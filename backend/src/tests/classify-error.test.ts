import { describe, it, expect } from "bun:test";
import { classifyError } from "../lib/sse";

describe("classifyError", () => {
  it("maps 401 + invalid x-api-key → anthropic_auth with help URL", () => {
    const e = classifyError(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'));
    expect(e.code).toBe("anthropic_auth");
    expect(e.help_url).toContain("console.anthropic.com");
    expect(e.message.toLowerCase()).toContain("api key");
  });

  it("maps 429 / rate_limit_error → anthropic_rate_limit", () => {
    const e = classifyError(new Error('429 {"type":"error","error":{"type":"rate_limit_error","message":"…"}}'));
    expect(e.code).toBe("anthropic_rate_limit");
    expect(e.message.toLowerCase()).toContain("rate-limit");
  });

  it("maps 402 / billing → anthropic_quota", () => {
    const e = classifyError(new Error("402 credit_balance_too_low"));
    expect(e.code).toBe("anthropic_quota");
    expect(e.message.toLowerCase()).toContain("credit");
  });

  it("maps 529 / overloaded → anthropic_overloaded", () => {
    expect(classifyError(new Error("529 overloaded_error")).code).toBe("anthropic_overloaded");
    expect(classifyError(new Error("Anthropic returned 529")).code).toBe("anthropic_overloaded");
  });

  it("maps abort → aborted", () => {
    const a = new Error("The operation was aborted.");
    a.name = "AbortError";
    expect(classifyError(a).code).toBe("aborted");
    expect(classifyError("aborted").code).toBe("aborted");
  });

  it("anthropic 4xx/5xx without specific match → anthropic_other", () => {
    const e = classifyError(new Error('500 {"type":"error","error":{"type":"api_error","message":"internal"}}'));
    expect(e.code).toBe("anthropic_other");
    expect(e.message).toMatch(/Diagnose/);
  });

  it("unknown error → internal with raw message preserved", () => {
    const e = classifyError(new Error("ECONNRESET"));
    expect(e.code).toBe("internal");
    expect(e.message).toBe("ECONNRESET");
  });

  it("non-Error inputs stringify cleanly", () => {
    expect(classifyError("plain string").code).toBe("internal");
    expect(classifyError({ random: "object" }).code).toBe("internal");
  });
});
