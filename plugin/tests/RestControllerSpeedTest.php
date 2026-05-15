<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class RestControllerSpeedTest extends TestCase {

	protected function setUp(): void {
		$GLOBALS['_seoagent_test_home_url'] = 'https://example.com';
		$GLOBALS['_seoagent_test_url_map']  = array();
		$GLOBALS['_seoagent_test_posts']    = array();
		$GLOBALS['wp_options_store']        = array( 'show_on_front' => 'posts' );
	}

	public function test_template_info_returns_structured_payload(): void {
		$GLOBALS['_seoagent_test_params'] = array( 'url' => 'https://example.com/' );
		$req = new \WP_REST_Request( 'GET', '/seoagent/v1/template-info' );
		$res = \SeoAgent\REST_Controller::handle_template_info( $req );
		$this->assertSame( 'home', $res['type'] );
	}

	public function test_template_info_400_on_missing_url(): void {
		$GLOBALS['_seoagent_test_params'] = array();
		$req = new \WP_REST_Request( 'GET', '/seoagent/v1/template-info' );
		$res = \SeoAgent\REST_Controller::handle_template_info( $req );
		$this->assertArrayHasKey( 'error', $res );
	}

	public function test_speed_optimizers_returns_three_categories(): void {
		$payload = \SeoAgent\Optimizer_Detector::detect();
		$this->assertArrayHasKey( 'cache', $payload );
		$this->assertArrayHasKey( 'image', $payload );
		$this->assertArrayHasKey( 'css_js', $payload );
	}
}
