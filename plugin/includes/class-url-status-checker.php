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

	private const TTL_SECONDS    = 86400; // DAY_IN_SECONDS — inlined so class loads without WP core constants
	private const CACHE_PREFIX   = 'seoagent_url_status_';
	private const USER_AGENT     = 'Mozilla/5.0 (compatible; SEOAgent/1.1; +https://getseoagent.app)';
	private const FETCH_TIMEOUT  = 10;
	private const RETRY_DELAY_MS = 500;

	/**
	 * @param callable(string, array<string, mixed>): array<string, mixed>|\WP_Error $http  Closure returning a wp_remote_request-shaped array, or WP_Error on transport failure.
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
			http: static fn ( string $url, array $args ): array|\WP_Error
				=> wp_remote_request( $url, $args ),
			cache: array(
				'get' => static fn ( string $key ): mixed => get_transient( $key ),
				'set' => static fn ( string $key, mixed $value, int $ttl ): bool
					=> set_transient( $key, $value, $ttl ),
			)
		);
	}

	public function check_single( string $url ): URL_Status {
		$cache_key = self::CACHE_PREFIX . md5( $url );

		$cached = ( $this->cache['get'] )( $cache_key );
		if ( is_array( $cached ) && array_key_exists( 'http_code', $cached ) ) {
			// Cache shape is owned by this class — see write below.
			return new URL_Status(
				url:        $url,
				http_code:  $cached['http_code'],
				error:      $cached['error'] ?? null,
				from_cache: true,
				checked_at: $cached['checked_at']
			);
		}

		[ $http_code, $error ] = $this->probe( $url );

		$now    = time();
		$status = new URL_Status(
			url:        $url,
			http_code:  $http_code,
			error:      $error,
			from_cache: false,
			checked_at: $now
		);

		( $this->cache['set'] )(
			$cache_key,
			array(
				'url'        => $url,
				'http_code'  => $http_code,
				'error'      => $error,
				'checked_at' => $now,
			),
			self::TTL_SECONDS
		);

		return $status;
	}

	/**
	 * HEAD first; if the server says "method not allowed" (405) or "not
	 * implemented" (501), retry as a one-byte GET. Any other HEAD response —
	 * including 404, 403, 5xx — is returned verbatim.
	 *
	 * @return array{0: ?int, 1: ?string}  [http_code, error]
	 */
	private function probe( string $url ): array {
		$head_response = ( $this->http )(
			$url,
			array(
				'method'      => 'HEAD',
				'timeout'     => self::FETCH_TIMEOUT,
				'user-agent'  => self::USER_AGENT,
				'redirection' => 0,
			)
		);
		[ $head_code, $head_error ] = self::parse_response( $head_response );

		if ( $head_code !== 405 && $head_code !== 501 ) {
			return array( $head_code, $head_error );
		}

		$get_response = ( $this->http )(
			$url,
			array(
				'method'      => 'GET',
				'timeout'     => self::FETCH_TIMEOUT,
				'user-agent'  => self::USER_AGENT,
				'redirection' => 0,
				'headers'     => array( 'Range' => 'bytes=0-0' ),
			)
		);
		return self::parse_response( $get_response );
	}

	/**
	 * @param array<string, mixed>|\WP_Error $response
	 * @return array{0: ?int, 1: ?string}  [http_code, error]
	 */
	private static function parse_response( mixed $response ): array {
		if ( $response instanceof \WP_Error ) {
			return array( null, $response->get_error_message() );
		}
		if ( is_array( $response ) && isset( $response['response']['code'] ) ) {
			$code = $response['response']['code'];
			return is_int( $code ) ? array( $code, null ) : array( null, 'malformed response' );
		}
		return array( null, 'unexpected http return shape' );
	}
}
