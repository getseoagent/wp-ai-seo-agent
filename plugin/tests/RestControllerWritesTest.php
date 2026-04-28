<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\REST_Controller;

final class RestControllerWritesTest extends TestCase
{
    protected function setUp(): void
    {
        $GLOBALS['_seoagent_test_caps'] = false;
        $GLOBALS['_seoagent_test_headers'] = [];
    }

    public function test_update_seo_fields_writes_applied_audit_when_value_changed(): void
    {
        $writes = [];
        $rows = [];
        $adapter = self::adapter_with_state(['title' => 'Old'], $writes);
        $store = self::store_with_capture($rows);

        $payload = REST_Controller::handle_update_seo_fields(
            42,
            ['fields' => ['title' => 'New']],
            $adapter,
            $store,
            static fn(): string => 'job-1'
        );

        $this->assertSame('job-1', $payload['job_id']);
        $this->assertSame('applied', $payload['results'][0]['status']);
        $this->assertSame('Old', $payload['results'][0]['before']);
        $this->assertSame('New', $payload['results'][0]['after']);
        $this->assertSame([['post_id' => 42, 'key' => 'rank_math_title', 'value' => 'New']], $writes);
        $this->assertCount(1, $rows);
        $this->assertSame('applied', $rows[0]['status']);
    }

    public function test_update_seo_fields_skipped_unchanged_when_same(): void
    {
        $writes = [];
        $rows = [];
        $adapter = self::adapter_with_state(['title' => 'Same'], $writes);
        $store = self::store_with_capture($rows);

        $payload = REST_Controller::handle_update_seo_fields(
            42,
            ['fields' => ['title' => 'Same']],
            $adapter,
            $store,
            static fn(): string => 'job-2'
        );

        $this->assertSame('skipped_unchanged', $payload['results'][0]['status']);
        $this->assertSame([], $writes);
        $this->assertSame('skipped_unchanged', $rows[0]['status']);
    }

    public function test_update_seo_fields_skipped_failed_when_unsupported(): void
    {
        $rows = [];
        $adapter = new \SeoAgent\Adapters\Fallback_Adapter(static fn(int $id): ?string => null);
        $store = self::store_with_capture($rows);

        $payload = REST_Controller::handle_update_seo_fields(
            42,
            ['fields' => ['title' => 'New']],
            $adapter,
            $store,
            static fn(): string => 'job-3'
        );

        $this->assertSame('skipped_failed', $payload['results'][0]['status']);
        $this->assertStringContainsString('does not support', $payload['results'][0]['reason']);
    }

    public function test_update_seo_fields_generates_uuid_when_job_id_omitted(): void
    {
        $writes = [];
        $rows = [];
        $adapter = self::adapter_with_state(['title' => 'Old'], $writes);
        $store = self::store_with_capture($rows);

        $payload = REST_Controller::handle_update_seo_fields(
            42,
            ['fields' => ['title' => 'New']],
            $adapter,
            $store,
            static fn(): string => 'gen-uuid'
        );

        $this->assertSame('gen-uuid', $payload['job_id']);
    }

    public function test_update_seo_fields_uses_provided_job_id(): void
    {
        $writes = [];
        $rows = [];
        $adapter = self::adapter_with_state(['title' => 'Old'], $writes);
        $store = self::store_with_capture($rows);

        $payload = REST_Controller::handle_update_seo_fields(
            42,
            ['job_id' => 'caller-uuid', 'fields' => ['title' => 'New']],
            $adapter,
            $store,
            static fn(): string => 'should-not-be-used'
        );

        $this->assertSame('caller-uuid', $payload['job_id']);
    }

    /**
     * Build an adapter that reads from $state and writes via Rank_Math_Adapter's writer-injection seam.
     * @param array<string, ?string> $state
     * @param array<int, array{post_id: int, key: string, value: string}> $writes
     */
    private static function adapter_with_state(array $state, array &$writes): \SeoAgent\Adapters\Seo_Fields_Adapter
    {
        $reader = static function (int $id, string $key) use (&$state): ?string {
            $field = match ($key) {
                'rank_math_title' => 'title',
                'rank_math_description' => 'description',
                'rank_math_focus_keyword' => 'focus_keyword',
                'rank_math_facebook_title' => 'og_title',
                default => null,
            };
            return $state[$field] ?? null;
        };
        $writer = static function (int $id, string $key, string $value) use (&$state, &$writes): void {
            $writes[] = ['post_id' => $id, 'key' => $key, 'value' => $value];
            $field = match ($key) {
                'rank_math_title' => 'title',
                'rank_math_description' => 'description',
                'rank_math_focus_keyword' => 'focus_keyword',
                'rank_math_facebook_title' => 'og_title',
                default => null,
            };
            if ($field !== null) $state[$field] = $value;
        };
        return new \SeoAgent\Adapters\Rank_Math_Adapter($reader, $writer);
    }

