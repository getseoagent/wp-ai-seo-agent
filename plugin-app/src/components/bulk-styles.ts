// Shared visual constants for bulk-job UI components (BulkProgressBar, BulkSummaryCard).
// Pure TS constants — not a CSS module — to preserve the inline-styles convention.

export const BULK_COLORS = {
  destructiveRed: "#842029",      // cancel mid-flight, failed status
  applyGreen: "#2c6e2f",           // applied / rolled_back
  warnYellow: "#996800",           // skipped, cancelled status
  rollbackBlue: "#006399",         // rolled_back status badge
  primaryBlue: "#2271b1",          // rollback action button (post-hoc undo)
  borderGray: "#dbe4ec",
  surfaceFill: "#f6f7f7",
  mutedFg: "#646970",
} as const;

export const BULK_STATUS_BG = {
  completed: "#e7f5e7",
  cancelled: "#fff8e5",
  failed: "#fcf0f1",
  rolled_back: "#e6f7ff",
} as const;
