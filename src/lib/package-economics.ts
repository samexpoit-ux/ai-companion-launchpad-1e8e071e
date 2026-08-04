/**
 * Package economics — admin-only break-even maths for the credit packages.
 *
 * Answers the two questions the business actually asks:
 *   1. If a package (200 / 300 / 500 / 800 credits) is sold at list price, what
 *      is left after upstream model spend?
 *   2. If the same package is sold through a reseller (discount + commission),
 *      how many units must be sold before we are in profit?
 *
 * `costPerCredit` comes from real ledger data (admin usage report), so the
 * numbers move with actual provider spend instead of a guess.
 */
import { PLANS, planPriceUsd, type PlanId } from "@/lib/plans";

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10);

export interface EconomicsInput {
  /** Real upstream USD cost of one credit (from the ledger). */
  costPerCredit: number;
  /** Reseller discount off list price, in percent. */
  resellerDiscountPct: number;
  /** Reseller commission on the paid amount, in percent. */
  commissionPct: number;
  /** Fixed monthly infrastructure spend to recover (VPS, storage, domains). */
  monthlyFixedUsd: number;
  /** Share of package credits an average customer actually burns (0-1). */
  utilisation: number;
}

export const DEFAULT_ECONOMICS: EconomicsInput = {
  costPerCredit: 0.012,
  // Resellers buy a flat low wholesale price and keep 100% of their own margin,
  // so we pay no commission (0%). The discount is the wholesale gap.
  resellerDiscountPct: 20,
  commissionPct: 0,
  monthlyFixedUsd: 120,
  utilisation: 0.85,
};

export interface PackageEconomicsRow {
  id: PlanId;
  name: string;
  credits: number;
  listUsd: number;
  pricePerCredit: number;
  /** Upstream cost when the customer burns `utilisation` of the package. */
  upstreamUsd: number;
  /** Worst case: every credit in the package is burned. */
  worstCaseUsd: number;
  directProfitUsd: number;
  directMarginPct: number;
  /** Reseller: what they pay us after the discount. */
  resellerPriceUsd: number;
  commissionUsd: number;
  resellerNetUsd: number;
  resellerProfitUsd: number;
  resellerMarginPct: number;
  /** Units needed to cover the fixed monthly spend. */
  unitsToBreakEvenDirect: number;
  unitsToBreakEvenReseller: number;
  /** Cost multiple recovered at list price — keep this at 3x or better. */
  multiple: number;
  safe: boolean;
}

export function packageEconomics(input: Partial<EconomicsInput> = {}): PackageEconomicsRow[] {
  const cfg = { ...DEFAULT_ECONOMICS, ...input };
  const utilisation = Math.min(1, Math.max(0.05, cfg.utilisation));

  return PLANS.filter((plan) => plan.credits > 0 && planPriceUsd(plan.id) > 0).map((plan) => {
    const listUsd = planPriceUsd(plan.id);
    const upstreamUsd = round2(plan.credits * utilisation * cfg.costPerCredit);
    const worstCaseUsd = round2(plan.credits * cfg.costPerCredit);

    const directProfitUsd = round2(listUsd - upstreamUsd);
    const resellerPriceUsd = round2(listUsd * (1 - clamp(cfg.resellerDiscountPct) / 100));
    const commissionUsd = round2(resellerPriceUsd * (clamp(cfg.commissionPct) / 100));
    const resellerNetUsd = round2(resellerPriceUsd - commissionUsd);
    const resellerProfitUsd = round2(resellerNetUsd - upstreamUsd);

    return {
      id: plan.id,
      name: plan.name,
      credits: plan.credits,
      listUsd: round2(listUsd),
      pricePerCredit: Math.round((listUsd / plan.credits) * 10000) / 10000,
      upstreamUsd,
      worstCaseUsd,
      directProfitUsd,
      directMarginPct: pct(directProfitUsd, listUsd),
      resellerPriceUsd,
      commissionUsd,
      resellerNetUsd,
      resellerProfitUsd,
      resellerMarginPct: pct(resellerProfitUsd, resellerPriceUsd),
      unitsToBreakEvenDirect: units(cfg.monthlyFixedUsd, directProfitUsd),
      unitsToBreakEvenReseller: units(cfg.monthlyFixedUsd, resellerProfitUsd),
      multiple: worstCaseUsd > 0 ? Math.round((listUsd / worstCaseUsd) * 100) / 100 : 0,
      safe: worstCaseUsd > 0 ? listUsd / worstCaseUsd >= 3 : true,
    };
  });
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function units(fixedUsd: number, profitPerUnit: number) {
  if (profitPerUnit <= 0) return Infinity;
  return Math.ceil(Math.max(0, fixedUsd) / profitPerUnit);
}

/** Highest sustainable upstream cost per credit at a 3x safety multiple. */
export function maxCostPerCredit(planId: PlanId): number {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan || plan.credits <= 0) return 0;
  return Math.round((planPriceUsd(planId) / plan.credits / 3) * 10000) / 10000;
}
