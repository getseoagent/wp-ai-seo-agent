/**
 * Thin wrapper around @wordpress/i18n that pins our text-domain.
 *
 * Use these everywhere user-facing strings appear — JSX text, button labels,
 * placeholders, aria-labels, alert/confirm calls, headlines built with
 * sprintf-style interpolation. Source language is English; .po/.json files
 * shipped under plugin/languages/ provide ru / uk / es / fr / pt_BR
 * translations and are loaded at runtime by wp_set_script_translations()
 * (registered in plugin/includes/class-admin-page.php).
 *
 * Wrapper rationale: we always pass the same text-domain ("seo-agent") so
 * components don't have to. `__` and `sprintf` keep the same signatures as
 * the @wordpress/i18n exports so familiar idioms (pluralisation, %1$s
 * positional args, etc.) work unchanged.
 */
import { __ as wpI18n, sprintf as wpSprintf, _n as wpN } from "@wordpress/i18n";

const DOMAIN = "seo-agent";

export function __(text: string): string {
  return wpI18n(text, DOMAIN);
}

/** Plural: pass singular + plural forms; the third arg picks one based on `n`. */
export function _n(single: string, plural: string, n: number): string {
  return wpN(single, plural, n, DOMAIN);
}

/**
 * sprintf — same runtime semantics as @wordpress/i18n's sprintf, but with a
 * loosened type signature. The upstream type recursively narrows %d/%s
 * placeholders to a tuple type, which trips up `tsc` whenever the format
 * string is itself the result of a `__()` call (a branded TransformedText).
 * Runtime is unchanged — we delegate to the same implementation.
 */
export function sprintf(format: string, ...args: Array<string | number>): string {
  // Cast through `unknown` because the upstream signature won't accept a
  // plain string variable (it wants the literal-type narrowing).
  return (wpSprintf as unknown as (format: string, ...args: Array<string | number>) => string)(format, ...args);
}
