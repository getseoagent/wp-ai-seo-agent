<?php
declare(strict_types=1);

namespace SeoAgent\Adapters;

final class Rank_Math_Adapter implements Seo_Fields_Adapter
{
    private const META_TITLE       = 'rank_math_title';
    private const META_DESCRIPTION = 'rank_math_description';
    private const META_FOCUS_KW    = 'rank_math_focus_keyword';
    private const META_OG_TITLE    = 'rank_math_facebook_title';

    /** @var \Closure(int, string): ?string */
    private \Closure $reader;

    /** @param \Closure(int, string): ?string $reader */
    public function __construct(?\Closure $reader = null)
    {
        $this->reader = $reader ?? static function (int $post_id, string $key): ?string {
            $value = get_post_meta($post_id, $key, true);
            return is_string($value) ? $value : null;
        };
    }

    public function get_seo_title(int $post_id): ?string
    {
        return $this->non_empty(($this->reader)($post_id, self::META_TITLE));
    }

    public function get_seo_description(int $post_id): ?string
    {
        return $this->non_empty(($this->reader)($post_id, self::META_DESCRIPTION));
    }

    public function get_focus_keyword(int $post_id): ?string
    {
        return $this->non_empty(($this->reader)($post_id, self::META_FOCUS_KW));
    }

    public function get_og_title(int $post_id): ?string
    {
        return $this->non_empty(($this->reader)($post_id, self::META_OG_TITLE));
    }

    public function name(): string { return 'rank-math'; }

    private function non_empty(?string $value): ?string
    {
        if ($value === null || $value === '') return null;
        return $value;
    }

    public function set_seo_title(int $post_id, string $value): void { /* Task 4 */ }
    public function set_seo_description(int $post_id, string $value): void { /* Task 4 */ }
    public function set_focus_keyword(int $post_id, string $value): void { /* Task 4 */ }
    public function set_og_title(int $post_id, string $value): void { /* Task 4 */ }

    public function supports(string $field): bool { return false; /* Task 4 */ }
}
