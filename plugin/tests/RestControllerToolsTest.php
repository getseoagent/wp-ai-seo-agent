<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\REST_Controller;

final class RestControllerToolsTest extends TestCase
{
    public function test_detect_seo_plugin_returns_factory_result(): void
    {
        $payload = REST_Controller::handle_detect_seo_plugin();
        $this->assertIsArray($payload);
        $this->assertArrayHasKey('name', $payload);
        $this->assertContains($payload['name'], ['rank-math', 'none']);
    }

    public function test_list_posts_passes_query_args_through(): void
    {
        $captured = null;
        $fake_query = static function (array $args) use (&$captured): array {
            $captured = $args;
            return [
                'posts' => [
                    (object) ['ID' => 7, 'post_title' => 'Hello', 'post_name' => 'hello', 'post_status' => 'publish', 'post_modified' => '2026-04-26 10:00:00'],
                ],
                'total' => 1,
            ];
        };

        $payload = REST_Controller::handle_list_posts(
            ['category' => 'news', 'limit' => 5, 'cursor' => 0],
            $fake_query
        );

        $this->assertSame('news', $captured['category_name']);
        $this->assertSame(5, $captured['posts_per_page']);
        $this->assertSame(1, $captured['paged']);
        $this->assertCount(1, $payload['posts']);
        $this->assertSame(7, $payload['posts'][0]['id']);
        $this->assertSame('hello', $payload['posts'][0]['slug']);
        $this->assertNull($payload['next_cursor']);
        $this->assertSame(1, $payload['total']);
    }

    public function test_list_posts_clamps_limit_and_advances_cursor(): void
    {
        $fake_query = static function (array $args): array {
            return [
                'posts' => array_fill(0, 50, (object) ['ID' => 1, 'post_title' => 'X', 'post_name' => 'x', 'post_status' => 'publish', 'post_modified' => '2026-04-26 10:00:00']),
                'total' => 200,
            ];
        };

        $payload = REST_Controller::handle_list_posts(['limit' => 9999, 'cursor' => 0], $fake_query);

        $this->assertSame(50, count($payload['posts']));
        $this->assertSame(50, $payload['next_cursor']);
        $this->assertSame(200, $payload['total']);
    }

    public function test_handle_list_posts_includes_word_count(): void
    {
        $posts = [
            (object) [
                'ID' => 100, 'post_title' => 'A', 'post_name' => 'a', 'post_status' => 'publish',
                'post_modified' => '2026-01-01 00:00:00',
                'post_content' => str_repeat('word ', 50),
            ],
            (object) [
                'ID' => 101, 'post_title' => 'B', 'post_name' => 'b', 'post_status' => 'publish',
                'post_modified' => '2026-01-02 00:00:00',
                'post_content' => '',
            ],
        ];
        $query_fn = static fn(array $args): array => ['posts' => $posts, 'total' => 2];
        $result = REST_Controller::handle_list_posts(['limit' => 50], $query_fn);
        self::assertArrayHasKey('word_count', $result['posts'][0]);
        self::assertSame(50, $result['posts'][0]['word_count']);
        self::assertSame(0, $result['posts'][1]['word_count']);
    }

    public function test_get_post_summary_uses_provided_adapter_and_loader(): void
    {
        $loader = static fn(int $id): ?object => $id === 7
            ? (object) ['ID' => 7, 'post_title' => 'Hello', 'post_name' => 'hello', 'post_status' => 'publish', 'post_modified' => '2026-04-26 10:00:00', 'post_content' => 'one two three four five']
            : null;

        $adapter = new class implements \SeoAgent\Adapters\Seo_Fields_Adapter {
            public function get_seo_title(int $id): ?string       { return 'T'; }
            public function get_seo_description(int $id): ?string { return 'D'; }
            public function get_focus_keyword(int $id): ?string   { return 'K'; }
            public function get_og_title(int $id): ?string        { return 'OG'; }
            public function name(): string { return 'rank-math'; }
            public function set_seo_title(int $id, string $value): void {}
            public function set_seo_description(int $id, string $value): void {}
            public function set_focus_keyword(int $id, string $value): void {}
            public function set_og_title(int $id, string $value): void {}
            public function supports(string $field): bool { return true; }
        };

        $payload = REST_Controller::handle_get_post_summary(7, $loader, $adapter);

        $this->assertSame(7, $payload['id']);
        $this->assertSame('Hello', $payload['post_title']);
        $this->assertSame(5, $payload['word_count']);
        $this->assertSame(['title' => 'T', 'description' => 'D', 'focus_keyword' => 'K', 'og_title' => 'OG'], $payload['current_seo']);
    }

