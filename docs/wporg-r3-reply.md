# wp.org Round-3 Reviewer Reply (v1.0.1)

> Reference: Review ID `R getseoagent/kirilludrugov/5May26/T4 8May26/3.9 (P0TDX307356HGN)`
>
> Send this as the reply to the round-3 review email after re-uploading the v1.0.1 ZIP at `dist/getseoagent.zip`.
>
> Note: between rounds we re-aligned the WP.org submission line back to the slim v1.0.x branch (no speed-audit, no multi-adapter — those features are still in feature branches awaiting directory approval). The ZIP, the public GitHub repo on `main`, and the source pointer in the readme now all describe the same v1.0.1 code.

---

Hi reviewers,

Re: Review ID R getseoagent/kirilludrugov/5May26/T4 8May26/3.9 (P0TDX307356HGN).

I've uploaded v1.0.1. Brief notes on the two remaining issues:

**1. CURL → WP HTTP API.** Thank you for the pointer to `http_api_curl` — we'd missed that the filter exposes the WP-managed handle for setopt customisation. The SSE chat-stream proxy in `includes/class-rest-controller.php` no longer contains any `curl_*` calls. The handler now drives the round-trip through `wp_remote_post()`; SSE chunk-by-chunk delivery is restored by attaching `CURLOPT_WRITEFUNCTION` (and a `CURLOPT_PROGRESSFUNCTION` for browser-disconnect aborts) to the WP-managed cURL handle inside an `http_api_curl` filter callback. The filter is gated by an exact URL match against the chat endpoint, so unrelated `wp_remote_*` traffic in the same request lifecycle (license check, JWT mint, third-party plugins) is not affected.

**2. Source code for the compressed JS/CSS.** The `Source Code` section is in `readme.txt`. The repository at https://github.com/getseoagent/wp-ai-seo-agent is public; the React/TypeScript sources for the bundle are at `plugin-app/src/`; the build is `cd plugin-app && bun install && bun run build` (or `npm install && npm run build`). Vite writes the bundle directly into `plugin/assets/dist/`, so a fresh build reproduces the exact files shipped in the ZIP.

I tested v1.0.1 on a clean WordPress 6.9 install with `WP_DEBUG=true` and Plugin Check (zero errors). The full unit-test suite (131 tests, 314 assertions) passes; new tests cover the SSE helpers (`emit_sse_chunk`, `sse_write_callback`, `is_chat_proxy_url`).

Thanks again for the careful review.

— Kyrylo (kirilludrugov)
