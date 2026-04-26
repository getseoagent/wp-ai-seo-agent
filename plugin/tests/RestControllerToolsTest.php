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
}