    /**
     * Build a History_Store that captures inserted rows into $rows.
     * @param array<int, array<string, mixed>> $rows
     */
    private static function store_with_capture(array &$rows): \SeoAgent\History_Store
    {
        $db = new class($rows) {
            public string $prefix = 'wp_';
            public function __construct(private array &$rows_ref) {}
            public function prepare(string $sql, ...$args): string { return $sql; }
            public function insert(string $table, array $data): int {
                $this->rows_ref[] = $data;
                return 1;
            }
            public function get_results(string $sql): array { return []; }
            public function get_row(string $sql): ?object { return null; }
            public function update(string $table, array $data, array $where): int { return 0; }
        };
        return new \SeoAgent\History_Store($db);
    }

    public function test_get_history_filters_by_post_id(): void
    {
        $store = self::store_with_rows([
            (object) ['id' => 5, 'post_id' => 42, 'job_id' => 'j1', 'field' => 'title', 'before_value' => 'a', 'after_value' => 'b', 'status' => 'applied', 'reason' => null, 'user_id' => null, 'created_at' => '2026-04-26 10:00:00', 'rolled_back_at' => null],
        ]);
        $payload = REST_Controller::handle_get_history(['post_id' => 42], $store);
        $this->assertCount(1, $payload['rows']);
        $this->assertSame(5, $payload['rows'][0]['id']);
    }

    public function test_get_history_filters_by_job_id(): void
    {
        $store = self::store_with_job_rows([
            (object) ['id' => 7, 'post_id' => 100, 'job_id' => 'job-x', 'field' => 'description', 'before_value' => null, 'after_value' => null, 'status' => 'skipped_unchanged', 'reason' => null, 'user_id' => null, 'created_at' => 'x', 'rolled_back_at' => null],
        ]);
        $payload = REST_Controller::handle_get_history(['job_id' => 'job-x'], $store);
        $this->assertCount(1, $payload['rows']);
        $this->assertSame('job-x', $payload['rows'][0]['job_id']);
    }

    public function test_get_history_clamps_limit(): void
    {
        // Observable proof of the clamp: pass limit=9999, fake store returns 100 rows
        // (the same as the clamp ceiling). Handler computes next_cursor only when
        // returned-count === requested-limit; matching at exactly 100 means the
        // handler asked for 100, which is the clamp ceiling.
        $rows = array_map(static fn(int $i) => (object) ['id' => $i, 'post_id' => 1, 'job_id' => 'x', 'field' => 'title', 'before_value' => null, 'after_value' => null, 'status' => 'applied', 'reason' => null, 'user_id' => null, 'created_at' => 'x', 'rolled_back_at' => null], range(1, 100));
        $store = self::store_with_rows($rows);
        $payload = REST_Controller::handle_get_history(['post_id' => 1, 'limit' => 9999], $store);
        $this->assertCount(100, $payload['rows']);
        $this->assertSame(100, $payload['next_cursor']);
    }

    /** @param list<object> $rows */
    private static function store_with_rows(array $rows): \SeoAgent\History_Store
    {
        $db = new class($rows) {
            public string $prefix = 'wp_';
            public function __construct(public array $rows_ref) {}
            public function prepare(string $sql, ...$args): string { return $sql; }
            public function insert(string $table, array $data): int { return 1; }
            public function get_results(string $sql): array { return $this->rows_ref; }
            public function get_row(string $sql): ?object { return null; }
            public function update(string $table, array $data, array $where): int { return 0; }
        };
        return new \SeoAgent\History_Store($db);
    }

    /** @param list<object> $rows */
    private static function store_with_job_rows(array $rows): \SeoAgent\History_Store
    {
        return self::store_with_rows($rows);
    }

