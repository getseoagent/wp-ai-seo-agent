<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class AIOSEO_Adapter implements Seo_Fields_Adapter {

	private const COL_TITLE       = 'title';
	private const COL_DESCRIPTION = 'description';
	private const COL_OG_TITLE    = 'og_title';
	private const COL_KEYPHRASES  = 'keyphrases';

	/** @var \Closure(int, string): ?string */
	private \Closure $reader;

	/** @var \Closure(int, array<string, string>): void */
	private \Closure $writer;

	/**
	 * @param \Closure(int, string): ?string|null $reader
	 * @param \Closure(int, array<string, string>): void|null $writer
	 */
	public function __construct( ?\Closure $reader = null, ?\Closure $writer = null ) {
		$this->reader = $reader ?? static function ( int $post_id, string $column ): ?string {
			global $wpdb;
			if ( ! $wpdb ) {
				return null;
			}
			$table = $wpdb->prefix . 'aioseo_posts';
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
			$value = $wpdb->get_var( $wpdb->prepare( "SELECT `{$column}` FROM {$table} WHERE post_id = %d", $post_id ) );
			return is_string( $value ) ? $value : null;
		};
		$this->writer = $writer ?? static function ( int $post_id, array $columns ): void {
			global $wpdb;
			if ( ! $wpdb || count( $columns ) === 0 ) {
				return;
			}
			$table = $wpdb->prefix . 'aioseo_posts';
			$set_clauses  = array();
			$values       = array( $post_id );
			$cols_sql     = array( '`post_id`' );
			$placeholders = array( '%d' );
			foreach ( $columns as $col => $val ) {
				$cols_sql[]    = '`' . $col . '`';
				$placeholders[] = '%s';
				$values[]      = (string) $val;
				$set_clauses[] = '`' . $col . '` = VALUES(`' . $col . '`)';
			}
			$sql = sprintf(
				'INSERT INTO %s (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s',
				$table,
				implode( ', ', $cols_sql ),
				implode( ', ', $placeholders ),
				implode( ', ', $set_clauses )
			);
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
			$ok = $wpdb->query( $wpdb->prepare( $sql, ...$values ) );
			if ( $ok === false ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new \RuntimeException( sprintf( 'aioseo_posts upsert failed for post %d', $post_id ) );
			}
			if ( has_action( 'aioseo_clear_cache' ) ) {
				do_action( 'aioseo_clear_cache', $post_id );
			}
		};
	}

	public function get_seo_title( int $post_id ): ?string {
		return $this->non_empty( ( $this->reader )( $post_id, self::COL_TITLE ) );
	}

	public function get_seo_description( int $post_id ): ?string {
		return $this->non_empty( ( $this->reader )( $post_id, self::COL_DESCRIPTION ) );
	}

	public function get_og_title( int $post_id ): ?string {
		return $this->non_empty( ( $this->reader )( $post_id, self::COL_OG_TITLE ) );
	}

	public function get_focus_keyword( int $post_id ): ?string {
		$json = ( $this->reader )( $post_id, self::COL_KEYPHRASES );
		if ( ! is_string( $json ) || $json === '' ) {
			return null;
		}
		$decoded = json_decode( $json, true );
		if ( ! is_array( $decoded ) ) {
			return null;
		}
		$kw = $decoded['focus']['keyphrase'] ?? null;
		return is_string( $kw ) && $kw !== '' ? $kw : null;
	}

	public function name(): string {
		return 'aioseo';
	}

	private function non_empty( ?string $value ): ?string {
		if ( $value === null || $value === '' ) {
			return null;
		}
		return $value;
	}

	public function set_seo_title( int $post_id, string $value ): void {
		( $this->writer )( $post_id, array( self::COL_TITLE => $value ) );
	}

	public function set_seo_description( int $post_id, string $value ): void {
		( $this->writer )( $post_id, array( self::COL_DESCRIPTION => $value ) );
	}

	public function set_og_title( int $post_id, string $value ): void {
		( $this->writer )( $post_id, array( self::COL_OG_TITLE => $value ) );
	}

	public function set_focus_keyword( int $post_id, string $value ): void {
		// Read-modify-write: preserve sibling structure (additional[], focus.score, etc.)
		$existing = ( $this->reader )( $post_id, self::COL_KEYPHRASES );
		$decoded  = is_string( $existing ) && $existing !== '' ? json_decode( $existing, true ) : null;
		if ( ! is_array( $decoded ) ) {
			$decoded = array( 'focus' => array(), 'additional' => array() );
		}
		if ( ! isset( $decoded['focus'] ) || ! is_array( $decoded['focus'] ) ) {
			$decoded['focus'] = array();
		}
		if ( ! isset( $decoded['additional'] ) ) {
			$decoded['additional'] = array();
		}
		$decoded['focus']['keyphrase'] = $value;
		$encoded = wp_json_encode( $decoded );
		if ( ! is_string( $encoded ) ) {
			// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
			throw new \RuntimeException( 'failed to encode keyphrases JSON' );
		}
		( $this->writer )( $post_id, array( self::COL_KEYPHRASES => $encoded ) );
	}

	public function supports( string $field ): bool {
		return in_array( $field, array( 'title', 'description', 'focus_keyword', 'og_title' ), true );
	}
}
