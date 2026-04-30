<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Optimizer_Detector {

	private const CACHE_PLUGINS = array(
		array( 'slug' => 'wp-rocket',       'name' => 'WP Rocket',       'class' => 'WP_Rocket\\Engine\\Plugin\\Plugin' ),
		array( 'slug' => 'w3-total-cache',  'name' => 'W3 Total Cache',  'class' => 'W3TC\\Root_Loader' ),
		array( 'slug' => 'litespeed-cache', 'name' => 'LiteSpeed Cache', 'class' => 'LiteSpeed\\Core' ),
		array( 'slug' => 'wp-super-cache',  'name' => 'WP Super Cache',  'function' => 'wp_super_cache_init' ),
	);

	private const IMAGE_PLUGINS = array(
		array( 'slug' => 'shortpixel', 'name' => 'ShortPixel Image Optimizer', 'class' => 'ShortPixel\\Plugin' ),
		array( 'slug' => 'ewww',       'name' => 'EWWW Image Optimizer',       'class' => 'EWWW' ),
		array( 'slug' => 'imagify',    'name' => 'Imagify',                    'class' => 'Imagify' ),
		array( 'slug' => 'smush',      'name' => 'WP Smush',                   'class' => 'WP_Smush' ),
	);

	private const CSS_JS_PLUGINS = array(
		array( 'slug' => 'autoptimize', 'name' => 'Autoptimize', 'class' => 'autoptimizeMain' ),
		// WP Rocket also handles CSS/JS — surfaced under both cache and css_js.
		array( 'slug' => 'wp-rocket',   'name' => 'WP Rocket',   'class' => 'WP_Rocket\\Engine\\Plugin\\Plugin' ),
	);

	/**
	 * @return array{cache: array, image: array, css_js: array}
	 */
	public static function detect(): array {
		$cache  = self::detect_group( self::CACHE_PLUGINS );
		$image  = self::detect_group( self::IMAGE_PLUGINS );
		$css_js = self::detect_group( self::CSS_JS_PLUGINS );

		// For each active image plugin, sample 5 attachments and check for .webp siblings.
		foreach ( $image as &$entry ) {
			if ( $entry['active'] ) {
				$entry['has_webp_files'] = self::sample_has_webp();
			}
		}
		unset( $entry );

		return array( 'cache' => $cache, 'image' => $image, 'css_js' => $css_js );
	}

	/**
	 * @param array<int, array<string, string>> $defs
	 * @return list<array<string, mixed>>
	 */
	private static function detect_group( array $defs ): array {
		$out = array();
		foreach ( $defs as $def ) {
			$active = false;
			if ( isset( $def['class'] ) && class_exists( $def['class'] ) ) {
				$active = true;
			}
			if ( ! $active && isset( $def['function'] ) && function_exists( $def['function'] ) ) {
				$active = true;
			}
			$out[] = array(
				'slug'    => $def['slug'],
				'name'    => $def['name'],
				'version' => $active ? self::version_for( $def['slug'] ) : '',
				'active'  => $active,
			);
		}
		return $out;
	}

	private static function version_for( string $slug ): string {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$all = get_plugins();
		foreach ( $all as $file => $data ) {
			if ( strpos( $file, $slug ) !== false ) {
				return (string) ( $data['Version'] ?? '' );
			}
		}
		return '';
	}

	private static function sample_has_webp(): bool {
		$q = new \WP_Query( array(
			'post_type'              => 'attachment',
			'post_mime_type'         => array( 'image/jpeg', 'image/png' ),
			'post_status'            => 'inherit',
			'posts_per_page'         => 5,
			'orderby'                => 'rand',
			'no_found_rows'          => true,
			'fields'                 => 'ids',
			'update_post_meta_cache' => false,
			'update_post_term_cache' => false,
		) );
		if ( empty( $q->posts ) ) {
			return false;
		}
		$hits = 0;
		foreach ( $q->posts as $id ) {
			$path = get_attached_file( (int) $id );
			if ( ! $path ) {
				continue;
			}
			$webp = preg_replace( '/\.(jpe?g|png)$/i', '.webp', $path );
			if ( $webp && file_exists( $webp ) ) {
				$hits++;
			}
		}
		return $hits >= 3;
	}
}
