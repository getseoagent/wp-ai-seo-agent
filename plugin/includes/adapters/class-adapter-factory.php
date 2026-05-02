<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Adapter_Factory {

	/**
	 * Detect every active SEO plugin in priority order: RankMath > Yoast > AIOSEO > SEOPress.
	 *
	 * @param \Closure(string): bool|null $class_exists_fn   defaults to PHP class_exists
	 * @param \Closure(string): bool|null $option_exists_fn  defaults to WP get_option presence check
	 * @param \Closure(string): bool|null $constant_defined_fn defaults to PHP defined()
	 * @param \Closure(string): bool|null $table_exists_fn   defaults to wpdb table-exists check
	 * @return list<string>
	 */
	public static function detect(
		?\Closure $class_exists_fn = null,
		?\Closure $option_exists_fn = null,
		?\Closure $constant_defined_fn = null,
		?\Closure $table_exists_fn = null
	): array {
		$class_exists_fn     ??= static fn( string $cls ): bool => class_exists( $cls );
		$option_exists_fn    ??= static fn( string $opt ): bool => get_option( $opt ) !== false;
		$constant_defined_fn ??= static fn( string $name ): bool => defined( $name );
		$table_exists_fn     ??= static function ( string $unprefixed_table ): bool {
			global $wpdb;
			if ( ! $wpdb ) {
				return false;
			}
			$full = $wpdb->prefix . $unprefixed_table;
			$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $full ) );
			return $found === $full;
		};

		$detected = array();

		// 1. RankMath
		if ( $class_exists_fn( 'RankMath\\Helper' ) || $option_exists_fn( 'rank_math_modules' ) ) {
			$detected[] = 'rank-math';
		}

		// 2. Yoast
		if ( $class_exists_fn( 'WPSEO_Options' ) || $option_exists_fn( 'wpseo' ) ) {
			$detected[] = 'yoast';
		}

		// 3. AIOSEO — class OR option, AND its data table must exist
		$aioseo_signaled = $class_exists_fn( 'AIOSEO\\Plugin\\AIOSEO' ) || $option_exists_fn( 'aioseo_options' );
		if ( $aioseo_signaled && $table_exists_fn( 'aioseo_posts' ) ) {
			$detected[] = 'aioseo';
		}

		// 4. SEOPress
		if (
			$constant_defined_fn( 'SEOPRESS_VERSION' )
			|| $option_exists_fn( 'seopress_titles_option_name' )
			|| $option_exists_fn( 'seopress_pro_license_status' )
		) {
			$detected[] = 'seopress';
		}

		return $detected;
	}

	/**
	 * NOTE: 'seopress' arm falls through to Fallback_Adapter because the concrete
	 * adapter class doesn't exist yet — it will be restored in Task 5 as the
	 * class file lands in includes/adapters/.
	 */
	public static function make( string $name ): Seo_Fields_Adapter {
		return match ( $name ) {
			'rank-math' => new Rank_Math_Adapter(),
			'yoast'     => new Yoast_Adapter(),
			'aioseo'    => new AIOSEO_Adapter(),
			default     => new Fallback_Adapter(),
		};
	}

	/**
	 * @param list<string> $detected
	 */
	public static function make_primary( array $detected ): Seo_Fields_Adapter {
		$first = $detected[0] ?? 'none';
		return self::make( $first );
	}
}
