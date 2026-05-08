<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\Backend_Client;
use SeoAgent\REST_Controller;

/**
 * Unit tests for the SSE-streaming `proxy_chat` proxy. The full request flow
 * is exit-based and depends on a live network call, so these tests target
 * the small, pure helpers we extracted to make the wp_remote_post + http_api_curl
 * rewrite reviewable:
 *
 *  - emit_sse_chunk()      — raw passthrough byte echo + flush
 *  - sse_write_callback()  — cURL CURLOPT_WRITEFUNCTION callback signature
 *  - is_chat_proxy_url()   — URL gate so the http_api_curl filter only
 *                            attaches our SSE callbacks for the backend
 *                            /chat endpoint, never for unrelated callers.
 */
final class RestControllerProxyChatTest extends TestCase
{
    protected function setUp(): void
    {
        REST_Controller::$connection_aborted_override = null;
        // Mirror BackendClientTest's setUp so backend_url() resolves the same
        // way regardless of which test class PHPUnit happens to load first.
        if (!defined('SEO_AGENT_BACKEND_URL')) {
            define('SEO_AGENT_BACKEND_URL', 'http://backend.test');
        }
    }

    protected function tearDown(): void
    {
        REST_Controller::$connection_aborted_override = null;
    }

    public function test_emit_sse_chunk_outputs_exact_bytes(): void
    {
        $payload = "event: token\ndata: hello world\n\n";

        ob_start();
        ob_start();
        REST_Controller::emit_sse_chunk($payload);
        ob_end_clean();
        $captured = ob_get_clean();

        $this->assertSame($payload, $captured);
    }

    public function test_emit_sse_chunk_does_not_html_escape_sse_framing(): void
    {
        // SSE bytes are framed as text/event-stream — escaping `<`/`>` would
        // corrupt the protocol. The helper must passthrough verbatim.
        $payload = "data: <p>hello</p>\n\n";

        ob_start();
        ob_start();
        REST_Controller::emit_sse_chunk($payload);
        ob_end_clean();
        $captured = ob_get_clean();

        $this->assertSame($payload, $captured);
    }

    public function test_sse_write_callback_returns_byte_length_and_emits_chunk(): void
    {
        $chunk = "data: token\n\n";

        // sse_write_callback (and emit_sse_chunk) intentionally call ob_flush()
        // + flush() to push each chunk out to the client immediately. Nest two
        // buffer levels: the inner one absorbs the chunk and the @ob_flush
        // moves it up into the outer one, which we then capture.
        ob_start();
        ob_start();
        $written = REST_Controller::sse_write_callback(null, $chunk);
        ob_end_clean();
        $captured = ob_get_clean();

        $this->assertSame(strlen($chunk), $written);
        $this->assertSame($chunk, $captured);
    }

    public function test_sse_write_callback_returns_zero_when_connection_aborted(): void
    {
        REST_Controller::$connection_aborted_override = static fn(): bool => true;
        $chunk = "data: token\n\n";

        ob_start();
        ob_start();
        $written = REST_Controller::sse_write_callback(null, $chunk);
        ob_end_clean();
        $captured = ob_get_clean();

        // returning != strlen aborts the cURL transfer; emit nothing on abort.
        $this->assertSame(0, $written);
        $this->assertSame('', $captured);
    }

    public function test_is_chat_proxy_url_matches_backend_chat_endpoint(): void
    {
        $expected = Backend_Client::backend_url() . '/chat';
        $this->assertTrue(REST_Controller::is_chat_proxy_url($expected));
    }

    public function test_is_chat_proxy_url_rejects_unrelated_urls(): void
    {
        $base = Backend_Client::backend_url();
        $this->assertFalse(REST_Controller::is_chat_proxy_url($base . '/health'));
        $this->assertFalse(REST_Controller::is_chat_proxy_url($base . '/auth/token'));
        $this->assertFalse(REST_Controller::is_chat_proxy_url('https://other.example.com/chat'));
        $this->assertFalse(REST_Controller::is_chat_proxy_url($base . '/'));
    }

    public function test_is_chat_proxy_url_rejects_chat_substring_in_path(): void
    {
        // Defensive: a request to a `…/chat-export` endpoint must NOT trigger
        // the SSE callbacks; the gate is exact-equality, not substring.
        $base = Backend_Client::backend_url();
        $this->assertFalse(REST_Controller::is_chat_proxy_url($base . '/chat-export'));
        $this->assertFalse(REST_Controller::is_chat_proxy_url($base . '/chat/foo'));
    }
}
