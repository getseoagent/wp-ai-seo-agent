import type { Tier } from "./key-format";

export type TierGateResult =
  | { ok: true }
  | { ok: false; error: { message: string; upgrade_url: string } };

const UPGRADE_URL = "https://www.seo-friendly.org/pricing";

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, agency: 2, enterprise: 3 };

/**
 * Encodes the §4.b matrix: which tools are available at which tier, with
 * tier-aware caps for tools that have variable input size (propose_seo_rewrites,
 * apply_style_to_batch).
 *
 * Fails closed: unknown tool → denied. Caller is the dispatcher — we never want
 * a misnamed tool to silently bypass the gate.
 */
export function tierAllows(toolName: string, tier: Tier, input: any): TierGateResult {
  const arrLen = (val: unknown): number => Array.isArray(val) ? val.length : 0;

  switch (toolName) {
    case "list_posts":
    case "get_post_summary":
    case "get_categories":
    case "get_tags":
    case "detect_seo_plugin":
      return { ok: true };

    case "propose_seo_rewrites": {
      const n = arrLen(input?.post_ids);
      if (TIER_RANK[tier] >= TIER_RANK.pro) return { ok: true };
      if (n <= 5) return { ok: true };
      return deny("propose_seo_rewrites with more than 5 posts requires Pro tier or higher.");
    }

    case "update_seo_fields":
    case "rollback":
    case "get_history":
    case "cancel_job":
    case "get_job_status": {
      if (TIER_RANK[tier] >= TIER_RANK.pro) return { ok: true };
      return deny(`${toolName} requires Pro tier or higher.`);
    }

    case "apply_style_to_batch": {
      if (TIER_RANK[tier] < TIER_RANK.pro) return deny("apply_style_to_batch requires Pro tier or higher.");
      const n = arrLen(input?.post_ids);
      if (TIER_RANK[tier] === TIER_RANK.pro && n > 20) {
        return deny("apply_style_to_batch with more than 20 posts requires Agency tier or higher.");
      }
      return { ok: true };
    }

    case "detect_template_type":
      return { ok: true };

    case "audit_url_speed":
    case "detect_speed_optimizers":
    case "propose_speed_fixes": {
      if (TIER_RANK[tier] >= TIER_RANK.pro) return { ok: true };
      return deny(`${toolName} requires Pro tier or higher.`);
    }

    default:
      return deny(`Tool '${toolName}' is not enabled for any tier.`);
  }
}

function deny(message: string): TierGateResult {
  return { ok: false, error: { message, upgrade_url: UPGRADE_URL } };
}
