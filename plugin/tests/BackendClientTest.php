<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\Backend_Client;
use SeoAgent\License;

final class BackendClientTest extends TestCase
{
    protected function setUp(): void
    {
        $GLOBALS['wp_options_store']      = [];
        $GLOBALS['_remote_post_handler']  = null;
        $GLOBALS['_last_remote_post']     = null;
        $GLOBALS['_seoagent_test_home_url'] = 'https://shop.example';

        if (!defined('SEO_AGENT_BACKEND_URL')) define('SEO_AGENT_BACKEND_URL', 'http://backend.test');
        if (!defined('SEO_AGENT_SHARED_SECRET')) define('SEO_AGENT_SHARED_SECRET', 'shared-test-secret');
    }

    public function test_mints_token_via_auth_token_when_cache_is_empty(): void
    {
        $expIso = gmdate('c', time() + 3600);
        $GLOBALS['_remote_post_handler'] = static function ($url, $args) use ($expIso) {
            return ['response' => ['code' => 200], 'body' => json_encode(['token' => 'jwt.value.sig', 'tier' => 'free', 'expires_at' => $expIso])];
        };

        $token = Backend_Client::get_jwt();
        $this->assertSame('jwt.value.sig', $token);

        $req = $GLOBALS['_last_remote_post'];
        $this->assertSame('http://backend.test/auth/token', $req['url']);
        $this->assertSame('shared-test-secret', $req['args']['headers']['X-Shared-Secret']);
        $this->assertSame('application/json',   $req['args']['headers']['Content-Type']);
        $body = json_decode($req['args']['body'], true);
        $this->assertNull($body['license_key']);
        $this->assertSame('https://shop.example', $body['site_url']);
    }

    public function test_includes_license_key_when_set(): void
    {
        License::set_license_key('seo_TEST_KEY');
        $GLOBALS['_remote_post_handler'] = static function ($url, $args) {
            return ['response' => ['code' => 200], 'body' => json_encode(['token' => 't', 'tier' => 'pro', 'expires_at' => gmdate('c', time() + 600)])];
        };

        Backend_Client::get_jwt();
        $body = json_decode($GLOBALS['_last_remote_post']['args']['body'], true);
        $this->assertSame('seo_TEST_KEY', $body['license_key']);
    }

    public function test_reuses_cached_token_within_grace_window(): void
    {
        $callCount = 0;
        $GLOBALS['_remote_post_handler'] = static function () use (&$callCount) {
            $callCount++;
            return ['response' => ['code' => 200], 'body' => json_encode(['token' => 'tok-' . $callCount, 'tier' => 'free', 'expires_at' => gmdate('c', time() + 3600)])];
        };

        $first  = Backend_Client::get_jwt();
        $second = Backend_Client::get_jwt();
        $this->assertSame($first, $second);
        $this->assertSame(1, $callCount, 'second call should hit the transient cache, not /auth/token');
    }

    public function test_refreshes_token_when_within_grace_window_of_expiry(): void
    {
        $callCount = 0;
        $GLOBALS['_remote_post_handler'] = static function () use (&$callCount) {
            $callCount++;
            // First mint expires in 30s — inside the 60s grace, so the next call should re-mint.
            $exp = $callCount === 1 ? time() + 30 : time() + 3600;
            return ['response' => ['code' => 200], 'body' => json_encode(['token' => 'tok-' . $callCount, 'tier' => 'free', 'expires_at' => gmdate('c', $exp)])];
        };

        Backend_Client::get_jwt();
        $second = Backend_Client::get_jwt();
        $this->assertSame('tok-2', $second);
        $this->assertSame(2, $callCount);
    }

    public function test_throws_on_non_200_response(): void
    {
        $GLOBALS['_remote_post_handler'] = static function () {
            return ['response' => ['code' => 403], 'body' => '{"error":"license_disabled"}'];
        };
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/HTTP 403/');
        Backend_Client::get_jwt();
    }

    public function test_throws_on_wp_error(): void
    {
        $GLOBALS['_remote_post_handler'] = static function () {
            return new WP_Error('http_request_failed', 'connection refused');
        };
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/connection refused/');
        Backend_Client::get_jwt();
    }

    public function test_clear_jwt_forces_remint(): void
    {
        $callCount = 0;
        $GLOBALS['_remote_post_handler'] = static function () use (&$callCount) {
            $callCount++;
            return ['response' => ['code' => 200], 'body' => json_encode(['token' => 'tok-' . $callCount, 'tier' => 'free', 'expires_at' => gmdate('c', time() + 3600)])];
        };

        Backend_Client::get_jwt();
        Backend_Client::clear_jwt();
        Backend_Client::get_jwt();
        $this->assertSame(2, $callCount);
    }
}
