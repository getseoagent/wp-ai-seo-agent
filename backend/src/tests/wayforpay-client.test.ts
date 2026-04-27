import { describe, it, expect, beforeEach } from "bun:test";
import { createWayForPayClient } from "../lib/billing/wayforpay-client";

const SECRET = "test-merchant-secret";
const ORIGINAL_FETCH = globalThis.fetch;

describe("createWayForPayClient", () => {
  beforeEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("verifyWebhookSignature accepts a correctly-signed payload", () => {
    const client = createWayForPayClient({ merchantAccount: "acct", merchantSecretKey: SECRET, merchantDomain: "example.com" });
    const fields = ["acct", "ord-1", "100.00", "USD", "Approved", "1"];
    const computed = client.computeWebhookSignature(fields);
    expect(client.verifyWebhookSignature(fields, computed)).toBe(true);
  });

  it("verifyWebhookSignature rejects tampered signature", () => {
    const client = createWayForPayClient({ merchantAccount: "acct", merchantSecretKey: SECRET, merchantDomain: "example.com" });
    const fields = ["acct", "ord-1", "100.00", "USD", "Approved", "1"];
    expect(client.verifyWebhookSignature(fields, "0".repeat(32))).toBe(false);
  });

  it("chargeRecurring posts to WFP API with correct signature and parses Approved", async () => {
    const client = createWayForPayClient({ merchantAccount: "acct", merchantSecretKey: SECRET, merchantDomain: "example.com" });
    let captured: any = null;
    const mockFetch = (async (url: string, init: any) => {
      captured = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        transactionStatus: "Approved",
        orderReference: "renew-001",
        amount: 19.0,
        currency: "USD",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    globalThis.fetch = mockFetch;
    try {
      const result = await client.chargeRecurring({
        recToken: "rec-token-abc",
        orderReference: "renew-001",
        amount: 19.0,
        currency: "USD",
        productName: "AI SEO Agent — Pro",
      });
      expect(result.transactionStatus).toBe("Approved");
      expect(captured.body.merchantAccount).toBe("acct");
      expect(captured.body.recToken).toBe("rec-token-abc");
      expect(captured.body.merchantSignature).toBeDefined();
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  });

  it("chargeRecurring returns Declined transactionStatus on WFP-side rejection", async () => {
    const client = createWayForPayClient({ merchantAccount: "acct", merchantSecretKey: SECRET, merchantDomain: "example.com" });
    globalThis.fetch = (async () => new Response(JSON.stringify({
      transactionStatus: "Declined",
      reasonCode: 1003,
      reason: "Insufficient funds",
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const result = await client.chargeRecurring({ recToken: "x", orderReference: "y", amount: 1, currency: "USD", productName: "p" });
      expect(result.transactionStatus).toBe("Declined");
      expect(result.reason).toBe("Insufficient funds");
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  });
});
