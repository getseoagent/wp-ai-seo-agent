<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\REST_Controller;
use WP_REST_Request;

final class PermitAdminOrJwtTest extends TestCase
{
    private const JWT_SECRET = 'test-jwt-secret-32-bytes-min-pls!';

    protected function setUp(): void
    {
        $GLOBALS['_seoagent_test_caps']    = false;
        $GLOBALS['_seoagent_test_headers'] = [];
        if (!defined('SEO_AGENT_JWT_SECRET'))    define('SEO_AGENT_JWT_SECRET',    self::JWT_SECRET);
        if (!defined('SEO_AGENT_SHARED_SECRET')) define('SEO_AGENT_SHARED_SECRET', 'shared-test-secret');
        if (!defined('SEO_AGENT_WRITE_SECRET'))  define('SEO_AGENT_WRITE_SECRET',  'write-test-secret');
    }

    public function test_admin_user_is_allowed(): void
    {
        $GLOBALS['_seoagent_test_caps'] = true;
        $this->assertTrue(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_valid_service_jwt_is_allowed(): void
    {
        $tok = self::sign(['sub' => 'service', 'scope' => 'read', 'iat' => time(), 'exp' => time() + 60], self::JWT_SECRET);
        $GLOBALS['_seoagent_test_headers'] = ['authorization' => "Bearer $tok"];
        $this->assertTrue(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_lowercase_bearer_scheme_is_allowed(): void
    {
        $tok = self::sign(['sub' => 'service', 'scope' => 'write', 'iat' => time(), 'exp' => time() + 60], self::JWT_SECRET);
        $GLOBALS['_seoagent_test_headers'] = ['authorization' => "bearer $tok"];
        $this->assertTrue(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_expired_jwt_is_rejected(): void
    {
        $tok = self::sign(['sub' => 'service', 'iat' => time() - 7200, 'exp' => time() - 100], self::JWT_SECRET);
        $GLOBALS['_seoagent_test_headers'] = ['authorization' => "Bearer $tok"];
        $this->assertFalse(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_jwt_signed_with_wrong_secret_is_rejected(): void
    {
        $tok = self::sign(['sub' => 'service', 'iat' => time(), 'exp' => time() + 60], 'wrong-secret-32-bytes-min-pls!!!!');
        $GLOBALS['_seoagent_test_headers'] = ['authorization' => "Bearer $tok"];
        $this->assertFalse(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_dual_mode_shared_secret_fallback(): void
    {
        $GLOBALS['_seoagent_test_headers'] = ['x-shared-secret' => 'shared-test-secret'];
        $this->assertTrue(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_dual_mode_write_secret_fallback(): void
    {
        $GLOBALS['_seoagent_test_headers'] = ['x-write-secret' => 'write-test-secret'];
        $this->assertTrue(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_no_auth_at_all_is_rejected(): void
    {
        $this->assertFalse(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    public function test_wrong_shared_secret_is_rejected(): void
    {
        $GLOBALS['_seoagent_test_headers'] = ['x-shared-secret' => 'totally-wrong'];
        $this->assertFalse(REST_Controller::permit_admin_or_jwt(new WP_REST_Request()));
    }

    private static function sign(array $payload, string $secret): string
    {
        $b64 = static fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $h   = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p   = $b64(json_encode($payload));
        $sig = $b64(hash_hmac('sha256', "$h.$p", $secret, true));
        return "$h.$p.$sig";
    }
}
