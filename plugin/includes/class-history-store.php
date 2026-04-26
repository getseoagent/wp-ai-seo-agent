<?php
declare(strict_types=1);

namespace SeoAgent;

final class History_Store
{
    public function __construct(private readonly object $db) {}

    /**
     * @param array<string, mixed> $row
     * @return int rows affected (1 on success, 0 on failure) — NOT insert id;
     *             use $wpdb->insert_id directly if a caller needs the new row id
     */
    public function insert(array $row): int
    {
        $table = $this->db->prefix . 'seoagent_history';
        return (int) $this->db->insert($table, $row);
    }

    /** @return list<object> */
    public function find_by_post(int $post_id, int $limit, int $cursor): array
    {
        $table = $this->db->prefix . 'seoagent_history';
        $sql = $this->db->prepare(
            "SELECT * FROM {$table} WHERE post_id = %d ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $post_id, $limit, $cursor
        );
        return (array) $this->db->get_results($sql);
    }

    /** @return list<object> */
    public function find_by_job(string $job_id, int $limit, int $cursor): array
    {
        $table = $this->db->prefix . 'seoagent_history';
        $sql = $this->db->prepare(
            "SELECT * FROM {$table} WHERE job_id = %s ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $job_id, $limit, $cursor
        );
        return (array) $this->db->get_results($sql);
    }

    public function get(int $id): ?object
    {
        $table = $this->db->prefix . 'seoagent_history';
        $sql = $this->db->prepare("SELECT * FROM {$table} WHERE id = %d", $id);
        $row = $this->db->get_row($sql);
        return is_object($row) ? $row : null;
    }

    public function mark_rolled_back(int $id, string $at): void
    {
        $table = $this->db->prefix . 'seoagent_history';
        $this->db->update($table, ['rolled_back_at' => $at], ['id' => $id]);
    }
}
