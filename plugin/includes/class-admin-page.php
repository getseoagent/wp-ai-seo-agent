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
			__( 'GetSEOAgent — AI Bulk SEO Chat', 'seo-agent' ),
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
			wp_set_script_translations( 'seo-agent-app', 'seo-agent', SEO_AGENT_DIR . 'languages' );

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
			<h1><?php echo esc_html__( 'GetSEOAgent — AI Bulk SEO Chat', 'seo-agent' ); ?></h1>

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

			<h2><?php echo esc_html__( 'Diagnose', 'seo-agent' ); ?></h2>
			<p style="color:#646970;font-size:13px;">
				<?php echo esc_html__( 'Run a one-click connectivity check before opening a support ticket. Output is safe to share — no secrets included.', 'seo-agent' ); ?>
			</p>
			<p>
				<button type="button" class="button" id="seoagent-diagnose-btn">
					<?php echo esc_html__( 'Run diagnose', 'seo-agent' ); ?>
				</button>
				<button type="button" class="button" id="seoagent-diagnose-copy" style="display:none;margin-left:8px;">
					<?php echo esc_html__( 'Copy report for support', 'seo-agent' ); ?>
				</button>
			</p>
			<pre id="seoagent-diagnose-out" style="display:none;background:#f4f5f7;border:1px solid #c3c4c7;border-radius:4px;padding:12px;font-size:12px;max-height:400px;overflow:auto;"></pre>
			<?php
			$diagnose_url   = esc_url( rest_url( 'seoagent/v1/diagnose' ) );
			$diagnose_nonce = wp_create_nonce( 'wp_rest' );
			?>
			<script>
(function(){
	var btn   = document.getElementById('seoagent-diagnose-btn');
	var copy  = document.getElementById('seoagent-diagnose-copy');
	var out   = document.getElementById('seoagent-diagnose-out');
	if (!btn) return;
	var lastReport = '';

	btn.addEventListener('click', async function() {
	btn.disabled = true;
	out.style.display = 'block';
	out.textContent = <?php echo wp_json_encode( __( 'Running diagnose…', 'seo-agent' ) ); ?>;
	try {
		var res = await fetch(<?php echo wp_json_encode( $diagnose_url ); ?>, {
		method:  'POST',
		headers: {
			'content-type': 'application/json',
			'x-wp-nonce':   <?php echo wp_json_encode( $diagnose_nonce ); ?>,
		},
		credentials: 'same-origin',
		body: '{}',
		});
		var data = await res.json();
		lastReport = formatReport(data);
		out.textContent = lastReport;
		copy.style.display = 'inline-block';
	} catch (e) {
		out.textContent = <?php echo wp_json_encode( __( 'Diagnose failed:', 'seo-agent' ) ); ?> + ' ' + e.message;
	} finally {
		btn.disabled = false;
	}
	});

	copy.addEventListener('click', async function() {
	try {
		await navigator.clipboard.writeText(lastReport);
		copy.textContent = <?php echo wp_json_encode( __( 'Copied!', 'seo-agent' ) ); ?>;
		setTimeout(function(){
		copy.textContent = <?php echo wp_json_encode( __( 'Copy report for support', 'seo-agent' ) ); ?>;
		}, 2000);
	} catch (e) {
		// Clipboard API can fail in non-https contexts or if user denies permission.
		// Fall back to a select-all hint so the user can copy manually.
		window.getSelection().selectAllChildren(out);
	}
	});

	// Render the JSON as a checklist + raw block. Only the keys we know are
	// formatted; unknown keys fall through to the raw JSON dump for debugging.
	function formatReport(d) {
	var ok = '✓', bad = '✗', skip = '~';
	var lines = [];
	lines.push('# GetSEOAgent diagnostic');
	lines.push('plugin: ' + d.plugin_version + ' · WP ' + d.wp_version + ' · PHP ' + d.php_version);
	lines.push('site:    ' + d.site_url);
	lines.push('backend: ' + d.backend_url);
	lines.push('took:    ' + d.took_ms + ' ms');
	lines.push('');
	lines.push('## Configuration');
	lines.push('  ' + (d.wp_config && d.wp_config.SEO_AGENT_JWT_SECRET === 'set' ? ok : bad)
		+ ' SEO_AGENT_JWT_SECRET: ' + (d.wp_config && d.wp_config.SEO_AGENT_JWT_SECRET));
	lines.push('  ' + ok + ' SEO_AGENT_BACKEND_URL: ' + (d.wp_config && d.wp_config.SEO_AGENT_BACKEND_URL));
	lines.push('  ' + (d.anthropic_key_set ? ok : bad) + ' Anthropic API key: ' + (d.anthropic_key_set ? 'set' : 'NOT SET'));
	lines.push('  ' + (d.license_key_set ? ok : skip) + ' License key: ' + (d.license_key_set ? 'set' : 'free tier'));
	lines.push('');
	lines.push('## Backend connectivity');
	var h = d.backend_health || {};
	lines.push('  ' + (h.status === 'ok' ? ok : bad) + ' /health: ' + (h.status || '?')
		+ ' (' + (h.http_code !== undefined ? 'HTTP ' + h.http_code + ', ' : '')
		+ (h.elapsed_ms || 0) + ' ms)');
	var m = d.jwt_mint || {};
	var mIcon = m.status === 'ok' ? ok : (m.status === 'skipped' ? skip : bad);
	lines.push('  ' + mIcon + ' /auth/token mint: ' + (m.status || '?')
		+ (m.elapsed_ms ? ' (' + m.elapsed_ms + ' ms)' : '')
		+ (m.error ? ' — ' + m.error : ''));
	var c = d.jwt_cache || {};
	lines.push('  ' + (c.present ? ok : skip) + ' JWT cache: ' + (c.present ? 'present' : 'empty'));
	lines.push('');
	lines.push('--- raw ---');
	lines.push(JSON.stringify(d, null, 2));
	return lines.join('\n');
	}
})();
</script>

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
