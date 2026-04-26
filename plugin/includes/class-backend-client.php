<?php
declare(strict_types=1);

namespace SeoAgent;

final class Backend_Client
{
    public static function backend_url(): string
    {
        $configured = defined('SEO_AGENT_BACKEND_URL') ? (string) SEO_AGENT_BACKEND_URL : '';
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        return 'http://localhost:8787';
    }

    public static function shared_secret(): string
    {
        return defined('SEO_AGENT_SHARED_SECRET') ? (string) SEO_AGENT_SHARED_SECRET : '';
    }
}
