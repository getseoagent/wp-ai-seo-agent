<?php
declare(strict_types=1);

namespace SeoAgent;

final class Admin_Page
{
    public const SLUG = 'seo-agent';

    public static function init(): void
    {
        add_action('admin_menu', [self::class, 'register_menu']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueue_assets']);
        add_action('admin_post_seo_agent_save_api_key', [self::class, 'handle_save_api_key']);
    }

    public static function register_menu(): void
    {
        add_menu_page(
            'AI SEO Agent',
            'SEO Agent',
            'manage_options',
            self::SLUG,
            [self::class, 'render'],
            'dashicons-format-chat',
            58
        );
    }

    public static function enqueue_assets(string $hook): void
    {
        if ($hook !== 'toplevel_page_' . self::SLUG) {
            return;
        }

        $manifest_path = SEO_AGENT_DIR . 'assets/dist/.vite/manifest.json';
        if (!file_exists($manifest_path)) {
            return;
        }
        $manifest = json_decode((string) file_get_contents($manifest_path), true);
        if (!is_array($manifest) || !isset($manifest['index.html'])) {
            return;
        }
        $entry = $manifest['index.html'];

        if (isset($entry['file'])) {
            wp_enqueue_script(
                'seo-agent-app',
                SEO_AGENT_URL . 'assets/dist/' . $entry['file'],
                [],
                SEO_AGENT_VERSION,
                true
            );
            wp_add_inline_script('seo-agent-app', 'window.SEO_AGENT = ' . wp_json_encode([
                'restUrl' => esc_url_raw(rest_url('seoagent/v1')),
                'nonce'   => wp_create_nonce('wp_rest'),
                'hasKey'  => Settings::get_api_key() !== null,
            ]) . ';', 'before');
        }
        foreach ($entry['css'] ?? [] as $css) {
            wp_enqueue_style(
                'seo-agent-app-' . md5($css),
                SEO_AGENT_URL . 'assets/dist/' . $css,
                [],
                SEO_AGENT_VERSION
            );
        }
    }

    public static function render(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die('Insufficient permissions.');
        }
        $key_set = Settings::get_api_key() !== null;
        $action  = esc_url(admin_url('admin-post.php'));
        $nonce   = wp_create_nonce('seo_agent_save_api_key');
        ?>
        <div class="wrap">
            <h1>AI SEO Agent</h1>

            <h2>Settings</h2>
            <form method="post" action="<?php echo $action; ?>">
                <input type="hidden" name="action" value="seo_agent_save_api_key">
                <input type="hidden" name="_wpnonce" value="<?php echo esc_attr($nonce); ?>">
                <p>
                    <label for="seo_agent_api_key">Anthropic API key</label><br>
                    <input type="password" id="seo_agent_api_key" name="api_key"
                           value="" placeholder="<?php echo $key_set ? '••••••• (set)' : 'sk-ant-...'; ?>"
                           class="regular-text">
                </p>
                <p><button type="submit" class="button button-primary">Save</button></p>
            </form>

            <h2>Chat</h2>
            <div id="seo-agent-root">Loading…</div>
        </div>
        <?php
    }

    public static function handle_save_api_key(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die('Insufficient permissions.');
        }
        check_admin_referer('seo_agent_save_api_key');
        $raw = isset($_POST['api_key']) ? (string) wp_unslash($_POST['api_key']) : '';
        if ($raw !== '') {
            Settings::set_api_key($raw);
        }
        wp_safe_redirect(admin_url('admin.php?page=' . self::SLUG));
        exit;
    }
}
