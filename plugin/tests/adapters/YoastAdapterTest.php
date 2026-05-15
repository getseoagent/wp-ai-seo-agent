<?php
declare(strict_types=1);

namespace SeoAgent\Tests\Adapters;

use PHPUnit\Framework\TestCase;
use SeoAgent\Adapters\Yoast_Adapter;

final class YoastAdapterTest extends TestCase
{
    public function test_reads_yoast_meta_keys(): void
    {
        $store = [
            42 => [
                '_yoast_wpseo_title'             => 'Title from Yoast',
                '_yoast_wpseo_metadesc'          => 'Desc from Yoast',
                '_yoast_wpseo_focuskw'           => 'pożyczka 5000',
                '_yoast_wpseo_opengraph-title'   => 'OG Title from Yoast',
            ],
        ];
        $reader = static fn(int $id, string $key): ?string => $store[$id][$key] ?? null;

        $adapter = new Yoast_Adapter($reader);
        $this->assertSame('Title from Yoast', $adapter->get_seo_title(42));
        $this->assertSame('Desc from Yoast', $adapter->get_seo_description(42));
        $this->assertSame('pożyczka 5000', $adapter->get_focus_keyword(42));
        $this->assertSame('OG Title from Yoast', $adapter->get_og_title(42));
    }

    public function test_returns_null_when_meta_missing(): void
    {
        $reader = static fn(int $id, string $key): ?string => null;
        $adapter = new Yoast_Adapter($reader);
        $this->assertNull($adapter->get_seo_title(42));
        $this->assertNull($adapter->get_seo_description(42));
        $this->assertNull($adapter->get_focus_keyword(42));
        $this->assertNull($adapter->get_og_title(42));
    }

    public function test_treats_empty_string_as_null(): void
    {
        $reader = static fn(int $id, string $key): ?string => '';
        $adapter = new Yoast_Adapter($reader);
        $this->assertNull($adapter->get_seo_title(42));
    }

    public function test_name_is_yoast(): void
    {
        $reader = static fn(int $id, string $key): ?string => null;
        $this->assertSame('yoast', (new Yoast_Adapter($reader))->name());
    }

    public function test_supports_returns_true_for_known_fields(): void
    {
        $adapter = new Yoast_Adapter(static fn(int $id, string $key): ?string => null);
        $this->assertTrue($adapter->supports('title'));
        $this->assertTrue($adapter->supports('description'));
        $this->assertTrue($adapter->supports('focus_keyword'));
        $this->assertTrue($adapter->supports('og_title'));
        $this->assertFalse($adapter->supports('canonical'));
    }

    public function test_setters_call_writer_with_yoast_meta_keys(): void
    {
        $writes = [];
        $writer = static function (int $post_id, string $key, string $value) use (&$writes): void {
            $writes[] = compact('post_id', 'key', 'value');
        };
        $adapter = new Yoast_Adapter(
            reader: static fn(int $id, string $key): ?string => null,
            writer: $writer,
        );
        $adapter->set_seo_title(42, 'New Title');
        $adapter->set_seo_description(42, 'New Desc');
        $adapter->set_focus_keyword(42, 'kw');
        $adapter->set_og_title(42, 'OG');

        $this->assertCount(4, $writes);
        $this->assertSame(['post_id' => 42, 'key' => '_yoast_wpseo_title', 'value' => 'New Title'], $writes[0]);
        $this->assertSame('_yoast_wpseo_metadesc', $writes[1]['key']);
        $this->assertSame('_yoast_wpseo_focuskw', $writes[2]['key']);
        $this->assertSame('_yoast_wpseo_opengraph-title', $writes[3]['key']);
    }
}
