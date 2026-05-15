<?php
declare(strict_types=1);

namespace SeoAgent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Canonical names for every wp_options entry this plugin writes.
 *
 * Centralising them prevents `uninstall.php` from drifting away from the
 * classes that own each value. `Settings`, `License`, and the activation-
 * hook db_version stamp all reference these constants; uninstall.php
 * iterates the `ALL` list.
 */
final class Options {

	public const API_KEY     = 'seo_agent_api_key';        // encrypted (Settings, Anthropic)
	public const PSI_API_KEY = 'seo_agent_psi_api_key';    // encrypted (Settings, Google PSI)
	public const LICENSE_KEY = 'seo_agent_license_key';    // encrypted (License)
	public const JWT         = 'seo_agent_jwt';            // encrypted (License)
	public const JWT_EXP     = 'seo_agent_jwt_exp';        // unix seconds (License)
	public const DB_VERSION  = 'seoagent_db_version';      // schema-tracker (seo-agent.php)

	/** Every option key this plugin writes. uninstall.php iterates this list. */
	public const ALL = array(
		self::API_KEY,
		self::PSI_API_KEY,
		self::LICENSE_KEY,
		self::JWT,
		self::JWT_EXP,
		self::DB_VERSION,
	);

	/** Custom DB tables (without the wpdb prefix). uninstall.php iterates this list. */
	public const TABLE_SUFFIXES = array(
		'seoagent_history',
		'seoagent_jobs',
	);
}
