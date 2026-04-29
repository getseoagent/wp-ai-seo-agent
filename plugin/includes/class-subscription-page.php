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
	public const CHECKOUT_URL = 'https://www.seo-friendly.org/pricing';

	public static function init(): void {
		add_action( 'admin_menu', array( self::class, 'register_menu' ) );
		add_action( 'wp_ajax_seoagent_cancel_subscription', array( self::class, 'handle_cancel_ajax' ) );
		add_action( 'admin_post_seoagent_save_license_key', array( self::class, 'handle_save_license_key' ) );
	}

	public static function register_menu(): void {
		add_submenu_page(
			Admin_Page::SLUG,
			__( 'Subscription', 'getseoagent' ),
			__( 'Subscription', 'getseoagent' ),
			'manage_options',
			self::SLUG,
			array( self::class, 'render' )
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
			<p><?php echo esc_html__( 'You\'re on the free tier. Upgrade to Pro or Agency to unlock write tools and bulk operations.', 'getseoagent' ); ?></p>
			<p><a href="<?php echo esc_url( self::CHECKOUT_URL ); ?>" class="button button-primary" target="_blank" rel="noopener"><?php echo esc_html__( 'Buy a license', 'getseoagent' ); ?></a></p>

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
		$nonce = wp_create_nonce( 'seoagent_cancel_sub' );
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

		// Inline JS for the cancel-button → AJAX hop. Small enough to keep
		// colocated with the markup; not worth a separate enqueue. User-facing
		// strings get JS-escaped via wp_json_encode so quotes/backslashes can't
		// break the script tag and so future translators get the same hooks.
		$ajax_url         = esc_url( admin_url( 'admin-ajax.php' ) );
		$confirm_msg      = wp_json_encode( __( 'Cancel auto-renewal? You\'ll keep access until the current period ends.', 'getseoagent' ) );
		$fail_generic_msg = wp_json_encode( __( 'Cancel failed — check the browser console.', 'getseoagent' ) );
		$fail_prefix_msg  = wp_json_encode( __( 'Cancel failed:', 'getseoagent' ) );
		// $confirm_msg / $fail_generic_msg / $fail_prefix_msg are wp_json_encode'd so
		// they're safe-as-JS-string-literals (no need for esc_html). $ajax_url /
		// $nonce are esc_url / nonce-format safe by construction.
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo "<script>
(function(){
  var btn = document.getElementById('seoagent-cancel-sub');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    if (!confirm({$confirm_msg})) return;
    btn.disabled = true;
    try {
      var res = await fetch('{$ajax_url}', {
        method:  'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body:    new URLSearchParams({ action: 'seoagent_cancel_subscription', _wpnonce: '{$nonce}' }).toString(),
        credentials: 'same-origin',
      });
      if (res.ok) { location.reload(); }
      else { alert({$fail_generic_msg}); btn.disabled = false; }
    } catch (e) { alert({$fail_prefix_msg} + ' ' + e.message); btn.disabled = false; }
  });
})();
</script>";
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
