<?php
declare(strict_types=1);

namespace SeoAgent;

use SeoAgent\Adapters;

final class REST_Controller
{
    private const LIST_POSTS_MAX_LIMIT = 50;

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

        register_rest_route('seoagent/v1', '/detect-seo-plugin', [
            'methods'             => 'GET',
            'callback'            => static function (): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_detect_seo_plugin());
            },
            'permission_callback' => [self::class, 'permit_admin'],
        ]);

        register_rest_route('seoagent/v1', '/posts', [
            'methods'             => 'GET',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_list_posts($req->get_query_params()));
            },
            'permission_callback' => [self::class, 'permit_admin'],
        ]);
    }

    public static function permit_admin(): bool
    {
        return current_user_can('manage_options');
    }

    /** @return array{name: string} */
    public static function handle_detect_seo_plugin(): array
    {
        return ['name' => Adapters\Adapter_Factory::detect()];
    }

    /**
     * @param array<string, mixed> $params
     * @param \Closure(array<string,mixed>): array{posts: list<object>, total: int}|null $query_fn
     * @return array{posts: list<array<string,mixed>>, next_cursor: int|null, total: int}
     */
    public static function handle_list_posts(array $params, ?\Closure $query_fn = null): array
    {
        $limit  = max(1, min(self::LIST_POSTS_MAX_LIMIT, (int) ($params['limit'] ?? 20)));
        $cursor = max(0, (int) ($params['cursor'] ?? 0));
        $args = [
            'post_type'      => 'post',
            'post_status'    => $params['status'] ?? 'publish',
            'posts_per_page' => $limit,
            'paged'          => intdiv($cursor, $limit) + 1,
            'orderby'        => 'modified',
            'order'          => 'DESC',
        ];
        if (!empty($params['category'])) $args['category_name'] = (string) $params['category'];
        if (!empty($params['tag']))      $args['tag']           = (string) $params['tag'];
        if (!empty($params['after']))    $args['date_query'][] = ['after'  => (string) $params['after']];
        if (!empty($params['before']))   $args['date_query'][] = ['before' => (string) $params['before']];

        $query_fn ??= static function (array $args): array {
            $q = new \WP_Query($args);
            return ['posts' => $q->posts, 'total' => (int) $q->found_posts];
        };

        $result = $query_fn($args);
        $posts  = array_map(static fn(object $p): array => [
            'id'         => (int) $p->ID,
            'post_title' => (string) $p->post_title,
            'slug'       => (string) $p->post_name,
            'status'     => (string) $p->post_status,
            'modified'   => (string) $p->post_modified,
        ], $result['posts']);

        $next_cursor = ($cursor + count($posts) < $result['total']) ? $cursor + count($posts) : null;

        return ['posts' => $posts, 'next_cursor' => $next_cursor, 'total' => $result['total']];
    }

    /**
     * Streaming SSE proxy. Bypasses WP_REST_Response on purpose: REST infra
     * buffers responses, which would defeat token-by-token delivery. Any
     * non-streaming endpoint must use the standard `return new WP_REST_Response`
     * form instead of duplicating this exit-based path.
     */
    public static function proxy_chat(\WP_REST_Request $request): never
    {
        $message = (string) $request->get_param('message');
        if ($message === '') {
            wp_send_json_error(['error' => 'message required'], 400);
        }

        $api_key = Settings::get_api_key();
        if ($api_key === null) {
            wp_send_json_error(['error' => 'api key not set'], 400);
        }

        @ini_set('output_buffering', '0');
        @ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('X-Accel-Buffering: no');

        $url = Backend_Client::backend_url() . '/chat';
        $payload = wp_json_encode(['message' => $message]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Shared-Secret: ' . Backend_Client::shared_secret(),
                'X-Anthropic-Key: ' . $api_key,
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
