<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\History_Store;

final class HistoryStoreTest extends TestCase
{
    public function test_insert_writes_row_with_expected_fields(): void
    {
        $captured = null;
        $db = self::fake_db(insert: function (string $table, array $data) use (&$captured): int {
            $captured = ['table' => $table, 'data' => $data];
            return 1;
        });
        $store = new History_Store($db);

        $store->insert([
            'post_id' => 42,
            'job_id'  => 'job-uuid',
            'field'   => 'title',
            'before_value' => 'Old',
            'after_value'  => 'New',
            'status'  => 'applied',
            'reason'  => null,
            'user_id' => 7,
        ]);

        $this->assertSame('wp_seoagent_history', $captured['table']);
        $this->assertSame(42, $captured['data']['post_id']);
        $this->assertSame('job-uuid', $captured['data']['job_id']);
        $this->assertSame('title', $captured['data']['field']);
        $this->assertSame('Old', $captured['data']['before_value']);
        $this->assertSame('New', $captured['data']['after_value']);
        $this->assertSame('applied', $captured['data']['status']);
        $this->assertNull($captured['data']['reason']);
        $this->assertSame(7, $captured['data']['user_id']);
    }

    public function test_find_by_post_returns_paginated_rows(): void
    {
        $db = self::fake_db(get_results: function (string $sql) {
            return [
                (object) ['id' => 5, 'post_id' => 42, 'job_id' => 'j1', 'field' => 'title', 'before_value' => 'a', 'after_value' => 'b', 'status' => 'applied', 'reason' => null, 'user_id' => null, 'created_at' => '2026-04-26 10:00:00', 'rolled_back_at' => null],
            ];
        });
        $store = new History_Store($db);

        $rows = $store->find_by_post(42, 20, 0);
        $this->assertCount(1, $rows);
        $this->assertSame(5, $rows[0]->id);
    }

    public function test_get_returns_single_row_or_null(): void
    {
        $db = self::fake_db(get_row: function (string $sql) {
            return (object) ['id' => 17, 'rolled_back_at' => null];
        });
        $store = new History_Store($db);
        $row = $store->get(17);
        $this->assertSame(17, $row->id);
    }

    public function test_get_returns_null_when_missing(): void
    {
        $db = self::fake_db(get_row: function (string $sql) { return null; });
        $store = new History_Store($db);
        $this->assertNull($store->get(999));
    }

    public function test_mark_rolled_back_updates_row(): void
    {
        $captured = null;
        $db = self::fake_db(update: function (string $table, array $data, array $where) use (&$captured): int {
            $captured = compact('table', 'data', 'where');
            return 1;
        });
        $store = new History_Store($db);
        $store->mark_rolled_back(17, '2026-04-26 12:00:00');

        $this->assertSame('wp_seoagent_history', $captured['table']);
        $this->assertSame('2026-04-26 12:00:00', $captured['data']['rolled_back_at']);
        $this->assertSame(17, $captured['where']['id']);
    }

    public function test_find_by_job_not_rolled_back_excludes_rolled_back(): void
    {
        // Seed 3 rows for job jA. Row #1 has rolled_back_at set; rows #2 and #3 do not.
        // The fake DB filters server-side so the assertion is on what the SQL would return.
        $rows = [
            (object) ['id' => 1, 'post_id' => 10, 'job_id' => 'jA', 'field' => 'title', 'before_value' => 'a', 'after_value' => 'b', 'status' => 'applied', 'reason' => null, 'user_id' => null, 'created_at' => '2026-04-26 10:00:00', 'rolled_back_at' => '2026-04-26 10:30:00'],
            (object) ['id' => 2, 'post_id' => 11, 'job_id' => 'jA', 'field' => 'title', 'before_value' => 'a', 'after_value' => 'b', 'status' => 'applied', 'reason' => null, 'user_id' => null, 'created_at' => '2026-04-26 10:01:00', 'rolled_back_at' => null],
            (object) ['id' => 3, 'post_id' => 12, 'job_id' => 'jA', 'field' => 'title', 'before_value' => 'a', 'after_value' => 'b', 'status' => 'applied', 'reason' => null, 'user_id' => null, 'created_at' => '2026-04-26 10:02:00', 'rolled_back_at' => null],
        ];
        $captured_sql = null;
        $db = self::fake_db(get_results: function (string $sql) use ($rows, &$captured_sql): array {
            $captured_sql = $sql;
            // Mimic the WHERE rolled_back_at IS NULL filter so the fake matches the SQL semantics.
            return array_values(array_filter($rows, static fn(object $r): bool => $r->rolled_back_at === null));
        });
        $store = new History_Store($db);

        $result = $store->find_by_job_not_rolled_back('jA');

        $this->assertCount(2, $result);
        $this->assertIsObject($result[0]);
        $this->assertObjectHasProperty('id', $result[0]);
        $this->assertSame(2, $result[0]->id);
        $this->assertSame(3, $result[1]->id);
        $this->assertStringContainsString('rolled_back_at IS NULL', $captured_sql);
        $this->assertStringContainsString("'jA'", $captured_sql);
    }

    private static function fake_db(
        ?\Closure $insert = null,
        ?\Closure $get_results = null,
        ?\Closure $get_row = null,
        ?\Closure $update = null
    ): object {
        return new class($insert, $get_results, $get_row, $update) {
            public string $prefix = 'wp_';
            public function __construct(
                public readonly ?\Closure $insert_fn,
                public readonly ?\Closure $get_results_fn,
                public readonly ?\Closure $get_row_fn,
                public readonly ?\Closure $update_fn,
            ) {}
            public function prepare(string $sql, ...$args): string { return vsprintf(str_replace(['%d', '%s'], ['%d', "'%s'"], $sql), $args); }
            public function insert(string $table, array $data): int { return $this->insert_fn ? ($this->insert_fn)($table, $data) : 0; }
            public function get_results(string $sql): array { return $this->get_results_fn ? ($this->get_results_fn)($sql) : []; }
            public function get_row(string $sql): ?object { return $this->get_row_fn ? ($this->get_row_fn)($sql) : null; }
            public function update(string $table, array $data, array $where): int { return $this->update_fn ? ($this->update_fn)($table, $data, $where) : 0; }
        };
    }
}
