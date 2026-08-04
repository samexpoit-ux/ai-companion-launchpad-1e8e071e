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
import { planById, planPriceUsd, resellerPriceBdt } from "./plans";
import { bdtToUsd, usdToBdt } from "./currency";

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
    // Resellers buy at a flat wholesale price and keep their own margin, so a
    // fixed price with 0% commission is the default deal.
    kind: "fixed_price",
    value: bdtToUsd(resellerPriceBdt("starter")),
    planSlug: null,
    bonusCredits: 0,
    resellerEmail: null,
    resellerName: null,
    commissionPct: 0,
    maxRedemptions: null,
    expiresAt: null,
    isActive: true,
    note: null,
  };
}

/**
 * Cost floor for a manual reseller price.
 *
 * `costPerCredit` is the measured upstream USD cost of one credit. Selling below
 * `breakEvenUsd` is a straight loss; below `safeUsd` (3× cost) the package stops
 * covering fixed spend, so the reseller tab flags it before it is saved.
 */
export interface PriceFloor {
  credits: number;
  breakEvenUsd: number;
  safeUsd: number;
  breakEvenBdt: number;
  safeBdt: number;
  /** "loss" | "thin" | "safe" for the price being entered. */
  verdict: "loss" | "thin" | "safe";
  multiple: number;
}

export function priceFloor(planId: string, costPerCredit: number, payableUsd: number): PriceFloor {
  const credits = planById(planId).credits;
  const cost = Math.max(0, Number(costPerCredit) || 0);
  const breakEvenUsd = round2(credits * cost);
  const safeUsd = round2(breakEvenUsd * 3);
  const multiple =
    breakEvenUsd > 0 ? Math.round((payableUsd / breakEvenUsd) * 100) / 100 : Infinity;
  return {
    credits,
    breakEvenUsd,
    safeUsd,
    breakEvenBdt: usdToBdt(breakEvenUsd),
    safeBdt: usdToBdt(safeUsd),
    verdict: payableUsd < breakEvenUsd ? "loss" : payableUsd < safeUsd ? "thin" : "safe",
    multiple,
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
export function quoteCoupon(
  coupon: Pick<Coupon, "kind" | "value" | "bonusCredits" | "commissionPct">,
  planId: string,
): CouponQuote {
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