    public function test_get_post_summary_returns_null_when_post_missing(): void
    {
        $loader = static fn(int $id): ?object => null;
        $adapter = new \SeoAgent\Adapters\Fallback_Adapter(static fn(int $id): ?string => null);
        $payload = REST_Controller::handle_get_post_summary(999, $loader, $adapter);
        $this->assertNull($payload);
    }

    public function test_get_post_summary_word_count_is_unicode_aware(): void
    {
        $loader = static fn(int $id): ?object => (object) [
            'ID' => 1, 'post_title' => 'x', 'post_name' => 'x', 'post_status' => 'publish', 'post_modified' => 'x',
            'post_content' => 'pożyczka 5000 zł na żądanie',
        ];
        $adapter = new \SeoAgent\Adapters\Fallback_Adapter(static fn(int $id): ?string => null);
        $payload = REST_Controller::handle_get_post_summary(1, $loader, $adapter);
        $this->assertSame(5, $payload['word_count']);
    }

    public function test_handle_get_post_summary_includes_content_preview(): void
    {
        $post = (object) [
            'ID' => 42,
            'post_title' => 'Title',
            'post_name' => 'slug',
            'post_status' => 'publish',
            'post_modified' => '2026-01-01 00:00:00',
            'post_content' => str_repeat('word ', 600) . 'tail',
        ];
        $loader = static fn(int $id): ?object => $id === 42 ? $post : null;
        $adapter = new \SeoAgent\Adapters\Fallback_Adapter(static fn(int $id): ?string => null);

        $result = REST_Controller::handle_get_post_summary(42, $loader, $adapter);

        self::assertIsArray($result);
        self::assertArrayHasKey('content_preview', $result);
        self::assertIsString($result['content_preview']);
        $word_count = str_word_count($result['content_preview']);
        self::assertLessThanOrEqual(500, $word_count, 'content_preview should cap at 500 words');
        self::assertGreaterThan(0, $word_count, 'content_preview should not be empty for a post with content');
        self::assertStringNotContainsString('tail', $result['content_preview']);
    }

    public function test_handle_get_post_summary_content_preview_strips_html_and_shortcodes(): void
    {
        $post = (object) [
            'ID' => 43,
            'post_title' => 'T',
            'post_name' => 's',
            'post_status' => 'publish',
            'post_modified' => '2026-01-01 00:00:00',
            'post_content' => '<p>Hello <strong>world</strong></p>[shortcode foo="bar"]<script>alert(1)</script>tail',
        ];
        $loader = static fn(int $id): ?object => $id === 43 ? $post : null;
        $adapter = new \SeoAgent\Adapters\Fallback_Adapter(static fn(int $id): ?string => null);
        $result = REST_Controller::handle_get_post_summary(43, $loader, $adapter);

        self::assertStringNotContainsString('<', $result['content_preview']);
        self::assertStringNotContainsString('[shortcode', $result['content_preview']);
        self::assertStringNotContainsString('alert', $result['content_preview']);
        self::assertStringContainsString('Hello world', $result['content_preview']);
    }

    public function test_handle_get_post_summary_content_preview_caps_unsegmented_text(): void
    {
        // CJK / Thai-style content has no spaces. Word-cap alone returns the entire body.
        // The character backstop must clamp it.
        $body = str_repeat('文', 8000); // 8000 Chinese characters, no spaces
        $post = (object) [
            'ID' => 44,
            'post_title' => 'T',
            'post_name' => 's',
            'post_status' => 'publish',
            'post_modified' => '2026-01-01 00:00:00',
            'post_content' => $body,
        ];
        $loader = static fn(int $id): ?object => $id === 44 ? $post : null;
        $adapter = new \SeoAgent\Adapters\Fallback_Adapter(static fn(int $id): ?string => null);
        $result = REST_Controller::handle_get_post_summary(44, $loader, $adapter);

        self::assertNotNull($result);
        // 500 words * 10 chars/word = 5000 char budget
        self::assertLessThanOrEqual(5000, mb_strlen($result['content_preview']));
        self::assertGreaterThan(0, mb_strlen($result['content_preview']));
    }

