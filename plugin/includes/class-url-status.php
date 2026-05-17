<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Immutable HTTP status snapshot for a single URL.
 *
 * `http_code` is null only when the transport itself failed (DNS, TLS,
 * connect timeout, etc.) — in that case `$error` describes what broke.
 * On any non-null `http_code` (including 5xx), `$error` is null and the
 * caller interprets the numeric code.
 */
final class URL_Status {

	public function __construct(
		public readonly string $url,
		public readonly ?int $http_code,
		public readonly ?string $error,
		public readonly bool $from_cache,
		public readonly int $checked_at
	) {}

	/** 2xx or 3xx — the URL is reachable and either OK or redirecting. */
	public function ok(): bool {
		return $this->http_code !== null
			&& $this->http_code >= 200
			&& $this->http_code < 400;
	}

	/**
	 * Specifically "doesn't exist" (404) or "gone" (410). 403 is NOT dead —
	 * the resource exists, access is refused (could be auth-gated, geofenced).
	 * We use this distinction so the broken-link audit only proposes removal
	 * for genuinely-missing targets.
	 */
	public function dead(): bool {
		return $this->http_code === 404 || $this->http_code === 410;
	}
}