    public function test_rollback_reverses_applied_row_and_marks_original(): void
    {
        $original = (object) ['id' => 17, 'post_id' => 42, 'job_id' => 'j1', 'field' => 'title', 'before_value' => 'Old', 'after_value' => 'New', 'status' => 'applied', 'reason' => null, 'user_id' => 1, 'created_at' => 'x', 'rolled_back_at' => null];
        $writes = [];
        $rows_inserted = [];
        $marked_ids = [];
        $adapter = self::adapter_with_state(['title' => 'New'], $writes);
        $store = self::store_with_history_rows([17 => $original], $rows_inserted, $marked_ids);

        $payload = REST_Controller::handle_rollback(
            ['history_ids' => [17]],
            $adapter,
            $store,
            static fn(): string => 'rollback-job',
            static fn(): string => '2026-04-26 12:00:00'
        );

        $this->assertSame('rollback-job', $payload['job_id']);
        $this->assertSame('rolled_back', $payload['results'][0]['status']);
        $this->assertSame([['post_id' => 42, 'key' => 'rank_math_title', 'value' => 'Old']], $writes);
        $this->assertCount(1, $rows_inserted);
        $this->assertSame('rollback of #17', $rows_inserted[0]['reason']);
        $this->assertSame('applied', $rows_inserted[0]['status']);
        $this->assertSame([['id' => 17, 'at' => '2026-04-26 12:00:00']], $marked_ids);
    }

    public function test_rollback_skips_already_rolled_back_row(): void
    {
        $original = (object) ['id' => 17, 'post_id' => 42, 'job_id' => 'j1', 'field' => 'title', 'before_value' => 'a', 'after_value' => 'b', 'status' => 'applied', 'reason' => null, 'user_id' => null, 'created_at' => 'x', 'rolled_back_at' => '2026-04-25 10:00:00'];
        $rows_inserted = [];
        $marked_ids = [];
        $writes = [];
        $adapter = self::adapter_with_state([], $writes);
        $store = self::store_with_history_rows([17 => $original], $rows_inserted, $marked_ids);

        $payload = REST_Controller::handle_rollback(
            ['history_ids' => [17]],
            $adapter,
            $store,
            static fn(): string => 'jb',
            static fn(): string => 'now'
        );

        $this->assertSame('skipped', $payload['results'][0]['status']);
        $this->assertSame('already rolled back', $payload['results'][0]['reason']);
        $this->assertSame([], $writes);
        $this->assertSame([], $rows_inserted);
        $this->assertSame([], $marked_ids);
    }

    public function test_rollback_clamps_history_ids_to_50(): void
    {
        $rows_inserted = [];
        $marked_ids = [];
        $writes = [];
        $adapter = self::adapter_with_state([], $writes);
        // Empty rows_by_id map → every store->get() returns null → status='not_found'
        $store = self::store_with_history_rows([], $rows_inserted, $marked_ids);

        $payload = REST_Controller::handle_rollback(
            ['history_ids' => range(1, 75)],
            $adapter,
            $store,
            static fn(): string => 'jb',
            static fn(): string => 'now'
        );

        $this->assertCount(50, $payload['results']);
        $this->assertSame('not_found', $payload['results'][0]['status']);
    }

    /**
     * Build a History_Store whose underlying db serves pre-seeded rows by id and
     * captures inserts + updates. Keeps History_Store final-friendly: production
     * History_Store, fake db, no subclassing.
     *
     * @param array<int, object> $rows_by_id
     * @param array<int, array<string, mixed>> $inserted
     * @param array<int, array{id:int, at:string}> $marked
     */
    private static function store_with_history_rows(array $rows_by_id, array &$inserted, array &$marked): \SeoAgent\History_Store
    {
        $db = new class($rows_by_id, $inserted, $marked) {
            public string $prefix = 'wp_';
            /**
             * @param array<int, object> $rows_by_id
             * @param array<int, array<string, mixed>> $inserted_ref
             * @param array<int, array{id:int, at:string}> $marked_ref
             */
            public function __construct(
                public array $rows_by_id,
                public array &$inserted_ref,
                public array &$marked_ref
            ) {}
            public function prepare(string $sql, ...$args): string {
                // Substitute %d / %s placeholders with the args. Quote %s for shape parity.
                $i = 0;
                return preg_replace_callback('/%d|%s/', function ($m) use ($args, &$i): string {
                    $val = $args[$i++] ?? '';
                    return $m[0] === '%d' ? (string) (int) $val : "'" . (string) $val . "'";
                }, $sql) ?? $sql;
            }
            public function insert(string $table, array $data): int {
                $this->inserted_ref[] = $data;
                return 1;
            }
            public function get_results(string $sql): array { return []; }
            public function get_row(string $sql): ?object {
                if (preg_match('/WHERE id = (\d+)/', $sql, $m)) {
                    $id = (int) $m[1];
                    return $this->rows_by_id[$id] ?? null;
                }
                return null;
            }
            public function update(string $table, array $data, array $where): int {
                if (isset($data['rolled_back_at'], $where['id'])) {
                    $this->marked_ref[] = ['id' => (int) $where['id'], 'at' => (string) $data['rolled_back_at']];
                }
                return 1;
            }
        };
        return new \SeoAgent\History_Store($db);
    }
}
