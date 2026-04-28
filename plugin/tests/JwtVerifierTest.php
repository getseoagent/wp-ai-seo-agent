<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\JwtVerifier;

final class JwtVerifierTest extends TestCase
{
    private const SECRET = 'jwt-secret-32-bytes-min-for-hs256pls!';
    private const OTHER  = 'completely-different-secret-32-by!!';

    public function test_verify_accepts_valid_token(): void
    {
        $tok = self::sign(['sub' => 'service', 'scope' => 'read', 'iat' => time(), 'exp' => time() + 60], self::SECRET);
        $r = JwtVerifier::verify($tok, self::SECRET);
        $this->assertTrue($r['ok']);
        $this->assertSame('service', $r['payload']['sub']);
        $this->assertSame('read',    $r['payload']['scope']);
    }

    public function test_verify_rejects_expired(): void
    {
        $tok = self::sign(['sub' => 'service', 'iat' => time() - 7200, 'exp' => time() - 100], self::SECRET);
        $r = JwtVerifier::verify($tok, self::SECRET);
        $this->assertFalse($r['ok']);
        $this->assertSame('expired', $r['reason']);
    }

    public function test_verify_rejects_bad_signature(): void
    {
        $tok = self::sign(['sub' => 'service', 'iat' => time(), 'exp' => time() + 60], self::OTHER);
        $r = JwtVerifier::verify($tok, self::SECRET);
        $this->assertFalse($r['ok']);
        $this->assertSame('bad_signature', $r['reason']);
    }

    public function test_verify_rejects_malformed(): void
    {
        $this->assertFalse(JwtVerifier::verify('not-a-jwt', self::SECRET)['ok']);
        $this->assertFalse(JwtVerifier::verify('',          self::SECRET)['ok']);
        $this->assertFalse(JwtVerifier::verify('a.b',       self::SECRET)['ok']);
    }

    public function test_verify_rejects_payload_without_exp(): void
    {
        $tok = self::sign(['sub' => 'service'], self::SECRET);
        $r = JwtVerifier::verify($tok, self::SECRET);
        $this->assertFalse($r['ok']);
        $this->assertSame('bad_payload', $r['reason']);
    }

    public function test_verify_rejects_non_json_payload(): void
    {
        // Hand-craft a token with payload that isn't valid base64-of-json.
        $b64 = static fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $h   = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p   = $b64('not json');
        $sig = $b64(hash_hmac('sha256', "$h.$p", self::SECRET, true));
        $r = JwtVerifier::verify("$h.$p.$sig", self::SECRET);
        $this->assertFalse($r['ok']);
    }

    /**
     * Cross-implementation compatibility: a token signed by the backend's signJwt
     * (Node-side, the same HS256 base64url shape) must verify here. Pre-baked
     * sample so this test doesn't depend on Node being available.
     */
    public function test_verify_accepts_pre_baked_node_signed_token(): void
    {
        $secret = 'node-side-secret-32-bytes-min-pls';
        $b64 = static fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $h   = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p   = $b64(json_encode(['sub' => 'service', 'scope' => 'write', 'iat' => 1, 'exp' => time() + 3600]));
        $sig = $b64(hash_hmac('sha256', "$h.$p", $secret, true));
        $r = JwtVerifier::verify("$h.$p.$sig", $secret);
        $this->assertTrue($r['ok']);
        $this->assertSame('write', $r['payload']['scope']);
    }

    private static function sign(array $payload, string $secret): string
    {
        $b64 = static fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $h   = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p   = $b64(json_encode($payload));
        $sig = $b64(hash_hmac('sha256', "$h.$p", $secret, true));
        return "$h.$p.$sig";
    }
}