    public function test_get_taxonomy_terms_maps_fields(): void
    {
        $loader = static fn(string $tax): array => [
            (object) ['term_id' => 3, 'name' => 'News', 'slug' => 'news', 'count' => 12],
            (object) ['term_id' => 4, 'name' => 'Tutorials', 'slug' => 'tutorials', 'count' => 5],
        ];
        $payload = REST_Controller::handle_get_taxonomy_terms('category', $loader);
        $this->assertCount(2, $payload);
        $this->assertSame(['id' => 3, 'name' => 'News', 'slug' => 'news', 'count' => 12], $payload[0]);
    }

    public function test_list_posts_post_type_default_post(): void
    {
        $captured = null;
        $fake_query = static function (array $args) use (&$captured): array {
            $captured = $args;
            return ['posts' => [], 'total' => 0];
        };
        REST_Controller::handle_list_posts([], $fake_query);
        $this->assertSame('post', $captured['post_type']);
    }

    public function test_list_posts_post_type_page(): void
    {
        $captured = null;
        $fake_query = static function (array $args) use (&$captured): array {
            $captured = $args;
            return ['posts' => [], 'total' => 0];
        };
        REST_Controller::handle_list_posts(['post_type' => 'page'], $fake_query);
        $this->assertSame('page', $captured['post_type']);
    }

    public function test_list_posts_post_type_array(): void
    {
        $captured = null;
        $fake_query = static function (array $args) use (&$captured): array {
            $captured = $args;
            return ['posts' => [], 'total' => 0];
        };
        REST_Controller::handle_list_posts(['post_type' => ['post', 'page']], $fake_query);
        $this->assertSame(['post', 'page'], $captured['post_type']);
    }

    public function test_list_posts_with_slugs_filter(): void
    {
        $captured = null;
        $fake_query = static function (array $args) use (&$captured): array {
            $captured = $args;
            return ['posts' => [], 'total' => 0];
        };
        REST_Controller::handle_list_posts(['slugs' => 'long-tail-keywords,seo-101'], $fake_query);
        $this->assertSame(['long-tail-keywords', 'seo-101'], $captured['post_name__in']);
    }

    public function test_list_posts_slugs_handles_array_input(): void
    {
        $captured = null;
        $fake_query = static function (array $args) use (&$captured): array {
            $captured = $args;
            return ['posts' => [], 'total' => 0];
        };
        REST_Controller::handle_list_posts(['slugs' => ['a', 'b', 'c']], $fake_query);
        $this->assertSame(['a', 'b', 'c'], $captured['post_name__in']);
    }

    private function makeFakeDb(): object
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

    public function test_handle_create_job_inserts_and_returns_job(): void
    {
        $store = new \SeoAgent\Jobs_Store($this->makeFakeDb());
        $params = [
            'id' => 'abc', 'user_id' => 0, 'tool_name' => 'apply_style_to_batch',
            'total' => 5, 'style_hints' => 'x', 'params_json' => '{}',
        ];
        $result = REST_Controller::handle_create_job($params, $store);
        self::assertSame('abc', $result['id']);
        self::assertSame('running', $result['status']);
    }

    public function test_handle_get_job_returns_row(): void
    {
        $store = new \SeoAgent\Jobs_Store($this->makeFakeDb());
        $store->create(['id' => 'jx', 'user_id' => 0, 'tool_name' => 't', 'total' => 5]);
        $result = REST_Controller::handle_get_job('jx', $store);
        self::assertSame('jx', $result['id']);
    }

    public function test_handle_get_job_not_found(): void
    {
        $store = new \SeoAgent\Jobs_Store($this->makeFakeDb());
        $result = REST_Controller::handle_get_job('does-not-exist', $store);
        self::assertNull($result);
    }

    public function test_handle_get_job_interrupted_heuristic(): void
    {
        // Simulate a job started > 10 min ago with no recent progress.
        $db = $this->makeFakeDb();
        $store = new \SeoAgent\Jobs_Store($db);
        $store->create(['id' => 'jstale', 'user_id' => 0, 'tool_name' => 't', 'total' => 100]);
        // Forge old timestamps directly in the fake DB row:
        $db->rows['jstale']['started_at'] = gmdate('Y-m-d H:i:s', time() - 1200);  // 20 min ago
        $db->rows['jstale']['last_progress_at'] = null;
        $result = REST_Controller::handle_get_job('jstale', $store);
        self::assertSame('interrupted', $result['status']);
    }

