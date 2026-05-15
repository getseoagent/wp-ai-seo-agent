<?php
declare(strict_types=1);

namespace SeoAgent\Tests\Adapters;

use PHPUnit\Framework\TestCase;
use SeoAgent\Adapters\AIOSEO_Adapter;

final class AIOSEOAdapterTest extends TestCase
{
    public function test_reads_columns(): void
    {
        $store = [
            42 => [
                'title'       => 'Title from AIOSEO',
                'description' => 'Desc from AIOSEO',
                'og_title'    => 'OG Title from AIOSEO',
                'keyphrases'  => '{"focus":{"keyphrase":"pożyczka 5000"},"additional":[]}',
            ],
        ];
        $reader = static fn(int $id, string $col): ?string => $store[$id][$col] ?? null;
        $adapter = new AIOSEO_Adapter($reader);
        $this->assertSame('Title from AIOSEO', $adapter->get_seo_title(42));
        $this->assertSame('Desc from AIOSEO', $adapter->get_seo_description(42));
        $this->assertSame('OG Title from AIOSEO', $adapter->get_og_title(42));
        $this->assertSame('pożyczka 5000', $adapter->get_focus_keyword(42));
    }

    public function test_returns_null_when_row_missing(): void
    {
        $reader = static fn(int $id, string $col): ?string => null;
        $adapter = new AIOSEO_Adapter($reader);
        $this->assertNull($adapter->get_seo_title(42));
        $this->assertNull($adapter->get_seo_description(42));
        $this->assertNull($adapter->get_og_title(42));
        $this->assertNull($adapter->get_focus_keyword(42));
    }

    public function test_focus_keyword_returns_null_for_invalid_keyphrases_json(): void
    {
        $cases = ['', 'not json', '{"focus":{}}', '{"focus":{"keyphrase":""}}', 'null'];
        foreach ($cases as $bad) {
            $reader = static fn(int $id, string $col): ?string => $col === 'keyphrases' ? $bad : null;
            $adapter = new AIOSEO_Adapter($reader);
            $this->assertNull($adapter->get_focus_keyword(42), "expected null for input: {$bad}");
        }
    }

    public function test_name_is_aioseo(): void
    {
        $reader = static fn(int $id, string $col): ?string => null;
        $this->assertSame('aioseo', (new AIOSEO_Adapter($reader))->name());
    }

    public function test_supports_returns_true_for_known_fields(): void
    {
        $adapter = new AIOSEO_Adapter(static fn(int $id, string $col): ?string => null);
        $this->assertTrue($adapter->supports('title'));
        $this->assertTrue($adapter->supports('description'));
        $this->assertTrue($adapter->supports('focus_keyword'));
        $this->assertTrue($adapter->supports('og_title'));
        $this->assertFalse($adapter->supports('canonical'));
    }

    public function test_setters_write_via_writer_closure(): void
    {
        $writes = [];
        $writer = static function (int $post_id, array $columns) use (&$writes): void {
            $writes[] = compact('post_id', 'columns');
        };
        $adapter = new AIOSEO_Adapter(
            reader: static fn(int $id, string $col): ?string => null,
            writer: $writer,
        );
        $adapter->set_seo_title(42, 'New Title');
        $adapter->set_seo_description(42, 'New Desc');
        $adapter->set_og_title(42, 'OG');

        $this->assertCount(3, $writes);
        $this->assertSame(['post_id' => 42, 'columns' => ['title' => 'New Title']], $writes[0]);
        $this->assertSame(['description' => 'New Desc'], $writes[1]['columns']);
        $this->assertSame(['og_title' => 'OG'], $writes[2]['columns']);
    }

    public function test_set_focus_keyword_preserves_sibling_keyphrases(): void
    {
        // Pre-existing keyphrases JSON with additional entries (premium AIOSEO scenario)
        $existing = '{"focus":{"keyphrase":"old kw","score":75},"additional":[{"keyphrase":"alt"}]}';
        $reader = static fn(int $id, string $col): ?string => $col === 'keyphrases' ? $existing : null;
        $writes = [];
        $writer = static function (int $post_id, array $columns) use (&$writes): void {
            $writes[] = compact('post_id', 'columns');
        };
        $adapter = new AIOSEO_Adapter(reader: $reader, writer: $writer);
        $adapter->set_focus_keyword(42, 'new kw');

        $this->assertCount(1, $writes);
        $written_json = $writes[0]['columns']['keyphrases'];
        $decoded = json_decode($written_json, true);
        $this->assertSame('new kw', $decoded['focus']['keyphrase']);
        $this->assertSame([['keyphrase' => 'alt']], $decoded['additional'], 'additional must survive');
        $this->assertSame(75, $decoded['focus']['score'], 'sibling focus.score must survive');
    }

