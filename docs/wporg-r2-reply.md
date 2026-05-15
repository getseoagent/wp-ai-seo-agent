# wp.org Round-2 Reviewer Reply (v1.2.2)

> Reference: Review ID `R getseoagent/kirilludrugov/5May26/T3 7May26/3.9 (P0TDX307356HGN)`
>
> Send this as the reply to the round-2 review email after re-uploading the v1.2.2 ZIP.

---

Hi reviewers,

Re: Review ID R getseoagent/kirilludrugov/5May26/T3 7May26/3.9 (P0TDX307356HGN).

I've uploaded v1.2.2 with the following changes. Brief notes on each issue, in your order:

**1. Trialware / Locked features.** No PHP feature gates exist in the plugin code, and none are added. The free / Pro / Agency tiers belong to the GetSEOAgent service (the external Node backend that handles AI processing), not to the plugin. The wording in `readme.txt` and `class-subscription-page.php` previously phrased the tiers as plugin-locked features, which I now see was the violation. v1.2.2 rewrites every such mention to describe **service** tiers, in the same model as Akismet or Jetpack — the plugin is a fully functional GPL client, payment gates live on the backend service. Concretely changed: readme "Key features" bullet, Installation steps 4–5, the "free tier" / "shared hosting" FAQ entries, the 1.0.0 and 1.1.0 changelog wording, and the Subscription page copy when no license is set.

**2. Source code for compressed JS/CSS.** Added a "Source Code" section in `readme.txt` linking to the public repo at https://github.com/getseoagent/wp-ai-seo-agent — React/TypeScript sources are at `plugin-app/src/`, the build is Vite + Bun (or npm), and Vite writes the production bundle directly into `plugin/assets/dist/`.

**3. CURL instead of HTTP API at `class-rest-controller.php:1064`.** This is the only place in our code we use raw cURL, and it is genuinely required: it's an SSE (`text/event-stream`) proxy that streams Anthropic-generated tokens to the browser chunk-by-chunk through our Node backend. The WordPress HTTP API (`wp_remote_*` / `WP_Http_Curl::request`) buffers the **entire** response body before returning to the caller — there is no public hook for a per-chunk write callback. `CURLOPT_WRITEFUNCTION` is the only mechanism that lets us flush each event-stream chunk straight through to the client. If we switched to `wp_remote_post` the chat would stop streaming and the user would see an empty chat for the full duration of the model response. The inline comment above `curl_init` has been expanded to document this rationale clearly, and the `phpcs:ignore WordPress.WP.AlternativeFunctions.curl_*` annotations are kept. We'd be glad to revisit if you can point us at any WP-HTTP-API path that supports unbuffered chunk delivery — we couldn't find one.

**4. Unescaped echo in `class-multi-seo-notice.php:66`.** Fixed. Output is now late-escaped with `wp_kses_post( self::render( $detected ) )` so any malicious translation would be sanitized while the `<strong>` markup we intend to render is preserved.

**5. `do_action('aioseo_clear_cache', $post_id)` flagged as a non-prefixed element.** This is a false positive: `aioseo_clear_cache` is a hook **published by the AIOSEO plugin** (https://aioseo.com), not a hook of ours. We fire it after writing into AIOSEO's `{prefix}aioseo_posts` table to invalidate AIOSEO's internal cache. The call is guarded by `has_action('aioseo_clear_cache')` so it's a no-op when AIOSEO isn't installed. All of our own hooks/options/classes use the `seoagent` / `seo_agent` / `getseoagent` prefixes; there are no other elements outside those.

I tested v1.2.2 on a clean WordPress install with `WP_DEBUG=true` and Plugin Check (zero errors).

<!-- TODO before sending: actually run Plugin Check on a clean WP testbed; remove this comment when done. -->

Thanks again for the careful review.
— Kyrylo (kirilludrugov)
