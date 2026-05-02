<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Multi_Seo_Notice {

	private const LABELS = array(
		'rank-math' => 'Rank Math',
		'yoast'     => 'Yoast',
		'aioseo'    => 'AIOSEO',
		'seopress'  => 'SEOPress',
	);

	public static function label( string $slug ): string {
		return self::LABELS[ $slug ] ?? $slug;
	}

	/**
	 * @param list<string> $detected
	 */
	public static function render( array $detected ): string {
		if ( count( $detected ) < 2 ) {
			return '';
		}
		$primary   = array_shift( $detected );
		$primary_l = self::label( $primary );
		$labels    = array_map( array( self::class, 'label' ), $detected );

		if ( count( $labels ) === 1 ) {
			$message = sprintf(
				/* translators: 1: primary SEO plugin label, 2: secondary plugin label */
				__( 'Detected multiple SEO plugins: <strong>%1$s</strong>, <strong>%2$s</strong>. The agent is writing through <strong>%1$s</strong>. %2$s metadata for the same posts will stay at its current values and may diverge over time. Disable the unused plugin to avoid drift.', 'getseoagent' ),
				esc_html( $primary_l ),
				esc_html( $labels[0] )
			);
		} else {
			$others  = implode(
				', ',
				array_map(
					static fn( string $l ): string => '<strong>' . esc_html( $l ) . '</strong>',
					$labels
				)
			);
			$message = sprintf(
				/* translators: 1: primary SEO plugin label, 2: comma-joined other plugin labels */
				__( 'Detected multiple SEO plugins: <strong>%1$s</strong>, plus %2$s. The agent is writing through <strong>%1$s</strong> only. Metadata in the others will stay at its current values and may diverge. Disable the unused plugins to avoid drift.', 'getseoagent' ),
				esc_html( $primary_l ),
				$others // already escaped per-item
			);
		}

		return sprintf(
			'<div class="notice notice-warning is-dismissible"><p>%s</p></div>',
			$message
		);
	}

	public static function maybe_print(): void {
		$detected = Adapters\Adapter_Factory::detect();
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo self::render( $detected );
	}
}
