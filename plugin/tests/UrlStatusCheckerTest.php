<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\URL_Status_Checker;

final class UrlStatusCheckerTest extends TestCase
{
    public function test_constructor_accepts_http_and_cache_closures(): void
    {
        $http    = static fn ( string $url, array $args ): array => [ 'response' => [ 'code' => 200 ], 'body' => '' ];
        $cache   = self::null_cache();
        $sleeper = static fn ( int $ms ): null => null;

        $checker = new URL_Status_Checker( $http, $cache, $sleeper );

        $this->assertInstanceOf( URL_Status_Checker::class, $checker );
    }

    public function test_check_single_does_head_request_when_no_cache_hit(): void
    {
        $captured_args = null;
        $http = static function ( string $url, array $args ) use ( &$captured_args ): array {
            $captured_args = [ 'url' => $url, 'args' => $args ];
            return [ 'response' => [ 'code' => 200 ], 'body' => '' ];
        };

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertSame( 'https://example.com/page', $captured_args['url'] );
        $this->assertSame( 'HEAD', $captured_args['args']['method'] );
        $this->assertSame( 200, $status->http_code );
        $this->assertFalse( $status->from_cache );
        $this->assertNull( $status->error );
    }

    public function test_check_single_sends_real_browser_ua_and_short_timeout(): void
    {
        $captured_args = null;
        $http = static function ( string $url, array $args ) use ( &$captured_args ): array {
            $captured_args = $args;
            return [ 'response' => [ 'code' => 200 ], 'body' => '' ];
        };

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $checker->check_single( 'https://example.com' );

        $this->assertStringContainsString( 'Mozilla/5.0', $captured_args['user-agent'] ?? '' );
        $this->assertSame( 10, $captured_args['timeout'] );
    }

    public function test_check_single_writes_result_to_cache(): void
    {
        $written = null;
        $cache   = array(
            'get' => static fn ( string $key ): mixed => false,
            'set' => static function ( string $key, mixed $value, int $ttl ) use ( &$written ): bool {
                $written = compact( 'key', 'value', 'ttl' );
                return true;
            },
        );
        $http = static fn (): array => [ 'response' => [ 'code' => 200 ], 'body' => '' ];

        $checker = new URL_Status_Checker( $http, $cache );
        $checker->check_single( 'https://example.com/page' );

        $this->assertStringStartsWith( 'seoagent_url_status_', $written['key'] );
        $this->assertSame( DAY_IN_SECONDS, $written['ttl'] );
        $this->assertSame( 200, $written['value']['http_code'] );
    }

    public function test_check_single_returns_cached_result_without_http_call(): void
    {
        $http_called = false;
        $http = static function () use ( &$http_called ): array {
            $http_called = true;
            return [ 'response' => [ 'code' => 200 ], 'body' => '' ];
        };
        $cache = array(
            'get' => static fn ( string $key ): mixed => array(
                'url'        => 'https://example.com/page',
                'http_code'  => 301,
                'error'      => null,
                'checked_at' => 1715000000,
            ),
            'set' => static fn ( string $k, mixed $v, int $t ): bool => true,
        );

        $checker = new URL_Status_Checker( $http, $cache );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertFalse( $http_called );
        $this->assertSame( 301, $status->http_code );
        $this->assertTrue( $status->from_cache );
        $this->assertSame( 1715000000, $status->checked_at );
    }

    public function test_check_single_returns_status_with_null_code_on_wp_error(): void
    {
        $http = static fn (): \WP_Error => new \WP_Error( 'http_request_failed', 'cURL error 6: Could not resolve host' );

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $status  = $checker->check_single( 'https://nonexistent.example.invalid' );

        $this->assertNull( $status->http_code );
        $this->assertStringContainsString( 'Could not resolve host', $status->error );
        $this->assertFalse( $status->ok() );
    }

    public function test_check_single_treats_array_without_response_key_as_unexpected_shape(): void
    {
        // Some plugins filter wp_remote_request to return a stripped/non-standard
        // shape — e.g. just ['body' => '...']. We surface http_code=null with a
        // descriptive error rather than silently treating it as a 0-status.
        $http = static fn (): array => [ 'body' => '' ];

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertNull( $status->http_code );
        $this->assertSame( 'unexpected http return shape', $status->error );
        $this->assertFalse( $status->ok() );
    }

    public function test_check_single_treats_non_int_response_code_as_malformed(): void
    {
        // Defensive: a stringy '200' from a non-conformant transport filter
        // would otherwise leak through and break URL_Status::ok()'s numeric
        // comparison. Surface as http_code=null + explicit error.
        $http = static fn (): array => [ 'response' => [ 'code' => '200' ], 'body' => '' ];

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertNull( $status->http_code );
        $this->assertSame( 'malformed response', $status->error );
    }

