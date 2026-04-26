<?php
declare(strict_types=1);

namespace SeoAgent\Tests\Adapters;

use PHPUnit\Framework\TestCase;
use SeoAgent\Adapters\Fallback_Adapter;

final class FallbackAdapterTest extends TestCase
{
    public function test_returns_post_title_for_title(): void
    {
        $adapter = new Fallback_Adapter(static fn(int $id): ?string => $id === 42 ? 'Hello World' : null);
        $this->assertSame('Hello World', $adapter->get_seo_title(42));
    }

    public function test_returns_null_for_missing_post(): void
    {
        $adapter = new Fallback_Adapter(static fn(int $id): ?string => null);
        $this->assertNull($adapter->get_seo_title(999));
    }

    public function test_other_fields_are_null(): void
    {
        $adapter = new Fallback_Adapter(static fn(int $id): ?string => 'X');
        $this->assertNull($adapter->get_seo_description(1));
        $this->assertNull($adapter->get_focus_keyword(1));
        $this->assertNull($adapter->get_og_title(1));
    }

    public function test_name_is_none(): void
    {
        $adapter = new Fallback_Adapter(static fn(int $id): ?string => null);
        $this->assertSame('none', $adapter->name());
    }
}
