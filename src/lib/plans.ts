/**
 * Pricing / credit packages.
 *
 * The plan a workspace picks decides two things:
 *   1. how many credits it gets per period, and
 *   2. which model tiers the smart router is allowed to reach.
 *
 * Free plans run entirely on the free model pool (`ceiling: "free"`) — the
 * router silently drops down instead of failing, so a free account still gets a
 * good answer without ever touching a paid model.
 *
 * Paid packages (Aug 2026): 200 / 300 / 500 / 800 credits at $15 / $25 / $40 /
 * $60. 200 credits is the smallest paid package we sell; top-ups start at 100.
 */
export type PlanId = "free" | "starter" | "growth" | "scale" | "max";

/** Coarse capability ceiling used by the router. */
export type TierCeiling = "free" | "cheap" | "premium";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  cadence: string;
  credits: number;
  /** Highest model tier this plan may use. */
  ceiling: TierCeiling;
  tagline: string;
  perks: string[];
  badge?: string;
}

/** Smallest paid package we sell, in credits. */
export const MIN_PACKAGE_CREDITS = 200;
/** Smallest credit top-up an admin or customer can buy. */
export const MIN_TOPUP_CREDITS = 100;

/**
 * Reseller price list in BDT — what a reseller pays *us* per package.
 * Resellers get a low flat wholesale price and keep **all** of the upside:
 * they resell at whatever price they want and we pay no commission.
 * Admins can override these per coupon (the reseller tab warns if an override
 * drops under the safe cost floor).
 */
export const RESELLER_BDT: Record<PlanId, number> = {
  free: 0,
  starter: 400,
  growth: 450,
  scale: 750,
  max: 1200,
};

export function resellerPriceBdt(id: string | null | undefined): number {
  return RESELLER_BDT[planById(id).id] ?? 0;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    credits: 5,
    ceiling: "free",
    tagline: "Every free engine we have, plus 5 build credits.",
    perks: [
      "5 build credits / month",
      "All free AI engines included",
      "Chat + plan modes",
      "Live preview, code view & console",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$15",
    cadence: "per month",
    credits: 200,
    ceiling: "premium",
    tagline: "Full build tier with smart cost routing.",
    perks: [
      "200 credits / month",
      "Premium build engine when needed",
      "Reviewed auto-fix patches",
      "Project export (zip)",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$25",
    cadence: "per month",
    credits: 300,
    ceiling: "premium",
    tagline: "For steady weekly shipping.",
    perks: [
      "300 credits / month",
      "Premium build engine first",
      "Unlimited projects",
      "Version history",
    ],
    badge: "Popular",
  },
  {
    id: "scale",
    name: "Scale",
    price: "$40",
    cadence: "per month",
    credits: 500,
    ceiling: "premium",
    tagline: "Heavy multi-file work and long sessions.",
    perks: [
      "500 credits / month",
      "Priority routing",
      "Image generation included",
      "GitHub ship flow",
    ],
  },
  {
    id: "max",
    name: "Max",
    price: "$60",
    cadence: "per month",
    credits: 800,
    ceiling: "premium",
    tagline: "Agency-grade throughput with the best margins per credit.",
    perks: [
      "800 credits / month",
      "Best price per credit",
      "Priority routing & support",
      "Reseller coupons available",
    ],
  },
];

export const DEFAULT_PLAN: PlanId = "free";
/** Plan used when an admin flips an account to "premium" in one click. */
export const PREMIUM_PLAN_ID: PlanId = "growth";

/** Paid packages only, cheapest first. */
export const PAID_PLANS = PLANS.filter((p) => p.credits >= MIN_PACKAGE_CREDITS);

export function planPriceUsd(id: string | null | undefined): number {
  return Number(planById(id).price.replace(/[^0-9.]/g, "")) || 0;
}

/** Older accounts stored retired slugs; map them onto the current packages. */
const LEGACY_PLAN_IDS: Record<string, PlanId> = { pro: "growth", business: "scale" };

export function planById(id: string | null | undefined): Plan {
  const key = typeof id === "string" ? (LEGACY_PLAN_IDS[id] ?? id) : id;
  return PLANS.find((p) => p.id === key) ?? PLANS[0];
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLANS.some((p) => p.id === value);
}
