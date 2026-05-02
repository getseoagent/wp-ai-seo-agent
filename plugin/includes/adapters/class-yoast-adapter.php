<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Yoast_Adapter implements Seo_Fields_Adapter {

	private const META_TITLE       = '_yoast_wpseo_title';
	private const META_DESCRIPTION = '_yoast_wpseo_metadesc';
	private const META_FOCUS_KW    = '_yoast_wpseo_focuskw';
	private const META_OG_TITLE    = '_yoast_wpseo_opengraph-title';

	/** @var \Closure(int, string): ?string */
	private \Closure $reader;

	/** @var \Closure(int, string, string): void */
	private \Closure $writer;

	/**
	 * @param \Closure(int, string): ?string|null $reader
	 * @param \Closure(int, string, string): void|null $writer
	 */
	public function __construct( ?\Closure $reader = null, ?\Closure $writer = null ) {
		$this->reader = $reader ?? static function ( int $post_id, string $key ): ?string {
			$value = get_post_meta( $post_id, $key, true );
			return is_string( $value ) ? $value : null;
		};
		$this->writer = $writer ?? static function ( int $post_id, string $key, string $value ): void {
			$ok = update_post_meta( $post_id, $key, $value );
			if ( $ok === false ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new \RuntimeException( sprintf( 'update_post_meta failed for post %d, key %s', $post_id, $key ) );
			}
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
		return $this->non_empty( ( $this->reader )( $post_id, self::META_OG_TITLE ) );
	}

	public function name(): string {
		return 'yoast'; }

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
		( $this->writer )( $post_id, self::META_OG_TITLE, $value );
	}

	public function supports( string $field ): bool {
		return in_array( $field, array( 'title', 'description', 'focus_keyword', 'og_title' ), true );
	}
}
