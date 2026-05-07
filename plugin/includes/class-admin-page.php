<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin_Page {

	public const SLUG = 'getseoagent';

	public static function init(): void {
		add_action( 'admin_menu', array( self::class, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'enqueue_assets' ) );
		add_action( 'admin_post_seo_agent_save_api_key', array( self::class, 'handle_save_api_key' ) );
	}

	public static function register_menu(): void {
		add_menu_page(
			__( 'GetSEOAgent — AI Bulk SEO Chat', 'getseoagent' ),
			__( 'SEO Agent', 'getseoagent' ),
			'manage_options',
			self::SLUG,
			array( self::class, 'render' ),
			'dashicons-format-chat',
			58
		);
	}

	public static function enqueue_assets( string $hook ): void {
		if ( $hook !== 'toplevel_page_' . self::SLUG ) {
			return;
		}

		// Diagnose-button JS is independent of the Vite bundle; enqueue it
		// before the manifest reads so a missing/broken manifest doesn't
		// break the support-diagnostic affordance.
		wp_enqueue_script(
			'seoagent-diagnose',
			SEO_AGENT_URL . 'assets/admin/diagnose.js',
			array(),
			SEO_AGENT_VERSION,
			true
		);
		wp_localize_script(
			'seoagent-diagnose',
			'seoAgentDiagnose',
			array(
				'diagnoseUrl'   => esc_url_raw( rest_url( 'seoagent/v1/diagnose' ) ),
				'diagnoseNonce' => wp_create_nonce( 'wp_rest' ),
				'runningMsg'    => __( 'Running diagnose…', 'getseoagent' ),
				'failMsg'       => __( 'Diagnose failed:', 'getseoagent' ),
				'copyMsg'       => __( 'Copy report for support', 'getseoagent' ),
				'copiedMsg'     => __( 'Copied!', 'getseoagent' ),
			)
		);

		// build-wporg-zip.sh promotes Vite's manifest.json out of the hidden
		// .vite/ directory so the shipping ZIP has no dot-prefixed dirs;
		// dev builds (Vite's normal output) still write to .vite/manifest.json.
		// Check both — production-ZIP wins if both exist.
		$manifest_path = SEO_AGENT_DIR . 'assets/dist/manifest.json';
		if ( ! file_exists( $manifest_path ) ) {
			$manifest_path = SEO_AGENT_DIR . 'assets/dist/.vite/manifest.json';
		}
		if ( ! file_exists( $manifest_path ) ) {
			return;
		}
		// Local Vite-build manifest read; not a remote URL fetch.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$manifest = json_decode( (string) file_get_contents( $manifest_path ), true );
		if ( ! is_array( $manifest ) || ! isset( $manifest['index.html'] ) ) {
			return;
		}
		$entry = $manifest['index.html'];

		if ( isset( $entry['file'] ) ) {
			wp_enqueue_script(
				'seo-agent-app',
				SEO_AGENT_URL . 'assets/dist/' . $entry['file'],
				array( 'wp-i18n' ),
				SEO_AGENT_VERSION,
				true
			);
			// Bind translations to the script handle. WP looks up
			// languages/seo-agent-{locale}-{md5-of-script-path}.json — but
			// we ship locale-only files (seo-agent-{locale}.json) and let WP's
			// fallback machinery find them via the Domain Path: /languages
			// header. This is the standard pattern for plugin-app translations.
			wp_set_script_translations( 'seo-agent-app', 'getseoagent', SEO_AGENT_DIR . 'languages' );

			wp_add_inline_script(
				'seo-agent-app',
				'window.SEO_AGENT = ' . wp_json_encode(
					array(
						'restUrl' => esc_url_raw( rest_url( 'seoagent/v1' ) ),
						'nonce'   => wp_create_nonce( 'wp_rest' ),
						'hasKey'  => Settings::get_api_key() !== null,
					)
				) . ';',
				'before'
			);
		}
		foreach ( $entry['css'] ?? array() as $css ) {
			wp_enqueue_style(
				'seo-agent-app-' . md5( $css ),
				SEO_AGENT_URL . 'assets/dist/' . $css,
				array(),
				SEO_AGENT_VERSION
			);
		}
	}

	public static function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'getseoagent' ) );
		}
		$key_set     = Settings::get_api_key() !== null;
		$action      = esc_url( admin_url( 'admin-post.php' ) );
		$nonce       = wp_create_nonce( 'seo_agent_save_api_key' );
		$placeholder = $key_set ? __( '••••••• (set)', 'getseoagent' ) : 'sk-ant-...';
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'GetSEOAgent — AI Bulk SEO Chat', 'getseoagent' ); ?></h1>

			<h2><?php echo esc_html__( 'Settings', 'getseoagent' ); ?></h2>
			<form method="post" action="<?php echo esc_url( $action ); ?>">
				<input type="hidden" name="action" value="seo_agent_save_api_key">
				<input type="hidden" name="_wpnonce" value="<?php echo esc_attr( $nonce ); ?>">
				<p>
					<label for="seo_agent_api_key"><?php echo esc_html__( 'Anthropic API key', 'getseoagent' ); ?></label><br>
					<input type="password" id="seo_agent_api_key" name="api_key"
							value="" placeholder="<?php echo esc_attr( $placeholder ); ?>"
							class="regular-text">
				</p>
				<p><button type="submit" class="button button-primary"><?php echo esc_html__( 'Save', 'getseoagent' ); ?></button></p>
			</form>

			<h2><?php echo esc_html__( 'Diagnose', 'getseoagent' ); ?></h2>
			<p style="color:#646970;font-size:13px;">
				<?php echo esc_html__( 'Run a one-click connectivity check before opening a support ticket. Output is safe to share — no secrets included.', 'getseoagent' ); ?>
			</p>
			<p>
				<button type="button" class="button" id="seoagent-diagnose-btn">
					<?php echo esc_html__( 'Run diagnose', 'getseoagent' ); ?>
				</button>
				<button type="button" class="button" id="seoagent-diagnose-copy" style="display:none;margin-left:8px;">
					<?php echo esc_html__( 'Copy report for support', 'getseoagent' ); ?>
				</button>
			</p>
			<pre id="seoagent-diagnose-out" style="display:none;background:#f4f5f7;border:1px solid #c3c4c7;border-radius:4px;padding:12px;font-size:12px;max-height:400px;overflow:auto;"></pre>

			<h2><?php echo esc_html__( 'Chat', 'getseoagent' ); ?></h2>
			<div id="seo-agent-root"><?php echo esc_html__( 'Loading…', 'getseoagent' ); ?></div>
		</div>
		<?php
	}

	public static function handle_save_api_key(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'getseoagent' ) );
		}
		check_admin_referer( 'seo_agent_save_api_key' );
		$raw = isset( $_POST['api_key'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['api_key'] ) ) : '';
		if ( $raw !== '' ) {
			Settings::set_api_key( $raw );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SLUG ) );
		exit;
	}
}
