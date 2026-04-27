<?php
declare(strict_types=1);

namespace SeoAgent;

use SeoAgent\Adapters;
use SeoAgent\History_Store;
use SeoAgent\Jobs_Store;

final class REST_Controller
{
    private const LIST_POSTS_MAX_LIMIT = 50;
    private const HISTORY_MAX_LIMIT = 100;
    private const ROLLBACK_MAX_IDS = 50;

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

        register_rest_route('seoagent/v1', '/history', [
            'methods'             => 'GET',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                $params = $req->get_query_params();
                if (empty($params['post_id']) && empty($params['job_id'])) {
                    return new \WP_REST_Response(['error' => 'post_id or job_id required'], 400);
                }
                return new \WP_REST_Response(self::handle_get_history($params));
            },
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
        ]);

        register_rest_route('seoagent/v1', '/rollback', [
            'methods'             => 'POST',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_rollback($req->get_json_params() ?? []));
            },
            'permission_callback' => [self::class, 'permit_admin_or_write_secret'],
        ]);

        register_rest_route('seoagent/v1', '/jobs', [
            'methods'             => 'POST',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                $params = $req->get_json_params() ?? [];
                return new \WP_REST_Response(self::handle_create_job($params));
            },
            'permission_callback' => [self::class, 'permit_admin_or_write_secret'],
        ]);

        register_rest_route('seoagent/v1', '/jobs', [
            'methods'             => 'GET',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_find_running_jobs($req->get_query_params()));
            },
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
        ]);

        register_rest_route('seoagent/v1', '/jobs/(?P<id>[a-zA-Z0-9-]+)', [
            'methods'             => 'GET',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                $job = self::handle_get_job((string) $req['id']);
                if ($job === null) {
                    return new \WP_REST_Response(['error' => 'not found'], 404);
                }
                return new \WP_REST_Response($job);
            },
            'permission_callback' => [self::class, 'permit_admin_or_secret'],
        ]);

        register_rest_route('seoagent/v1', '/jobs/(?P<id>[a-zA-Z0-9-]+)/progress', [
            'methods'             => 'POST',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                $params = $req->get_json_params() ?? [];
                return new \WP_REST_Response(self::handle_update_job_progress((string) $req['id'], $params));
            },
            'permission_callback' => [self::class, 'permit_admin_or_write_secret'],
        ]);

        register_rest_route('seoagent/v1', '/jobs/(?P<id>[a-zA-Z0-9-]+)/done', [
            'methods'             => 'POST',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                $params = $req->get_json_params() ?? [];
                return new \WP_REST_Response(self::handle_mark_job_done((string) $req['id'], $params));
            },
            'permission_callback' => [self::class, 'permit_admin_or_write_secret'],
        ]);

        register_rest_route('seoagent/v1', '/jobs/(?P<id>[a-zA-Z0-9-]+)/cancel', [
            'methods'             => 'POST',
            'callback'            => static function (\WP_REST_Request $req): \WP_REST_Response {
                return new \WP_REST_Response(self::handle_cancel_job((string) $req['id']));
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
        $post_type_raw = $params['post_type'] ?? 'post';
        $post_type = is_array($post_type_raw)
            ? array_values(array_filter(array_map(static fn($s) => sanitize_key((string) $s), $post_type_raw)))
            : sanitize_key((string) $post_type_raw);
        $args = [
            'post_type'      => $post_type,
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
            'word_count' => self::word_count_unicode(wp_strip_all_tags((string) ($p->post_content ?? ''))),
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
            'content_preview' => self::content_preview((string) $post->post_content, 500),
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
     * Strip HTML, shortcodes, and scripts from post content; cap to N words.
     * Returns up to N words joined with single spaces, no trailing whitespace.
     */
    private static function content_preview(string $raw, int $max_words): string
    {
        if (function_exists('strip_shortcodes')) {
            $raw = strip_shortcodes($raw);
        }
        $stripped = wp_strip_all_tags($raw, true);
        $stripped = trim((string) preg_replace('/\s+/u', ' ', $stripped));
        if ($stripped === '') return '';

        $words = preg_split('/\s+/u', $stripped) ?: [];
        $result = count($words) <= $max_words
            ? implode(' ', $words)
            : implode(' ', array_slice($words, 0, $max_words));

        // Character backstop: protects CJK / unsegmented languages where preg_split('/\s+/u')
        // returns a single "word" that bypasses the word cap.
        $max_chars = $max_words * 10;
        if (function_exists('mb_substr') && mb_strlen($result) > $max_chars) {
            $result = mb_substr($result, 0, $max_chars);
        }
        return $result;
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

    /**
     * @param array<string, mixed> $params
     * @return array{rows: list<array<string,mixed>>, next_cursor: int|null, total: int}
     */
    public static function handle_get_history(array $params, ?History_Store $store = null): array
    {
        $store ??= new History_Store($GLOBALS['wpdb']);
        $limit  = max(1, min(self::HISTORY_MAX_LIMIT, (int) ($params['limit'] ?? 20)));
        $cursor = max(0, (int) ($params['cursor'] ?? 0));

        $post_id = isset($params['post_id']) ? (int) $params['post_id'] : null;
        $job_id  = isset($params['job_id'])  ? (string) $params['job_id']  : null;

        if ($post_id === null && ($job_id === null || $job_id === '')) {
            return ['rows' => [], 'next_cursor' => null, 'total' => 0]; // route handler turns this into 400
        }

        $raw = $post_id !== null
            ? $store->find_by_post($post_id, $limit, $cursor)
            : $store->find_by_job((string) $job_id, $limit, $cursor);

        $rows = array_map(static fn(object $r): array => [
            'id'             => (int) $r->id,
            'post_id'        => (int) $r->post_id,
            'job_id'         => (string) $r->job_id,
            'field'          => (string) $r->field,
            'before_value'   => $r->before_value !== null ? (string) $r->before_value : null,
            'after_value'    => $r->after_value  !== null ? (string) $r->after_value  : null,
            'status'         => (string) $r->status,
            'reason'         => $r->reason !== null ? (string) $r->reason : null,
            'user_id'        => $r->user_id !== null ? (int) $r->user_id : null,
            'created_at'     => (string) $r->created_at,
            'rolled_back_at' => $r->rolled_back_at !== null ? (string) $r->rolled_back_at : null,
        ], $raw);

        return ['rows' => $rows, 'next_cursor' => count($rows) === $limit ? $cursor + $limit : null, 'total' => count($rows)];
    }

    /**
     * Reverse one or more recorded writes. Audit is immutable: originals are
     * never overwritten, the reversal itself is a NEW row (status=applied,
     * reason='rollback of #N'), and the original row is stamped with
     * `rolled_back_at` as a forensic marker. Reversals are themselves
     * rollback-able by the same mechanism.
     *
     * @param array<string, mixed> $params
     * @return array{job_id: string, results: list<array<string,mixed>>, error?: string}
     */
    public static function handle_rollback(
        array $params,
        ?Adapters\Seo_Fields_Adapter $adapter = null,
        ?History_Store $store = null,
        ?\Closure $uuid = null,
        ?\Closure $now = null
    ): array {
        $adapter ??= Adapters\Adapter_Factory::make(Adapters\Adapter_Factory::detect());
        $store   ??= new History_Store($GLOBALS['wpdb']);
        $uuid    ??= static fn(): string => wp_generate_uuid4();
        $now     ??= static fn(): string => current_time('mysql');

        $job_id_in = isset($params['job_id']) && is_string($params['job_id']) && $params['job_id'] !== ''
            ? (string) $params['job_id']
            : null;
        $raw_ids = is_array($params['history_ids'] ?? null) ? (array) $params['history_ids'] : [];

        // Require exactly one of {history_ids, job_id}. Mirror Plan 3a's tool-return shape:
        // a 200 response with an `error` key + empty results so callers can branch on isset().
        if ($job_id_in === null && count($raw_ids) === 0) {
            return ['error' => 'rollback requires history_ids or job_id', 'job_id' => '', 'results' => []];
        }
        if ($job_id_in !== null && count($raw_ids) > 0) {
            return ['error' => 'rollback accepts only one of history_ids or job_id', 'job_id' => '', 'results' => []];
        }

        // job-id mode: resolve to the still-in-effect history rows for that job.
        if ($job_id_in !== null) {
            $rows    = $store->find_by_job_not_rolled_back($job_id_in);
            $raw_ids = array_map(static fn(object $r): int => (int) $r->id, $rows);
        }

        $ids     = array_slice($raw_ids, 0, self::ROLLBACK_MAX_IDS);
        $job_id  = $uuid();
        $user_id = function_exists('get_current_user_id') ? (get_current_user_id() ?: null) : null;

        // Wrap the batch in a wpdb transaction for crash safety. Per-row failures are
        // still recorded as status='failed' (Plan 3a semantics); the transaction only
        // protects against a fatal exception or DB outage mid-loop.
        $wpdb = $GLOBALS['wpdb'] ?? null;
        $can_tx = is_object($wpdb) && method_exists($wpdb, 'query');
        if ($can_tx) {
            $wpdb->query('START TRANSACTION');
        }

        $results = [];
        try {
            foreach ($ids as $raw_id) {
                $id  = (int) $raw_id;
                $row = $store->get($id);
                if ($row === null) {
                    $results[] = ['history_id' => $id, 'status' => 'not_found'];
                    continue;
                }
                if (!empty($row->rolled_back_at)) {
                    $results[] = ['history_id' => $id, 'status' => 'skipped', 'reason' => 'already rolled back'];
                    continue;
                }
                $field = (string) ($row->field ?? '');
                if (!$adapter->supports($field)) {
                    $results[] = ['history_id' => $id, 'status' => 'skipped', 'reason' => 'adapter does not support field'];
                    continue;
                }
                try {
                    $post_id    = (int) ($row->post_id ?? 0);
                    $value      = (string) ($row->before_value ?? '');
                    $before_now = self::adapter_get($adapter, $field, $post_id);
                    self::adapter_set($adapter, $field, $post_id, $value);
                    $store->insert([
                        'post_id'      => $post_id,
                        'job_id'       => $job_id,
                        'field'        => $field,
                        'before_value' => $before_now,
                        'after_value'  => $value,
                        'status'       => 'applied',
                        'reason'       => 'rollback of #' . $id,
                        'user_id'      => $user_id,
                    ]);
                    $store->mark_rolled_back($id, $now());
                    $results[] = ['history_id' => $id, 'status' => 'rolled_back'];
                } catch (\Throwable $e) {
                    // Per-row failures are non-fatal: record and continue.
                    $results[] = ['history_id' => $id, 'status' => 'failed', 'reason' => $e->getMessage()];
                }
            }
            if ($can_tx) {
                $wpdb->query('COMMIT');
            }
        } catch (\Throwable $e) {
            if ($can_tx) {
                $wpdb->query('ROLLBACK');
            }
            throw $e;
        }

        return ['job_id' => $job_id, 'results' => $results];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public static function handle_create_job(array $params, ?Jobs_Store $store = null): array
    {
        $store ??= new Jobs_Store($GLOBALS['wpdb']);
        $job = $store->create([
            'id'          => (string) ($params['id'] ?? ''),
            'user_id'     => (int) ($params['user_id'] ?? 0),
            'tool_name'   => (string) ($params['tool_name'] ?? ''),
            'total'       => (int) ($params['total'] ?? 0),
            'style_hints' => $params['style_hints'] ?? null,
            'params_json' => $params['params_json'] ?? null,
        ]);
        return (array) $job;
    }

    /**
     * Returns the job row, or null if not found. If a job is `running` but
     * has been silent for >60s and started >10min ago, surface its status as
     * `interrupted` (heuristic — the row in DB is unchanged).
     *
     * @return array<string, mixed>|null
     */
    public static function handle_get_job(string $id, ?Jobs_Store $store = null): ?array
    {
        $store ??= new Jobs_Store($GLOBALS['wpdb']);
        $job = $store->get($id);
        if ($job === null) {
            return null;
        }
        if (($job->status ?? null) === 'running') {
            $started      = isset($job->started_at) ? (int) strtotime((string) $job->started_at) : 0;
            $lastProgress = !empty($job->last_progress_at) ? (int) strtotime((string) $job->last_progress_at) : 0;
            $silentFor    = time() - max($lastProgress, $started);
            if ($started > 0 && (time() - $started) > 600 && $silentFor > 60) {
                $arr = (array) $job;
                $arr['status'] = 'interrupted';
                return $arr;
            }
        }
        return (array) $job;
    }

    /**
     * @param array<string, mixed> $params
     * @return array{ok: bool}
     */
    public static function handle_update_job_progress(string $id, array $params, ?Jobs_Store $store = null): array
    {
        $store ??= new Jobs_Store($GLOBALS['wpdb']);
        $store->update_progress(
            $id,
            (int) ($params['done'] ?? 0),
            (int) ($params['failed_count'] ?? 0)
        );
        return ['ok' => true];
    }

    /**
     * @param array<string, mixed> $params
     * @return array{ok: bool}
     */
    public static function handle_mark_job_done(string $id, array $params, ?Jobs_Store $store = null): array
    {
        $store ??= new Jobs_Store($GLOBALS['wpdb']);
        $store->mark_done($id, (string) ($params['status'] ?? 'completed'));
        return ['ok' => true];
    }

    /** @return array{status: string} */
    public static function handle_cancel_job(string $id, ?Jobs_Store $store = null): array
    {
        $store ??= new Jobs_Store($GLOBALS['wpdb']);
        $store->request_cancel($id);
        return ['status' => 'cancel_requested'];
    }

    /**
     * @param array<string, mixed> $params
     * @return list<array<string, mixed>>
     */
    public static function handle_find_running_jobs(array $params, ?Jobs_Store $store = null): array
    {
        $store ??= new Jobs_Store($GLOBALS['wpdb']);
        $job = $store->find_running_for_user((int) ($params['user_id'] ?? 0));
        return $job === null ? [] : [(array) $job];
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

        // Allow this script to run as long as the underlying SSE stream is alive.
        // Bulk runs can exceed PHP's default max_execution_time of 60s.
        set_time_limit(0);

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
