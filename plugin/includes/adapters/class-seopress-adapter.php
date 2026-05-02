<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SEOPress_Adapter implements Seo_Fields_Adapter {

	private const META_TITLE       = '_seopress_titles_title';
	private const META_DESCRIPTION = '_seopress_titles_desc';
	private const META_FOCUS_KW    = '_seopress_analysis_target_kw';
	private const META_OG_TITLE    = '_seopress_social_fb_title';

	/** @var \Closure(int, string): ?string */
	private \Closure $reader;

	/** @var \Closure(int, string, string): void */
	private \Closure $writer;

	/** @var \Closure(): bool */
	private \Closure $social_active;

	/**
	 * @param \Closure(int, string): ?string|null $reader
	 * @param \Closure(int, string, string): void|null $writer
	 * @param \Closure(): bool|null $social_active
	 */
	public function __construct(
		?\Closure $reader = null,
		?\Closure $writer = null,
		?\Closure $social_active = null
	) {
		$this->reader        = $reader ?? static function ( int $post_id, string $key ): ?string {
			$value = get_post_meta( $post_id, $key, true );
			return is_string( $value ) ? $value : null;
		};
		$this->writer        = $writer ?? static function ( int $post_id, string $key, string $value ): void {
			$ok = update_post_meta( $post_id, $key, $value );
			if ( $ok === false ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new \RuntimeException( sprintf( 'update_post_meta failed for post %d, key %s', $post_id, $key ) );
			}
		};
		$this->social_active = $social_active ?? static function (): bool {
			return get_option( 'seopress_social_active' ) === '1';
		};
	}

	public function get_seo_title( int $post_id ): ?string {
		return $this->non_empty( ( $this->reader )( $post_id, self::META_TITLE ) );
	}

	public function get_seo_description( int $post_id ): ?string {
		return $this->non_empty( ( $this->reader )( $post_id, self::META_DESCRIPTION ) );
	}

	public function get_focus_keyword( int $post_id ): ?string {
		return $this->non_empty( ( $this->reader )( $post_id, self::META_FOCUS_KW ) );
	}

	public function get_og_title( int $post_id ): ?string {
		// Reads remain unconditional — read is harmless even with module off.
		return $this->non_empty( ( $this->reader )( $post_id, self::META_OG_TITLE ) );
	}

	public function name(): string {
		return 'seopress'; }

	private function non_empty( ?string $value ): ?string {
		if ( $value === null || $value === '' ) {
			return null;
		}
		return $value;
	}

	public function set_seo_title( int $post_id, string $value ): void {
		( $this->writer )( $post_id, self::META_TITLE, $value );
	}

	public function set_seo_description( int $post_id, string $value ): void {
		( $this->writer )( $post_id, self::META_DESCRIPTION, $value );
	}

	public function set_focus_keyword( int $post_id, string $value ): void {
		( $this->writer )( $post_id, self::META_FOCUS_KW, $value );
	}

	public function set_og_title( int $post_id, string $value ): void {
		// Defense-in-depth: even though supports() should have gated this, no-op silently
		// when module is off. Avoids throwing for a caller that bypassed the check.
		if ( ! ( $this->social_active )() ) {
			return;
		}
		( $this->writer )( $post_id, self::META_OG_TITLE, $value );
	}

	public function supports( string $field ): bool {
		switch ( $field ) {
			case 'title':
			case 'description':
			case 'focus_keyword':
				return true;
			case 'og_title':
				return ( $this->social_active )();
			default:
				return false;
		}
	}
}
