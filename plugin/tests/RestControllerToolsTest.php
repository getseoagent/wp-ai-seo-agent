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
}
