<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

require_once dirname(__DIR__) . '/includes/class-settings.php';
require_once dirname(__DIR__) . '/includes/class-backend-client.php';
require_once dirname(__DIR__) . '/includes/class-rest-controller.php';
require_once dirname(__DIR__) . '/includes/class-history-store.php';
require_once dirname(__DIR__) . '/includes/class-jobs-store.php';

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
        $handler = $GLOBALS['_remote_post_handler'] ?? null;
        if (is_callable($handler)) {
            return $handler($url, $args);
        }
        return ['response' => ['code' => 200], 'body' => ''];
    }
}
if (!function_exists('wp_remote_retrieve_response_code')) {
    function wp_remote_retrieve_response_code($response): int {
        return is_array($response) ? (int) ($response['response']['code'] ?? 0) : 0;
    }
}
if (!function_exists('wp_remote_retrieve_body')) {
    function wp_remote_retrieve_body($response): string {
        return is_array($response) ? (string) ($response['body'] ?? '') : '';
    }
}
if (!function_exists('is_wp_error')) {
    function is_wp_error($thing): bool {
        return $thing instanceof \WP_Error;
    }
}
if (!class_exists('WP_Error')) {
    class WP_Error {
        private string $message;
        public function __construct(string $code = '', string $message = '') { $this->message = $message; }
        public function get_error_message(): string { return $this->message; }
    }
}
if (!function_exists('home_url')) {
    function home_url(string $path = ''): string {
        return ($GLOBALS['_seoagent_test_home_url'] ?? 'https://test.example') . $path;
    }
}
if (!function_exists('get_transient')) {
    function get_transient(string $key) {
        $entry = $GLOBALS['_transient_store'][$key] ?? null;
        if (!is_array($entry)) return false;
        if (isset($entry['expires_at']) && $entry['expires_at'] !== 0 && $entry['expires_at'] < time()) {
            unset($GLOBALS['_transient_store'][$key]);
            return false;
        }
        return $entry['value'];
    }
}
if (!function_exists('set_transient')) {
    function set_transient(string $key, $value, int $ttl = 0): bool {
        $GLOBALS['_transient_store'][$key] = [
            'value'      => $value,
            'expires_at' => $ttl > 0 ? time() + $ttl : 0,
        ];
        return true;
    }
}
if (!function_exists('delete_transient')) {
    function delete_transient(string $key): bool {
        unset($GLOBALS['_transient_store'][$key]);
        return true;
    }
}

if (!function_exists('update_post_meta')) {
    function update_post_meta(int $post_id, string $key, $value): bool {
        $GLOBALS['_postmeta_store'][$post_id][$key] = $value;
        return true;
    }
}

if (!function_exists('wp_strip_all_tags')) {
    function wp_strip_all_tags(string $s, bool $remove_breaks = false): string {
        $s = preg_replace('@<(script|style)[^>]*?>.*?</\\1>@si', '', $s) ?? $s;
        $s = strip_tags($s);
        if ($remove_breaks) {
            $s = preg_replace('/[\r\n\t ]+/', ' ', $s) ?? $s;
        }
        return trim($s);
    }
}
if (!function_exists('strip_shortcodes')) {
    function strip_shortcodes(string $s): string {
        return preg_replace('/\[[^\]]*\]/', '', $s) ?? $s;
    }
}

if (!function_exists('sanitize_title')) {
    function sanitize_title(string $s): string { return strtolower(trim(preg_replace('/[^a-z0-9-]+/i', '-', $s) ?? '', '-')); }
}
if (!function_exists('sanitize_key')) {
    function sanitize_key(string $s): string { return strtolower(preg_replace('/[^a-z0-9_\-]/', '', $s) ?? ''); }
}

if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request implements \ArrayAccess {
        public function get_header(string $key): ?string {
            return $GLOBALS['_seoagent_test_headers'][strtolower($key)] ?? null;
        }
        public function get_param(string $key) { return $GLOBALS['_seoagent_test_params'][$key] ?? null; }
        public function get_query_params(): array { return $GLOBALS['_seoagent_test_params'] ?? []; }
        public function get_json_params(): ?array { return $GLOBALS['_seoagent_test_json'] ?? null; }
        public function offsetGet($offset): mixed { return $GLOBALS['_seoagent_test_params'][$offset] ?? null; }
        public function offsetSet($offset, $value): void {}
        public function offsetExists($offset): bool { return isset($GLOBALS['_seoagent_test_params'][$offset]); }
        public function offsetUnset($offset): void {}
    }
}
if (!function_exists('current_user_can')) {
    function current_user_can(string $cap): bool {
        return (bool) ($GLOBALS['_seoagent_test_caps'] ?? false);
    }
}

if (!function_exists('wp_kses_post')) {
    function wp_kses_post(string $s): string { return strip_tags($s, '<strong><em><a><br>'); }
}
if (!function_exists('wp_generate_uuid4')) {
    function wp_generate_uuid4(): string { return 'fixed-test-uuid'; }
}
if (!function_exists('get_current_user_id')) {
    function get_current_user_id(): int { return $GLOBALS['_seoagent_test_user_id'] ?? 0; }
}
if (!function_exists('current_time')) {
    function current_time(string $type, bool $gmt = false): string { return $type === 'mysql' ? '2026-04-26 12:00:00' : (string) time(); }
}
