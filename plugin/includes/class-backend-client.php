<?php
declare(strict_types=1);

namespace SeoAgent;

final class Backend_Client
{
    private const TRANSIENT_KEY = 'seo_agent_jwt';
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

    public static function shared_secret(): string
    {
        return defined('SEO_AGENT_SHARED_SECRET') ? (string) SEO_AGENT_SHARED_SECRET : '';
    }

    /**
     * Returns a fresh JWT, minting one via /auth/token if no cached token exists or
     * the cached one is within REFRESH_GRACE_SECONDS of its expiry. Throws on backend error.
     */
    public static function get_jwt(): string
    {
        $cached = get_transient(self::TRANSIENT_KEY);
        if (is_array($cached)
            && isset($cached['token'], $cached['exp'])
            && is_string($cached['token'])
            && is_int($cached['exp'])
            && $cached['exp'] - self::REFRESH_GRACE_SECONDS > time()
        ) {
            return $cached['token'];
        }
        return self::mint_and_cache();
    }

    /** Force a fresh mint on next call. Use after the backend rejects the cached token (401). */
    public static function clear_jwt(): void
    {
        delete_transient(self::TRANSIENT_KEY);
    }

    private static function mint_and_cache(): string
    {
        $url     = self::backend_url() . '/auth/token';
        $payload = wp_json_encode([
            'license_key' => Settings::get_license_key(),
            'site_url'    => self::site_url(),
        ]);

        $response = wp_remote_post($url, [
            'headers' => [
                'Content-Type'    => 'application/json',
                'X-Shared-Secret' => self::shared_secret(),
            ],
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

        // WP transient TTL counts down from now; align with JWT exp minus grace so the
        // transient evicts itself just before the token would actually expire.
        $ttl = max(60, $expUnix - self::REFRESH_GRACE_SECONDS - time());
        set_transient(self::TRANSIENT_KEY, ['token' => $data['token'], 'exp' => $expUnix], $ttl);

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
