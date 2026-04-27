import { describe, it, expect, beforeEach, vi } from "vitest";
import { requestNotificationPermissionOnce, notifyJobComplete } from "./notifications";
import type { Job } from "../hooks/useJobPolling";

const job = (over: Partial<Job> = {}): Job => ({
  id: "j", tool_name: "apply_style_to_batch", status: "completed",
  total: 10, done: 10, failed_count: 0, style_hints: null,
  started_at: "x", finished_at: "y", cancel_requested_at: null,
  last_progress_at: null, current_post_id: null, current_post_title: null,
  ...over,
});

describe("notifications.ts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Notification;
  });

  it("requestNotificationPermissionOnce returns 'denied' when Notification API missing", async () => {
    const r = await requestNotificationPermissionOnce();
    expect(r).toBe("denied");
  });

  it("returns existing 'granted' without re-prompting", async () => {
    const requestPermission = vi.fn();
    (globalThis as any).Notification = function () {} as any;
    (globalThis as any).Notification.permission = "granted";
    (globalThis as any).Notification.requestPermission = requestPermission;
    const r = await requestNotificationPermissionOnce();
    expect(r).toBe("granted");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("returns existing 'denied' without re-prompting", async () => {
    const requestPermission = vi.fn();
    (globalThis as any).Notification = function () {} as any;
    (globalThis as any).Notification.permission = "denied";
    (globalThis as any).Notification.requestPermission = requestPermission;
    const r = await requestNotificationPermissionOnce();
    expect(r).toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("calls requestPermission when permission is 'default'", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    (globalThis as any).Notification = function () {} as any;
    (globalThis as any).Notification.permission = "default";
    (globalThis as any).Notification.requestPermission = requestPermission;
    const r = await requestNotificationPermissionOnce();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(r).toBe("granted");
  });

  it("notifyJobComplete is no-op without granted permission", () => {
    const ctor = vi.fn();
    (globalThis as any).Notification = ctor;
    (globalThis as any).Notification.permission = "denied";
    notifyJobComplete(job());
    expect(ctor).not.toHaveBeenCalled();
  });

  it("notifyJobComplete fires Notification when granted", () => {
    const ctor = vi.fn();
    (globalThis as any).Notification = ctor;
    (globalThis as any).Notification.permission = "granted";
    notifyJobComplete(job({ id: "j-1", done: 5, total: 6, failed_count: 1 }));
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0][0]).toMatch(/SEO bulk done/i);
    expect(ctor.mock.calls[0][1].body).toMatch(/5\/6/);
    expect(ctor.mock.calls[0][1].body).toMatch(/1 failed/);
  });
});