    public function test_set_focus_keyword_creates_keyphrases_json_when_missing(): void
    {
        $reader = static fn(int $id, string $col): ?string => null; // no row yet
        $writes = [];
        $writer = static function (int $post_id, array $columns) use (&$writes): void {
            $writes[] = compact('post_id', 'columns');
        };
        $adapter = new AIOSEO_Adapter(reader: $reader, writer: $writer);
        $adapter->set_focus_keyword(42, 'fresh kw');

        $this->assertCount(1, $writes);
        $decoded = json_decode($writes[0]['columns']['keyphrases'], true);
        $this->assertSame('fresh kw', $decoded['focus']['keyphrase']);
        $this->assertSame([], $decoded['additional']);
    }

    public function test_default_writer_inserts_with_created_and_updated_when_row_missing(): void
    {
        $captured = [];
        $fake_wpdb = new class ($captured) {
            public string $prefix = 'wp_';
            public ?array $captured;
            public function __construct(array &$captured) { $this->captured = &$captured; }
            public function get_var($_q) { return null; } // no existing row
            public function prepare($q, ...$args): string { return $q; }
            public function insert(string $table, array $data) {
                $this->captured[] = ['op' => 'insert', 'table' => $table, 'data' => $data];
                return 1;
            }
            public function update(string $table, array $data, array $where) {
                $this->captured[] = ['op' => 'update', 'table' => $table, 'data' => $data, 'where' => $where];
                return 1;
            }
        };
        $GLOBALS['wpdb'] = $fake_wpdb;

        $adapter = new AIOSEO_Adapter(); // no closures — defaults run
        $adapter->set_seo_title(42, 'New Title');

        unset($GLOBALS['wpdb']);

        $this->assertCount(1, $captured);
        $this->assertSame('insert', $captured[0]['op']);
        $this->assertSame('wp_aioseo_posts', $captured[0]['table']);
        $this->assertSame('New Title', $captured[0]['data']['title']);
        $this->assertSame(42, $captured[0]['data']['post_id']);
        $this->assertArrayHasKey('created', $captured[0]['data'], 'INSERT must include created (NOT NULL no DEFAULT)');
        $this->assertArrayHasKey('updated', $captured[0]['data'], 'INSERT must include updated (NOT NULL no DEFAULT)');
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $captured[0]['data']['created']);
    }

    public function test_default_writer_updates_existing_row_by_id_with_updated_bumped(): void
    {
        $captured = [];
        $fake_wpdb = new class ($captured) {
            public string $prefix = 'wp_';
            public ?array $captured;
            public function __construct(array &$captured) { $this->captured = &$captured; }
            public function get_var($_q) { return '7'; } // existing row id
            public function prepare($q, ...$args): string { return $q; }
            public function insert(string $table, array $data) {
                $this->captured[] = ['op' => 'insert', 'table' => $table, 'data' => $data];
                return 1;
            }
            public function update(string $table, array $data, array $where) {
                $this->captured[] = ['op' => 'update', 'table' => $table, 'data' => $data, 'where' => $where];
                return 1;
            }
        };
        $GLOBALS['wpdb'] = $fake_wpdb;

        $adapter = new AIOSEO_Adapter();
        $adapter->set_seo_description(42, 'Updated Desc');

        unset($GLOBALS['wpdb']);

        $this->assertCount(1, $captured);
        $this->assertSame('update', $captured[0]['op']);
        $this->assertSame(['id' => 7], $captured[0]['where']);
        $this->assertSame('Updated Desc', $captured[0]['data']['description']);
        $this->assertArrayHasKey('updated', $captured[0]['data'], 'UPDATE must bump updated timestamp');
        $this->assertArrayNotHasKey('created', $captured[0]['data'], 'UPDATE must NOT touch created');
        $this->assertArrayNotHasKey('post_id', $captured[0]['data'], 'UPDATE must not redundantly set post_id');
    }
}
