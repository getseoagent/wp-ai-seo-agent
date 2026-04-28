<?php
declare(strict_types=1);

namespace SeoAgent;

final class Backend_Client
{
    /** Refresh ahead of expiry so an in-flight request never carries a token that's about to die. */
    private const REFRESH_GRACE_SECONDS = 60;

    public static function backend_url(): string
    {
        $configured = defined('SEO_AGENT_BACKEND_URL') ? (string) SEO_AGENT_BACKEND_URL : '';
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        return 'http://localhost:8787';
    }

    /**
     * Returns a fresh JWT, minting one via /auth/token if no cached token exists or
     * the cached one is within REFRESH_GRACE_SECONDS of its expiry. Throws on backend error.
     */
    public static function get_jwt(): string
    {
        $cached = License::get_cached_jwt();
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }
        return self::mint_and_cache();
    }

    /** Force a fresh mint on next call. Use after the backend rejects the cached token (401). */
    public static function clear_jwt(): void
    {
        License::clear_cached_jwt();
    }

    /**
     * GETs /license/{key}/details from the backend with a Bearer JWT minted
     * for this license. Returns the decoded payload or null on any failure.
     * Subscription tab uses this to render tier / next-charge / card last-4.
     */
    public static function get_license_status(string $licenseKey): ?array
    {
        try {
            $jwt = self::get_jwt();
        } catch (\Throwable $e) {
            return null;
        }
        $url = self::backend_url() . '/license/' . rawurlencode($licenseKey) . '/details';
        $response = wp_remote_get($url, [
            'headers' => [ 'Authorization' => 'Bearer ' . $jwt ],
            'timeout' => 10,
        ]);
        if (is_wp_error($response)) return null;
        if ((int) wp_remote_retrieve_response_code($response) !== 200) return null;
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        return is_array($body) ? $body : null;
    }

    /**
     * POSTs /license/{key}/cancel. Returns true on 200, false on anything
     * else. The backend just sets recurring_state='cancelled'; the license
     * keeps `status='active'` so the customer retains access until expires_at.
     */
    public static function cancel_license(string $licenseKey): bool
    {
        try {
            $jwt = self::get_jwt();
        } catch (\Throwable $e) {
            return false;
        }
        $url = self::backend_url() . '/license/' . rawurlencode($licenseKey) . '/cancel';
        $response = wp_remote_post($url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $jwt,
                'Content-Type'  => 'application/json',
            ],
            'body'    => '{}',
            'timeout' => 10,
        ]);
        if (is_wp_error($response)) return false;
        return (int) wp_remote_retrieve_response_code($response) === 200;
    }

    private static function mint_and_cache(): string
    {
        $url     = self::backend_url() . '/auth/token';
        $payload = wp_json_encode([
            'license_key' => License::get_license_key(),
            'site_url'    => self::site_url(),
        ]);

        $response = wp_remote_post($url, [
            'headers' => [ 'Content-Type' => 'application/json' ],
            'body'    => $payload,
            'timeout' => 10,
        ]);

        if (is_wp_error($response)) {
            throw new \RuntimeException('auth/token request failed: ' . $response->get_error_message());
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        $body = (string) wp_remote_retrieve_body($response);
        if ($code !== 200) {
            throw new \RuntimeException("auth/token returned HTTP $code: $body");
        }

        $data = json_decode($body, true);
        if (!is_array($data) || !isset($data['token'], $data['expires_at']) || !is_string($data['token']) || !is_string($data['expires_at'])) {
            throw new \RuntimeException('auth/token returned malformed response');
        }
        $expUnix = strtotime($data['expires_at']);
        if ($expUnix === false) {
            throw new \RuntimeException('auth/token returned unparseable expires_at');
        }

        // License::get_cached_jwt() compares exp <= time(), so we shorten the
        // stored exp by REFRESH_GRACE_SECONDS — no separate "almost-expired" check needed.
        License::cache_jwt($data['token'], $expUnix - self::REFRESH_GRACE_SECONDS);

        return $data['token'];
    }

    private static function site_url(): string
    {
        if (function_exists('home_url')) {
            $u = home_url();
            if (is_string($u) && $u !== '') return $u;
        }
        return defined('WP_HOME') ? (string) WP_HOME : '';
    }
}
