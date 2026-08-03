/**
 * Reseller coupons.
 *
 * Resellers get a personal coupon code. A coupon either takes a **percentage**
 * off the package price, a **fixed amount** off, or sets a **flat reseller
 * price** for a package — plus optional bonus credits. All maths lives here so
 * the admin console, the checkout preview and the ledger agree on one number.
 *
 * Redemption limits, expiry and the active flag are enforced in the database
 * (`redeem_coupon`), never in the browser.
 */
import { planById, planPriceUsd } from "./plans";

export type CouponKind = "percent" | "amount" | "fixed_price";

export interface Coupon {
  id: string;
  code: string;
  kind: CouponKind;
  /** percent → 0-100, amount → USD off, fixed_price → USD final price. */
  value: number;
  /** Restrict to one package slug, or null for every paid package. */
  planSlug: string | null;
  /** Extra credits handed out on top of the package. */
  bonusCredits: number;
  /** Owner of the coupon (a reseller account or partner email). */
  resellerEmail: string | null;
  resellerName: string | null;
  /** Reseller's cut of the sale, in percent. */
  commissionPct: number;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

export type CouponDraft = Omit<Coupon, "id" | "timesRedeemed" | "createdAt">;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyCouponDraft(): CouponDraft {
  return {
    code: "",
    kind: "percent",
    value: 20,
    planSlug: null,
    bonusCredits: 0,
    resellerEmail: null,
    resellerName: null,
    commissionPct: 10,
    maxRedemptions: null,
    expiresAt: null,
    isActive: true,
    note: null,
  };
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "-").slice(0, 32);
}

export interface CouponQuote {
  listUsd: number;
  discountUsd: number;
  payableUsd: number;
  credits: number;
  bonusCredits: number;
  commissionUsd: number;
  netUsd: number;
}

/** What a reseller (or their customer) pays for a package with this coupon. */
export function quoteCoupon(coupon: Pick<Coupon, "kind" | "value" | "bonusCredits" | "commissionPct">, planId: string): CouponQuote {
  const plan = planById(planId);
  const list = planPriceUsd(planId);
  let payable = list;
  if (coupon.kind === "percent") payable = list * (1 - clampPct(coupon.value) / 100);
  else if (coupon.kind === "amount") payable = list - Math.max(0, coupon.value);
  else payable = Math.max(0, coupon.value);
  payable = round2(Math.max(0, Math.min(payable, list)));
  const commissionUsd = round2(payable * (clampPct(coupon.commissionPct) / 100));
  return {
    listUsd: round2(list),
    discountUsd: round2(list - payable),
    payableUsd: payable,
    credits: plan.credits + Math.max(0, coupon.bonusCredits),
    bonusCredits: Math.max(0, coupon.bonusCredits),
    commissionUsd,
    netUsd: round2(payable - commissionUsd),
  };
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function describeCoupon(coupon: Pick<Coupon, "kind" | "value">): string {
  if (coupon.kind === "percent") return `${clampPct(coupon.value)}% off`;
  if (coupon.kind === "amount") return `$${round2(coupon.value)} off`;
  return `$${round2(coupon.value)} flat price`;
}

export function couponStatus(coupon: Coupon): "active" | "expired" | "exhausted" | "disabled" {
  if (!coupon.isActive) return "disabled";
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) return "expired";
  if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions)
    return "exhausted";
  return "active";
}
