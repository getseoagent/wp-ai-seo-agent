import type { Job } from "../hooks/useJobPolling";
import { __, sprintf } from "./i18n";

/**
 * Plan 4-B: ask the browser for Notification permission once per session,
 * triggered on the first apply_style_to_batch in this tab. Returns existing
 * permission without re-prompting if already granted/denied.
 */
export async function requestNotificationPermissionOnce(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    // Some legacy browsers (esp. iOS Safari) reject the prompt entirely
    // outside a user gesture. Fall back to "denied" instead of throwing
    // — desktop notifications are best-effort UX, not load-bearing.
    return "denied";
  }
}

/**
 * Fire a desktop notification when a bulk job reaches a terminal state.
 * No-op without permission (UI signals — title flash + summary card —
 * are sufficient on their own).
 */
export function notifyJobComplete(job: Job): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  // Translators: title of the desktop notification fired when a bulk job ends.
  const title = __("SEO bulk done");
  // Translators: %1$d = pages done, %2$d = total pages
  const main = sprintf(__("%1$d/%2$d done"), job.done, job.total);
  // Translators: %d = failed page count
  const failedSuffix = job.failed_count > 0 ? sprintf(__(", %d failed"), job.failed_count) : "";
  try {
    // Tag dedupes if multiple terminal events somehow reach this code for the same job.
    new Notification(title, { body: main + failedSuffix, tag: `seo-job-${job.id}` });
  } catch {
    // Notification instantiation can throw if the user revoked permission
    // between the check above and the new — also if the browser hits a
    // notification-rate-limit (Chrome enforces quiet periods). Swallow:
    // the on-page summary card is the source of truth for job completion.
  }
}
