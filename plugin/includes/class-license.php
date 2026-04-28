<?php
declare(strict_types=1);

namespace SeoAgent;

/**
 * License + JWT-cache storage. Both blobs ride encrypted in wp_options under
 * AUTH_KEY (same envelope as Settings::api_key) so a DB dump on a restored
 * site doesn't leak credentials. Mutating the license_key invalidates any
 * cached JWT — a stale token would still encode the OLD tier.
 */
final class License
{
    private const OPT_LICENSE_KEY = 'seo_agent_license_key';
    private const OPT_JWT         = 'seo_agent_jwt';
    private const OPT_JWT_EXP     = 'seo_agent_jwt_exp';

    public static function get_license_key(): ?string
    {
        $stored = get_option(self::OPT_LICENSE_KEY, null);
        if (!is_string($stored) || $stored === '') return null;
        $plain = self::decrypt($stored);
        return $plain === '' ? null : $plain;
    }

    public static function set_license_key(string $key): void
    {
        $key = trim($key);
        if ($key === '') {
            self::clear_license_key();
            return;
        }
        update_option(self::OPT_LICENSE_KEY, self::encrypt($key));
        self::clear_cached_jwt();
    }

    public static function clear_license_key(): void
    {
        delete_option(self::OPT_LICENSE_KEY);
        self::clear_cached_jwt();
    }

    public static function get_cached_jwt(): ?string
    {
        $exp = (int) get_option(self::OPT_JWT_EXP, 0);
        if ($exp <= time()) return null;
        $stored = get_option(self::OPT_JWT, null);
        if (!is_string($stored) || $stored === '') return null;
        $plain = self::decrypt($stored);
        return $plain === '' ? null : $plain;
    }

    public static function cache_jwt(string $jwt, int $expUnixTimestamp): void
    {
        update_option(self::OPT_JWT,     self::encrypt($jwt));
        update_option(self::OPT_JWT_EXP, $expUnixTimestamp);
    }

    public static function clear_cached_jwt(): void
    {
        delete_option(self::OPT_JWT);
        delete_option(self::OPT_JWT_EXP);
    }

    private static function encrypt(string $plain): string
    {
        $secret = self::secret_bytes();
        $iv = random_bytes(16);
        $ct = openssl_encrypt($plain, 'aes-256-cbc', $secret, OPENSSL_RAW_DATA, $iv);
        if ($ct === false) {
            throw new \RuntimeException('License encryption failed');
        }
        return base64_encode($iv . $ct);
    }

    private static function decrypt(string $stored): string
    {
        $raw = base64_decode($stored, true);
        if ($raw === false || strlen($raw) < 17) return '';
        $iv = substr($raw, 0, 16);
        $ct = substr($raw, 16);
        $pt = openssl_decrypt($ct, 'aes-256-cbc', self::secret_bytes(), OPENSSL_RAW_DATA, $iv);
        return is_string($pt) ? $pt : '';
    }

    private static function secret_bytes(): string
    {
        $base = defined('AUTH_KEY') ? (string) AUTH_KEY : '';
        return hash('sha256', 'seo-agent-license:' . $base, true);
    }
}
