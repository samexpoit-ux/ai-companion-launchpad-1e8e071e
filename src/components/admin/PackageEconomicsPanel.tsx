/**
 * Admin-only package economics: what each credit package earns us directly, and
 * what is left once a reseller takes their discount and commission.
 *
 * Everything is derived from `packageEconomics()` so the admin console, the
 * reseller tab and the pricing page agree on one set of numbers.
 */
import { useMemo, useState } from "react";
import { Coins, Percent, Server, TrendingUp, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/components/admin/currency";
import { formatBdt, usdToBdt } from "@/lib/currency";
import { resellerPriceBdt } from "@/lib/plans";
import { ACTION_RULES, MAX_PROMPT_WORDS, perKWords, type CreditAction } from "@/lib/credits";
import { DEFAULT_ECONOMICS, packageEconomics } from "@/lib/package-economics";
import { Panel, Pill, SectionHeading, StatCard } from "@/components/admin/ui";

const num = (value: string, fallback: number) => (Number(value) > 0 ? Number(value) : fallback);

export function PackageEconomicsPanel({ costPerCredit }: { costPerCredit?: number }) {
  const { money, currency } = useCurrency();
  const [cost, setCost] = useState(
    String(costPerCredit && costPerCredit > 0 ? costPerCredit : DEFAULT_ECONOMICS.costPerCredit),
  );
  const [discount, setDiscount] = useState(String(DEFAULT_ECONOMICS.resellerDiscountPct));
  const [commission, setCommission] = useState(String(DEFAULT_ECONOMICS.commissionPct));
  const [fixed, setFixed] = useState(String(DEFAULT_ECONOMICS.monthlyFixedUsd));
  const [utilisation, setUtilisation] = useState(String(DEFAULT_ECONOMICS.utilisation * 100));

  const rows = useMemo(
    () =>
      packageEconomics({
        costPerCredit: num(cost, DEFAULT_ECONOMICS.costPerCredit),
        resellerDiscountPct: num(discount, DEFAULT_ECONOMICS.resellerDiscountPct),
        commissionPct: num(commission, DEFAULT_ECONOMICS.commissionPct),
        monthlyFixedUsd: num(fixed, DEFAULT_ECONOMICS.monthlyFixedUsd),
        utilisation: num(utilisation, 85) / 100,
      }),
    [cost, discount, commission, fixed, utilisation],
  );

  const safest = rows.filter((r) => r.safe).length;
  const bestReseller = rows.reduce(
    (best, row) => (row.resellerProfitUsd > (best?.resellerProfitUsd ?? -Infinity) ? row : best),
    rows[0],
  );

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Package break-even"
        hint="Direct sale vs reseller sale for every credit package, from real upstream cost."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="block text-xs text-ink-600">
          Upstream cost / credit (USD)
          <Input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="mt-1"
            inputMode="decimal"
          />
        </label>
        <label className="block text-xs text-ink-600">
          Reseller discount (%)
          <Input
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="mt-1"
            inputMode="decimal"
          />
        </label>
        <label className="block text-xs text-ink-600">
          Reseller commission (% — 0 by default)
          <Input
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="mt-1"
            inputMode="decimal"
          />
        </label>
        <label className="block text-xs text-ink-600">
          Fixed monthly spend (USD)
          <Input
            value={fixed}
            onChange={(e) => setFixed(e.target.value)}
            className="mt-1"
            inputMode="decimal"
          />
        </label>
        <label className="block text-xs text-ink-600">
          Credits actually burned (%)
          <Input
            value={utilisation}
            onChange={(e) => setUtilisation(e.target.value)}
            className="mt-1"
            inputMode="decimal"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Packages at 3x safety"
          value={`${safest}/${rows.length}`}
          hint="List price vs worst-case burn"
        />
        <StatCard
          icon={Users}
          label="Best reseller package"
          value={bestReseller?.name ?? "—"}
          hint={bestReseller ? `${money(bestReseller.resellerProfitUsd)} net per unit` : ""}
        />
        <StatCard
          icon={Server}
          label="Fixed spend to cover"
          value={money(num(fixed, 0))}
          hint="Per month, before profit"
        />
        <StatCard
          icon={Percent}
          label="Word cap per prompt"
          value={`${MAX_PROMPT_WORDS.toLocaleString()} words`}
          hint="Enforced in composer and API"
        />
      </div>

      <Panel title="Direct vs reseller" description="Per single package sold" icon={Coins}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="text-2xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-3 py-2">Package</th>
                <th className="px-3 py-2">List</th>
                <th className="px-3 py-2">Wholesale (reseller)</th>
                <th className="px-3 py-2">$/credit</th>
                <th className="px-3 py-2">Upstream</th>
                <th className="px-3 py-2">Direct profit</th>
                <th className="px-3 py-2">Reseller pays</th>
                <th className="px-3 py-2">Commission</th>
                <th className="px-3 py-2">Reseller profit</th>
                <th className="px-3 py-2">Units to break even</th>
                <th className="px-3 py-2">Safety</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200/70">
              {rows.map((row) => (
                <tr key={row.id} className="text-ink-800">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-ink-900">{row.name}</span>
                    <span className="ml-1.5 text-ink-500">{row.credits} cr</span>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {money(row.listUsd)}
                    <span className="ml-1 text-ink-500">
                      {currency === "BDT"
                        ? `$${row.listUsd.toFixed(2)}`
                        : formatBdt(usdToBdt(row.listUsd))}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold">
                    {formatBdt(resellerPriceBdt(row.id))}
                  </td>
                  <td className="px-3 py-2 font-mono">${row.pricePerCredit.toFixed(4)}</td>
                  <td className="px-3 py-2 font-mono">
                    {money(row.upstreamUsd)}
                    <span className="ml-1 text-ink-500">/ {money(row.worstCaseUsd)} max</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[color:var(--color-iris-deep)]">
                    {money(row.directProfitUsd)}{" "}
                    <span className="text-ink-500">({row.directMarginPct}%)</span>
                  </td>
                  <td className="px-3 py-2 font-mono">{money(row.resellerPriceUsd)}</td>
                  <td className="px-3 py-2 font-mono">{money(row.commissionUsd)}</td>
                  <td className="px-3 py-2 font-mono">
                    {money(row.resellerProfitUsd)}{" "}
                    <span className="text-ink-500">({row.resellerMarginPct}%)</span>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {finite(row.unitsToBreakEvenDirect)} direct ·{" "}
                    {finite(row.unitsToBreakEvenReseller)} reseller
                  </td>
                  <td className="px-3 py-2">
                    <Pill tone={row.safe ? "good" : "bad"}>{row.multiple}x</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Word-based charge sheet"
        description="What every action costs per 1 000 words of prompt"
        icon={Percent}
      >
        <ul className="divide-y divide-ink-200/70">
          {(Object.keys(ACTION_RULES) as CreditAction[]).map((action) => {
            const rule = ACTION_RULES[action];
            return (
              <li key={action} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                <span className="min-w-40 font-semibold text-ink-900">{rule.label}</span>
                <span className="font-mono text-ink-700">{rule.base} base</span>
                <span className="font-mono text-ink-700">+ {perKWords(action)} / 1k words</span>
                <span className="ml-auto text-ink-500">{rule.note}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

const finite = (value: number) => (Number.isFinite(value) ? String(value) : "never");