    public function test_handle_update_job_progress(): void
    {
        $store = new \SeoAgent\Jobs_Store($this->makeFakeDb());
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        REST_Controller::handle_update_job_progress('j1', ['done' => 5, 'failed_count' => 1], $store);
        $j = $store->get('j1');
        self::assertSame(5, $j->done);
        self::assertSame(1, $j->failed_count);
    }

    public function test_handle_mark_job_done(): void
    {
        $store = new \SeoAgent\Jobs_Store($this->makeFakeDb());
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        REST_Controller::handle_mark_job_done('j1', ['status' => 'completed'], $store);
        $j = $store->get('j1');
        self::assertSame('completed', $j->status);
    }

    public function test_handle_cancel_job(): void
    {
        $store = new \SeoAgent\Jobs_Store($this->makeFakeDb());
        $store->create(['id' => 'j1', 'user_id' => 0, 'tool_name' => 't', 'total' => 10]);
        REST_Controller::handle_cancel_job('j1', $store);
        $j = $store->get('j1');
        self::assertNotNull($j->cancel_requested_at);
    }

    public function test_handle_find_running_returns_first(): void
    {
        $store = new \SeoAgent\Jobs_Store($this->makeFakeDb());
        $store->create(['id' => 'j1', 'user_id' => 7, 'tool_name' => 't', 'total' => 10]);
        $result = REST_Controller::handle_find_running_jobs(['user_id' => 7], $store);
        self::assertCount(1, $result);
        self::assertSame('j1', $result[0]['id']);
    }

    public function test_handle_rollback_by_job_id_unwinds_all_non_rolled_back(): void
    {
        // 2 rows for jA (post 42 and post 43, both applied, neither rolled back),
        // 1 row for jB (must NOT be touched).
        $rows_by_id = [
            17 => (object) ['id' => 17, 'post_id' => 42, 'job_id' => 'jA', 'field' => 'title',       'before_value' => 'OldA', 'after_value' => 'NewA', 'status' => 'applied', 'reason' => null, 'user_id' => 1, 'created_at' => 'x', 'rolled_back_at' => null],
            18 => (object) ['id' => 18, 'post_id' => 43, 'job_id' => 'jA', 'field' => 'description', 'before_value' => 'OldB', 'after_value' => 'NewB', 'status' => 'applied', 'reason' => null, 'user_id' => 1, 'created_at' => 'y', 'rolled_back_at' => null],
            19 => (object) ['id' => 19, 'post_id' => 44, 'job_id' => 'jB', 'field' => 'title',       'before_value' => 'OldC', 'after_value' => 'NewC', 'status' => 'applied', 'reason' => null, 'user_id' => 1, 'created_at' => 'z', 'rolled_back_at' => null],
        ];
        // job-id mode pulls non-rolled-back rows for jA only:
        $job_rows_for = [
            'jA' => [$rows_by_id[17], $rows_by_id[18]],
            'jB' => [$rows_by_id[19]],
        ];
        $writes        = [];
        $rows_inserted = [];
        $marked_ids    = [];
        $adapter       = self::adapter_with_state(['title' => 'NewA', 'description' => 'NewB'], $writes);
        $store         = self::store_with_history_rows($rows_by_id, $rows_inserted, $marked_ids, $job_rows_for);

        $payload = REST_Controller::handle_rollback(
            ['job_id' => 'jA'],
            $adapter,
            $store,
            static fn(): string => 'rb-job',
            static fn(): string => '2026-04-26 12:00:00'
        );

        self::assertSame('rb-job', $payload['job_id']);
        self::assertCount(2, $payload['results']);
        self::assertSame('rolled_back', $payload['results'][0]['status']);
        self::assertSame('rolled_back', $payload['results'][1]['status']);
        // jB row 19 must remain untouched: only ids 17 and 18 should appear in $marked_ids.
        $marked_id_set = array_map(static fn(array $m): int => $m['id'], $marked_ids);
        self::assertEqualsCanonicalizing([17, 18], $marked_id_set);
        self::assertNotContains(19, $marked_id_set);
    }

