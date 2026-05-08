<?php
/**
 * Plugin Name:       GetSEOAgent — AI Bulk SEO Chat
 * Plugin URI:        https://getseoagent.app
 * Description:       Bulk SEO rewrites through chat. Sample-and-extrapolate UX over RankMath/Yoast/AIOSEO/SEOPress.
 * Version:           1.0.2
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            SEO-FRIENDLY
 * Author URI:        https://www.seo-friendly.org
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       getseoagent
 * Domain Path:       /languages
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Bump on any schema change; plugins_loaded compares against the stored
// `seoagent_db_version` option and re-runs dbDelta when they differ.
define( 'SEO_AGENT_VERSION', '1.0.2' );
define( 'SEO_AGENT_FILE', __FILE__ );
define( 'SEO_AGENT_DIR', plugin_dir_path( __FILE__ ) );
define( 'SEO_AGENT_URL', plugin_dir_url( __FILE__ ) );

require_once SEO_AGENT_DIR . 'includes/class-options.php';
require_once SEO_AGENT_DIR . 'includes/class-settings.php';
require_once SEO_AGENT_DIR . 'includes/class-license.php';
require_once SEO_AGENT_DIR . 'includes/class-jwt-verifier.php';
require_once SEO_AGENT_DIR . 'includes/class-admin-page.php';
require_once SEO_AGENT_DIR . 'includes/class-subscription-page.php';
require_once SEO_AGENT_DIR . 'includes/class-rest-controller.php';
require_once SEO_AGENT_DIR . 'includes/class-history-store.php';
require_once SEO_AGENT_DIR . 'includes/class-jobs-store.php';
require_once SEO_AGENT_DIR . 'includes/class-backend-client.php';

foreach ( glob( SEO_AGENT_DIR . 'includes/adapters/interface-*.php' ) as $seoagent_file ) {
	require_once $seoagent_file;
}
foreach ( glob( SEO_AGENT_DIR . 'includes/adapters/class-*.php' ) as $seoagent_file ) {
	require_once $seoagent_file;
}

/**
 * Idempotent schema migrations. dbDelta diffs the live schema against the DDL
 * and adds missing columns/indexes — safe to call repeatedly on plugins_loaded
 * when the version option mismatches SEO_AGENT_VERSION.
 */
function seoagent_run_db_migrations(): void {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$charset_collate = $wpdb->get_charset_collate();

	// dbDelta is picky:
	//  • PRIMARY KEY must be on its own line, not inline-declared on the column.
	//  • Every INDEX/KEY must be named. Anonymous indexes parse-fail, leaving
	//    behind "Incorrect index name ''" rows in WordPress's debug log on
	//    every plugins_loaded upgrade tick.
	//  • Each KEY clause must be on its own line.
	$history_table = $wpdb->prefix . 'seoagent_history';
	$history_sql   = "CREATE TABLE {$history_table} (
        id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
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
        PRIMARY KEY  (id),
        KEY idx_post_created (post_id, created_at),
        KEY idx_job (job_id)
    ) ENGINE=InnoDB {$charset_collate};";
	dbDelta( $history_sql );

	// Plan 4-B: + current_post_id, current_post_title — populated by job-runner
	// so polling consumers can render "current: <title>" without SSE.
	$jobs_table = $wpdb->prefix . 'seoagent_jobs';
	$jobs_sql   = "CREATE TABLE {$jobs_table} (
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
        current_post_id      BIGINT UNSIGNED NULL,
        current_post_title   VARCHAR(255) NULL,
        PRIMARY KEY  (id),
        KEY idx_user_status (user_id, status),
        KEY idx_started (started_at)
    ) ENGINE=InnoDB {$charset_collate};";
	dbDelta( $jobs_sql );
}

register_activation_hook( __FILE__, 'seoagent_run_db_migrations' );

add_action(
	'plugins_loaded',
	static function (): void {
		// Idempotent migration check: if the stored db_version doesn't match the
		// plugin constant, run migrations and bump the option. dbDelta is a no-op
		// when the live schema already matches.
		if ( get_option( \SeoAgent\Options::DB_VERSION ) !== SEO_AGENT_VERSION ) {
			seoagent_run_db_migrations();
			update_option( \SeoAgent\Options::DB_VERSION, SEO_AGENT_VERSION, false );
		}

		\SeoAgent\Settings::init();
		\SeoAgent\Admin_Page::init();
		\SeoAgent\Subscription_Page::init();
		\SeoAgent\REST_Controller::init();
	}
);
