<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Settings {

	private const OPTION_KEY = Options::API_KEY;

	public static function init(): void {
		// No-op for now; reserved for option registration if needed later.
	}

	public static function get_api_key(): ?string {
		$stored = get_option( self::OPTION_KEY, null );
		if ( ! is_string( $stored ) || $stored === '' ) {
			return null;
		}
		$decrypted = self::decrypt( $stored );
		return $decrypted === '' ? null : $decrypted;
	}

	public static function set_api_key( string $key ): void {
		$key = trim( $key );
		if ( $key === '' ) {
			self::clear_api_key();
			return;
		}
		update_option( self::OPTION_KEY, self::encrypt( $key ) );
	}

	public static function clear_api_key(): void {
		delete_option( self::OPTION_KEY );
	}

	private static function encrypt( string $plain ): string {
		$secret = self::secret_bytes();
		$iv     = random_bytes( 16 );
		$ct     = openssl_encrypt( $plain, 'aes-256-cbc', $secret, OPENSSL_RAW_DATA, $iv );
		if ( $ct === false ) {
			throw new \RuntimeException( 'encryption failed' );
		}
		return base64_encode( $iv . $ct );
	}

	private static function decrypt( string $stored ): string {
		$raw = base64_decode( $stored, true );
		if ( $raw === false || strlen( $raw ) < 17 ) {
			return '';
		}
		$iv     = substr( $raw, 0, 16 );
		$ct     = substr( $raw, 16 );
		$secret = self::secret_bytes();
		$pt     = openssl_decrypt( $ct, 'aes-256-cbc', $secret, OPENSSL_RAW_DATA, $iv );
		return is_string( $pt ) ? $pt : '';
	}

	private static function secret_bytes(): string {
		$base = defined( 'AUTH_KEY' ) ? (string) AUTH_KEY : '';
		return hash( 'sha256', 'seo-agent:' . $base, true );
	}
}
