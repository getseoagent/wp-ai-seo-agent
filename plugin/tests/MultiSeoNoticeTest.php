<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\Multi_Seo_Notice;

final class MultiSeoNoticeTest extends TestCase
{
    public function test_render_returns_empty_when_only_one_plugin_active(): void
    {
        $html = Multi_Seo_Notice::render(['rank-math']);
        $this->assertSame('', $html);
    }

    public function test_render_returns_empty_when_no_plugins_active(): void
    {
        $html = Multi_Seo_Notice::render([]);
        $this->assertSame('', $html);
    }

    public function test_render_for_two_plugins_names_both_and_marks_primary(): void
    {
        $html = Multi_Seo_Notice::render(['rank-math', 'yoast']);
        $this->assertStringContainsString('Rank Math', $html);
        $this->assertStringContainsString('Yoast', $html);
        $this->assertStringContainsString('writing through', $html);
        $this->assertStringContainsString('notice-warning', $html);
        $this->assertStringContainsString('is-dismissible', $html);
    }

    public function test_render_for_three_or_more_uses_plural_form(): void
    {
        $html = Multi_Seo_Notice::render(['rank-math', 'yoast', 'aioseo']);
        $this->assertStringContainsString('Rank Math', $html);
        $this->assertStringContainsString('Yoast', $html);
        $this->assertStringContainsString('AIOSEO', $html);
        $this->assertStringContainsString('plus', $html);
    }

    public function test_label_for_known_slugs(): void
    {
        $this->assertSame('Rank Math', Multi_Seo_Notice::label('rank-math'));
        $this->assertSame('Yoast', Multi_Seo_Notice::label('yoast'));
        $this->assertSame('AIOSEO', Multi_Seo_Notice::label('aioseo'));
        $this->assertSame('SEOPress', Multi_Seo_Notice::label('seopress'));
        $this->assertSame('unknown-plugin', Multi_Seo_Notice::label('unknown-plugin'));
    }
}
