<?php
declare(strict_types=1);

namespace SeoAgent\Tests\Adapters;

use PHPUnit\Framework\TestCase;
use SeoAgent\Adapters\Adapter_Factory;
use SeoAgent\Adapters\Rank_Math_Adapter;
use SeoAgent\Adapters\Fallback_Adapter;

final class AdapterFactoryTest extends TestCase
{
    public function test_detect_returns_array_with_rank_math_when_class_exists(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => $cls === 'RankMath\\Helper',
            option_exists_fn: static fn(string $opt): bool => false,
        );
        $this->assertSame(['rank-math'], $names);
    }

    public function test_detect_returns_array_with_rank_math_when_option_present(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => false,
            option_exists_fn: static fn(string $opt): bool => $opt === 'rank_math_modules',
        );
        $this->assertSame(['rank-math'], $names);
    }

    public function test_detect_returns_empty_array_when_nothing_matches(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => false,
            option_exists_fn: static fn(string $opt): bool => false,
        );
        $this->assertSame([], $names);
    }

    public function test_make_returns_rank_math_for_rank_math(): void
    {
        $adapter = Adapter_Factory::make('rank-math');
        $this->assertInstanceOf(Rank_Math_Adapter::class, $adapter);
    }

    public function test_make_returns_fallback_for_unknown(): void
    {
        $adapter = Adapter_Factory::make('totally-unknown-plugin');
        $this->assertInstanceOf(Fallback_Adapter::class, $adapter);
    }

    public function test_make_primary_returns_first_known_adapter_from_array(): void
    {
        $adapter = Adapter_Factory::make_primary(['rank-math']);
        $this->assertInstanceOf(Rank_Math_Adapter::class, $adapter);
    }

    public function test_make_primary_returns_fallback_for_empty_array(): void
    {
        $adapter = Adapter_Factory::make_primary([]);
        $this->assertInstanceOf(Fallback_Adapter::class, $adapter);
    }

    public function test_detect_finds_yoast_when_class_exists(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => $cls === 'WPSEO_Options',
            option_exists_fn: static fn(string $opt): bool => false,
        );
        $this->assertSame(['yoast'], $names);
    }

    public function test_detect_finds_yoast_when_option_present(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => false,
            option_exists_fn: static fn(string $opt): bool => $opt === 'wpseo',
        );
        $this->assertSame(['yoast'], $names);
    }

    public function test_detect_priority_rank_math_first_yoast_second(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => in_array($cls, ['RankMath\\Helper', 'WPSEO_Options'], true),
            option_exists_fn: static fn(string $opt): bool => false,
        );
        $this->assertSame(['rank-math', 'yoast'], $names);
    }

    public function test_make_returns_yoast_adapter(): void
    {
        $adapter = Adapter_Factory::make('yoast');
        $this->assertInstanceOf(\SeoAgent\Adapters\Yoast_Adapter::class, $adapter);
    }

    public function test_detect_finds_aioseo_when_class_and_table_present(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => $cls === 'AIOSEO\\Plugin\\AIOSEO',
            option_exists_fn: static fn(string $opt): bool => false,
            constant_defined_fn: static fn(string $name): bool => false,
            table_exists_fn: static fn(string $tbl): bool => $tbl === 'aioseo_posts',
        );
        $this->assertSame(['aioseo'], $names);
    }

    public function test_detect_skips_aioseo_when_table_missing(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => $cls === 'AIOSEO\\Plugin\\AIOSEO',
            option_exists_fn: static fn(string $opt): bool => false,
            constant_defined_fn: static fn(string $name): bool => false,
            table_exists_fn: static fn(string $tbl): bool => false,
        );
        $this->assertSame([], $names);
    }

    public function test_make_returns_aioseo_adapter(): void
    {
        $adapter = Adapter_Factory::make('aioseo');
        $this->assertInstanceOf(\SeoAgent\Adapters\AIOSEO_Adapter::class, $adapter);
    }

    public function test_detect_finds_seopress_when_constant_defined(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => false,
            option_exists_fn: static fn(string $opt): bool => false,
            constant_defined_fn: static fn(string $name): bool => $name === 'SEOPRESS_VERSION',
        );
        $this->assertSame(['seopress'], $names);
    }

    public function test_detect_finds_seopress_when_option_present(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => false,
            option_exists_fn: static fn(string $opt): bool => $opt === 'seopress_titles_option_name',
            constant_defined_fn: static fn(string $name): bool => false,
        );
        $this->assertSame(['seopress'], $names);
    }

    public function test_detect_priority_all_four_present(): void
    {
        $names = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => in_array($cls, [
                'RankMath\\Helper',
                'WPSEO_Options',
                'AIOSEO\\Plugin\\AIOSEO',
            ], true),
            option_exists_fn: static fn(string $opt): bool => false,
            constant_defined_fn: static fn(string $name): bool => $name === 'SEOPRESS_VERSION',
            table_exists_fn: static fn(string $tbl): bool => $tbl === 'aioseo_posts',
        );
        $this->assertSame(['rank-math', 'yoast', 'aioseo', 'seopress'], $names);
    }

    public function test_make_returns_seopress_adapter(): void
    {
        $adapter = Adapter_Factory::make('seopress');
        $this->assertInstanceOf(\SeoAgent\Adapters\SEOPress_Adapter::class, $adapter);
    }
}
