import { createHmac } from "node:crypto";

export type Tier = "free" | "pro" | "agency" | "enterprise";

const PREFIX = "seo_";
const TIER_TO_BYTE: Record<Tier, number> = {
  free: 0,
  pro: 1,
  agency: 2,
  enterprise: 3,
};
const BYTE_TO_TIER: Record<number, Tier> = {
  0: "free",
  1: "pro",
  2: "agency",
  3: "enterprise",
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    m[BASE32_ALPHABET[i]!] = i;
  }
  return m;
})();

const PAYLOAD_LEN = 17; // 1 tier + 4 issued_at + 4 expiry_at + 8 random
const HMAC_LEN = 8;

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]! * 0x1000000) +
    ((buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!)
  );
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

function base32encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      const idx = (buffer >> bits) & 0x1f;
      out += BASE32_ALPHABET[idx];
    }
  }
  if (bits > 0) {
    const idx = (buffer << (5 - bits)) & 0x1f;
    out += BASE32_ALPHABET[idx];
  }
  return out;
}

function base32decode(str: string): Uint8Array | null {
  const upper = str.toUpperCase();
  // Each char encodes 5 bits; total bits = len * 5; bytes = floor(bits / 8).
  const bits = upper.length * 5;
  const byteLen = Math.floor(bits / 8);
  const out = new Uint8Array(byteLen);
  let buffer = 0;
  let bitsHeld = 0;
  let outIdx = 0;
  for (let i = 0; i < upper.length; i++) {
    const c = upper[i]!;
    const v = BASE32_LOOKUP[c];
    if (v === undefined) return null;
    buffer = (buffer << 5) | v;
    bitsHeld += 5;
    if (bitsHeld >= 8) {
      bitsHeld -= 8;
      out[outIdx++] = (buffer >> bitsHeld) & 0xff;
    }
  }
  return out;
}

export interface GenerateKeyInput {
  tier: Tier;
  expirySeconds: number;
  secret: string;
}

export interface GenerateKeyOutput {
  key: string;
  expiryAt: number;
  tier: Tier;
}

export function generateKey(input: GenerateKeyInput): GenerateKeyOutput {
  const { tier, expirySeconds, secret } = input;
  const tierByte = TIER_TO_BYTE[tier];
  if (tierByte === undefined) {
    throw new Error(`invalid tier: ${tier}`);
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiryAt = issuedAt + expirySeconds;

  const payload = new Uint8Array(PAYLOAD_LEN);
  payload[0] = tierByte;
  writeUint32BE(payload, 1, issuedAt);
  writeUint32BE(payload, 5, expiryAt);
  const randomChunk = new Uint8Array(8);
  crypto.getRandomValues(randomChunk);
  payload.set(randomChunk, 9);

  const hmacFull = createHmac("sha256", secret).update(payload).digest();
  const hmac8 = new Uint8Array(hmacFull.buffer, hmacFull.byteOffset, HMAC_LEN);

  const key = `${PREFIX}${base32encode(payload)}_${base32encode(hmac8)}`;
  return { key, expiryAt, tier };
}

export type ParseKeyResult =
  | { ok: false }
  | {
      ok: true;
      tier: Tier;
      issuedAt: number;
      expiryAt: number;
      expired: boolean;
    };

export function parseKey(key: string, secret: string): ParseKeyResult {
  if (typeof key !== "string" || !key.startsWith(PREFIX)) {
    return { ok: false };
  }
  const body = key.slice(PREFIX.length);
  const sep = body.lastIndexOf("_");
  if (sep <= 0 || sep >= body.length - 1) {
    return { ok: false };
  }
  const payloadStr = body.slice(0, sep);
  const hmacStr = body.slice(sep + 1);

  const payload = base32decode(payloadStr);
  const hmacGiven = base32decode(hmacStr);
  if (!payload || !hmacGiven) return { ok: false };
  if (payload.length !== PAYLOAD_LEN) return { ok: false };
  if (hmacGiven.length !== HMAC_LEN) return { ok: false };

  const hmacFull = createHmac("sha256", secret).update(payload).digest();
  const hmacExpected = new Uint8Array(hmacFull.buffer, hmacFull.byteOffset, HMAC_LEN);
  if (!constantTimeEqual(hmacGiven, hmacExpected)) {
    return { ok: false };
  }

  const tierByte = payload[0]!;
  const tier = BYTE_TO_TIER[tierByte];
  if (tier === undefined) return { ok: false };

  const issuedAt = readUint32BE(payload, 1);
  const expiryAt = readUint32BE(payload, 5);
  const now = Math.floor(Date.now() / 1000);
  return {
    ok: true,
    tier,
    issuedAt,
    expiryAt,
    expired: expiryAt < now,
  };
}
