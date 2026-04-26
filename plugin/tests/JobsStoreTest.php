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
                if (preg_match('/id = \'([^\']+)\'/', $sql, $m) && isset($this->rows[$m[1]])) {
                    return (object) $this->rows[$m[1]];
                }
                return null;
            }

            public function get_results(string $sql): array
            {
                $out = [];
                foreach ($this->rows as $row) {
                    if (preg_match('/status = \'running\'/', $sql) && $row['status'] !== 'running') continue;
                    if (preg_match('/user_id = (\d+)/', $sql, $m) && (int)$row['user_id'] !== (int)$m[1]) continue;
                    $out[] = (object) $row;
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

            public function query(string $sql): int|bool { return 1; }
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
}
