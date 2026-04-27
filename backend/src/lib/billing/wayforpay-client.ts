import { createHmac } from "node:crypto";

export type WfpConfig = {
  merchantAccount: string;
  merchantSecretKey: string;
  merchantDomain: string;
  apiEndpoint?: string;   // default: "https://api.wayforpay.com/api"
};

export type ChargeArgs = {
  recToken: string;
  orderReference: string;
  amount: number;
  currency: string;       // "USD" | "EUR" | "UAH"
  productName: string;
};

export type ChargeResult = {
  transactionStatus: "Approved" | "Declined" | string;
  orderReference?: string;
  reasonCode?: number;
  reason?: string;
  rawBody: unknown;
};

export type WayForPayClient = {
  computeWebhookSignature(fields: string[]): string;
  verifyWebhookSignature(fields: string[], presented: string): boolean;
  chargeRecurring(args: ChargeArgs): Promise<ChargeResult>;
};

/**
 * WayForPay client — signature helpers + the recurring-charge HTTP wrapper.
 * Only the operations needed by this plan are implemented; the full WFP API
 * surface is much larger.
 *
 * Signatures use HMAC-MD5 per WFP protocol — note: MD5 is required by WFP
 * even though it's deprecated for general crypto. The threat model is webhook
 * authenticity (forgery), not collision attacks; HMAC-MD5 is acceptable here
 * (HMAC-MD5 has no known practical collision attacks).
 */
export function createWayForPayClient(config: WfpConfig): WayForPayClient {
  const apiEndpoint = config.apiEndpoint ?? "https://api.wayforpay.com/api";

  function hmacMd5Hex(key: string, message: string): string {
    return createHmac("md5", key).update(message).digest("hex");
  }

  function buildChargeSignature(args: ChargeArgs): string {
    const orderDate = Math.floor(Date.now() / 1000).toString();
    const fields = [
      config.merchantAccount,
      config.merchantDomain,
      args.orderReference,
      orderDate,
      args.amount.toFixed(2),
      args.currency,
      args.productName,
      "1",
      args.amount.toFixed(2),
    ];
    return hmacMd5Hex(config.merchantSecretKey, fields.join(";"));
  }

  return {
    computeWebhookSignature(fields) {
      return hmacMd5Hex(config.merchantSecretKey, fields.join(";"));
    },

    verifyWebhookSignature(fields, presented) {
      const computed = createHmac("md5", config.merchantSecretKey).update(fields.join(";")).digest();
      let presentedBuf: Buffer;
      try {
        presentedBuf = Buffer.from(presented, "hex");
      } catch {
        return false;
      }
      if (computed.length !== presentedBuf.length) return false;
      let acc = 0;
      for (let i = 0; i < computed.length; i++) acc |= computed[i]! ^ presentedBuf[i]!;
      return acc === 0;
    },

    async chargeRecurring(args) {
      const orderDate = Math.floor(Date.now() / 1000);
      const body = {
        transactionType: "CHARGE",
        merchantAccount: config.merchantAccount,
        merchantDomainName: config.merchantDomain,
        merchantSignature: buildChargeSignature(args),
        apiVersion: 1,
        orderReference: args.orderReference,
        orderDate,
        amount: args.amount,
        currency: args.currency,
        productName: [args.productName],
        productCount: [1],
        productPrice: [args.amount],
        recToken: args.recToken,
      };
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.json() as any;
      return {
        transactionStatus: raw.transactionStatus ?? "Unknown",
        orderReference: raw.orderReference,
        reasonCode: raw.reasonCode,
        reason: raw.reason,
        rawBody: raw,
      };
    },
  };
}
