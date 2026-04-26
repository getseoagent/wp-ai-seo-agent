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

        register_rest_route('seoagent/v1', '/post/(?P<id>\d+)/summary', [
            'methods'             => 'GET',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                $payload = self::handle_get_post_summary((int) $req['id']);
                if ($payload === null) {
                    return new \WP_REST_Response(['error' => 'post not found'], 404);
                }
                return new \WP_REST_Response($payload);
            },
            'permission_callback' => [self::class, 'permit_admin'],
        ]);

        register_rest_route('seoagent/v1', '/categories', [
            'methods'             => 'GET',
            'callback'            => static fn(): \WP_REST_Response =>
                new \WP_REST_Response(self::handle_get_taxonomy_terms('category')),
            'permission_callback' => [self::class, 'permit_admin'],
        ]);
        register_rest_route('seoagent/v1', '/tags', [
            'methods'             => 'GET',
            'callback'            => static fn(): \WP_REST_Response =>
                new \WP_REST_Response(self::handle_get_taxonomy_terms('post_tag')),
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
     * @param \Closure(int): ?object $loader
     * @return array<string, mixed>|null
     */
    public static function handle_get_post_summary(int $id, ?\Closure $loader = null, ?Adapters\Seo_Fields_Adapter $adapter = null): ?array
    {
        $loader  ??= static fn(int $id): ?object => get_post($id) ?: null;
        $adapter ??= Adapters\Adapter_Factory::make(Adapters\Adapter_Factory::detect());
        $post = $loader($id);
        if ($post === null) return null;

        return [
            'id'         => (int) $post->ID,
            'post_title' => (string) $post->post_title,
            'slug'       => (string) $post->post_name,
            'status'     => (string) $post->post_status,
            'modified'   => (string) $post->post_modified,
            'word_count' => self::word_count_unicode(wp_strip_all_tags((string) $post->post_content)),
            'current_seo' => [
                'title'         => $adapter->get_seo_title($id),
                'description'   => $adapter->get_seo_description($id),
                'focus_keyword' => $adapter->get_focus_keyword($id),
                'og_title'      => $adapter->get_og_title($id),
            ],
        ];
    }

    private static function word_count_unicode(string $text): int
    {
        $trimmed = trim($text);
        if ($trimmed === '') return 0;
        $parts = preg_split('/\s+/u', $trimmed);
        return is_array($parts) ? count($parts) : 0;
    }

    /**
     * @param \Closure(string): list<object>|null $loader
     * @return list<array{id:int, name:string, slug:string, count:int}>
     */
    public static function handle_get_taxonomy_terms(string $taxonomy, ?\Closure $loader = null): array
    {
        $loader ??= static function (string $tax): array {
            $terms = get_terms(['taxonomy' => $tax, 'hide_empty' => false]);
            return is_array($terms) ? $terms : [];
        };
        return array_map(static fn(object $t): array => [
            'id'    => (int) $t->term_id,
            'name'  => (string) $t->name,
            'slug'  => (string) $t->slug,
            'count' => (int) $t->count,
        ], $loader($taxonomy));
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
