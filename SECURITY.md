# Security Policy

We take the security of AI SEO Agent seriously. The plugin handles your
Anthropic API key, your WordPress credentials, and your post content — if you
find a way that information could leak, be tampered with, or be used to escalate
privileges, we want to hear from you.

## Supported Versions

Only the latest minor release of `seo-agent` on the WordPress.org plugin
directory receives security fixes. Older versions are not patched.

| Version | Status     |
| ------- | ---------- |
| 1.0.x   | Supported  |
| < 1.0   | Unsupported |

## Reporting a Vulnerability

**Please do not report security issues through public GitHub issues, the
WordPress.org support forum, or social media.** Public disclosure before a fix
is shipped puts every existing install at risk.

Send the report by email to **artifact861+security@gmail.com**.

If you would like to encrypt the report, request our public PGP key in the
first message and we will respond with it before you send the details.

Please include, where possible:

- A description of the issue and the impact you believe it has.
- Steps to reproduce, or a proof-of-concept.
- The plugin version, WordPress version, PHP version, and any relevant
  third-party plugins.
- Whether the issue affects the WordPress plugin, the backend service, or
  both.
- Your name and a link (GitHub, website, X/Twitter) if you would like to be
  credited in the release notes once the fix ships.

## Our Commitment

When you report a vulnerability we will:

1. Acknowledge receipt within **72 hours**.
2. Confirm the issue and assess severity within **7 days**.
3. Aim to ship a fix within **30 days** for high-severity issues, or work with
   you on a longer disclosure window for issues that require deeper changes.
4. Credit you in the changelog and release notes after the fix is available,
   unless you prefer to remain anonymous.

## Scope

The following are in scope:

- The WordPress plugin code in this repository (`plugin/` directory).
- The plugin's React admin app (`plugin-app/` directory).
- The Node backend service (`backend/` directory).
- The official `seo-agent` plugin distributed through WordPress.org.
- The hosted backend at `api.getseoagent.app` and any other service hosted
  by us under `getseoagent.app` or `seo-friendly.org`.

The following are out of scope:

- Issues in third-party plugins or themes that happen to be installed
  alongside our plugin.
- Issues in WordPress core, PHP, the user's web server, or any other software
  not maintained by us.
- Self-inflicted issues that require an attacker to already have administrator
  access to the WordPress site.
- Reports generated solely by automated scanners without a working
  reproduction.

## Safe Harbour

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction, and
  service disruption while testing.
- Report the issue to us promptly through the channel above.
- Give us a reasonable amount of time to fix the issue before any public
  disclosure.

Thank you for helping keep AI SEO Agent and its users safe.
