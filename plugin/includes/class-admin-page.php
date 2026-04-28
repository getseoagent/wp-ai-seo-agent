<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin_Page {

	public const SLUG = 'seo-agent';

	public static function init(): void {
		add_action( 'admin_menu', array( self::class, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'enqueue_assets' ) );
		add_action( 'admin_post_seo_agent_save_api_key', array( self::class, 'handle_save_api_key' ) );
	}

	public static function register_menu(): void {
		add_menu_page(
			__( 'AI SEO Agent', 'seo-agent' ),
			__( 'SEO Agent', 'seo-agent' ),
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

		$manifest_path = SEO_AGENT_DIR . 'assets/dist/.vite/manifest.json';
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
				array(),
				SEO_AGENT_VERSION,
				true
			);
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
			wp_die( esc_html__( 'Insufficient permissions.', 'seo-agent' ) );
		}
		$key_set     = Settings::get_api_key() !== null;
		$action      = esc_url( admin_url( 'admin-post.php' ) );
		$nonce       = wp_create_nonce( 'seo_agent_save_api_key' );
		$placeholder = $key_set ? __( '••••••• (set)', 'seo-agent' ) : 'sk-ant-...';
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'AI SEO Agent', 'seo-agent' ); ?></h1>

			<h2><?php echo esc_html__( 'Settings', 'seo-agent' ); ?></h2>
			<form method="post" action="<?php echo esc_url( $action ); ?>">
				<input type="hidden" name="action" value="seo_agent_save_api_key">
				<input type="hidden" name="_wpnonce" value="<?php echo esc_attr( $nonce ); ?>">
				<p>
					<label for="seo_agent_api_key"><?php echo esc_html__( 'Anthropic API key', 'seo-agent' ); ?></label><br>
					<input type="password" id="seo_agent_api_key" name="api_key"
							value="" placeholder="<?php echo esc_attr( $placeholder ); ?>"
							class="regular-text">
				</p>
				<p><button type="submit" class="button button-primary"><?php echo esc_html__( 'Save', 'seo-agent' ); ?></button></p>
			</form>

			<h2><?php echo esc_html__( 'Chat', 'seo-agent' ); ?></h2>
			<div id="seo-agent-root"><?php echo esc_html__( 'Loading…', 'seo-agent' ); ?></div>
		</div>
		<?php
	}

	public static function handle_save_api_key(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'seo-agent' ) );
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
