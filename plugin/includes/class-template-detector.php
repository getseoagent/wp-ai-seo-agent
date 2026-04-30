<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Template_Detector {

	/**
	 * @return array{
	 *   type: string,
	 *   post_id?: int,
	 *   post_type?: string,
	 *   count_of_same_type: int
	 * }
	 */
	public static function detect( string $url ): array {
		$home = trailingslashit( home_url() );
		if ( ! str_starts_with( trailingslashit( $url ), $home ) ) {
			return array( 'type' => 'unknown', 'count_of_same_type' => 0 );
		}

		// Strip query string and fragment.
		$parts = wp_parse_url( $url );
		$path  = isset( $parts['path'] ) ? $parts['path'] : '/';

		// 1. Front page / blog index
		if ( $path === '/' || $path === '' ) {
			$show_on_front = get_option( 'show_on_front' );
			if ( $show_on_front === 'page' ) {
				return array( 'type' => 'front_page', 'post_id' => (int) get_option( 'page_on_front' ), 'post_type' => 'page', 'count_of_same_type' => 1 );
			}
			return array( 'type' => 'home', 'count_of_same_type' => 1 );
		}

		// 2. url_to_postid for single posts and pages
		$post_id = (int) url_to_postid( $url );
		if ( $post_id > 0 ) {
			$post = get_post( $post_id );
			if ( $post ) {
				$type = ( $post->post_type === 'page' ) ? 'page' : 'single';
				$count = (int) wp_count_posts( $post->post_type )->publish;
				return array(
					'type'               => $type,
					'post_id'            => $post_id,
					'post_type'          => $post->post_type,
					'count_of_same_type' => $count,
				);
			}
		}

		// 3. Taxonomy archives — try category, tag.
		// V1 heuristic: detects presence of these slugs anywhere in path (may over-match edge cases).
		$cat_base = get_option( 'category_base' ) ?: 'category';
		if ( strpos( $path, '/' . trim( $cat_base, '/' ) . '/' ) !== false ) {
			return array( 'type' => 'category', 'count_of_same_type' => self::count_category_archives() );
		}
		$tag_base = get_option( 'tag_base' ) ?: 'tag';
		if ( strpos( $path, '/' . trim( $tag_base, '/' ) . '/' ) !== false ) {
			return array( 'type' => 'tag', 'count_of_same_type' => self::count_tag_archives() );
		}

		// 4. /author/<slug>/, /YYYY/MM/, /?s=, /search/...
		// V1 heuristic: author archives; simplified from redundant === 0 || !== false check.
		if ( strpos( $path, '/author/' ) !== false ) {
			return array( 'type' => 'author', 'count_of_same_type' => 0 );
		}
		if ( preg_match( '#/\d{4}/(\d{1,2}/)?#', $path ) ) {
			return array( 'type' => 'date', 'count_of_same_type' => 0 );
		}
		if ( strpos( $path, '/search/' ) !== false || ( isset( $parts['query'] ) && preg_match( '/(^|&)s=/', $parts['query'] ) ) ) {
			return array( 'type' => 'search', 'count_of_same_type' => 0 );
		}

		// 5. WooCommerce templates — only if Woo is installed.
		if ( class_exists( '\WooCommerce' ) ) {
			$shop_id = (int) get_option( 'woocommerce_shop_page_id' );
			if ( $shop_id > 0 && $post_id === $shop_id ) {
				return array( 'type' => 'shop', 'post_id' => $shop_id, 'count_of_same_type' => 1 );
			}
			// Heuristic: /product/<slug>/
			if ( strpos( $path, '/product/' ) !== false ) {
				return array( 'type' => 'product', 'count_of_same_type' => self::count_post_type( 'product' ) );
			}
		}

		return array( 'type' => 'unknown', 'count_of_same_type' => 0 );
	}

	private static function count_post_type( string $pt ): int {
		$counts = wp_count_posts( $pt );
		return $counts ? (int) $counts->publish : 0;
	}

	private static function count_category_archives(): int {
		return (int) wp_count_terms( array( 'taxonomy' => 'category', 'hide_empty' => true ) );
	}

	private static function count_tag_archives(): int {
		return (int) wp_count_terms( array( 'taxonomy' => 'post_tag', 'hide_empty' => true ) );
	}
}
