<?php
declare(strict_types=1);

namespace SeoAgent;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pure HS256 JWT verifier — no third-party deps. Wire-compatible with the
 * backend `lib/jwt.ts`: same {alg:HS256, typ:JWT} header, same base64url
 * encoding, same `exp` (unix seconds) check.
 */
final class JwtVerifier
{
    /**
     * @return array{ok: bool, payload?: array<string, mixed>, reason?: string}
     */
    public static function verify(string $token, string $secret): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return ['ok' => false, 'reason' => 'malformed'];
        [$h, $p, $s] = $parts;
        if ($h === '' || $p === '' || $s === '') return ['ok' => false, 'reason' => 'malformed'];

        $expectedSig = self::base64UrlEncode(hash_hmac('sha256', "$h.$p", $secret, true));
        if (!hash_equals($expectedSig, $s)) return ['ok' => false, 'reason' => 'bad_signature'];

        $payloadJson = self::base64UrlDecode($p);
        $payload     = json_decode($payloadJson, true);
        if (!is_array($payload)) return ['ok' => false, 'reason' => 'bad_payload'];
        if (!isset($payload['exp']) || !is_int($payload['exp'])) return ['ok' => false, 'reason' => 'bad_payload'];
        if ($payload['exp'] < time()) return ['ok' => false, 'reason' => 'expired'];

        return ['ok' => true, 'payload' => $payload];
    }

    private static function base64UrlEncode(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $s): string
    {
        $pad = strlen($s) % 4;
        if ($pad > 0) $s .= str_repeat('=', 4 - $pad);
        $decoded = base64_decode(strtr($s, '-_', '+/'), true);
        return $decoded === false ? '' : $decoded;
    }
}
