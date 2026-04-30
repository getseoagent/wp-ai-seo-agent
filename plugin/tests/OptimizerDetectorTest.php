<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\Optimizer_Detector;

final class OptimizerDetectorTest extends TestCase {

	protected function setUp(): void {
		$GLOBALS['_seoagent_test_plugins']        = array();
		$GLOBALS['_seoagent_test_attachment_ids'] = array();
		$GLOBALS['_seoagent_test_attached_files'] = array();
	}

	public function test_returns_three_categories_with_arrays(): void {
		$out = Optimizer_Detector::detect();
		$this->assertArrayHasKey( 'cache', $out );
		$this->assertArrayHasKey( 'image', $out );
		$this->assertArrayHasKey( 'css_js', $out );
		$this->assertIsArray( $out['cache'] );
		$this->assertIsArray( $out['image'] );
		$this->assertIsArray( $out['css_js'] );
	}

	public function test_inactive_when_class_and_function_absent(): void {
		$out = Optimizer_Detector::detect();
		// shortpixel slug is in the catalog but the class isn't loaded → active=false
		$shortpixel = null;
		foreach ( $out['image'] as $entry ) {
			if ( $entry['slug'] === 'shortpixel' ) { $shortpixel = $entry; break; }
		}
		$this->assertNotNull( $shortpixel );
		$this->assertFalse( $shortpixel['active'] );
	}

	public function test_detects_active_plugin_via_class_existence(): void {
		// Define a stub class in the namespace Optimizer_Detector probes.
		if ( ! class_exists( 'ShortPixel\\Plugin' ) ) {
			eval( 'namespace ShortPixel; class Plugin {}' );
		}
		$out = Optimizer_Detector::detect();
		$shortpixel = null;
		foreach ( $out['image'] as $entry ) {
			if ( $entry['slug'] === 'shortpixel' ) { $shortpixel = $entry; break; }
		}
		$this->assertNotNull( $shortpixel );
		$this->assertTrue( $shortpixel['active'] );
		$this->assertArrayHasKey( 'has_webp_files', $shortpixel );
	}

	public function test_has_webp_files_false_when_no_attachments(): void {
		if ( ! class_exists( 'ShortPixel\\Plugin' ) ) {
			eval( 'namespace ShortPixel; class Plugin {}' );
		}
		$out = Optimizer_Detector::detect();
		$shortpixel = null;
		foreach ( $out['image'] as $entry ) {
			if ( $entry['slug'] === 'shortpixel' ) { $shortpixel = $entry; break; }
		}
		$this->assertSame( false, $shortpixel['has_webp_files'] );
	}
}
