<?php
declare(strict_types=1);

namespace SeoAgent;

use SeoAgent\Adapters;
use SeoAgent\History_Store;

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
                'message'    => ['type' => 'string', 'required' => true],
                'session_id' => ['type' => 'string', 'required' => true],
            ],
        ]);

        register_rest_route('seoagent/v1', '/detect-seo-plugin', [
            'methods'             => 'GET',
            'callback'            => static function (): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_detect_seo_plugin());
            },
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
        ]);

        register_rest_route('seoagent/v1', '/posts', [
            'methods'             => 'GET',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_list_posts($req->get_query_params()));
            },
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
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
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
        ]);

        register_rest_route('seoagent/v1', '/categories', [
            'methods'             => 'GET',
            'callback'            => static fn(): \WP_REST_Response =>
                new \WP_REST_Response(self::handle_get_taxonomy_terms('category')),
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
        ]);
        register_rest_route('seoagent/v1', '/tags', [
            'methods'             => 'GET',
            'callback'            => static fn(): \WP_REST_Response =>
                new \WP_REST_Response(self::handle_get_taxonomy_terms('post_tag')),
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
        ]);

        register_rest_route('seoagent/v1', '/post/(?P<id>\d+)/seo-fields', [
            'methods'             => 'POST',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_update_seo_fields(
                    (int) $req['id'],
                    $req->get_json_params() ?? []
                ));
            },
            'permission_callback' => [self::class, 'permit_admin_or_write_secret'],
        ]);
    }

    public static function permit_admin(): bool
    {
        return current_user_can('manage_options');
    }

    /**
     * Accepts either an admin user (browser→WP path) or a request carrying
     * the shared-secret header (backend→WP path). Plan 4 replaces the
     * shared-secret leg with HS256 JWT.
     */
    public static function permit_admin_or_secret(\WP_REST_Request $request): bool
    {
        if (current_user_can('manage_options')) {
            return true;
        }
        $expected = Backend_Client::shared_secret();
        if ($expected === '') {
            return false;
        }
        return hash_equals($expected, (string) $request->get_header('x-shared-secret'));
    }

    /**
     * Mirror of permit_admin_or_secret but checks X-Write-Secret against
     * SEO_AGENT_WRITE_SECRET. Used on write endpoints (Tasks 7, 9) to isolate
     * code-bug blast radius — a leaked read-secret cannot enable writes.
     */
    public static function permit_admin_or_write_secret(\WP_REST_Request $request): bool
    {
        if (current_user_can('manage_options')) {
            return true;
        }
        $expected = defined('SEO_AGENT_WRITE_SECRET') ? (string) SEO_AGENT_WRITE_SECRET : '';
        if ($expected === '') {
            return false;
        }
        return hash_equals($expected, (string) $request->get_header('x-write-secret'));
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
        if (!empty($params['slugs'])) {
            $raw = $params['slugs'];
            $list = is_array($raw) ? $raw : explode(',', (string) $raw);
            $list = array_values(array_filter(array_map(static fn($s) => sanitize_title((string) $s), $list)));
            if (!empty($list)) {
                $args['post_name__in'] = $list;
            }
        }

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
     * @param array<string, mixed> $params
     * @return array{job_id: string, results: list<array<string,mixed>>}
     */
    public static function handle_update_seo_fields(
        int $post_id,
        array $params,
        ?Adapters\Seo_Fields_Adapter $adapter = null,
        ?History_Store $store = null,
        ?\Closure $uuid = null
    ): array {
        $adapter ??= Adapters\Adapter_Factory::make(Adapters\Adapter_Factory::detect());
        $store   ??= new History_Store($GLOBALS['wpdb']);
        $uuid    ??= static fn(): string => wp_generate_uuid4();

        $job_id  = (string) ($params['job_id'] ?? $uuid());
        $fields  = is_array($params['fields'] ?? null) ? (array) $params['fields'] : [];
        $user_id = function_exists('get_current_user_id') ? (get_current_user_id() ?: null) : null;

        $results = [];
        foreach ($fields as $field => $value) {
            if (!is_string($field) || !is_string($value)) {
                continue; // schema rejects null already
            }
            if (!$adapter->supports($field)) {
                $store->insert([
                    'post_id' => $post_id, 'job_id' => $job_id, 'field' => $field,
                    'before_value' => null, 'after_value' => null,
                    'status' => 'skipped_failed', 'reason' => 'adapter does not support field',
                    'user_id' => $user_id,
                ]);
                $results[] = ['field' => $field, 'status' => 'skipped_failed', 'before' => null, 'after' => null, 'reason' => 'adapter does not support field'];
                continue;
            }

            $before = self::adapter_get($adapter, $field, $post_id);
            $after  = wp_kses_post($value);

            if ($before === $after) {
                $store->insert([
                    'post_id' => $post_id, 'job_id' => $job_id, 'field' => $field,
                    'before_value' => $before, 'after_value' => $after,
                    'status' => 'skipped_unchanged', 'reason' => null,
                    'user_id' => $user_id,
                ]);
                $results[] = ['field' => $field, 'status' => 'skipped_unchanged', 'before' => $before, 'after' => $after];
                continue;
            }

            try {
                self::adapter_set($adapter, $field, $post_id, $after);
                $store->insert([
                    'post_id' => $post_id, 'job_id' => $job_id, 'field' => $field,
                    'before_value' => $before, 'after_value' => $after,
                    'status' => 'applied', 'reason' => null,
                    'user_id' => $user_id,
                ]);
                $results[] = ['field' => $field, 'status' => 'applied', 'before' => $before, 'after' => $after];
            } catch (\Throwable $e) {
                $store->insert([
                    'post_id' => $post_id, 'job_id' => $job_id, 'field' => $field,
                    'before_value' => $before, 'after_value' => $after,
                    'status' => 'skipped_failed', 'reason' => $e->getMessage(),
                    'user_id' => $user_id,
                ]);
                $results[] = ['field' => $field, 'status' => 'skipped_failed', 'before' => $before, 'after' => null, 'reason' => $e->getMessage()];
            }
        }

        return ['job_id' => $job_id, 'results' => $results];
    }

    private static function adapter_get(Adapters\Seo_Fields_Adapter $adapter, string $field, int $post_id): ?string
    {
        return match ($field) {
            'title'         => $adapter->get_seo_title($post_id),
            'description'   => $adapter->get_seo_description($post_id),
            'focus_keyword' => $adapter->get_focus_keyword($post_id),
            'og_title'      => $adapter->get_og_title($post_id),
            default         => null,
        };
    }

    private static function adapter_set(Adapters\Seo_Fields_Adapter $adapter, string $field, int $post_id, string $value): void
    {
        match ($field) {
            'title'         => $adapter->set_seo_title($post_id, $value),
            'description'   => $adapter->set_seo_description($post_id, $value),
            'focus_keyword' => $adapter->set_focus_keyword($post_id, $value),
            'og_title'      => $adapter->set_og_title($post_id, $value),
            default         => null,
        };
    }

    /**
     * Streaming SSE proxy. Bypasses WP_REST_Response on purpose: REST infra
     * buffers responses, which would defeat token-by-token delivery. Any
     * non-streaming endpoint must use the standard `return new WP_REST_Response`
     * form instead of duplicating this exit-based path.
     */
    public static function proxy_chat(\WP_REST_Request $request): never
    {
        $message    = (string) $request->get_param('message');
        $session_id = (string) $request->get_param('session_id');
        if ($message === '') {
            wp_send_json_error(['error' => 'message required'], 400);
        }
        if ($session_id === '') {
            wp_send_json_error(['error' => 'session_id required'], 400);
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
        $payload = wp_json_encode(['message' => $message, 'session_id' => $session_id]);

        ignore_user_abort(false);

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
                if (connection_aborted()) {
                    return 0; // returning != strlen aborts the cURL transfer
                }
                echo $chunk;
                @ob_flush();
                @flush();
                return strlen($chunk);
            },
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_TIMEOUT        => 0,
            CURLOPT_NOPROGRESS     => false,
            CURLOPT_PROGRESSFUNCTION => static function (): int {
                return connection_aborted() ? 1 : 0; // non-zero aborts
            },
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
