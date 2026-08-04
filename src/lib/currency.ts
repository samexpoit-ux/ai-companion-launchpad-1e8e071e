/**
 * Currency display for the admin console.
 *
 * Everything is *stored* in USD (packages, coupons, ledger, payments) — BDT is
 * a display/entry convenience so the business can reason in taka. One rate
 * lives here so the profit panel, the package break-even table and the reseller
 * tab always agree.
 */
export type CurrencyCode = "USD" | "BDT";

/** USD → BDT rate used across the admin console. */
export const BDT_PER_USD = 122;

export const CURRENCY_STORAGE_KEY = "nexura.admin.currency";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function usdToBdt(usd: number): number {
  return round2((Number(usd) || 0) * BDT_PER_USD);
}

export function bdtToUsd(bdt: number): number {
  return round2((Number(bdt) || 0) / BDT_PER_USD);
}

export function formatUsdAmount(usd: number): string {
  const value = Number(usd) || 0;
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return `${value < 0 ? "-" : ""}$${abs.toFixed(digits)}`;
}

export function formatBdt(bdt: number): string {
  const value = Number(bdt) || 0;
  const abs = Math.abs(value);
  return `${value < 0 ? "-" : ""}৳${abs.toLocaleString("en-US", {
    minimumFractionDigits: abs > 0 && abs < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Format a USD amount in the selected display currency. */
export function formatMoney(usd: number, currency: CurrencyCode): string {
  return currency === "BDT" ? formatBdt(usdToBdt(usd)) : formatUsdAmount(usd);
}

/** "৳1,830 · $15.00" — used where both figures matter (headline numbers). */
export function formatDual(usd: number, currency: CurrencyCode): string {
  return currency === "BDT"
    ? `${formatBdt(usdToBdt(usd))} · ${formatUsdAmount(usd)}`
    : `${formatUsdAmount(usd)} · ${formatBdt(usdToBdt(usd))}`;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return value === "USD" || value === "BDT";
}
