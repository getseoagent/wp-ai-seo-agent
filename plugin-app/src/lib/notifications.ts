import type { Job } from "../hooks/useJobPolling";

/**
 * Plan 4-B: ask the browser for Notification permission once per session,
 * triggered on the first apply_style_to_batch in this tab. Returns existing
 * permission without re-prompting if already granted/denied.
 */
export async function requestNotificationPermissionOnce(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Fire a desktop notification when a bulk job reaches a terminal state.
 * No-op without permission (UI signals — title flash + summary card —
 * are sufficient on their own).
 */
export function notifyJobComplete(job: Job): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const title = "SEO bulk done";
  const body = `${job.done}/${job.total} done${job.failed_count > 0 ? `, ${job.failed_count} failed` : ""}`;
  // Tag dedupes if multiple terminal events somehow reach this code for the same job.
  new Notification(title, { body, tag: `seo-job-${job.id}` });
}
