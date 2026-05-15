<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/class-url-status.php';

/**
 * Fetches HTTP status for URLs with 24h transient caching.
 *
 * Dependencies are injected as closures (HTTP and cache) so tests can stub
 * them without monkey-patching `wp_remote_request` / `get_transient`. In
 * production wiring, `wire_with_wordpress()` supplies the live functions.
 *
 * Sequential by design: 24h cache means each URL hits the network once per
 * day per site, and admin UX wraps batches in a progress bar. Parallel HEAD
 * pool deferred — staying inside the round-3 wp_remote_* compliance envelope.
 */
final class URL_Status_Checker {

	private const TTL_SECONDS    = DAY_IN_SECONDS;
	private const CACHE_PREFIX   = 'seoagent_url_status_';
	private const USER_AGENT     = 'Mozilla/5.0 (compatible; SEOAgent/1.1; +https://getseoagent.app)';
	private const FETCH_TIMEOUT  = 10;
	private const RETRY_DELAY_MS = 500;

	/**
	 * @param callable(string, array<string, mixed>): array<string, mixed> $http  Closure returning a wp_remote_request-shaped array.
	 * @param array{get: callable(string): mixed, set: callable(string, mixed, int): bool} $cache  Get/set pair, returns false on cache miss.
	 */
	public function __construct(
		private $http,
		private array $cache
	) {}

	/**
	 * Build a checker wired to the live WordPress runtime.
	 * Production callers should use this; tests construct directly with fakes.
	 */
	public static function wire_with_wordpress(): self {
		return new self(
			http: static fn ( string $url, array $args ): array
				=> wp_remote_request( $url, $args ),
			cache: array(
				'get' => static fn ( string $key ): mixed => get_transient( $key ),
				'set' => static fn ( string $key, mixed $value, int $ttl ): bool
					=> set_transient( $key, $value, $ttl ),
			)
		);
	}
}
