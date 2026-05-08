<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\License;
use SeoAgent\Subscription_Page;

final class SubscriptionPageTest extends TestCase
{
    protected function setUp(): void
    {
        $GLOBALS['wp_options_store']        = [];
        $GLOBALS['_seoagent_test_caps']     = true; // admin by default
        $GLOBALS['_seoagent_test_headers']  = [];
        $GLOBALS['_remote_get_handler']     = null;
        $GLOBALS['_remote_post_handler']    = null;
        $GLOBALS['_seoagent_test_redirect'] = null;
        $GLOBALS['_seoagent_test_json_response'] = null;
        if (!defined('SEO_AGENT_BACKEND_URL')) define('SEO_AGENT_BACKEND_URL', 'http://backend.test');
    }

    public function test_render_no_license_shows_plans_cta_and_paste_form(): void
    {
        // No license_key set.
        ob_start();
        Subscription_Page::render();
        $out = (string) ob_get_clean();
        $this->assertStringContainsString('free tier', $out);
        $this->assertStringContainsString('See plans &amp; get a key', $out);
        $this->assertStringContainsString('seoagent_save_license_key', $out);
        $this->assertStringContainsString(Subscription_Page::CHECKOUT_URL, $out);
    }

    public function test_render_status_shows_table_and_cancel_button_when_recurring_active(): void
    {
        License::set_license_key('seo_TEST');
        $GLOBALS['_remote_get_handler'] = static function () {
            return ['response' => ['code' => 200], 'body' => json_encode([
                'key'             => 'seo_TEST',
                'status'          => 'active',
                'tier'            => 'pro',
                'expires_at'      => '2026-05-30T00:00:00Z',
                'recurring_state' => 'active',
                'next_charge_at'  => '2026-05-29T00:00:00Z',
                'card_last4'      => '1234',
                'cancelled_at'    => null,
            ])];
        };
        // mint_and_cache will hit POST /auth/token.
        $GLOBALS['_remote_post_handler'] = static function () {
            return ['response' => ['code' => 200], 'body' => json_encode([
                'token' => 'jwt.value.sig', 'tier' => 'pro',
                'expires_at' => gmdate('c', time() + 3600),
            ])];
        };
        ob_start();
        Subscription_Page::render();
        $out = (string) ob_get_clean();
        $this->assertStringContainsString('seo_TEST', $out);
        $this->assertStringContainsString('Pro', $out);
        $this->assertStringContainsString('•••• 1234', $out);
        $this->assertStringContainsString('Cancel subscription', $out);
        $this->assertStringContainsString('seoagent-cancel-sub', $out);
    }

    public function test_render_status_shows_inactive_message_when_recurring_cancelled(): void
    {
        License::set_license_key('seo_TEST');
        $GLOBALS['_remote_get_handler'] = static function () {
            return ['response' => ['code' => 200], 'body' => json_encode([
                'key' => 'seo_TEST', 'status' => 'active', 'tier' => 'pro',
                'expires_at' => '2026-05-30T00:00:00Z',
                'recurring_state' => 'cancelled', 'next_charge_at' => null,
                'card_last4' => '1234', 'cancelled_at' => '2026-04-28T12:00:00Z',
            ])];
        };
        $GLOBALS['_remote_post_handler'] = static function () {
            return ['response' => ['code' => 200], 'body' => json_encode([
                'token' => 'jwt', 'tier' => 'pro', 'expires_at' => gmdate('c', time() + 3600),
            ])];
        };
        ob_start();
        Subscription_Page::render();
        $out = (string) ob_get_clean();
        $this->assertStringContainsString('no longer auto-renewing', $out);
        $this->assertStringNotContainsString('Cancel subscription', $out);
    }

    public function test_render_status_handles_backend_outage(): void
    {
        License::set_license_key('seo_TEST');
        $GLOBALS['_remote_get_handler']  = static fn() => ['response' => ['code' => 503], 'body' => 'down'];
        $GLOBALS['_remote_post_handler'] = static fn() => ['response' => ['code' => 200], 'body' => json_encode([
            'token' => 'jwt', 'tier' => 'pro', 'expires_at' => gmdate('c', time() + 3600),
        ])];
        ob_start();
        Subscription_Page::render();
        $out = (string) ob_get_clean();
        $this->assertStringContainsString('Could not reach', $out);
        $this->assertStringContainsString('seo_TEST', $out);
    }

    public function test_handle_cancel_ajax_denies_non_admin(): void
    {
        License::set_license_key('seo_TEST');
        $GLOBALS['_seoagent_test_caps'] = false;
        try {
            Subscription_Page::handle_cancel_ajax();
            $this->fail('Expected wp_send_json_error to halt');
        } catch (\RuntimeException $e) {
            $this->assertSame('wp_send_json_error', $e->getMessage());
        }
        $resp = $GLOBALS['_seoagent_test_json_response'];
        $this->assertFalse($resp['success']);
        $this->assertSame(403, $resp['code']);
    }

    public function test_handle_cancel_ajax_returns_400_when_no_license(): void
    {
        try {
            Subscription_Page::handle_cancel_ajax();
            $this->fail('Expected wp_send_json_error to halt');
        } catch (\RuntimeException $e) {}
        $resp = $GLOBALS['_seoagent_test_json_response'];
        $this->assertFalse($resp['success']);
        $this->assertSame(400, $resp['code']);
        $this->assertSame('no_license', $resp['data']['error']);
    }

    public function test_handle_cancel_ajax_calls_backend_when_authorised(): void
    {
        License::set_license_key('seo_TEST');
        $cancelCalled = false;
        $GLOBALS['_remote_post_handler'] = static function ($url) use (&$cancelCalled) {
            if (str_contains($url, '/auth/token')) {
                return ['response' => ['code' => 200], 'body' => json_encode([
                    'token' => 'jwt', 'tier' => 'pro', 'expires_at' => gmdate('c', time() + 3600),
                ])];
            }
            if (str_contains($url, '/cancel')) {
                $cancelCalled = true;
                return ['response' => ['code' => 200], 'body' => '{"cancelled":true}'];
            }
            return ['response' => ['code' => 404], 'body' => ''];
        };
        try {
            Subscription_Page::handle_cancel_ajax();
            $this->fail('Expected wp_send_json_success to halt');
        } catch (\RuntimeException $e) {
            $this->assertSame('wp_send_json_success', $e->getMessage());
        }
        $this->assertTrue($cancelCalled);
        $this->assertTrue($GLOBALS['_seoagent_test_json_response']['success']);
    }

    public function test_handle_save_license_key_persists_then_redirects(): void
    {
        $_POST['license_key'] = 'seo_NEW_KEY';
        try {
            Subscription_Page::handle_save_license_key();
            $this->fail('Expected redirect to halt');
        } catch (\RuntimeException $e) {}
        $this->assertSame('seo_NEW_KEY', License::get_license_key());
        $this->assertStringContainsString('seo-agent-subscription', $GLOBALS['_seoagent_test_redirect']);
    }
}
