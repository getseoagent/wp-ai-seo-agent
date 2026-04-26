<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\REST_Controller;

final class RestControllerToolsTest extends TestCase
{
    public function test_detect_seo_plugin_returns_factory_result(): void
    {
        $payload = REST_Controller::handle_detect_seo_plugin();
        $this->assertIsArray($payload);
        $this->assertArrayHasKey('name', $payload);
        $this->assertContains($payload['name'], ['rank-math', 'none']);
    }
}
