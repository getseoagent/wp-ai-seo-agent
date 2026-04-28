import { createHmac } from "node:crypto";
import type { Tier } from "./license/key-format";

export type JwtPayload = {
  site_url: string;
  license_key: string | null;
  tier: Tier;
  iat: number;
  exp: number;
};

export type JwtSecrets = {
  current: string;
  previous?: string;   // accepted-but-not-issued window during rotation
};

const HEADER_B64 = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export function signJwt(payload: JwtPayload, secrets: JwtSecrets): string {
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${HEADER_B64}.${payloadB64}`;
  const sig = createHmac("sha256", secrets.current).update(signingInput).digest();
  return `${signingInput}.${base64urlBuffer(sig)}`;
}

export type VerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_payload" };

export function verifyJwt(token: string, secrets: JwtSecrets): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, payloadB64, sigB64] = parts;

  const signingInput = `${headerB64}.${payloadB64}`;
  const candidates = secrets.previous ? [secrets.current, secrets.previous] : [secrets.current];
  let sigOk = false;
  for (const secret of candidates) {
    const expectedBuf = createHmac("sha256", secret).update(signingInput).digest();
    if (constantTimeEqualB64(base64urlBuffer(expectedBuf), sigB64)) { sigOk = true; break; }
  }
  if (!sigOk) return { ok: false, reason: "bad_signature" };

  let payload: JwtPayload;
  try { payload = JSON.parse(Buffer.from(base64urlDecode(payloadB64), "binary").toString("utf8")) as JwtPayload; }
  catch { return { ok: false, reason: "bad_payload" }; }

  if (typeof payload.exp !== "number") return { ok: false, reason: "bad_payload" };
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

function base64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlBuffer(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlDecode(s: string): string {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("binary");
}
function constantTimeEqualB64(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}
