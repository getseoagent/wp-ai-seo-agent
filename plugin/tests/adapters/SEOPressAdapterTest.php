<?php
declare(strict_types=1);

namespace SeoAgent\Tests\Adapters;

use PHPUnit\Framework\TestCase;
use SeoAgent\Adapters\SEOPress_Adapter;

final class SEOPressAdapterTest extends TestCase
{
    public function test_reads_seopress_meta_keys(): void
    {
        $store = [
            42 => [
                '_seopress_titles_title'        => 'Title from SEOPress',
                '_seopress_titles_desc'         => 'Desc from SEOPress',
                '_seopress_analysis_target_kw'  => 'pożyczka 5000',
                '_seopress_social_fb_title'     => 'OG Title from SEOPress',
            ],
        ];
        $reader = static fn(int $id, string $key): ?string => $store[$id][$key] ?? null;
        $social_active = static fn(): bool => true;
        $adapter = new SEOPress_Adapter($reader, null, $social_active);
        $this->assertSame('Title from SEOPress', $adapter->get_seo_title(42));
        $this->assertSame('Desc from SEOPress', $adapter->get_seo_description(42));
        $this->assertSame('pożyczka 5000', $adapter->get_focus_keyword(42));
        $this->assertSame('OG Title from SEOPress', $adapter->get_og_title(42));
    }

    public function test_returns_null_when_meta_missing(): void
    {
        $reader = static fn(int $id, string $key): ?string => null;
        $adapter = new SEOPress_Adapter($reader);
        $this->assertNull($adapter->get_seo_title(42));
        $this->assertNull($adapter->get_seo_description(42));
        $this->assertNull($adapter->get_focus_keyword(42));
        $this->assertNull($adapter->get_og_title(42));
    }

    public function test_name_is_seopress(): void
    {
        $reader = static fn(int $id, string $key): ?string => null;
        $this->assertSame('seopress', (new SEOPress_Adapter($reader))->name());
    }

    public function test_supports_three_core_fields_always(): void
    {
        $adapter = new SEOPress_Adapter(
            static fn(int $id, string $key): ?string => null,
            null,
            static fn(): bool => false,
        );
        $this->assertTrue($adapter->supports('title'));
        $this->assertTrue($adapter->supports('description'));
        $this->assertTrue($adapter->supports('focus_keyword'));
        $this->assertFalse($adapter->supports('canonical'));
    }

    public function test_supports_og_title_only_when_social_module_active(): void
    {
        $adapter_off = new SEOPress_Adapter(
            static fn(int $id, string $key): ?string => null,
            null,
            static fn(): bool => false,
        );
        $this->assertFalse($adapter_off->supports('og_title'));

        $adapter_on = new SEOPress_Adapter(
            static fn(int $id, string $key): ?string => null,
            null,
            static fn(): bool => true,
        );
        $this->assertTrue($adapter_on->supports('og_title'));
    }

    public function test_setters_call_writer_with_seopress_meta_keys(): void
    {
        $writes = [];
        $writer = static function (int $post_id, string $key, string $value) use (&$writes): void {
            $writes[] = compact('post_id', 'key', 'value');
        };
        $adapter = new SEOPress_Adapter(
            reader: static fn(int $id, string $key): ?string => null,
            writer: $writer,
            social_active: static fn(): bool => true,
        );
        $adapter->set_seo_title(42, 'New Title');
        $adapter->set_seo_description(42, 'New Desc');
        $adapter->set_focus_keyword(42, 'kw');
        $adapter->set_og_title(42, 'OG');

        $this->assertCount(4, $writes);
        $this->assertSame(['post_id' => 42, 'key' => '_seopress_titles_title', 'value' => 'New Title'], $writes[0]);
        $this->assertSame('_seopress_titles_desc', $writes[1]['key']);
        $this->assertSame('_seopress_analysis_target_kw', $writes[2]['key']);
        $this->assertSame('_seopress_social_fb_title', $writes[3]['key']);
    }

    public function test_set_og_title_is_noop_when_social_module_off(): void
    {
        $writes = [];
        $writer = static function (int $post_id, string $key, string $value) use (&$writes): void {
            $writes[] = compact('post_id', 'key', 'value');
        };
        $adapter = new SEOPress_Adapter(
            reader: static fn(int $id, string $key): ?string => null,
            writer: $writer,
            social_active: static fn(): bool => false,
        );
        $adapter->set_og_title(42, 'Should not be written');

        $this->assertSame([], $writes, 'set_og_title must no-op when Social module is off (defense-in-depth)');
    }
}
