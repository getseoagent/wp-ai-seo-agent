<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\Settings;

final class SettingsTest extends TestCase
{
    protected function setUp(): void
    {
        $GLOBALS['wp_options_store'] = [];
    }

    public function test_set_then_get_returns_original(): void
    {
        Settings::set_api_key('sk-ant-test-12345');
        $this->assertSame('sk-ant-test-12345', Settings::get_api_key());
    }

    public function test_get_returns_null_when_unset(): void
    {
        $this->assertNull(Settings::get_api_key());
    }

    public function test_stored_value_is_not_plaintext(): void
    {
        Settings::set_api_key('sk-ant-secret');
        $raw = $GLOBALS['wp_options_store']['seo_agent_api_key'] ?? '';
        $this->assertIsString($raw);
        $this->assertStringNotContainsString('sk-ant-secret', $raw);
    }

    public function test_clear_removes_key(): void
    {
        Settings::set_api_key('sk-ant-x');
        Settings::clear_api_key();
        $this->assertNull(Settings::get_api_key());
    }

    public function test_license_key_get_returns_null_when_unset(): void
    {
        $this->assertNull(Settings::get_license_key());
    }

    public function test_license_key_roundtrip(): void
    {
        Settings::set_license_key('seo_TEST_LICENSE');
        $this->assertSame('seo_TEST_LICENSE', Settings::get_license_key());
    }

    public function test_license_key_clear(): void
    {
        Settings::set_license_key('seo_X');
        Settings::clear_license_key();
        $this->assertNull(Settings::get_license_key());
    }

    public function test_license_key_setting_empty_string_clears(): void
    {
        Settings::set_license_key('seo_X');
        Settings::set_license_key('   ');
        $this->assertNull(Settings::get_license_key());
    }
}
