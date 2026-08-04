/**
 * Admin currency switch (BDT ⇄ USD).
 *
 * Stored amounts never change — this only decides how the admin console renders
 * money. The choice is remembered per browser.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import {
  BDT_PER_USD,
  CURRENCY_STORAGE_KEY,
  formatDual,
  formatMoney,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";
import { cn } from "@/lib/utils";

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (next: CurrencyCode) => void;
  /** Format a USD amount in the selected currency. */
  money: (usd: number) => string;
  /** Format a USD amount showing both currencies, selected one first. */
  dual: (usd: number) => string;
  rate: number;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function AdminCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("BDT");

  useEffect(() => {
    const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (isCurrencyCode(stored)) setCurrencyState(stored);
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCurrencyState(next);
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      money: (usd: number) => formatMoney(usd, currency),
      dual: (usd: number) => formatDual(usd, currency),
      rate: BDT_PER_USD,
    }),
    [currency, setCurrency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Safe outside the provider too — falls back to USD formatting. */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  return {
    currency: "USD",
    setCurrency: () => {},
    money: (usd: number) => formatMoney(usd, "USD"),
    dual: (usd: number) => formatDual(usd, "USD"),
    rate: BDT_PER_USD,
  };
}

const OPTIONS: { id: CurrencyCode; label: string }[] = [
  { id: "BDT", label: "৳ BDT" },
  { id: "USD", label: "$ USD" },
];

/** Header pill: pick the currency the whole console reports in. */
export function CurrencyToggle({
  className,
  tone = "light",
}: {
  className?: string;
  /** "dark" = sitting on the gradient header, so labels go white. */
  tone?: "light" | "dark";
}) {
  const { currency, setCurrency, rate } = useCurrency();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "hidden items-center gap-1 text-2xs xl:flex",
          tone === "dark" ? "text-white/60" : "text-ink-500",
        )}
      >
        <Repeat className="h-3 w-3" aria-hidden />1 USD = ৳{rate}
      </span>
      <div
        role="group"
        aria-label="Reporting currency"
        className="flex gap-1 rounded-full border border-ink-200 bg-white p-1 shadow-ds-xs"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={currency === option.id}
            onClick={() => setCurrency(option.id)}
            className={cn(
              "rounded-full px-2.5 py-1 text-2xs font-semibold transition",
              currency === option.id
                ? "bg-[color:var(--color-iris)] text-[color:var(--color-iris-fg)]"
                : "text-ink-600 hover:bg-ink-100",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
