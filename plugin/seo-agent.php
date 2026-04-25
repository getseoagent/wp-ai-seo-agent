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
require_once SEO_AGENT_DIR . 'includes/class-backend-client.php';

add_action('plugins_loaded', static function (): void {
    \SeoAgent\Settings::init();
    \SeoAgent\Admin_Page::init();
    \SeoAgent\REST_Controller::init();
});
