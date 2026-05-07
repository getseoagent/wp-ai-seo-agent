<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Subscription admin tab — sub-menu under SEO Agent. Reads license status
 * via Backend_Client::get_license_status (which mints a JWT and hits
 * /license/{key}/details on the Node backend) and renders a small status
 * table + cancel button. AJAX cancel posts to /license/{key}/cancel.
 *
 * Most of the heavy lifting is on the backend; this class is just WP-side
 * presentation + auth glue.
 */
final class Subscription_Page {

	public const SLUG         = 'seo-agent-subscription';
	public const CHECKOUT_URL = 'https://getseoagent.app/pricing';

	/**
	 * Hook suffix returned by add_submenu_page() — the canonical value to
	 * compare against the $hook arg admin_enqueue_scripts hands us. Building
	 * the suffix manually is brittle: WP sets the prefix to
	 * sanitize_title( $menu_title ) of the parent menu, NOT the parent slug,
	 * so a translated or punctuated parent title (we have an em-dash) would
	 * silently break a hand-built check.
	 */
	private static ?string $page_hook = null;

	public static function init(): void {
		add_action( 'admin_menu', array( self::class, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'enqueue_assets' ) );
		add_action( 'wp_ajax_seoagent_cancel_subscription', array( self::class, 'handle_cancel_ajax' ) );
		add_action( 'admin_post_seoagent_save_license_key', array( self::class, 'handle_save_license_key' ) );
	}

	public static function register_menu(): void {
		$hook = add_submenu_page(
			Admin_Page::SLUG,
			__( 'Subscription', 'getseoagent' ),
			__( 'Subscription', 'getseoagent' ),
			'manage_options',
			self::SLUG,
			array( self::class, 'render' )
		);
		if ( is_string( $hook ) ) {
			self::$page_hook = $hook;
		}
	}

	public static function enqueue_assets( string $hook ): void {
		if ( self::$page_hook === null || $hook !== self::$page_hook ) {
			return;
		}
		wp_enqueue_script(
			'seoagent-subscription',
			SEO_AGENT_URL . 'assets/admin/subscription.js',
			array(),
			SEO_AGENT_VERSION,
			true
		);
		wp_localize_script(
			'seoagent-subscription',
			'seoAgentSub',
			array(
				'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
				'nonce'          => wp_create_nonce( 'seoagent_cancel_sub' ),
				'confirmMsg'     => __( 'Cancel auto-renewal? You\'ll keep access until the current period ends.', 'getseoagent' ),
				'failGenericMsg' => __( 'Cancel failed — check the browser console.', 'getseoagent' ),
				'failPrefixMsg'  => __( 'Cancel failed:', 'getseoagent' ),
			)
		);
	}

