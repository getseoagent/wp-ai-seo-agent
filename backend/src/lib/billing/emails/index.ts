import type { EmailKind, EmailRenderer, LicenseSnapshot, RenderedEmail } from "./transport";
import { renderLicenseIssued }   from "./license-issued";
import { renderUpcomingRenewal } from "./upcoming-renewal";
import { renderChargeFailed }    from "./charge-failed";
import { renderCancelled }       from "./cancelled";

/** Default registry — passed into sendTransactionalEmail at the boundary. */
export const renderEmail: EmailRenderer = (kind, license: LicenseSnapshot): RenderedEmail => {
  switch (kind) {
    case "license-issued":   return renderLicenseIssued(license);
    case "upcoming-renewal": return renderUpcomingRenewal(license);
    case "charge-failed":    return renderChargeFailed(license);
    case "cancelled":        return renderCancelled(license);
  }
  // exhaustiveness guard — TS narrows above to never if EmailKind grows.
  const _unreachable: never = kind;
  throw new Error(`unknown email kind: ${_unreachable}`);
};

export type { EmailKind, EmailRenderer, LicenseSnapshot } from "./transport";
