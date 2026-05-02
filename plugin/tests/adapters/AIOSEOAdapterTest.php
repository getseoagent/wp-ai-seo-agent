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
}
