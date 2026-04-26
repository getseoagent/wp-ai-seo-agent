<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

require_once dirname(__DIR__) . '/includes/class-settings.php';
require_once dirname(__DIR__) . '/includes/class-backend-client.php';
require_once dirname(__DIR__) . '/includes/class-rest-controller.php';
require_once dirname(__DIR__) . '/includes/class-history-store.php';

foreach (glob(dirname(__DIR__) . '/includes/adapters/interface-*.php') as $adapter_file) {
    require_once $adapter_file;
}
foreach (glob(dirname(__DIR__) . '/includes/adapters/class-*.php') as $adapter_file) {
    require_once $adapter_file;
}

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

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, int $options = 0, int $depth = 512): string|false {
        return json_encode($data, $options, $depth);
    }
}

if (!function_exists('wp_remote_post')) {
    function wp_remote_post(string $url, array $args) {
        $GLOBALS['_last_remote_post'] = ['url' => $url, 'args' => $args];
        return ['response' => ['code' => 200], 'body' => ''];
    }
}

if (!function_exists('update_post_meta')) {
    function update_post_meta(int $post_id, string $key, $value): bool {
        $GLOBALS['_postmeta_store'][$post_id][$key] = $value;
        return true;
    }
}

if (!function_exists('wp_strip_all_tags')) {
    function wp_strip_all_tags(string $s): string { return strip_tags($s); }
}

if (!function_exists('sanitize_title')) {
    function sanitize_title(string $s): string { return strtolower(trim(preg_replace('/[^a-z0-9-]+/i', '-', $s) ?? '', '-')); }
}