	public static function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'getseoagent' ) );
		}
		$key = License::get_license_key();
		if ( $key === null ) {
			self::render_no_license();
			return;
		}
		$status = Backend_Client::get_license_status( $key );
		self::render_status( $status, $key );
	}

	public static function render_no_license(): void {
		$action = esc_url( admin_url( 'admin-post.php' ) );
		$nonce  = wp_create_nonce( 'seoagent_save_license_key' );
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'Subscription', 'getseoagent' ); ?></h1>
			<p><?php echo esc_html__( 'GetSEOAgent connects to an external service for AI processing. Add a license key below — the GetSEOAgent service has a free tier (no card required) and paid plans with higher quotas.', 'getseoagent' ); ?></p>
			<p><a href="<?php echo esc_url( self::CHECKOUT_URL ); ?>" class="button button-primary" target="_blank" rel="noopener"><?php echo esc_html__( 'See plans & get a key', 'getseoagent' ); ?></a></p>

			<h2><?php echo esc_html__( 'Already have a license key?', 'getseoagent' ); ?></h2>
			<form method="post" action="<?php echo esc_url( $action ); ?>">
				<input type="hidden" name="action"   value="seoagent_save_license_key">
				<input type="hidden" name="_wpnonce" value="<?php echo esc_attr( $nonce ); ?>">
				<p>
					<label for="seoagent_license_key"><?php echo esc_html__( 'License key', 'getseoagent' ); ?></label><br>
					<input type="text" id="seoagent_license_key" name="license_key"
							placeholder="seo_..." class="regular-text">
				</p>
				<p><button type="submit" class="button"><?php echo esc_html__( 'Save', 'getseoagent' ); ?></button></p>
			</form>
		</div>
		<?php
	}

	/** @param array<string, mixed>|null $status */
	public static function render_status( ?array $status, string $key ): void {
		echo '<div class="wrap"><h1>' . esc_html__( 'Subscription', 'getseoagent' ) . '</h1>';

		if ( $status === null ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Could not reach the licensing server. Try again in a minute.', 'getseoagent' ) . '</p></div>';
			echo '<p><strong>' . esc_html__( 'License key on file:', 'getseoagent' ) . '</strong> <code>' . esc_html( $key ) . '</code></p>';
			echo '</div>';
			return;
		}

		$tier       = (string) ( $status['tier'] ?? 'unknown' );
		$statusStr  = (string) ( $status['status'] ?? 'unknown' );
		$recState   = (string) ( $status['recurring_state'] ?? 'unknown' );
		$expiresAt  = (string) ( $status['expires_at'] ?? '' );
		$nextCharge = isset( $status['next_charge_at'] ) && is_string( $status['next_charge_at'] ) ? $status['next_charge_at'] : null;
		$cardLast4  = isset( $status['card_last4'] ) && is_string( $status['card_last4'] ) ? $status['card_last4'] : null;

		echo '<table class="form-table"><tbody>';
		echo '<tr><th>' . esc_html__( 'License key', 'getseoagent' ) . '</th><td><code>' . esc_html( $key ) . '</code></td></tr>';
		echo '<tr><th>' . esc_html__( 'Tier', 'getseoagent' ) . '</th><td>' . esc_html( ucfirst( $tier ) ) . '</td></tr>';
		echo '<tr><th>' . esc_html__( 'Status', 'getseoagent' ) . '</th><td>' . esc_html( $statusStr ) . '</td></tr>';
		echo '<tr><th>' . esc_html__( 'Auto-renewal', 'getseoagent' ) . '</th><td>'
			. esc_html( $recState === 'active' ? __( 'on', 'getseoagent' ) : __( 'off', 'getseoagent' ) ) . '</td></tr>';
		if ( $expiresAt !== '' ) {
			echo '<tr><th>' . esc_html__( 'Active until', 'getseoagent' ) . '</th><td>' . esc_html( self::fmt_date( $expiresAt ) ) . '</td></tr>';
		}
		if ( $nextCharge !== null && $recState === 'active' ) {
			echo '<tr><th>' . esc_html__( 'Next charge', 'getseoagent' ) . '</th><td>' . esc_html( self::fmt_date( $nextCharge ) ) . '</td></tr>';
		}
		if ( $cardLast4 !== null ) {
			echo '<tr><th>' . esc_html__( 'Card', 'getseoagent' ) . '</th><td>•••• ' . esc_html( $cardLast4 ) . '</td></tr>';
		}
		echo '</tbody></table>';

		if ( $recState === 'active' ) {
			echo '<p><button type="button" class="button" id="seoagent-cancel-sub">' . esc_html__( 'Cancel subscription', 'getseoagent' ) . '</button></p>';
			echo '<p><small>'
				/* translators: %s is a date like "2026-05-30 12:00 UTC" */
				. sprintf( esc_html__( 'Cancellation stops auto-renewal. You keep access until %s.', 'getseoagent' ), '<strong>' . esc_html( self::fmt_date( $expiresAt ) ) . '</strong>' )
				. '</small></p>';
		} else {
			echo '<p><em>' . esc_html__( 'This subscription is no longer auto-renewing.', 'getseoagent' ) . '</em></p>';
		}
		echo '<p><a href="https://secure.wayforpay.com/account" target="_blank" rel="noopener">' . esc_html__( 'Manage card on WayForPay', 'getseoagent' ) . '</a></p>';
		echo '</div>';
	}

	public static function handle_cancel_ajax(): void {
		check_ajax_referer( 'seoagent_cancel_sub' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'error' => 'unauthorized' ), 403 );
		}
		$key = License::get_license_key();
		if ( $key === null ) {
			wp_send_json_error( array( 'error' => 'no_license' ), 400 );
		}
		$ok = Backend_Client::cancel_license( $key );
		if ( $ok ) {
			wp_send_json_success();
		} else {
			wp_send_json_error( array( 'error' => 'backend_error' ), 500 );
		}
	}

	public static function handle_save_license_key(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'getseoagent' ) );
		}
		check_admin_referer( 'seoagent_save_license_key' );
		$raw = isset( $_POST['license_key'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['license_key'] ) ) : '';
		if ( $raw !== '' ) {
			License::set_license_key( $raw );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SLUG ) );
		exit;
	}

	private static function fmt_date( string $iso ): string {
		$ts = strtotime( $iso );
		if ( $ts === false ) {
			return $iso;
		}
		return gmdate( 'Y-m-d H:i', $ts ) . ' UTC';
	}
}
