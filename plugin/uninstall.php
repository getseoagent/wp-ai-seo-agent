<?php
/**
 * Uninstaller for GetSEOAgent — AI Bulk SEO Chat.
 *
 * Triggered when the user clicks "Delete" from the Plugins screen — NOT on
 * deactivation. WordPress sets WP_UNINSTALL_PLUGIN before loading this file.
 * Anything else loading uninstall.php directly is hostile and we bail.
 */
declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) || ! defined( 'ABSPATH' ) ) {
	exit;
}

// Load the canonical name registry used by Settings, License, and the schema
// stamp. This file's own ABSPATH guard keeps it safe to require here.
require_once __DIR__ . '/includes/class-options.php';

global $wpdb;

// 1) Drop our custom tables. dbDelta won't restore them on next activation
//    unless the user reinstalls and re-activates the plugin — by which point
//    they've explicitly opted back in.
foreach ( \SeoAgent\Options::TABLE_SUFFIXES as $seoagent_suffix ) {
	$seoagent_table = $wpdb->prefix . $seoagent_suffix;
	// Table name is interpolated, not parameterised — $wpdb->prepare doesn't
	// support identifier placeholders. The values are safe (built from
	// $wpdb->prefix + a hard-coded suffix from Options::TABLE_SUFFIXES).
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery
	$wpdb->query( "DROP TABLE IF EXISTS `$seoagent_table`" );
}

// 2) Delete every option this plugin writes. Encrypted secrets (api_key,
//    license_key, jwt) are sensitive — wipe them, don't leave them in the
//    DB after uninstall.
foreach ( \SeoAgent\Options::ALL as $seoagent_option ) {
	delete_option( $seoagent_option );
}

// 3) Multisite — also wipe the schema-stamp at the network-options level.
if ( is_multisite() ) {
	delete_site_option( \SeoAgent\Options::DB_VERSION );
}
