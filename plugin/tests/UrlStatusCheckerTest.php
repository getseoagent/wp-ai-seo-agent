<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\URL_Status_Checker;

final class UrlStatusCheckerTest extends TestCase
{
    public function test_constructor_accepts_http_and_cache_closures(): void
    {
        $http  = static fn ( string $url, array $args ): array => [ 'response' => [ 'code' => 200 ], 'body' => '' ];
        $cache = self::null_cache();

        $checker = new URL_Status_Checker( $http, $cache );

        $this->assertInstanceOf( URL_Status_Checker::class, $checker );
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
