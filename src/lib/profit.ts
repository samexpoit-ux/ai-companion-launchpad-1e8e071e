/**
 * Profit / margin maths for the admin console.
 *
 * Revenue is derived from what a credit is *sold* for (default: the Starter
 * plan's implied price per credit) and cost is the real upstream provider spend
 * already recorded on every ledger row. Nothing here is exposed to customers —
 * the whole module is only imported by the admin console.
 */
import { ACTION_RULES, type CreditAction } from "@/lib/credits";
import { PLANS } from "@/lib/plans";
import type { UsageReport, UsageRequestRow } from "@/lib/admin-api";

/** Implied sale price of one credit for a plan, in USD. */
export function pricePerCredit(planId: string): number {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan || plan.credits <= 0) return 0;
  const usd = Number(plan.price.replace(/[^0-9.]/g, "")) || 0;
  return usd / plan.credits;
  // 200/$15 → $0.075, 300/$25 → $0.083, 500/$40 → $0.08, 800/$60 → $0.075.
}

/** Default sell price per credit: the Starter tier's implied rate. */
export const DEFAULT_PRICE_PER_CREDIT = pricePerCredit("starter") || 0.075;

export interface ProfitRow {
  key: string;
  label: string;
  requests: number;
  credits: number;
  revenueUsd: number;
  costUsd: number;
  profitUsd: number;
  marginPct: number;
}

export interface ProfitSummary {
  revenueUsd: number;
  costUsd: number;
  profitUsd: number;
  marginPct: number;
  /** Multiple of upstream cost that current pricing recovers. */
  multiple: number;
  credits: number;
  requests: number;
  /** Average upstream cost of a single credit, in USD. */
  costPerCredit: number;
  /** Price per credit needed to keep a 3x safety multiple. */
  breakEvenPrice: number;
  byAction: ProfitRow[];
  byUser: ProfitRow[];
  byModel: ProfitRow[];
}

const round = (n: number, p = 6) => Math.round(n * 10 ** p) / 10 ** p;
const pct = (part: number, whole: number) =>
  whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10;

function emptyRow(key: string, label: string): ProfitRow {
  return {
    key,
    label,
    requests: 0,
    credits: 0,
    revenueUsd: 0,
    costUsd: 0,
    profitUsd: 0,
    marginPct: 0,
  };
}

function group(
  rows: UsageRequestRow[],
  price: number,
  keyOf: (r: UsageRequestRow) => { key: string; label: string },
): ProfitRow[] {
  const map = new Map<string, ProfitRow>();
  for (const r of rows) {
    const { key, label } = keyOf(r);
    const row = map.get(key) ?? emptyRow(key, label);
    if (r.credits > 0) row.requests += 1;
    row.credits = round(row.credits + r.credits, 2);
    row.costUsd = round(row.costUsd + r.costUsd);
    map.set(key, row);
  }
  return [...map.values()]
    .map((row) => {
      row.revenueUsd = round(row.credits * price);
      row.profitUsd = round(row.revenueUsd - row.costUsd);
      row.marginPct = pct(row.profitUsd, row.revenueUsd);
      return row;
    })
    .sort((a, b) => b.revenueUsd - a.revenueUsd);
}

/** Full profit picture for a usage window at a given sell price per credit. */
export function profitSummary(
  report: UsageReport,
  price = DEFAULT_PRICE_PER_CREDIT,
): ProfitSummary {
  const rows = report.requests;
  const credits = round(
    rows.reduce((s, r) => s + r.credits, 0),
    2,
  );
  const costUsd = round(rows.reduce((s, r) => s + r.costUsd, 0));
  const revenueUsd = round(credits * price);
  const profitUsd = round(revenueUsd - costUsd);
  const costPerCredit = credits > 0 ? round(costUsd / credits) : 0;

  return {
    revenueUsd,
    costUsd,
    profitUsd,
    marginPct: pct(profitUsd, revenueUsd),
    multiple: costUsd > 0 ? Math.round((revenueUsd / costUsd) * 100) / 100 : 0,
    credits,
    requests: rows.filter((r) => r.credits > 0).length,
    costPerCredit,
    breakEvenPrice: round(costPerCredit * 3),
    byAction: group(rows, price, (r) => ({
      key: r.action,
      label: ACTION_RULES[r.action as CreditAction]?.label ?? r.action,
    })),
    byUser: group(rows, price, (r) => ({
      key: r.userId,
      label: r.email ?? r.userId.slice(0, 8),
    })).slice(0, 20),
    byModel: group(rows, price, (r) => {
      const model = r.upstreamModel ?? r.model ?? "unknown";
      return { key: model, label: model };
    }),
  };
}
