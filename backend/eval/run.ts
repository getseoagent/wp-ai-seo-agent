import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { composeRewrite, CraftError, type RewriteProposal } from "../src/lib/craft";
import type { PostSummary } from "../src/lib/wp-client";

type Fixture = { expected_intent: string; summary: PostSummary };
type Verdict = { name: string; intentMatch: boolean; titleLen: number; descLen: number; durationMs: number; pass: boolean; reason?: string; proposal?: RewriteProposal };

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

async function runOne(name: string, fx: Fixture, apiKey: string): Promise<Verdict> {
  const t0 = Date.now();
  try {
    const proposal = await composeRewrite(fx.summary, undefined, apiKey);
    const intentMatch = proposal.intent === fx.expected_intent;
    const titleLen = proposal.title.new.length;
    const descLen  = proposal.description.new.length;
    const kwInTitle = proposal.title.new.toLowerCase().includes(proposal.primary_keyword.text.toLowerCase());
    const pass = intentMatch && titleLen <= 60 && descLen <= 155 && kwInTitle;
    return {
      name, intentMatch, titleLen, descLen,
      durationMs: Date.now() - t0,
      pass,
      reason: pass ? undefined : `intent_match=${intentMatch} title_len=${titleLen} desc_len=${descLen} kw_in_title=${kwInTitle}`,
      proposal,
    };
  } catch (err) {
    const reason = err instanceof CraftError ? `${err.reason}: ${err.detail}` : String(err);
    return {
      name, intentMatch: false, titleLen: 0, descLen: 0,
      durationMs: Date.now() - t0, pass: false, reason,
    };
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY env var required");
    process.exit(2);
  }

  const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith(".json"));
  const verdicts: Verdict[] = [];
  for (const f of files) {
    const fx = JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as Fixture;
    const v = await runOne(f.replace(/\.json$/, ""), fx, apiKey);
    verdicts.push(v);
  }

  console.log("\n=== Summary ===");
  console.log("name                    intent  title_len  desc_len  duration   verdict");
  for (const v of verdicts) {
    const intentChar = v.intentMatch ? "✓" : "✗";
    const verdict = v.pass ? "PASS" : "FAIL";
    console.log(
      `${v.name.padEnd(24)}${intentChar.padEnd(8)}${String(v.titleLen).padEnd(11)}${String(v.descLen).padEnd(10)}${(v.durationMs + "ms").padEnd(11)}${verdict}` + (v.reason ? `  (${v.reason})` : "")
    );
  }

  console.log("\n=== Outputs ===");
  for (const v of verdicts) {
    console.log(`\n--- ${v.name} ---`);
    if (v.proposal) {
      console.log(JSON.stringify(v.proposal, null, 2));
    } else {
      console.log(`(failed: ${v.reason})`);
    }
  }

  const failed = verdicts.filter(v => !v.pass);
  if (failed.length > 0) {
    console.error(`\n${failed.length}/${verdicts.length} fixtures FAILED`);
    process.exit(1);
  }
  console.log(`\n${verdicts.length}/${verdicts.length} fixtures PASSED`);
}

main();
