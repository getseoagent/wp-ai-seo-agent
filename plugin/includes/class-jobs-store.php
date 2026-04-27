<?php
declare(strict_types=1);

namespace SeoAgent;

final class Jobs_Store
{
    public function __construct(private readonly object $db) {}

    private function table(): string
    {
        return $this->db->prefix . 'seoagent_jobs';
    }

    /**
     * @param array{id: string, user_id?: int, tool_name: string, total: int, style_hints?: ?string, params_json?: ?string} $args
     */
    public function create(array $args): object
    {
        $row = [
            'id' => $args['id'],
            'user_id' => (int) ($args['user_id'] ?? 0),
            'tool_name' => $args['tool_name'],
            'status' => 'running',
            'total' => (int) $args['total'],
            'done' => 0,
            'failed_count' => 0,
            'style_hints' => $args['style_hints'] ?? null,
            'params_json' => $args['params_json'] ?? null,
            'started_at' => current_time('mysql', true),
            'finished_at' => null,
            'cancel_requested_at' => null,
            'last_progress_at' => null,
        ];
        $this->db->insert($this->table(), $row);
        return (object) $row;
    }

    public function get(string $id): ?object
    {
        $sql = $this->db->prepare("SELECT * FROM {$this->table()} WHERE id = %s", $id);
        $row = $this->db->get_row($sql);
        return is_object($row) ? $row : null;
    }

    public function update_progress(string $id, int $done, int $failed_count, ?int $current_post_id = null, ?string $current_post_title = null): void
    {
        $data = [
            'done' => $done,
            'failed_count' => $failed_count,
            'last_progress_at' => current_time('mysql', true),
        ];
        // current_post_* only persisted when the caller has a post in flight.
        // Keep last-known values when null (avoid blanking between worker swaps).
        if ($current_post_id !== null) {
            $data['current_post_id'] = $current_post_id;
        }
        if ($current_post_title !== null) {
            $data['current_post_title'] = $current_post_title;
        }
        $this->db->update($this->table(), $data, ['id' => $id]);
    }

    public function mark_done(string $id, string $status): void
    {
        $this->db->update(
            $this->table(),
            ['status' => $status, 'finished_at' => current_time('mysql', true)],
            ['id' => $id]
        );
    }

    public function request_cancel(string $id): void
    {
        $this->db->update(
            $this->table(),
            ['cancel_requested_at' => current_time('mysql', true)],
            ['id' => $id]
        );
    }

    public function find_running_for_user(int $user_id): ?object
    {
        $sql = $this->db->prepare(
            "SELECT * FROM {$this->table()} WHERE user_id = %d AND status = 'running' ORDER BY started_at DESC LIMIT 1",
            $user_id
        );
        $row = $this->db->get_row($sql);
        return is_object($row) ? $row : null;
    }

    /**
     * Mark any 'running' job whose last_progress_at is older than $minutes
     * (or whose started_at is older if last_progress_at is null) as
     * 'interrupted'. Returns affected row count.
     *
     * Called once on backend startup so jobs left running by a dead backend
     * process don't perpetually show as 'running' to polling consumers.
     */
    public function sweep_interrupted(int $minutes): int
    {
        $minutes = max(1, $minutes);
        $sql = "UPDATE {$this->table()}
                SET status = 'interrupted', finished_at = NOW()
                WHERE status = 'running'
                  AND COALESCE(last_progress_at, started_at) < NOW() - INTERVAL {$minutes} MINUTE";
        $affected = $this->db->query($sql);
        return is_int($affected) ? $affected : 0;
    }

    /**
     * List jobs filtered by status / since / limit. Powers the recent-jobs banner
     * and any "what jobs ran lately" UI.
     *
     * @param array{status?: string, since?: string, limit?: int} $filters
     * @return array<int, object>
     */
    public function list_jobs(array $filters): array
    {
        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'status = %s';
            $params[] = $filters['status'];
        }
        if (!empty($filters['since'])) {
            // Match on finished_at when present; for jobs still running the column
            // is NULL — fall back to last_progress_at so a recently-touched runner
            // also shows up if the caller wants that.
            $where[] = '(finished_at >= %s OR (finished_at IS NULL AND last_progress_at >= %s))';
            $params[] = $filters['since'];
            $params[] = $filters['since'];
        }

        $limit = max(1, min(50, (int) ($filters['limit'] ?? 10)));

        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $sql = "SELECT * FROM {$this->table()} {$whereSql} ORDER BY started_at DESC LIMIT {$limit}";

        $prepared = empty($params) ? $sql : $this->db->prepare($sql, ...$params);
        $rows = $this->db->get_results($prepared);
        return is_array($rows) ? $rows : [];
    }
}
