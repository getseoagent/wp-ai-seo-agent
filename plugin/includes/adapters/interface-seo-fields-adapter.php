<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

interface Seo_Fields_Adapter
{
    public function get_seo_title(int $post_id): ?string;
    public function get_seo_description(int $post_id): ?string;
    public function get_focus_keyword(int $post_id): ?string;
    public function get_og_title(int $post_id): ?string;
    public function name(): string;

    public function set_seo_title(int $post_id, string $value): void;
    public function set_seo_description(int $post_id, string $value): void;
    public function set_focus_keyword(int $post_id, string $value): void;
    public function set_og_title(int $post_id, string $value): void;
    public function supports(string $field): bool;
}
