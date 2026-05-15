import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MessageList, type ChatItem } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useSseChat } from "../hooks/useSseChat";
import { useJobPolling, type Job } from "../hooks/useJobPolling";
import { useDocumentTitleForJob } from "../hooks/useDocumentTitleForJob";
import { useRecentJobsBanner } from "../hooks/useRecentJobsBanner";
import { BulkProgressBar } from "./BulkProgressBar";
import { BulkSummaryCard } from "./BulkSummaryCard";
import { RecentJobsBanner } from "./RecentJobsBanner";
import { MultiActiveBanner } from "./MultiActiveBanner";
import { __ } from "../lib/i18n";
import { requestNotificationPermissionOnce, notifyJobComplete } from "../lib/notifications";
import { BULK_COLORS } from "./bulk-styles";

type SiteInfo = {
  name: string;
  multi_active: string[];
};

const typingIndicatorStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "6px 10px", marginTop: 4,
  fontSize: 12, color: BULK_COLORS.mutedFg,
};
const dotsStyle: React.CSSProperties = {
  fontSize: 16, letterSpacing: 2, color: BULK_COLORS.mutedFg,
};
const typingTextStyle: React.CSSProperties = {
  fontStyle: "italic",
};
const stopButtonStyle: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 12, padding: "3px 10px",
  border: `1px solid ${BULK_COLORS.destructiveRed}`,
  color: BULK_COLORS.destructiveRed,
  background: "#fff", borderRadius: 4, cursor: "pointer",
};

export function Chat({ restUrl, nonce }: { restUrl: string; nonce: string }) {
  const sessionId = useMemo(
    () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    []
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  // The active bulk job currently driving the on-screen progress bar / summary.
  // Set when apply_style_to_batch tool result arrives with status:"running".
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Detect active SEO plugins so we can warn about multi-plugin conflicts.
  const [multiActive, setMultiActive] = useState<string[]>([]);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`${restUrl}/detect-seo-plugin`, {
      headers: { "X-WP-Nonce": nonce },
      credentials: "same-origin",
      signal: ac.signal,
    })
      .then<SiteInfo>(r => r.json())
      .then(data => {
        // Defensive: older plugin code returns {name} without multi_active.
        setMultiActive(data.multi_active ?? []);
      })
      .catch(err => {
        // Non-fatal: banner stays hidden if the fetch fails.
        if ((err as Error).name !== "AbortError") {
          // (no-op)
        }
      });
    return () => ac.abort();
  }, [restUrl, nonce]);

  const pollState = useJobPolling(activeJobId, restUrl);
  useDocumentTitleForJob(pollState);

  // Recent-jobs banner: surfaces a job that completed while user was away.
  // Clicking [View summary] mounts a BulkSummaryCard for that "recovered" job.
  const recent = useRecentJobsBanner(restUrl);
  const [recoveredJob, setRecoveredJob] = useState<Job | null>(null);

  // Track which terminal job we've already notified for so re-renders don't
  // re-fire the same Notification.
  const notifiedJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (pollState.status !== "terminal") return;
    if (notifiedJobIdRef.current === pollState.job.id) return;
    notifiedJobIdRef.current = pollState.job.id;
    // Only ping when the user isn't already looking at the page; if the tab
    // is visible the BulkSummaryCard is in their face already.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      notifyJobComplete(pollState.job);
    }
  }, [pollState]);

  const appendAssistantDelta = (delta: string) =>
    setItems(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.kind !== "message" || last.message.role !== "assistant") {
        return [...prev, { kind: "message", message: { role: "assistant", text: delta } }];
      }
      return [
        ...prev.slice(0, -1),
        { kind: "message", message: { role: "assistant", text: last.message.text + delta } },
      ];
    });

  // Memoize so useSseChat's deps array doesn't churn every render.
  const handleBulkProgress = useCallback((jobId: string, patch: { done: number; total: number; failed_count: number; current_post_id: number | null; current_post_title: string | null }) => {
    if (jobId !== activeJobId) return;
    if (pollState.status === "running") {
      pollState.applyOptimistic(patch);
    }
  }, [activeJobId, pollState]);

  const { send, cancel, busy } = useSseChat({
    endpoint: `${restUrl}/chat`,
    nonce,
    sessionId,
    onDelta: appendAssistantDelta,
    onToolCall: (id, name, args) =>
      setItems(prev => [...prev, { kind: "tool", tool: { id, name, args } }]),
    onToolResult: (id, result) => {
      setItems(prev =>
        prev.map(it =>
          it.kind === "tool" && it.tool.id === id ? { kind: "tool", tool: { ...it.tool, result } } : it
        )
      );
      // Plan 4-B: apply_style_to_batch returns immediately with a job_id; latch
      // it so useJobPolling kicks in and the bar/card render below.
      const r = result as { job_id?: string; status?: string } | undefined;
      const matchingTool = items.find(it => it.kind === "tool" && it.tool.id === id);
      const isApplyTool = matchingTool && matchingTool.kind === "tool" && matchingTool.tool.name === "apply_style_to_batch";
      if (isApplyTool && r?.status === "running" && typeof r.job_id === "string") {
        setActiveJobId(r.job_id);
        // Best-effort permission ask on first apply in this session. Fire-and-forget.
        void requestNotificationPermissionOnce();
      }
    },
    onError: msg =>
      setItems(prev => [...prev, { kind: "message", message: { role: "assistant", text: `Error: ${msg}` } }]),
    onBulkProgress: handleBulkProgress,
  });

  const handleSend = (text: string) => {
    setItems(prev => [...prev, { kind: "message", message: { role: "user", text } }]);
    send(text);
  };

  return (
    <div>
      <MultiActiveBanner detected={multiActive} />
      {recent.banner && (
        <RecentJobsBanner
          job={recent.banner}
          onView={(j) => { setRecoveredJob(j); recent.dismiss(); }}
          onDismiss={recent.dismiss}
        />
      )}
      <MessageList items={items} onSendChat={handleSend} />
      {recoveredJob && (
        <BulkSummaryCard pollingJob={recoveredJob} onSendChat={handleSend} />
      )}
      {pollState.status === "running" && (
        <BulkProgressBar job={pollState.job} onSendChat={handleSend} />
      )}
      {pollState.status === "terminal" && (
        <BulkSummaryCard pollingJob={pollState.job} onSendChat={handleSend} />
      )}
      {busy && (
        <div style={typingIndicatorStyle}>
          <span style={dotsStyle}>•••</span>
          <span style={typingTextStyle}>{__("Agent is thinking…")}</span>
          <button style={stopButtonStyle} onClick={cancel}>{__("Stop")}</button>
        </div>
      )}
      <MessageInput onSend={handleSend} disabled={busy} />
    </div>
  );
}
