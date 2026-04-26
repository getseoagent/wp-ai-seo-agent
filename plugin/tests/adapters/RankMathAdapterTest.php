<?php
declare(strict_types=1);

namespace SeoAgent\Tests\Adapters;

use PHPUnit\Framework\TestCase;
use SeoAgent\Adapters\Rank_Math_Adapter;

final class RankMathAdapterTest extends TestCase
{
    public function test_reads_meta_keys(): void
    {
        $store = [
            42 => [
                'rank_math_title'         => 'Title from RM',
                'rank_math_description'   => 'Desc from RM',
                'rank_math_focus_keyword' => 'pożyczka 5000',
                'rank_math_facebook_title' => 'OG Title from RM',
            ],
        ];
        $reader = static function (int $post_id, string $key) use ($store): ?string {
            return $store[$post_id][$key] ?? null;
        };

        $adapter = new Rank_Math_Adapter($reader);
        $this->assertSame('Title from RM', $adapter->get_seo_title(42));
        $this->assertSame('Desc from RM', $adapter->get_seo_description(42));
        $this->assertSame('pożyczka 5000', $adapter->get_focus_keyword(42));
        $this->assertSame('OG Title from RM', $adapter->get_og_title(42));
    }

    public function test_returns_null_when_meta_missing(): void
    {
        $reader = static fn(int $id, string $key): ?string => null;
        $adapter = new Rank_Math_Adapter($reader);
        $this->assertNull($adapter->get_seo_title(42));
        $this->assertNull($adapter->get_seo_description(42));
        $this->assertNull($adapter->get_focus_keyword(42));
        $this->assertNull($adapter->get_og_title(42));
    }

    public function test_treats_empty_string_as_null(): void
    {
        $reader = static fn(int $id, string $key): ?string => '';
        $adapter = new Rank_Math_Adapter($reader);
        $this->assertNull($adapter->get_seo_title(42));
    }

    public function test_name_is_rank_math(): void
    {
        $reader = static fn(int $id, string $key): ?string => null;
        $this->assertSame('rank-math', (new Rank_Math_Adapter($reader))->name());
    }
}
