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
	 * @param callable(string, array<string, mixed>): array<string, mixed>|\WP_Error $http
	 * @param array{get: callable(string): mixed, set: callable(string, mixed, int): bool} $cache
	 * @param (callable(int): void)|null $sleeper  Receives milliseconds. Production uses usleep; tests pass a no-op or capturing closure.
	 */
	public function __construct(
		private $http,
		private array $cache,
		private $sleeper = null
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
			),
			sleeper: static function ( int $ms ): void {
				usleep( $ms * 1000 );
			}
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

		[ $http_code, $error ] = $this->probe_with_retry( $url );

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
	 * Run a probe; on 5xx wait 500ms and run one more probe. 4xx and 2xx/3xx
	 * are returned verbatim with no retry. WP_Error transports are returned
	 * verbatim — a 500ms wait won't fix a DNS or TLS failure.
	 *
	 * @return array{0: ?int, 1: ?string}  [http_code, error]
	 */
	private function probe_with_retry( string $url ): array {
		$result = $this->probe( $url );
		[ $code, $error ] = $result;

		$is_transport_error = $code === null;
		$is_5xx             = $code !== null && $code >= 500 && $code < 600;

		if ( $is_transport_error || ! $is_5xx ) {
			return $result;
		}

		if ( $this->sleeper !== null ) {
			( $this->sleeper )( self::RETRY_DELAY_MS );
		}

		return $this->probe( $url );
	}

	/**
	 * One probe: HEAD first; on 405/501 fall back to a one-byte GET. Any
	 * other HEAD response (2xx/3xx, 4xx other than 405, 5xx) is returned
	 * verbatim. Returned shape matches parse_response().
	 *
	 * @return array{0: ?int, 1: ?string}
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
