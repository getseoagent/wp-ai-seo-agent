<?php
declare(strict_types=1);

namespace SeoAgent\Tests;

use PHPUnit\Framework\TestCase;
use SeoAgent\Backend_Client;

final class BackendClientTest extends TestCase
{
    public function test_builds_post_args_with_shared_secret_header(): void
    {
        $args = Backend_Client::build_request_args(
            'sk-ant-x',
            'hello world',
            'shared-secret-123'
        );

        $this->assertSame('POST', $args['method']);
        $this->assertSame('shared-secret-123', $args['headers']['x-shared-secret']);
        $this->assertSame('application/json', $args['headers']['content-type']);
        $payload = json_decode($args['body'], true);
        $this->assertSame('hello world', $payload['message']);
        $this->assertSame('sk-ant-x', $payload['api_key']);
        $this->assertSame(120, $args['timeout']);
        $this->assertSame(false, $args['blocking']);
    }
}
