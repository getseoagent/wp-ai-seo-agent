<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\URL_Status;

final class UrlStatusTest extends TestCase
{
    public function test_holds_all_fields_verbatim(): void
    {
        $status = new URL_Status(
            url:        'https://example.com/page',
            http_code:  200,
            error:      null,
            from_cache: false,
            checked_at: 1715785200
        );

        $this->assertSame('https://example.com/page', $status->url);
        $this->assertSame(200, $status->http_code);
        $this->assertNull($status->error);
        $this->assertFalse($status->from_cache);
        $this->assertSame(1715785200, $status->checked_at);
    }

    public function test_ok_returns_true_for_2xx(): void
    {
        $status = new URL_Status('https://e.com', 204, null, false, 1);
        $this->assertTrue($status->ok());
    }

    public function test_ok_returns_true_for_3xx(): void
    {
        $status = new URL_Status('https://e.com', 301, null, false, 1);
        $this->assertTrue($status->ok());
    }

    public function test_ok_returns_false_for_4xx(): void
    {
        $status = new URL_Status('https://e.com', 404, null, false, 1);
        $this->assertFalse($status->ok());
    }

    public function test_ok_returns_false_for_5xx(): void
    {
        $status = new URL_Status('https://e.com', 503, null, false, 1);
        $this->assertFalse($status->ok());
    }

    public function test_ok_returns_false_when_http_code_is_null(): void
    {
        $status = new URL_Status('https://e.com', null, 'connection timeout', false, 1);
        $this->assertFalse($status->ok());
    }

    public function test_dead_returns_true_for_404(): void
    {
        $status = new URL_Status('https://e.com', 404, null, false, 1);
        $this->assertTrue($status->dead());
    }

    public function test_dead_returns_true_for_410(): void
    {
        $status = new URL_Status('https://e.com', 410, null, false, 1);
        $this->assertTrue($status->dead());
    }

    public function test_dead_returns_false_for_403(): void
    {
        // 403 is "I see you and refuse" — not "doesn't exist". Don't treat as dead.
        $status = new URL_Status('https://e.com', 403, null, false, 1);
        $this->assertFalse($status->dead());
    }
}
