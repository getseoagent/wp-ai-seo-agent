<?php
/**
 * Plugin Name: AI SEO Agent
 * Description: Bulk SEO operations through dialog. Augments RankMath/Yoast/AIOSEO/SEOPress.
 * Version: 0.1.0
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Author: artifact861
 * License: GPL-2.0-or-later
 * Text Domain: seo-agent
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('SEO_AGENT_VERSION', '0.1.0');
define('SEO_AGENT_FILE', __FILE__);
define('SEO_AGENT_DIR', plugin_dir_path(__FILE__));
define('SEO_AGENT_URL', plugin_dir_url(__FILE__));

require_once SEO_AGENT_DIR . 'includes/class-settings.php';
require_once SEO_AGENT_DIR . 'includes/class-admin-page.php';
require_once SEO_AGENT_DIR . 'includes/class-rest-controller.php';
require_once SEO_AGENT_DIR . 'includes/class-history-store.php';
require_once SEO_AGENT_DIR . 'includes/class-jobs-store.php';
require_once SEO_AGENT_DIR . 'includes/class-backend-client.php';

foreach (glob(SEO_AGENT_DIR . 'includes/adapters/interface-*.php') as $file) {
    require_once $file;
}
foreach (glob(SEO_AGENT_DIR . 'includes/adapters/class-*.php') as $file) {
    require_once $file;
}

register_activation_hook(__FILE__, static function (): void {
    global $wpdb;
    $charset_collate = $wpdb->get_charset_collate();
    $table = $wpdb->prefix . 'seoagent_history';
    $sql = "CREATE TABLE {$table} (
        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        post_id         BIGINT UNSIGNED NOT NULL,
        job_id          VARCHAR(36)     NOT NULL,
        field           VARCHAR(64)     NOT NULL,
        before_value    LONGTEXT        NULL,
        after_value     LONGTEXT        NULL,
        status          VARCHAR(32)     NOT NULL,
        reason          TEXT            NULL,
        user_id         BIGINT UNSIGNED NULL,
        created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
        rolled_back_at  DATETIME        NULL,
        INDEX (post_id, created_at),
        INDEX (job_id)
    ) {$charset_collate};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);

    $jobs_table = $wpdb->prefix . 'seoagent_jobs';
    $jobs_sql = "CREATE TABLE {$jobs_table} (
        id                   VARCHAR(36)  NOT NULL,
        user_id              BIGINT       NOT NULL DEFAULT 0,
        tool_name            VARCHAR(64)  NOT NULL,
        status               VARCHAR(32)  NOT NULL,
        total                INT          NOT NULL,
        done                 INT          NOT NULL DEFAULT 0,
        failed_count         INT          NOT NULL DEFAULT 0,
        style_hints          TEXT         NULL,
        params_json          LONGTEXT     NULL,
        started_at           DATETIME     NOT NULL,
        finished_at          DATETIME     NULL,
        cancel_requested_at  DATETIME     NULL,
        last_progress_at     DATETIME     NULL,
        PRIMARY KEY (id),
        INDEX idx_user_status (user_id, status),
        INDEX idx_started (started_at)
    ) {$charset_collate};";
    dbDelta($jobs_sql);
});

add_action('plugins_loaded', static function (): void {
    \SeoAgent\Settings::init();
    \SeoAgent\Admin_Page::init();
    \SeoAgent\REST_Controller::init();
});
