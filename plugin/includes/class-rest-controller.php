<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use SeoAgent\Adapters;
use SeoAgent\History_Store;
use SeoAgent\Jobs_Store;

final class REST_Controller {

	private const LIST_POSTS_MAX_LIMIT = 50;
	private const HISTORY_MAX_LIMIT    = 100;
	private const ROLLBACK_MAX_IDS     = 50;

	public static function init(): void {
		add_action( 'rest_api_init', array( self::class, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			'seoagent/v1',
			'/chat',
			array(
				'methods'             => 'POST',
				'callback'            => array( self::class, 'proxy_chat' ),
				'permission_callback' => array( self::class, 'permit_admin' ),
				'args'                => array(
					'message'    => array(
						'type'     => 'string',
						'required' => true,
					),
					'session_id' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/detect-seo-plugin',
			array(
				'methods'             => 'GET',
				'callback'            => static function (): \WP_REST_Response {
					return new \WP_REST_Response( self::handle_detect_seo_plugin() );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/posts',
			array(
				'methods'             => 'GET',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					return new \WP_REST_Response( self::handle_list_posts( $req->get_query_params() ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/post/(?P<id>\d+)/summary',
			array(
				'methods'             => 'GET',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					$payload = self::handle_get_post_summary( (int) $req['id'] );
					if ( $payload === null ) {
						return new \WP_REST_Response( array( 'error' => 'post not found' ), 404 );
					}
					return new \WP_REST_Response( $payload );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/categories',
			array(
				'methods'             => 'GET',
				'callback'            => static fn(): \WP_REST_Response =>
					new \WP_REST_Response( self::handle_get_taxonomy_terms( 'category' ) ),
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);
		register_rest_route(
			'seoagent/v1',
			'/tags',
			array(
				'methods'             => 'GET',
				'callback'            => static fn(): \WP_REST_Response =>
					new \WP_REST_Response( self::handle_get_taxonomy_terms( 'post_tag' ) ),
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/post/(?P<id>\d+)/seo-fields',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					return new \WP_REST_Response(
						self::handle_update_seo_fields(
							(int) $req['id'],
							$req->get_json_params() ?? array()
						)
					);
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/history',
			array(
				'methods'             => 'GET',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					$params = $req->get_query_params();
					if ( empty( $params['post_id'] ) && empty( $params['job_id'] ) ) {
						return new \WP_REST_Response( array( 'error' => 'post_id or job_id required' ), 400 );
					}
					return new \WP_REST_Response( self::handle_get_history( $params ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/rollback',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					return new \WP_REST_Response( self::handle_rollback( $req->get_json_params() ?? array() ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/jobs',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					$params = $req->get_json_params() ?? array();
					return new \WP_REST_Response( self::handle_create_job( $params ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/jobs',
			array(
				'methods'             => 'GET',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					return new \WP_REST_Response( self::handle_list_jobs( $req->get_query_params() ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/jobs/(?P<id>[a-zA-Z0-9-]+)',
			array(
				'methods'             => 'GET',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					$job = self::handle_get_job( (string) $req['id'] );
					if ( $job === null ) {
						return new \WP_REST_Response( array( 'error' => 'not found' ), 404 );
					}
					return new \WP_REST_Response( $job );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/jobs/(?P<id>[a-zA-Z0-9-]+)/progress',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					$params = $req->get_json_params() ?? array();
					return new \WP_REST_Response( self::handle_update_job_progress( (string) $req['id'], $params ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/jobs/(?P<id>[a-zA-Z0-9-]+)/done',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					$params = $req->get_json_params() ?? array();
					return new \WP_REST_Response( self::handle_mark_job_done( (string) $req['id'], $params ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/jobs/(?P<id>[a-zA-Z0-9-]+)/cancel',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					return new \WP_REST_Response( self::handle_cancel_job( (string) $req['id'] ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);

		register_rest_route(
			'seoagent/v1',
			'/jobs/sweep-interrupted',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( \WP_REST_Request $req ): \WP_REST_Response {
					$params = $req->get_json_params() ?? array();
					return new \WP_REST_Response( self::handle_sweep_interrupted( $params ) );
				},
				'permission_callback' => array( self::class, 'permit_admin_or_jwt' ),
			)
		);
	}

	public static function permit_admin(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Single permission callback covering admin + service-JWT (backend→plugin).
	 * The shared-secret / write-secret legacy arms were removed in Task 3.6.
	 */
	public static function permit_admin_or_jwt( \WP_REST_Request $request ): bool {
		if ( current_user_can( 'manage_options' ) ) {
			return true;
		}
		if ( ! defined( 'SEO_AGENT_JWT_SECRET' ) ) {
			return false;
		}
		$auth = (string) $request->get_header( 'authorization' );
		if ( $auth === '' || ! preg_match( '/^bearer\s+(.+)$/i', $auth, $m ) ) {
			return false;
		}
		$verified = JwtVerifier::verify( $m[1], (string) SEO_AGENT_JWT_SECRET );
		return ! empty( $verified['ok'] );
	}

	/** @return array{name: string} */
	public static function handle_detect_seo_plugin(): array {
		return array( 'name' => Adapters\Adapter_Factory::detect() );
	}

	/**
	 * @param array<string, mixed> $params
	 * @param \Closure(array<string,mixed>): array{posts: list<object>, total: int}|null $query_fn
	 * @return array{posts: list<array<string,mixed>>, next_cursor: int|null, total: int}
	 */
	public static function handle_list_posts( array $params, ?\Closure $query_fn = null ): array {
		$limit         = max( 1, min( self::LIST_POSTS_MAX_LIMIT, (int) ( $params['limit'] ?? 20 ) ) );
		$cursor        = max( 0, (int) ( $params['cursor'] ?? 0 ) );
		$post_type_raw = $params['post_type'] ?? 'post';
		$post_type     = is_array( $post_type_raw )
			? array_values( array_filter( array_map( static fn( $s ) => sanitize_key( (string) $s ), $post_type_raw ) ) )
			: sanitize_key( (string) $post_type_raw );
		// Whitelist against publicly-queryable post types. Without this an
		// authenticated caller could request post_type=revision / oembed_cache
		// / etc. and exfiltrate non-public bodies through the listing.
		if ( function_exists( 'get_post_types' ) ) {
			$public_types = get_post_types( array( 'public' => true ), 'names' );
			if ( is_array( $post_type ) ) {
				$post_type = array_values( array_intersect( $post_type, $public_types ) );
				if ( empty( $post_type ) ) {
					$post_type = 'post';
				}
			} elseif ( ! in_array( $post_type, $public_types, true ) ) {
				$post_type = 'post';
			}
		}
		$args = array(
			'post_type'      => $post_type,
			'post_status'    => $params['status'] ?? 'publish',
			'posts_per_page' => $limit,
			'paged'          => intdiv( $cursor, $limit ) + 1,
			'orderby'        => 'modified',
			'order'          => 'DESC',
		);
		if ( ! empty( $params['category'] ) ) {
			$args['category_name'] = sanitize_title( (string) $params['category'] );
		}
		if ( ! empty( $params['tag'] ) ) {
			$args['tag'] = sanitize_title( (string) $params['tag'] );
		}
		if ( ! empty( $params['after'] ) ) {
			$args['date_query'][] = array( 'after' => (string) $params['after'] );
		}
		if ( ! empty( $params['before'] ) ) {
			$args['date_query'][] = array( 'before' => (string) $params['before'] );
		}
		if ( ! empty( $params['slugs'] ) ) {
			$raw  = $params['slugs'];
			$list = is_array( $raw ) ? $raw : explode( ',', (string) $raw );
			$list = array_values( array_filter( array_map( static fn( $s ) => sanitize_title( (string) $s ), $list ) ) );
			if ( ! empty( $list ) ) {
				$args['post_name__in'] = $list;
			}
		}

		$query_fn ??= static function ( array $args ): array {
			$q = new \WP_Query( $args );
			return array(
				'posts' => $q->posts,
				'total' => (int) $q->found_posts,
			);
		};

		$result = $query_fn( $args );
		$posts  = array_map(
			static fn( object $p ): array => array(
				'id'         => (int) $p->ID,
				'post_title' => (string) $p->post_title,
				'slug'       => (string) $p->post_name,
				'status'     => (string) $p->post_status,
				'modified'   => (string) $p->post_modified,
				'word_count' => self::word_count_unicode( wp_strip_all_tags( (string) ( $p->post_content ?? '' ) ) ),
			),
			$result['posts']
		);

		$next_cursor = ( $cursor + count( $posts ) < $result['total'] ) ? $cursor + count( $posts ) : null;

		return array(
			'posts'       => $posts,
			'next_cursor' => $next_cursor,
			'total'       => $result['total'],
		);
	}

	/**
	 * @param \Closure(int): ?object $loader
	 * @return array<string, mixed>|null
	 */
	public static function handle_get_post_summary( int $id, ?\Closure $loader = null, ?Adapters\Seo_Fields_Adapter $adapter = null ): ?array {
		$loader  ??= static fn( int $id ): ?object => get_post( $id ) ?: null;
		$adapter ??= Adapters\Adapter_Factory::make( Adapters\Adapter_Factory::detect() );
		$post      = $loader( $id );
		if ( $post === null ) {
			return null;
		}

		return array(
			'id'              => (int) $post->ID,
			'post_title'      => (string) $post->post_title,
			'slug'            => (string) $post->post_name,
			'status'          => (string) $post->post_status,
			'modified'        => (string) $post->post_modified,
			'word_count'      => self::word_count_unicode( wp_strip_all_tags( (string) $post->post_content ) ),
			'content_preview' => self::content_preview( (string) $post->post_content, 500 ),
			'current_seo'     => array(
				'title'         => $adapter->get_seo_title( $id ),
				'description'   => $adapter->get_seo_description( $id ),
				'focus_keyword' => $adapter->get_focus_keyword( $id ),
				'og_title'      => $adapter->get_og_title( $id ),
			),
		);
	}

	private static function word_count_unicode( string $text ): int {
		$trimmed = trim( $text );
		if ( $trimmed === '' ) {
			return 0;
		}
		$parts = preg_split( '/\s+/u', $trimmed );
		return is_array( $parts ) ? count( $parts ) : 0;
	}

	/**
	 * Strip HTML, shortcodes, and scripts from post content; cap to N words.
	 * Returns up to N words joined with single spaces, no trailing whitespace.
	 */
	private static function content_preview( string $raw, int $max_words ): string {
		if ( function_exists( 'strip_shortcodes' ) ) {
			$raw = strip_shortcodes( $raw );
		}
		$stripped = wp_strip_all_tags( $raw, true );
		$stripped = trim( (string) preg_replace( '/\s+/u', ' ', $stripped ) );
		if ( $stripped === '' ) {
			return '';
		}

		$words  = preg_split( '/\s+/u', $stripped ) ?: array();
		$result = count( $words ) <= $max_words
			? implode( ' ', $words )
			: implode( ' ', array_slice( $words, 0, $max_words ) );

		// Character backstop: protects CJK / unsegmented languages where preg_split('/\s+/u')
		// returns a single "word" that bypasses the word cap.
		$max_chars = $max_words * 10;
		if ( function_exists( 'mb_substr' ) && mb_strlen( $result ) > $max_chars ) {
			$result = mb_substr( $result, 0, $max_chars );
		}
		return $result;
	}

	/**
	 * @param \Closure(string): list<object>|null $loader
	 * @return list<array{id:int, name:string, slug:string, count:int}>
	 */
	public static function handle_get_taxonomy_terms( string $taxonomy, ?\Closure $loader = null ): array {
		$loader ??= static function ( string $tax ): array {
			$terms = get_terms(
				array(
					'taxonomy'   => $tax,
					'hide_empty' => false,
				)
			);
			return is_array( $terms ) ? $terms : array();
		};
		return array_map(
			static fn( object $t ): array => array(
				'id'    => (int) $t->term_id,
				'name'  => (string) $t->name,
				'slug'  => (string) $t->slug,
				'count' => (int) $t->count,
			),
			$loader( $taxonomy )
		);
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
		$adapter ??= Adapters\Adapter_Factory::make( Adapters\Adapter_Factory::detect() );
		$store   ??= new History_Store( $GLOBALS['wpdb'] );
		$uuid    ??= static fn(): string => wp_generate_uuid4();

		$job_id  = (string) ( $params['job_id'] ?? $uuid() );
		$fields  = is_array( $params['fields'] ?? null ) ? (array) $params['fields'] : array();
		$user_id = function_exists( 'get_current_user_id' ) ? ( get_current_user_id() ?: null ) : null;

		$results = array();
		foreach ( $fields as $field => $value ) {
			if ( ! is_string( $field ) || ! is_string( $value ) ) {
				continue; // schema rejects null already
			}
			if ( ! $adapter->supports( $field ) ) {
				$store->insert(
					array(
						'post_id'      => $post_id,
						'job_id'       => $job_id,
						'field'        => $field,
						'before_value' => null,
						'after_value'  => null,
						'status'       => 'skipped_failed',
						'reason'       => 'adapter does not support field',
						'user_id'      => $user_id,
					)
				);
				$results[] = array(
					'field'  => $field,
					'status' => 'skipped_failed',
					'before' => null,
					'after'  => null,
					'reason' => 'adapter does not support field',
				);
				continue;
			}

			$before = self::adapter_get( $adapter, $field, $post_id );
			// SEO fields are plain text (title / description / focus_keyword /
			// og_title); none of them render HTML through any adapter we ship.
			// sanitize_text_field strips tags + collapses whitespace; using
			// wp_kses_post here would leak <a>/<img> through to <title>.
			$after = sanitize_text_field( (string) $value );

			if ( $before === $after ) {
				$store->insert(
					array(
						'post_id'      => $post_id,
						'job_id'       => $job_id,
						'field'        => $field,
						'before_value' => $before,
						'after_value'  => $after,
						'status'       => 'skipped_unchanged',
						'reason'       => null,
						'user_id'      => $user_id,
					)
				);
				$results[] = array(
					'field'  => $field,
					'status' => 'skipped_unchanged',
					'before' => $before,
					'after'  => $after,
				);
				continue;
			}

			try {
				self::adapter_set( $adapter, $field, $post_id, $after );
				$store->insert(
					array(
						'post_id'      => $post_id,
						'job_id'       => $job_id,
						'field'        => $field,
						'before_value' => $before,
						'after_value'  => $after,
						'status'       => 'applied',
						'reason'       => null,
						'user_id'      => $user_id,
					)
				);
				$results[] = array(
					'field'  => $field,
					'status' => 'applied',
					'before' => $before,
					'after'  => $after,
				);
			} catch ( \Throwable $e ) {
				$store->insert(
					array(
						'post_id'      => $post_id,
						'job_id'       => $job_id,
						'field'        => $field,
						'before_value' => $before,
						'after_value'  => $after,
						'status'       => 'skipped_failed',
						'reason'       => $e->getMessage(),
						'user_id'      => $user_id,
					)
				);
				$results[] = array(
					'field'  => $field,
					'status' => 'skipped_failed',
					'before' => $before,
					'after'  => null,
					'reason' => $e->getMessage(),
				);
			}
		}

		return array(
			'job_id'  => $job_id,
			'results' => $results,
		);
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array{rows: list<array<string,mixed>>, next_cursor: int|null, total: int}
	 */
	public static function handle_get_history( array $params, ?History_Store $store = null ): array {
		$store ??= new History_Store( $GLOBALS['wpdb'] );
		$limit   = max( 1, min( self::HISTORY_MAX_LIMIT, (int) ( $params['limit'] ?? 20 ) ) );
		$cursor  = max( 0, (int) ( $params['cursor'] ?? 0 ) );

		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : null;
		$job_id  = isset( $params['job_id'] ) ? (string) $params['job_id'] : null;

		if ( $post_id === null && ( $job_id === null || $job_id === '' ) ) {
			return array(
				'rows'        => array(),
				'next_cursor' => null,
				'total'       => 0,
			); // route handler turns this into 400
		}

		$raw = $post_id !== null
			? $store->find_by_post( $post_id, $limit, $cursor )
			: $store->find_by_job( (string) $job_id, $limit, $cursor );

		$rows = array_map(
			static fn( object $r ): array => array(
				'id'             => (int) $r->id,
				'post_id'        => (int) $r->post_id,
				'job_id'         => (string) $r->job_id,
				'field'          => (string) $r->field,
				'before_value'   => $r->before_value !== null ? (string) $r->before_value : null,
				'after_value'    => $r->after_value !== null ? (string) $r->after_value : null,
				'status'         => (string) $r->status,
				'reason'         => $r->reason !== null ? (string) $r->reason : null,
				'user_id'        => $r->user_id !== null ? (int) $r->user_id : null,
				'created_at'     => (string) $r->created_at,
				'rolled_back_at' => $r->rolled_back_at !== null ? (string) $r->rolled_back_at : null,
			),
			$raw
		);

		return array(
			'rows'        => $rows,
			'next_cursor' => count( $rows ) === $limit ? $cursor + $limit : null,
			'total'       => count( $rows ),
		);
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
		$adapter ??= Adapters\Adapter_Factory::make( Adapters\Adapter_Factory::detect() );
		$store   ??= new History_Store( $GLOBALS['wpdb'] );
		$uuid    ??= static fn(): string => wp_generate_uuid4();
		$now     ??= static fn(): string => current_time( 'mysql' );

		$job_id_in = isset( $params['job_id'] ) && is_string( $params['job_id'] ) && $params['job_id'] !== ''
			? (string) $params['job_id']
			: null;
		$raw_ids   = is_array( $params['history_ids'] ?? null ) ? (array) $params['history_ids'] : array();

		// Require exactly one of {history_ids, job_id}. Mirror Plan 3a's tool-return shape:
		// a 200 response with an `error` key + empty results so callers can branch on isset().
		if ( $job_id_in === null && count( $raw_ids ) === 0 ) {
			return array(
				'error'   => 'rollback requires history_ids or job_id',
				'job_id'  => '',
				'results' => array(),
			);
		}
		if ( $job_id_in !== null && count( $raw_ids ) > 0 ) {
			return array(
				'error'   => 'rollback accepts only one of history_ids or job_id',
				'job_id'  => '',
				'results' => array(),
			);
		}

		// job-id mode: resolve to the still-in-effect history rows for that job.
		if ( $job_id_in !== null ) {
			$rows    = $store->find_by_job_not_rolled_back( $job_id_in );
			$raw_ids = array_map( static fn( object $r ): int => (int) $r->id, $rows );
		}

		$ids     = array_slice( $raw_ids, 0, self::ROLLBACK_MAX_IDS );
		$job_id  = $uuid();
		$user_id = function_exists( 'get_current_user_id' ) ? ( get_current_user_id() ?: null ) : null;

		// Wrap the batch in a wpdb transaction for crash safety. Per-row failures are
		// still recorded as status='failed' (Plan 3a semantics); the transaction only
		// protects against a fatal exception or DB outage mid-loop.
		$wpdb   = $GLOBALS['wpdb'] ?? null;
		$can_tx = is_object( $wpdb ) && method_exists( $wpdb, 'query' );
		if ( $can_tx ) {
			$wpdb->query( 'START TRANSACTION' );
		}

		$results = array();
		try {
			foreach ( $ids as $raw_id ) {
				$id  = (int) $raw_id;
				$row = $store->get( $id );
				if ( $row === null ) {
					$results[] = array(
						'history_id' => $id,
						'status'     => 'not_found',
					);
					continue;
				}
				if ( ! empty( $row->rolled_back_at ) ) {
					$results[] = array(
						'history_id' => $id,
						'status'     => 'skipped',
						'reason'     => 'already rolled back',
					);
					continue;
				}
				$field = (string) ( $row->field ?? '' );
				if ( ! $adapter->supports( $field ) ) {
					$results[] = array(
						'history_id' => $id,
						'status'     => 'skipped',
						'reason'     => 'adapter does not support field',
					);
					continue;
				}
				try {
					$post_id    = (int) ( $row->post_id ?? 0 );
					$value      = (string) ( $row->before_value ?? '' );
					$before_now = self::adapter_get( $adapter, $field, $post_id );
					self::adapter_set( $adapter, $field, $post_id, $value );
					$store->insert(
						array(
							'post_id'      => $post_id,
							'job_id'       => $job_id,
							'field'        => $field,
							'before_value' => $before_now,
							'after_value'  => $value,
							'status'       => 'applied',
							'reason'       => 'rollback of #' . $id,
							'user_id'      => $user_id,
						)
					);
					$store->mark_rolled_back( $id, $now() );
					$results[] = array(
						'history_id' => $id,
						'status'     => 'rolled_back',
					);
				} catch ( \Throwable $e ) {
					// Per-row failures are non-fatal: record and continue.
					$results[] = array(
						'history_id' => $id,
						'status'     => 'failed',
						'reason'     => $e->getMessage(),
					);
				}
			}
			if ( $can_tx ) {
				$wpdb->query( 'COMMIT' );
			}
		} catch ( \Throwable $e ) {
			if ( $can_tx ) {
				$wpdb->query( 'ROLLBACK' );
			}
			throw $e;
		}

		return array(
			'job_id'  => $job_id,
			'results' => $results,
		);
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public static function handle_create_job( array $params, ?Jobs_Store $store = null ): array {
		$store ??= new Jobs_Store( $GLOBALS['wpdb'] );
		$job     = $store->create(
			array(
				'id'          => (string) ( $params['id'] ?? '' ),
				'user_id'     => (int) ( $params['user_id'] ?? 0 ),
				'tool_name'   => (string) ( $params['tool_name'] ?? '' ),
				'total'       => (int) ( $params['total'] ?? 0 ),
				'style_hints' => $params['style_hints'] ?? null,
				'params_json' => $params['params_json'] ?? null,
			)
		);
		return (array) $job;
	}

	/**
	 * Returns the job row, or null if not found. If a job is `running` but
	 * has been silent for >60s and started >10min ago, surface its status as
	 * `interrupted` (heuristic — the row in DB is unchanged).
	 *
	 * @return array<string, mixed>|null
	 */
	public static function handle_get_job( string $id, ?Jobs_Store $store = null ): ?array {
		$store ??= new Jobs_Store( $GLOBALS['wpdb'] );
		$job     = $store->get( $id );
		if ( $job === null ) {
			return null;
		}
		if ( ( $job->status ?? null ) === 'running' ) {
			$started      = isset( $job->started_at ) ? (int) strtotime( (string) $job->started_at ) : 0;
			$lastProgress = ! empty( $job->last_progress_at ) ? (int) strtotime( (string) $job->last_progress_at ) : 0;
			$silentFor    = time() - max( $lastProgress, $started );
			if ( $started > 0 && ( time() - $started ) > 600 && $silentFor > 60 ) {
				$arr           = (array) $job;
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
	public static function handle_update_job_progress( string $id, array $params, ?Jobs_Store $store = null ): array {
		$store ??= new Jobs_Store( $GLOBALS['wpdb'] );
		$store->update_progress(
			$id,
			(int) ( $params['done'] ?? 0 ),
			(int) ( $params['failed_count'] ?? 0 ),
			isset( $params['current_post_id'] ) ? (int) $params['current_post_id'] : null,
			isset( $params['current_post_title'] ) ? (string) $params['current_post_title'] : null,
		);
		return array( 'ok' => true );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array{ok: bool}
	 */
	public static function handle_mark_job_done( string $id, array $params, ?Jobs_Store $store = null ): array {
		$store ??= new Jobs_Store( $GLOBALS['wpdb'] );
		$store->mark_done( $id, (string) ( $params['status'] ?? 'completed' ) );
		return array( 'ok' => true );
	}

	/** @return array{status: string} */
	public static function handle_cancel_job( string $id, ?Jobs_Store $store = null ): array {
		$store ??= new Jobs_Store( $GLOBALS['wpdb'] );
		$store->request_cancel( $id );
		return array( 'status' => 'cancel_requested' );
	}

	/**
	 * Backend startup calls this to mark stale 'running' rows from a dead
	 * previous process as 'interrupted'. Idempotent.
	 *
	 * @param array<string, mixed> $params
	 * @return array{interrupted: int}
	 */
	public static function handle_sweep_interrupted( array $params, ?Jobs_Store $store = null ): array {
		$store ??= new Jobs_Store( $GLOBALS['wpdb'] );
		$minutes = isset( $params['minutes'] ) ? (int) $params['minutes'] : 5;
		$count   = $store->sweep_interrupted( $minutes );
		return array( 'interrupted' => $count );
	}

	/**
	 * Filtered list of jobs. Backward-compatible with the Plan 3c
	 * "find running for user" shortcut: when params include both `user_id`
	 * and `status=running`, use find_running_for_user (single-row optimization).
	 * Otherwise apply the Plan 4-B status/since/limit filter via list_jobs.
	 *
	 * Response shape: { jobs: Array<row> }. Backend wp-client must read .jobs.
	 *
	 * @param array<string, mixed> $params
	 * @return array{jobs: list<array<string, mixed>>}
	 */
	public static function handle_list_jobs( array $params, ?Jobs_Store $store = null ): array {
		$store ??= new Jobs_Store( $GLOBALS['wpdb'] );

		$hasUserId     = isset( $params['user_id'] );
		$statusRunning = ( $params['status'] ?? null ) === 'running';
		if ( $hasUserId && $statusRunning ) {
			$job = $store->find_running_for_user( (int) $params['user_id'] );
			return array( 'jobs' => $job === null ? array() : array( (array) $job ) );
		}

		$rows = $store->list_jobs(
			array(
				'status' => isset( $params['status'] ) ? (string) $params['status'] : null,
				'since'  => isset( $params['since'] ) ? (string) $params['since'] : null,
				'limit'  => isset( $params['limit'] ) ? (int) $params['limit'] : 10,
			)
		);
		return array( 'jobs' => array_map( static fn( $r ) => (array) $r, $rows ) );
	}

	private static function adapter_get( Adapters\Seo_Fields_Adapter $adapter, string $field, int $post_id ): ?string {
		return match ( $field ) {
			'title'         => $adapter->get_seo_title( $post_id ),
			'description'   => $adapter->get_seo_description( $post_id ),
			'focus_keyword' => $adapter->get_focus_keyword( $post_id ),
			'og_title'      => $adapter->get_og_title( $post_id ),
			default         => null,
		};
	}

	private static function adapter_set( Adapters\Seo_Fields_Adapter $adapter, string $field, int $post_id, string $value ): void {
		match ( $field ) {
			'title'         => $adapter->set_seo_title( $post_id, $value ),
			'description'   => $adapter->set_seo_description( $post_id, $value ),
			'focus_keyword' => $adapter->set_focus_keyword( $post_id, $value ),
			'og_title'      => $adapter->set_og_title( $post_id, $value ),
			default         => null,
		};
	}

	/**
	 * Streaming SSE proxy. Bypasses WP_REST_Response on purpose: REST infra
	 * buffers responses, which would defeat token-by-token delivery. Any
	 * non-streaming endpoint must use the standard `return new WP_REST_Response`
	 * form instead of duplicating this exit-based path.
	 */
	public static function proxy_chat( \WP_REST_Request $request ): never {
		$message    = (string) $request->get_param( 'message' );
		$session_id = (string) $request->get_param( 'session_id' );
		if ( $message === '' ) {
			wp_send_json_error( array( 'error' => 'message required' ), 400 );
		}
		if ( $session_id === '' ) {
			wp_send_json_error( array( 'error' => 'session_id required' ), 400 );
		}

		$api_key = Settings::get_api_key();
		if ( $api_key === null ) {
			wp_send_json_error( array( 'error' => 'api key not set' ), 400 );
		}

		// Allow this script to run as long as the underlying SSE stream is alive.
		// Bulk runs can exceed PHP's default max_execution_time of 60s.
		set_time_limit( 0 );

		@ini_set( 'output_buffering', '0' );
		@ini_set( 'zlib.output_compression', '0' );
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		header( 'Content-Type: text/event-stream' );
		header( 'Cache-Control: no-cache' );
		header( 'X-Accel-Buffering: no' );

		$url     = Backend_Client::backend_url() . '/chat';
		$payload = wp_json_encode(
			array(
				'message'    => $message,
				'session_id' => $session_id,
			)
		);

		try {
			$jwt = Backend_Client::get_jwt();
		} catch ( \Throwable $e ) {
			// Log full detail server-side so an operator can diagnose; surface a
			// generic message to the browser so we don't leak the backend URL,
			// connection-refused hostnames, or other internals.
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[seo-agent] proxy_chat: get_jwt() failed: ' . $e->getMessage() );
			echo "event: error\ndata: " . wp_json_encode(
				array(
					'type'    => 'error',
					'message' => 'Could not authenticate with the SEO Agent backend. Check site logs for details.',
				)
			) . "\n\n";
			exit;
		}

		ignore_user_abort( false );

		$ch = curl_init( $url );
		curl_setopt_array(
			$ch,
			array(
				CURLOPT_HTTPHEADER       => array(
					'Content-Type: application/json',
					'Authorization: Bearer ' . $jwt,
					'X-Anthropic-Key: ' . $api_key,
				),
				CURLOPT_POST             => true,
				CURLOPT_POSTFIELDS       => $payload,
				CURLOPT_WRITEFUNCTION    => static function ( $ch, string $chunk ): int {
					if ( connection_aborted() ) {
						return 0; // returning != strlen aborts the cURL transfer
					}
					echo $chunk;
					@ob_flush();
					@flush();
					return strlen( $chunk );
				},
				CURLOPT_RETURNTRANSFER   => false,
				CURLOPT_TIMEOUT          => 0,
				CURLOPT_NOPROGRESS       => false,
				CURLOPT_PROGRESSFUNCTION => static function (): int {
					return connection_aborted() ? 1 : 0; // non-zero aborts
				},
			)
		);

		$ok = curl_exec( $ch );
		if ( $ok === false ) {
			// curl_error() can leak internal hostnames / ports
			// ("Could not resolve host: backend.internal:7117"); log the full
			// detail and surface a generic message instead.
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[seo-agent] proxy_chat: curl_exec failed: ' . curl_error( $ch ) );
			echo "event: error\ndata: " . wp_json_encode(
				array(
					'type'    => 'error',
					'message' => 'Upstream connection to the SEO Agent backend failed. Check site logs for details.',
				)
			) . "\n\n";
		}
		curl_close( $ch );
		exit;
	}
}
