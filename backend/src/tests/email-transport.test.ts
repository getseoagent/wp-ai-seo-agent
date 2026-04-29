import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { sendTransactionalEmail, type LicenseSnapshot } from "../lib/billing/emails/transport";

const license: LicenseSnapshot = { key: "seo_TEST", email: "u@example.com", tier: "pro" };

describe("sendTransactionalEmail", () => {
  let fetchCalls: Array<{ url: string; init: RequestInit }>;
  let restoreFetch: () => void;
  const prevApiKey = process.env.BREVO_API_KEY;

  beforeEach(() => {
    fetchCalls = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    restoreFetch = () => { globalThis.fetch = original; };
    process.env.BREVO_API_KEY = "test-brevo-key";
  });
  afterEach(() => {
    restoreFetch();
    if (prevApiKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = prevApiKey;
  });

  it("posts to Brevo with api-key header and JSON body", async () => {
    await sendTransactionalEmail(
      "license-issued",
      license,
      () => ({ subject: "Welcome", html: "<p>hi</p>" }),
    );
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe("https://api.brevo.com/v3/smtp/email");
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("test-brevo-key");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(body.subject).toBe("Welcome");
    expect(body.htmlContent).toBe("<p>hi</p>");
    expect(body.to[0].email).toBe("u@example.com");
    expect(body.sender.email).toBe("noreply@getseoagent.app");
  });

  it("no-ops when license has no email", async () => {
    await sendTransactionalEmail(
      "license-issued",
      { ...license, email: null },
      () => ({ subject: "X", html: "Y" }),
    );
    expect(fetchCalls.length).toBe(0);
  });

  it("no-ops when BREVO_API_KEY unset (warns to console)", async () => {
    delete process.env.BREVO_API_KEY;
    await sendTransactionalEmail(
      "license-issued",
      license,
      () => ({ subject: "X", html: "Y" }),
    );
    expect(fetchCalls.length).toBe(0);
  });

  it("retries once on 5xx", async () => {
    let attempt = 0;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      attempt++;
      if (attempt === 1) return new Response("server overloaded", { status: 503 });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await sendTransactionalEmail("license-issued", license, () => ({ subject: "X", html: "Y" }));
    expect(fetchCalls.length).toBe(2);
  });

  it("does not retry on 4xx", async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response("bad request", { status: 400 });
    }) as typeof fetch;
    await sendTransactionalEmail("license-issued", license, () => ({ subject: "X", html: "Y" }));
    expect(fetchCalls.length).toBe(1);
  });

  it("gives up after 2 attempts on persistent 5xx", async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response("nope", { status: 500 });
    }) as typeof fetch;
    await sendTransactionalEmail("license-issued", license, () => ({ subject: "X", html: "Y" }));
    expect(fetchCalls.length).toBe(2);
  });
});