    public function test_check_single_falls_back_to_get_range_on_405(): void
    {
        $calls = array();
        $http  = static function ( string $url, array $args ) use ( &$calls ): array {
            $calls[] = $args['method'] . ' ' . ( $args['headers']['Range'] ?? '' );
            if ( $args['method'] === 'HEAD' ) {
                return array( 'response' => array( 'code' => 405 ), 'body' => '' );
            }
            return array( 'response' => array( 'code' => 200 ), 'body' => 'a' );
        };

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertSame( array( 'HEAD ', 'GET bytes=0-0' ), $calls );
        $this->assertSame( 200, $status->http_code );
    }

    public function test_check_single_falls_back_to_get_range_on_501(): void
    {
        $get_called = false;
        $http       = static function ( string $url, array $args ) use ( &$get_called ): array {
            if ( $args['method'] === 'HEAD' ) {
                return array( 'response' => array( 'code' => 501 ), 'body' => '' );
            }
            $get_called = true;
            return array( 'response' => array( 'code' => 200 ), 'body' => 'a' );
        };

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertTrue( $get_called );
        $this->assertSame( 200, $status->http_code );
    }

    public function test_check_single_does_not_fallback_on_2xx_3xx_4xx_other_than_405(): void
    {
        $http_calls = 0;
        $http = static function ( string $url, array $args ) use ( &$http_calls ): array {
            $http_calls++;
            return array( 'response' => array( 'code' => 404 ), 'body' => '' );
        };

        $checker = new URL_Status_Checker( $http, self::null_cache() );
        $status  = $checker->check_single( 'https://example.com/missing' );

        $this->assertSame( 1, $http_calls, 'HEAD-only — 404 means the page genuinely doesnt exist, no GET retry' );
        $this->assertSame( 404, $status->http_code );
    }

    public function test_check_single_retries_once_on_5xx_then_succeeds(): void
    {
        $attempt   = 0;
        $sleep_ms  = null;
        $http      = static function ( string $url, array $args ) use ( &$attempt ): array {
            $attempt++;
            if ( $attempt === 1 ) {
                return array( 'response' => array( 'code' => 503 ), 'body' => '' );
            }
            return array( 'response' => array( 'code' => 200 ), 'body' => '' );
        };
        $sleeper = static function ( int $ms ) use ( &$sleep_ms ): void {
            $sleep_ms = $ms;
        };

        $checker = new URL_Status_Checker( $http, self::null_cache(), $sleeper );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertSame( 200, $status->http_code );
        $this->assertSame( 2, $attempt );
        $this->assertSame( 500, $sleep_ms );
    }

    public function test_check_single_returns_5xx_after_one_retry_still_5xx(): void
    {
        $attempt = 0;
        $http    = static function () use ( &$attempt ): array {
            $attempt++;
            return array( 'response' => array( 'code' => 502 ), 'body' => '' );
        };

        $checker = new URL_Status_Checker( $http, self::null_cache(), static fn ( int $ms ): null => null );
        $status  = $checker->check_single( 'https://example.com/page' );

        $this->assertSame( 502, $status->http_code );
        $this->assertSame( 2, $attempt, 'one retry, no more' );
        $this->assertFalse( $status->ok() );
    }

    public function test_check_single_does_not_retry_on_4xx(): void
    {
        $attempt = 0;
        $http    = static function () use ( &$attempt ): array {
            $attempt++;
            return array( 'response' => array( 'code' => 404 ), 'body' => '' );
        };

        $checker = new URL_Status_Checker( $http, self::null_cache(), static fn ( int $ms ): null => null );
        $status  = $checker->check_single( 'https://example.com/missing' );

        $this->assertSame( 1, $attempt );
        $this->assertSame( 404, $status->http_code );
    }

    public function test_check_single_does_not_retry_on_wp_error(): void
    {
        // A transport error (DNS, TLS, connect timeout) is unlikely to clear in
        // 500ms — don't waste the budget. Re-test later when cache expires.
        $attempt = 0;
        $http    = static function () use ( &$attempt ): \WP_Error {
            $attempt++;
            return new \WP_Error( 'http_request_failed', 'cURL error 28: Operation timed out' );
        };

        $checker = new URL_Status_Checker( $http, self::null_cache(), static fn ( int $ms ): null => null );
        $status  = $checker->check_single( 'https://slow.example' );

        $this->assertSame( 1, $attempt );
        $this->assertNull( $status->http_code );
    }

    /**
     * Cache fake that never has a hit and silently accepts writes. Used by
     * tests that want to bypass caching entirely and just exercise the HTTP
     * path. Returns the same closures every call — no shared state between
     * tests.
     *
     * @return array{get: callable, set: callable}
     */
    private static function null_cache(): array {
        return [
            'get' => static fn ( string $key ): mixed => false,
            'set' => static fn ( string $key, mixed $value, int $ttl ): bool => true,
        ];
    }
}
