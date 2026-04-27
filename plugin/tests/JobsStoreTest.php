<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\Jobs_Store;

final class JobsStoreTest extends TestCase
{
    private function fakeDb(): object
    {
        return new class {
            public string $prefix = 'wp_';
            public array $rows = [];
            public array $insertCalls = [];
            public array $updateCalls = [];
            public string $lastQuery = '';

            public function insert(string $table, array $row): int
            {
                $this->insertCalls[] = ['table' => $table, 'row' => $row];
                $this->rows[$row['id']] = $row;
                return 1;
            }

            public function update(string $table, array $data, array $where): int
            {
                $this->updateCalls[] = ['table' => $table, 'data' => $data, 'where' => $where];
                if (isset($this->rows[$where['id']])) {
                    $this->rows[$where['id']] = array_merge($this->rows[$where['id']], $data);
                }
                return 1;
            }

            public function get_row(string $sql): ?object
            {
                $this->lastQuery = $sql;
                if (preg_match('/id = \'([^\']+)\'/', $sql, $m) && isset($this->rows[$m[1]])) {
                    return (object) $this->rows[$m[1]];
                }
                // Support find_running_for_user-style query: WHERE user_id = N AND status = 'running'
                if (preg_match('/status = \'running\'/', $sql)) {
                    $userId = preg_match('/user_id = (\d+)/', $sql, $m) ? (int) $m[1] : null;
                    foreach ($this->rows as $row) {
                        if ($row['status'] !== 'running') continue;
                        if ($userId !== null && (int) $row['user_id'] !== $userId) continue;
                        return (object) $row;
                    }
                }
                return null;
            }

            public function get_results(string $sql): array
            {
                $this->lastQuery = $sql;
                $out = [];
                $statusMatch = null;
                if (preg_match('/status = \'([^\']+)\'/', $sql, $m)) {
                    $statusMatch = $m[1];
                }
                foreach ($this->rows as $row) {
                    if ($statusMatch !== null && ($row['status'] ?? null) !== $statusMatch) continue;
                    if (preg_match('/user_id = (\d+)/', $sql, $m) && (int)($row['user_id'] ?? 0) !== (int)$m[1]) continue;
                    $out[] = (object) $row;
                }
                // Honor LIMIT n at end of query
                if (preg_match('/LIMIT (\d+)/', $sql, $m)) {
                    $out = array_slice($out, 0, (int)$m[1]);
                }
                return $out;
            }

            public function prepare(string $sql, ...$args): string
            {
                foreach ($args as $a) {
                    $sql = preg_replace('/%[ds]/', is_int($a) ? (string)$a : "'$a'", $sql, 1);
                }
                return $sql;
            }

            public function query(string $sql): int|bool { $this->lastQuery = $sql; return 1; }
        };
    }

    public function test_create_inserts_row(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $job = $store->create([
            'id' => 'abc-123', 'user_id' => 0, 'tool_name' => 'apply_style_to_batch',
            'total' => 50, 'style_hints' => 'aggressive', 'params_json' => '{}',
        ]);
        self::assertSame('wp_seoagent_jobs', $db->insertCalls[0]['table']);
        self::assertSame('abc-123', $job->id);
        self::assertSame('running', $job->status);
        self::assertSame(0, $job->done);
    }

    public function test_get_returns_row(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 5]);
        $j = $store->get('j1');
        self::assertNotNull($j);
        self::assertSame('j1', $j->id);
    }

    public function test_update_progress_sets_done_and_failed(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        $store->update_progress('j1', 5, 1);
        $j = $store->get('j1');
        self::assertSame(5, $j->done);
        self::assertSame(1, $j->failed_count);
    }

    public function test_request_cancel_writes_timestamp(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        $store->request_cancel('j1');
        $j = $store->get('j1');
        self::assertNotNull($j->cancel_requested_at);
    }

    public function test_mark_done_sets_status_and_finished_at(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        $store->mark_done('j1', 'completed');
        $j = $store->get('j1');
        self::assertSame('completed', $j->status);
        self::assertNotNull($j->finished_at);
    }

    public function test_find_running_for_user_filters_by_status(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        $store->create(['id' => 'j2', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        $store->mark_done('j2', 'completed');
        $running = $store->find_running_for_user(0);
        self::assertNotNull($running);
        self::assertSame('j1', $running->id);
    }

    public function test_list_jobs_returns_rows_matching_status_filter(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->create(['id' => 'a', 'user_id' => 0, 'tool_name' => 't', 'total' => 5]);
        $store->create(['id' => 'b', 'user_id' => 0, 'tool_name' => 't', 'total' => 3]);
        $store->mark_done('a', 'completed');
        $store->mark_done('b', 'completed');
        $store->create(['id' => 'c', 'user_id' => 0, 'tool_name' => 't', 'total' => 7]); // running

        $rows = $store->list_jobs(['status' => 'completed', 'limit' => 10]);
        self::assertCount(2, $rows);
        self::assertContains('a', array_map(fn($r) => $r->id, $rows));
        self::assertContains('b', array_map(fn($r) => $r->id, $rows));
    }

    public function test_list_jobs_applies_since_filter_in_sql(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->list_jobs(['status' => 'completed', 'since' => '2026-04-27 12:00:00', 'limit' => 5]);

        self::assertStringContainsString("status = 'completed'", $db->lastQuery);
        self::assertStringContainsString('finished_at >=', $db->lastQuery);
        self::assertStringContainsString("'2026-04-27 12:00:00'", $db->lastQuery);
        self::assertStringContainsString('LIMIT 5', $db->lastQuery);
    }

    public function test_list_jobs_clamps_limit_to_50(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->list_jobs(['status' => 'completed', 'limit' => 9999]);
        self::assertStringContainsString('LIMIT 50', $db->lastQuery);
    }

    public function test_list_jobs_clamps_limit_to_at_least_one(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->list_jobs(['status' => 'completed', 'limit' => 0]);
        self::assertStringContainsString('LIMIT 1', $db->lastQuery);
    }

    public function test_sweep_interrupted_marks_stale_running_jobs(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $count = $store->sweep_interrupted(5);

        self::assertSame(1, $count); // fakeDb's query() returns 1 (single-row no-op)
        self::assertStringContainsString("status = 'interrupted'", $db->lastQuery);
        self::assertStringContainsString("status = 'running'", $db->lastQuery);
        self::assertStringContainsString("INTERVAL 5 MINUTE", $db->lastQuery);
    }

    public function test_sweep_interrupted_clamps_minutes_to_at_least_one(): void
    {
        $db = $this->fakeDb();
        $store = new Jobs_Store($db);
        $store->sweep_interrupted(0);
        self::assertStringContainsString("INTERVAL 1 MINUTE", $db->lastQuery);
    }
}
