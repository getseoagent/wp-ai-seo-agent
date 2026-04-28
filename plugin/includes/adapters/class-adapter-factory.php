<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Adapter_Factory {

	/**
	 * @param \Closure(string): bool|null $class_exists_fn   defaults to PHP class_exists
	 * @param \Closure(string): bool|null $option_exists_fn  defaults to WP get_option presence check
	 */
	public static function detect(
		?\Closure $class_exists_fn = null,
		?\Closure $option_exists_fn = null
	): string {
		$class_exists_fn  ??= static fn( string $cls ): bool => class_exists( $cls );
		$option_exists_fn ??= static fn( string $opt ): bool => get_option( $opt ) !== false;

		if ( $class_exists_fn( 'RankMath\\Helper' ) || $option_exists_fn( 'rank_math_modules' ) ) {
			return 'rank-math';
		}
		return 'none';
	}

	public static function make( string $name ): Seo_Fields_Adapter {
		return match ( $name ) {
			'rank-math' => new Rank_Math_Adapter(),
			default     => new Fallback_Adapter(),
		};
	}
}
