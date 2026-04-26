<?php
declare(strict_types=1);

namespace SeoAgent\Tests\Adapters;

use PHPUnit\Framework\TestCase;
use SeoAgent\Adapters\Adapter_Factory;
use SeoAgent\Adapters\Rank_Math_Adapter;
use SeoAgent\Adapters\Fallback_Adapter;

final class AdapterFactoryTest extends TestCase
{
    public function test_detect_returns_rank_math_when_class_exists(): void
    {
        $name = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => $cls === 'RankMath\\Helper',
            option_exists_fn: static fn(string $opt): bool => false,
        );
        $this->assertSame('rank-math', $name);
    }

    public function test_detect_returns_rank_math_when_option_present(): void
    {
        $name = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => false,
            option_exists_fn: static fn(string $opt): bool => $opt === 'rank_math_modules',
        );
        $this->assertSame('rank-math', $name);
    }

    public function test_detect_returns_none_when_nothing_matches(): void
    {
        $name = Adapter_Factory::detect(
            class_exists_fn: static fn(string $cls): bool => false,
            option_exists_fn: static fn(string $opt): bool => false,
        );
        $this->assertSame('none', $name);
    }

    public function test_make_returns_rank_math_for_rank_math(): void
    {
        $adapter = Adapter_Factory::make('rank-math');
        $this->assertInstanceOf(Rank_Math_Adapter::class, $adapter);
    }

    public function test_make_returns_fallback_for_none(): void
    {
        $adapter = Adapter_Factory::make('none');
        $this->assertInstanceOf(Fallback_Adapter::class, $adapter);
    }

    public function test_make_returns_fallback_for_unknown(): void
    {
        $adapter = Adapter_Factory::make('yoast');
        $this->assertInstanceOf(Fallback_Adapter::class, $adapter);
    }
}
