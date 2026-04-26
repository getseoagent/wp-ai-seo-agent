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
        if (!defined('SEO_AGENT_WRITE_SECRET')) define('SEO_AGENT_WRITE_SECRET', 'test-write-secret');
    }

    public function test_permit_admin_or_write_secret_passes_for_admin(): void
    {
        $GLOBALS['_seoagent_test_caps'] = true;
        $req = self::fake_request([]);
        $this->assertTrue(REST_Controller::permit_admin_or_write_secret($req));
    }

    public function test_permit_admin_or_write_secret_passes_for_matching_secret(): void
    {
        $req = self::fake_request(['x-write-secret' => 'test-write-secret']);
        $this->assertTrue(REST_Controller::permit_admin_or_write_secret($req));
    }

    public function test_permit_admin_or_write_secret_rejects_wrong_secret(): void
    {
        $req = self::fake_request(['x-write-secret' => 'wrong']);
        $this->assertFalse(REST_Controller::permit_admin_or_write_secret($req));
    }

    public function test_permit_admin_or_write_secret_rejects_missing_secret(): void
    {
        $req = self::fake_request([]);
        $this->assertFalse(REST_Controller::permit_admin_or_write_secret($req));
    }

    private static function fake_request(array $headers): \WP_REST_Request
    {
        $GLOBALS['_seoagent_test_headers'] = $headers;
        return new \WP_REST_Request();
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
}
