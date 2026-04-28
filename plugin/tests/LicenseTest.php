<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\License;

final class LicenseTest extends TestCase
{
    protected function setUp(): void
    {
        $GLOBALS['wp_options_store'] = [];
    }

    public function test_get_license_key_returns_null_when_unset(): void
    {
        $this->assertNull(License::get_license_key());
    }

    public function test_set_then_get_license_key_roundtrip(): void
    {
        License::set_license_key('seo_TEST_AAA');
        $this->assertSame('seo_TEST_AAA', License::get_license_key());
    }

    public function test_license_key_is_stored_encrypted(): void
    {
        License::set_license_key('seo_SECRET_KEY_XYZ');
        $raw = $GLOBALS['wp_options_store']['seo_agent_license_key'] ?? '';
        $this->assertIsString($raw);
        $this->assertStringNotContainsString('seo_SECRET_KEY_XYZ', $raw);
    }

    public function test_clear_license_key_removes_it(): void
    {
        License::set_license_key('seo_X');
        License::clear_license_key();
        $this->assertNull(License::get_license_key());
    }

    public function test_set_empty_license_key_clears(): void
    {
        License::set_license_key('seo_X');
        License::set_license_key('   ');
        $this->assertNull(License::get_license_key());
    }

    public function test_jwt_cache_returns_null_on_first_call(): void
    {
        $this->assertNull(License::get_cached_jwt());
    }

    public function test_jwt_cache_set_and_read(): void
    {
        License::cache_jwt('eyTOKEN', time() + 3600);
        $this->assertSame('eyTOKEN', License::get_cached_jwt());
    }

    public function test_jwt_cache_returns_null_when_expired(): void
    {
        License::cache_jwt('eyOLD', time() - 100);
        $this->assertNull(License::get_cached_jwt());
    }

    public function test_jwt_cache_is_stored_encrypted(): void
    {
        License::cache_jwt('eyVERY_SECRET_TOKEN', time() + 3600);
        $raw = $GLOBALS['wp_options_store']['seo_agent_jwt'] ?? '';
        $this->assertIsString($raw);
        $this->assertStringNotContainsString('eyVERY_SECRET_TOKEN', $raw);
    }

    public function test_set_license_key_clears_cached_jwt(): void
    {
        License::cache_jwt('eyOLD_TOKEN', time() + 3600);
        License::set_license_key('seo_NEW_KEY');
        $this->assertNull(License::get_cached_jwt());
    }

    public function test_clear_license_key_clears_cached_jwt(): void
    {
        License::cache_jwt('eyOLD_TOKEN', time() + 3600);
        License::set_license_key('seo_X');
        License::clear_license_key();
        $this->assertNull(License::get_cached_jwt());
    }

    public function test_clear_cached_jwt_keeps_license_key(): void
    {
        License::set_license_key('seo_KEEP');
        License::cache_jwt('ey', time() + 3600);
        License::clear_cached_jwt();
        $this->assertNull(License::get_cached_jwt());
        $this->assertSame('seo_KEEP', License::get_license_key());
    }
}
