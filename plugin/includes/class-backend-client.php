<?php
declare(strict_types=1);

namespace SeoAgent;

final class Backend_Client
{
    public static function backend_url(): string
    {
        $configured = defined('SEO_AGENT_BACKEND_URL') ? (string) SEO_AGENT_BACKEND_URL : '';
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        return 'http://localhost:8787';
    }

    public static function shared_secret(): string
    {
        return defined('SEO_AGENT_SHARED_SECRET') ? (string) SEO_AGENT_SHARED_SECRET : '';
    }

    /**
     * Pure builder, used in tests and by send_chat().
     *
     * @return array<string, mixed>
     */
    public static function build_request_args(string $api_key, string $message, string $secret): array
    {
        return [
            'method'   => 'POST',
            'headers'  => [
                'content-type'   => 'application/json',
                'x-shared-secret' => $secret,
            ],
            'body'     => wp_json_encode([
                'message' => $message,
                'api_key' => $api_key,
            ]),
            'timeout'  => 120,
            'blocking' => false,
        ];
    }

    /**
     * Fire-and-forget POST to backend. Streaming is read by the browser, not PHP.
     */
    public static function send_chat(string $api_key, string $message): void
    {
        $url  = self::backend_url() . '/chat';
        $args = self::build_request_args($api_key, $message, self::shared_secret());
        wp_remote_post($url, $args);
    }
}
