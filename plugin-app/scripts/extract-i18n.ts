#!/usr/bin/env bun
/**
 * Extracts translatable strings from src/ (TS / TSX) and emits .po-style
 * `msgid` entries that can be merged into the plugin's seo-agent.pot.
 *
 * Why a custom extractor: `wp i18n make-pot` scans .php and .js by default
 * but not .ts / .tsx, and we don't want to ship a non-minified JS build
 * just to feed wp-cli. The patterns we care about are bounded:
 *
 *   __("literal")
 *   _n("singular", "plural", n)
 *
 * (Both via the wrapper at src/lib/i18n.ts, which always pins
 * the "getseoagent" text-domain — so extracted entries don't carry it.)
 *
 * Usage:
 *   bun run plugin-app/scripts/extract-i18n.ts > /tmp/js.pot.fragment
 *   # then merge with msgcat or hand-paste into plugin/languages/seo-agent.pot
 *
 * Caveats:
 *   - Only matches double-quoted single-line literals. Backtick / multi-line
 *     strings won't be picked up. We don't currently use those for i18n.
 *   - `sprintf(__("..."), ...)` matches because the inner __() is what we
 *     scan for. The sprintf wrapper itself is irrelevant to extraction.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

type Entry = {
  msgid: string;
  msgid_plural?: string;
  references: Set<string>;
  comments: Set<string>;
};

const SRC_DIR = new URL("../src", import.meta.url).pathname;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(ent.name) && !/\.test\./.test(ent.name)) yield p;
  }
}

function escapePo(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const entries = new Map<string, Entry>();

function add(key: string, ref: string, plural?: string, comment?: string): void {
  const mapKey = plural ? `${key}\0${plural}` : key;
  let e = entries.get(mapKey);
  if (!e) {
    e = { msgid: key, msgid_plural: plural, references: new Set(), comments: new Set() };
    entries.set(mapKey, e);
  }
  e.references.add(ref);
  if (comment) e.comments.add(comment);
}

for await (const file of walk(SRC_DIR)) {
  const text  = await Bun.file(file).text();
  const lines = text.split("\n");
  const rel   = file.slice(SRC_DIR.length - "src".length);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    // Pull the previous line's `// Translators: …` if present.
    const prev = i > 0 ? lines[i - 1]!.trim() : "";
    const translatorComment = /^\/\*?\s*Translators:\s*(.+?)(?:\s*\*\/)?$/.exec(prev)?.[1];

    // __("text") — single double-quoted literal
    for (const m of ln.matchAll(/__\("((?:[^"\\]|\\.)*)"\)/g)) {
      add(m[1]!, `${rel}:${i + 1}`, undefined, translatorComment);
    }
    // _n("single", "plural", n)
    for (const m of ln.matchAll(/_n\("((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",/g)) {
      add(m[1]!, `${rel}:${i + 1}`, m[2]!, translatorComment);
    }
  }
}

// Emit. Sorted by msgid for stable diffs.
const sorted = [...entries.values()].sort((a, b) => a.msgid.localeCompare(b.msgid));
for (const e of sorted) {
  for (const c of e.comments) console.log(`#. translators: ${c}`);
  for (const r of [...e.references].sort()) console.log(`#: ${r}`);
  console.log(`msgid "${escapePo(e.msgid)}"`);
  if (e.msgid_plural) {
    console.log(`msgid_plural "${escapePo(e.msgid_plural)}"`);
    console.log('msgstr[0] ""');
    console.log('msgstr[1] ""');
  } else {
    console.log('msgstr ""');
  }
  console.log("");
}

console.error(`extracted ${entries.size} entries from ${SRC_DIR}`);
