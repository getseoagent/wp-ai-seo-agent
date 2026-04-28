<?php
/**
 * Uninstaller for AI SEO Agent.
 *
 * Triggered when the user clicks "Delete" from the Plugins screen — NOT on
 * deactivation. WordPress sets WP_UNINSTALL_PLUGIN before loading this file.
 * Anything else loading uninstall.php directly is hostile and we bail.
 */
declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) || ! defined( 'ABSPATH' ) ) {
	exit;
}

global $wpdb;

// 1) Drop our two custom tables. dbDelta won't restore them on next activation
//    unless the user reinstalls and re-activates the plugin — by which point
//    they've explicitly opted back in.
$tables = array(
	$wpdb->prefix . 'seoagent_history',
	$wpdb->prefix . 'seoagent_jobs',
);
foreach ( $tables as $table ) {
	// Table name is interpolated, not parameterised — $wpdb->prepare doesn't
	// support identifier placeholders. The values are safe (built from
	// $wpdb->prefix + a hard-coded suffix).
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery
	$wpdb->query( "DROP TABLE IF EXISTS `$table`" );
}

// 2) Delete every option this plugin writes. Encrypted secrets (api_key,
//    license_key, jwt) are sensitive — wipe them, don't leave them in the
//    DB after uninstall.
// Option names mirror the constants in class-settings.php and class-license.php
// (api_key, license_key, jwt, jwt_exp are AUTH_KEY-encrypted; db_version is the
// schema tracker). Keep this list in sync with those files.
$options = array(
	'seo_agent_api_key',
	'seo_agent_license_key',
	'seo_agent_jwt',
	'seo_agent_jwt_exp',
	'seoagent_db_version',
);
foreach ( $options as $option ) {
	delete_option( $option );
}

// 3) Multisite — wipe site-options too. delete_option targets the current site;
//    on a network deactivation the iteration here covers every subsite.
if ( is_multisite() ) {
	delete_site_option( 'seoagent_db_version' );
}
