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
}
