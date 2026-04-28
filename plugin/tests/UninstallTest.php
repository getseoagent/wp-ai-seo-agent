<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use SeoAgent\License;
use SeoAgent\Options;
use SeoAgent\Settings;

/**
 * Smoke-test uninstall.php on a process where WP_UNINSTALL_PLUGIN is set
 * and a fake $wpdb captures DROP TABLE / delete_option calls.
 *
 * Loading uninstall.php inside the test process would normally explode
 * because it `exit;`s on a missing constant. We satisfy the constant guard
 * by `define(WP_UNINSTALL_PLUGIN)` first, then `require` the file in an
 * isolated process via `runInSeparateProcesses` so the constant set here
 * doesn't leak into other tests.
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
final class UninstallTest extends TestCase
{
    /** @runInSeparateProcess */
    public function test_runs_drops_tables_and_deletes_options(): void
    {
        $GLOBALS['wp_options_store'] = array(
            Options::API_KEY     => 'encrypted-blob-1',
            Options::LICENSE_KEY => 'encrypted-blob-2',
            Options::JWT         => 'encrypted-blob-3',
            Options::JWT_EXP     => 1234567890,
            Options::DB_VERSION  => '1.0.0',
            'unrelated_option'   => 'should-not-be-touched',
        );

        $captured_queries = array();
        $GLOBALS['wpdb'] = new class($captured_queries) {
            public string $prefix = 'wp_';
            /** @var array<int,string> */
            public array $queries;
            public function __construct(array &$captured) { $this->queries = &$captured; }
            public function query(string $sql): bool { $this->queries[] = $sql; return true; }
        };

        if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) define( 'WP_UNINSTALL_PLUGIN', true );

        require dirname(__DIR__) . '/uninstall.php';

        // Tables: both the history + jobs DROP TABLE statements got issued.
        $this->assertCount(2, $captured_queries);
        $this->assertStringContainsString('DROP TABLE IF EXISTS `wp_seoagent_history`', $captured_queries[0]);
        $this->assertStringContainsString('DROP TABLE IF EXISTS `wp_seoagent_jobs`',    $captured_queries[1]);

        // Every plugin-owned option is gone, and the unrelated one is preserved.
        foreach (Options::ALL as $opt) {
            $this->assertArrayNotHasKey($opt, $GLOBALS['wp_options_store'], "Option $opt should have been deleted");
        }
        $this->assertArrayHasKey('unrelated_option', $GLOBALS['wp_options_store']);
    }

    /** @runInSeparateProcess */
    public function test_bails_when_WP_UNINSTALL_PLUGIN_is_undefined(): void
    {
        // Without WP_UNINSTALL_PLUGIN defined uninstall.php must `exit` before
        // touching anything. We run it in an isolated process and assert it
        // exited zero with no fatal.
        $script = dirname(__DIR__) . '/uninstall.php';
        // Provide ABSPATH so the second arm of the guard isn't the one tripping
        $cmd = sprintf(
            '/usr/bin/php8.3 -r %s 2>&1',
            escapeshellarg("define('ABSPATH', '/tmp/'); require " . var_export($script, true) . ";")
        );
        $output = shell_exec($cmd);
        $this->assertSame('', trim((string) $output), 'uninstall.php should exit silently when WP_UNINSTALL_PLUGIN unset');
    }
}
