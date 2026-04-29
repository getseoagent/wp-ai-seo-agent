#!/usr/bin/env bun
/**
 * Convert plugin/languages/seo-agent-{locale}.po → Jed-format JSON files
 * that wp_set_script_translations() can hand to @wordpress/i18n at runtime.
 *
 * Filename: {textdomain}-{locale}-{md5(script-relative-path)}.json — that's
 * what `wp_set_script_translations('seo-agent-app', 'getseoagent', $dir)` looks
 * for when the script handle resolves to assets/dist/assets/index-{HASH}.js.
 *
 * We compute the md5 from the manifest.json so the bundle's fingerprint and
 * the JSON filename stay in sync across rebuilds.
 *
 * Why not `wp i18n make-json`: it requires the .po References to point at
 * actual built JS files, but our .po references the TS source. Generating
 * the JSON ourselves is ~30 lines and keeps the tooling boundary cleaner.
 *
 * Filters to JS-only entries by matching reference comments to .ts/.tsx.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const REPO     = new URL("../..", import.meta.url).pathname;
const LANG_DIR = join(REPO, "plugin/languages");
// Vite's default emits .vite/manifest.json; build-zip.sh promotes it to
// dist/manifest.json for the wp.org ZIP. Check both — production-ZIP shape
// wins so we hash the same path the runtime will actually load.
const MANIFEST_CANDIDATES = [
  join(REPO, "plugin/assets/dist/manifest.json"),
  join(REPO, "plugin/assets/dist/.vite/manifest.json"),
];
let MANIFEST = "";
for (const p of MANIFEST_CANDIDATES) {
  try { await readFile(p); MANIFEST = p; break; } catch {}
}
if (!MANIFEST) throw new Error(`No manifest.json found in: ${MANIFEST_CANDIDATES.join(" or ")}`);

// Build script handle → relative-path map from the Vite manifest.
type ManifestEntry = { file: string };
const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as Record<string, ManifestEntry>;
const indexEntry = manifest["index.html"];
if (!indexEntry?.file) throw new Error("manifest.json missing index.html.file");
const scriptRelPath = `assets/dist/${indexEntry.file}`;
const scriptHash    = createHash("md5").update(scriptRelPath).digest("hex");
console.error(`script: ${scriptRelPath}`);
console.error(`hash:   ${scriptHash}`);

// Tiny .po parser: msgid + (msgid_plural?) + msgstr / msgstr[N], with
// reference comment lines `#: …`.
type Entry = { msgid: string; msgidPlural?: string; msgstr: string[]; references: string[] };
function parsePo(text: string): Entry[] {
  const out: Entry[] = [];
  const lines = text.split("\n");
  let cur: Entry | null = null;
  let mode: "msgid" | "msgid_plural" | "msgstr" = "msgid";
  let strIdx = 0;
  const flush = () => {
    if (cur && cur.msgid !== "") out.push(cur);
    cur  = null;
    mode = "msgid";
    strIdx = 0;
  };
  for (const ln of lines) {
    if (ln === "") { flush(); continue; }
    if (ln.startsWith("#: ")) {
      cur ??= { msgid: "", msgstr: [], references: [] };
      cur.references.push(ln.slice(3).trim());
      continue;
    }
    if (ln.startsWith("#")) continue;
    const m = /^(msgid|msgid_plural|msgstr)(?:\[(\d+)\])?\s+"(.*)"$/.exec(ln);
    if (m) {
      cur ??= { msgid: "", msgstr: [], references: [] };
      const [, kind, idxStr, val] = m;
      const dec = unescape(val!);
      if (kind === "msgid")          { cur.msgid = dec;        mode = "msgid"; }
      else if (kind === "msgid_plural") { cur.msgidPlural = dec; mode = "msgid_plural"; }
      else /* msgstr */               { strIdx = idxStr ? Number(idxStr) : 0; cur.msgstr[strIdx] = dec; mode = "msgstr"; }
      continue;
    }
    const cont = /^"(.*)"$/.exec(ln);
    if (cont && cur) {
      const dec = unescape(cont[1]!);
      if (mode === "msgid")           cur.msgid       += dec;
      else if (mode === "msgid_plural") cur.msgidPlural = (cur.msgidPlural ?? "") + dec;
      else if (mode === "msgstr")      cur.msgstr[strIdx] = (cur.msgstr[strIdx] ?? "") + dec;
    }
  }
  flush();
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

// Iterate every .po in the languages dir.
for (const f of await readdir(LANG_DIR)) {
  const m = /^getseoagent-([a-zA-Z_]+)\.po$/.exec(f);
  if (!m) continue;
  const locale = m[1]!;
  const text   = await readFile(join(LANG_DIR, f), "utf8");
  const entries = parsePo(text);

  // build-translations.ts emits .po files without #: references, so we can't
  // robustly filter to "JS-only" entries. Including everything is harmless:
  // PHP-side strings ride along in the JSON but the runtime never queries
  // them (different domain at the call site). Cost is ~3 KB per JSON.
  const jsOnly = entries;

  // Pull Plural-Forms from the .po header.
  const headerMsg = entries.find(e => e.msgid === "")?.msgstr[0] ?? "";
  const pluralForms = /Plural-Forms:\s*([^\\\n]+)/.exec(headerMsg)?.[1]?.trim()
    ?? "nplurals=2; plural=(n != 1);";

  const localeData: Record<string, string[]> = {
    "": [], // intentionally empty placeholder — header lives one level up
  };
  for (const e of jsOnly) {
    if (!e.msgstr.some(s => s !== "")) continue;
    const key = e.msgidPlural ? `${e.msgid}${e.msgid}` : e.msgid;
    localeData[key] = e.msgstr;
  }

  const jed = {
    "translation-revision-date": new Date().toISOString().slice(0, 19) + "+00:00",
    generator: "build-jed-json.ts",
    domain: "messages",
    locale_data: {
      messages: {
        "": {
          domain: "messages",
          "plural-forms": pluralForms,
          lang: locale,
        },
        ...localeData,
      },
    },
  };
  // Drop the placeholder we inserted so JSON.stringify doesn't emit "":[]
  delete (jed.locale_data.messages as { ""?: unknown })[""];
  jed.locale_data.messages[""] = {
    domain: "messages",
    "plural-forms": pluralForms,
    lang: locale,
  };

  const outName = `getseoagent-${locale}-${scriptHash}.json`;
  const outPath = join(LANG_DIR, outName);
  await writeFile(outPath, JSON.stringify(jed, null, 2));
  console.error(`${locale}: ${jsOnly.length} JS entries → ${outName}`);
}
