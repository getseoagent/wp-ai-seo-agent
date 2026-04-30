<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\Template_Detector;

final class TemplateDetectorTest extends TestCase {

	protected function setUp(): void {
		$GLOBALS['_seoagent_test_home_url']    = 'https://example.com';
		$GLOBALS['_seoagent_test_url_map']     = array(
			'https://example.com/sample-post/' => 11,
			'https://example.com/about/'       => 12,
		);
		$GLOBALS['_seoagent_test_posts']       = array(
			11 => (object) array( 'ID' => 11, 'post_type' => 'post' ),
			12 => (object) array( 'ID' => 12, 'post_type' => 'page' ),
		);
		$GLOBALS['_seoagent_test_post_counts'] = array( 'post' => 200, 'page' => 6 );
		$GLOBALS['_seoagent_test_term_counts'] = array( 'category' => 12, 'post_tag' => 30 );
		// get_option() reads from wp_options_store, not _seoagent_test_options.
		$GLOBALS['wp_options_store']           = array( 'show_on_front' => 'posts' );
	}

	public function test_detects_home(): void {
		$out = Template_Detector::detect( 'https://example.com/' );
		$this->assertSame( 'home', $out['type'] );
		$this->assertSame( 1, $out['count_of_same_type'] );
	}

	public function test_detects_single_post(): void {
		$out = Template_Detector::detect( 'https://example.com/sample-post/' );
		$this->assertSame( 'single', $out['type'] );
		$this->assertSame( 'post', $out['post_type'] );
		$this->assertSame( 200, $out['count_of_same_type'] );
	}

	public function test_detects_page(): void {
		$out = Template_Detector::detect( 'https://example.com/about/' );
		$this->assertSame( 'page', $out['type'] );
		$this->assertSame( 'page', $out['post_type'] );
		$this->assertSame( 6, $out['count_of_same_type'] );
	}

	public function test_unknown_for_external_url(): void {
		$out = Template_Detector::detect( 'https://other-site.com/page' );
		$this->assertSame( 'unknown', $out['type'] );
	}
}
