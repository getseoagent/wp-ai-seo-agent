<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

final class Fallback_Adapter implements Seo_Fields_Adapter
{
    /** @var \Closure(int): ?string */
    private \Closure $title_reader;

    /** @param \Closure(int): ?string $title_reader */
    public function __construct(?\Closure $title_reader = null)
    {
        $this->title_reader = $title_reader ?? static fn(int $id): ?string => self::wp_post_title($id);
    }

    public function get_seo_title(int $post_id): ?string
    {
        return ($this->title_reader)($post_id);
    }

    public function get_seo_description(int $post_id): ?string { return null; }
    public function get_focus_keyword(int $post_id): ?string  { return null; }
    public function get_og_title(int $post_id): ?string       { return null; }

    public function name(): string { return 'none'; }

    private static function wp_post_title(int $post_id): ?string
    {
        $post = get_post($post_id);
        return $post ? (string) $post->post_title : null;
    }

    public function set_seo_title(int $post_id, string $value): void {}
    public function set_seo_description(int $post_id, string $value): void {}
    public function set_focus_keyword(int $post_id, string $value): void {}
    public function set_og_title(int $post_id, string $value): void {}

    public function supports(string $field): bool { return false; }
}
