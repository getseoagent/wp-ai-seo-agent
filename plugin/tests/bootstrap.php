<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

require_once dirname(__DIR__) . '/includes/class-settings.php';

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__);
}
if (!defined('AUTH_KEY')) {
    define('AUTH_KEY', 'test-auth-key-do-not-use-in-prod');
}

// Minimal WP function stubs for unit tests
$GLOBALS['wp_options_store'] = [];

if (!function_exists('get_option')) {
    function get_option(string $name, $default = false) {
        return $GLOBALS['wp_options_store'][$name] ?? $default;
    }
}
if (!function_exists('update_option')) {
    function update_option(string $name, $value): bool {
        $GLOBALS['wp_options_store'][$name] = $value;
        return true;
    }
}
if (!function_exists('delete_option')) {
    function delete_option(string $name): bool {
        unset($GLOBALS['wp_options_store'][$name]);
        return true;
    }
}
