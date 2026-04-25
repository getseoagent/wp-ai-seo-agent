<?php
declare(strict_types=1);

namespace SeoAgent;

final class REST_Controller
{
    public static function init(): void
    {
        add_action('rest_api_init', [self::class, 'register_routes']);
    }

    public static function register_routes(): void
    {
        register_rest_route('seoagent/v1', '/chat', [
            'methods'             => 'POST',
            'callback'            => [self::class, 'proxy_chat'],
            'permission_callback' => [self::class, 'permit_admin'],
            'args'                => [
                'message' => [
                    'type'     => 'string',
                    'required' => true,
                ],
            ],
        ]);
    }

    public static function permit_admin(): bool
    {
        return current_user_can('manage_options');
    }

    public static function proxy_chat(\WP_REST_Request $request): void
    {
        $message = (string) $request->get_param('message');
        if ($message === '') {
            wp_send_json_error(['error' => 'message required'], 400);
            return;
        }

        $api_key = Settings::get_api_key();
        if ($api_key === null) {
            wp_send_json_error(['error' => 'api key not set'], 400);
            return;
        }

        // Stream from backend to browser, byte-for-byte.
        @ini_set('output_buffering', '0');
        @ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('X-Accel-Buffering: no');

        $url = Backend_Client::backend_url() . '/chat';
        $payload = wp_json_encode([
            'message' => $message,
            'api_key' => $api_key,
        ]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Shared-Secret: ' . Backend_Client::shared_secret(),
            ],
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_WRITEFUNCTION  => static function ($ch, string $chunk): int {
                echo $chunk;
                @ob_flush();
                @flush();
                return strlen($chunk);
            },
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_TIMEOUT        => 0,
        ]);

        $ok = curl_exec($ch);
        if ($ok === false) {
            $err = curl_error($ch);
            echo "event: error\ndata: " . wp_json_encode(['type' => 'error', 'message' => $err]) . "\n\n";
        }
        curl_close($ch);
        exit;
    }
}