    public function test_handle_rollback_history_ids_path_still_works(): void
    {
        $original = (object) ['id' => 50, 'post_id' => 42, 'job_id' => 'jX', 'field' => 'title', 'before_value' => 'Old', 'after_value' => 'New', 'status' => 'applied', 'reason' => null, 'user_id' => 1, 'created_at' => 'x', 'rolled_back_at' => null];
        $writes        = [];
        $rows_inserted = [];
        $marked_ids    = [];
        $adapter       = self::adapter_with_state(['title' => 'New'], $writes);
        $store         = self::store_with_history_rows([50 => $original], $rows_inserted, $marked_ids);

        $payload = REST_Controller::handle_rollback(
            ['history_ids' => [50]],
            $adapter,
            $store,
            static fn(): string => 'rb-job-2',
            static fn(): string => '2026-04-26 12:00:00'
        );

        self::assertSame('rb-job-2', $payload['job_id']);
        self::assertCount(1, $payload['results']);
        self::assertSame('rolled_back', $payload['results'][0]['status']);
        self::assertSame([['id' => 50, 'at' => '2026-04-26 12:00:00']], $marked_ids);
    }

    public function test_handle_rollback_requires_one_of_history_ids_or_job_id(): void
    {
        $writes        = [];
        $rows_inserted = [];
        $marked_ids    = [];
        $adapter       = self::adapter_with_state([], $writes);
        $store         = self::store_with_history_rows([], $rows_inserted, $marked_ids);

        $payload = REST_Controller::handle_rollback(
            [], // neither history_ids nor job_id
            $adapter,
            $store,
            static fn(): string => 'rb-job-3',
            static fn(): string => '2026-04-26 12:00:00'
        );

        self::assertArrayHasKey('error', $payload);
        self::assertSame([], $payload['results']);
        // No writes, no inserts, no marks should occur.
        self::assertSame([], $writes);
        self::assertSame([], $rows_inserted);
        self::assertSame([], $marked_ids);
    }

    public function test_handle_rollback_rejects_both_history_ids_and_job_id(): void
    {
        $writes        = [];
        $rows_inserted = [];
        $marked_ids    = [];
        $adapter       = self::adapter_with_state([], $writes);
        $store         = self::store_with_history_rows([], $rows_inserted, $marked_ids);

        $payload = REST_Controller::handle_rollback(
            ['history_ids' => [1], 'job_id' => 'jA'],
            $adapter,
            $store,
            static fn(): string => 'rb-job-4',
            static fn(): string => '2026-04-26 12:00:00'
        );

        self::assertArrayHasKey('error', $payload);
        self::assertSame([], $payload['results']);
        self::assertSame([], $writes);
        self::assertSame([], $rows_inserted);
        self::assertSame([], $marked_ids);
    }

    /**
     * Build an adapter that reads from $state and writes via Rank_Math_Adapter's writer-injection seam.
     * Mirrors the helper in RestControllerWritesTest so the rollback tests can stand alone here.
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
     * History store with seeded rows-by-id and optional job-id -> rows mapping for
     * find_by_job_not_rolled_back. Captures inserts and mark_rolled_back calls.
     *
     * @param array<int, object> $rows_by_id
     * @param array<int, array<string, mixed>> $inserted
     * @param array<int, array{id:int, at:string}> $marked
     * @param array<string, list<object>> $job_rows
     */
    private static function store_with_history_rows(
        array $rows_by_id,
        array &$inserted,
        array &$marked,
        array $job_rows = []
    ): \SeoAgent\History_Store {
        $db = new class($rows_by_id, $inserted, $marked, $job_rows) {
            public string $prefix = 'wp_';
            public array $queries = [];
            public function __construct(
                public array $rows_by_id,
                public array &$inserted_ref,
                public array &$marked_ref,
                public array $job_rows
            ) {}
            public function prepare(string $sql, ...$args): string {
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
            public function get_results(string $sql): array {
                // find_by_job_not_rolled_back: SELECT ... WHERE job_id = '...' AND rolled_back_at IS NULL
                if (preg_match("/job_id = '([^']+)'/", $sql, $m) && str_contains($sql, 'rolled_back_at IS NULL')) {
                    return $this->job_rows[$m[1]] ?? [];
                }
                return [];
            }
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
            public function query(string $sql): int|bool {
                $this->queries[] = $sql;
                return 1;
            }
        };
        return new \SeoAgent\History_Store($db);
    }
}
