import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Coins,
  Cpu,
  DollarSign,
  Layers,
  Percent,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchUsageReport, type UsageReport } from "@/lib/admin-api";
import { formatUsd } from "@/lib/credit-ledger";
import { formatCredits } from "@/lib/credits";
import { DEFAULT_PRICE_PER_CREDIT, profitSummary, type ProfitRow } from "@/lib/profit";
import { EmptyState, Panel, Pill, SectionHeading, StatCard, StatSkeleton } from "@/components/admin/ui";

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

const EMPTY: UsageReport = {
  users: [],
  requests: [],
  totals: { requests: 0, credits: 0, tokens: 0, costUsd: 0 },
};

const shortModel = (value: string) => value.split("/").pop() ?? value;

/**
 * Admin-only margin view: what credits were sold for, what the upstream calls
 * actually cost, and where the profit comes from (action, engine, customer).
 */
export function ProfitTab() {
  const [days, setDays] = useState<number>(30);
  const [price, setPrice] = useState<string>(String(DEFAULT_PRICE_PER_CREDIT));
  const [report, setReport] = useState<UsageReport>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setReport(await fetchUsageReport(range));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const perCredit = Number(price) > 0 ? Number(price) : DEFAULT_PRICE_PER_CREDIT;
  const summary = useMemo(() => profitSummary(report, perCredit), [report, perCredit]);

  const healthy = summary.multiple >= 3;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-full border border-ink-200 bg-white p-1 shadow-ds-xs" role="group" aria-label="Profit range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                days === r.days
                  ? "bg-[color:var(--color-iris)] font-semibold text-[color:var(--color-iris-fg)] shadow-ds-xs"
                  : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-500">
          Sell price / credit
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="h-9 w-24 font-mono text-sm"
            aria-label="Sell price per credit in USD"
          />
        </label>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void load(days)}
          disabled={loading}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </div>

      {/* Hero margin strip */}
      <section
        className="relative overflow-hidden rounded-3xl p-5 text-[color:var(--color-iris-fg)] shadow-ds-lg sm:p-6"
        style={{ background: "var(--admin-gradient)" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--premium-gradient)" }}
        />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wider text-white/55">
              Gross profit · last {days === 1 ? "24h" : `${days} days`}
            </p>
            <p className="mt-1 font-display text-4xl font-semibold tracking-tight">
              {formatUsd(summary.profitUsd)}
            </p>
            <p className="mt-1.5 text-xs text-white/60">
              {formatUsd(summary.revenueUsd)} sold · {formatUsd(summary.costUsd)} engine cost ·{" "}
              {formatCredits(summary.credits)} credits over {summary.requests} billed requests
            </p>
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            <HeroChip label="Margin" value={`${summary.marginPct}%`} />
            <HeroChip label="Cost multiple" value={`${summary.multiple}×`} tone={healthy ? "good" : "warn"} />
            <HeroChip label="Cost / credit" value={formatUsd(summary.costPerCredit)} />
          </div>
        </div>

        <div className="relative mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full"
              style={{
                width: `${Math.max(2, Math.min(100, (summary.costUsd / Math.max(summary.revenueUsd, 1e-9)) * 100))}%`,
                background: "var(--color-flare)",
              }}
            />
            <div className="h-full flex-1" style={{ background: "var(--color-mint)" }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-2xs text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-flare)" }} />
              Engine cost
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-mint)" }} />
              Retained margin
            </span>
            <span className="ml-auto">
              Safe floor at 3× cost: {formatUsd(summary.breakEvenPrice)} / credit
            </span>
          </div>
        </div>
      </section>

      {/* Metric grid */}
      {loading ? (
        <StatSkeleton count={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Revenue"
            value={formatUsd(summary.revenueUsd)}
            icon={Wallet}
            accent="var(--color-iris)"
            hint={`At ${formatUsd(perCredit)} per credit`}
          />
          <StatCard
            label="Engine cost"
            value={formatUsd(summary.costUsd)}
            icon={DollarSign}
            accent="var(--color-flare)"
            progress={summary.revenueUsd > 0 ? summary.costUsd / summary.revenueUsd : 0}
            hint={`${formatUsd(summary.costPerCredit)} average per credit`}
          />
          <StatCard
            label="Margin"
            value={`${summary.marginPct}%`}
            icon={Percent}
            accent="var(--color-mint)"
            progress={Math.max(0, summary.marginPct / 100)}
            delta={healthy ? `${summary.multiple}× safe` : `${summary.multiple}× tight`}
            hint={healthy ? "Comfortably above the 3× floor" : "Below the 3× safety multiple"}
          />
          <StatCard
            label="Credits sold"
            value={formatCredits(summary.credits)}
            icon={Coins}
            accent="var(--color-orchid)"
            hint={`${summary.requests} billed requests`}
          />
        </div>
      )}

      {/* Breakdowns */}
      <SectionHeading
        title="Where the margin comes from"
        hint="Revenue, engine cost and retained profit per action, engine and customer."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ProfitPanel
          title="By action"
          description="Which product surfaces earn the most"
          icon={Layers}
          accent="var(--color-iris)"
          rows={summary.byAction}
          loading={loading}
        />
        <ProfitPanel
          title="By engine"
          description="Upstream model spend (admin-only)"
          icon={Cpu}
          accent="var(--color-orchid)"
          rows={summary.byModel.map((r) => ({ ...r, label: shortModel(r.label), sub: r.key }))}
          loading={loading}
        />
      </div>

      <ProfitPanel
        title="Top customers by margin"
        description="Highest revenue accounts in this window"
        icon={Users}
        accent="var(--color-mint)"
        rows={summary.byUser}
        loading={loading}
        showRank
      />
    </div>
  );
}

function HeroChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const ring =
    tone === "good"
      ? "ring-[color:var(--color-mint)]/50"
      : tone === "warn"
        ? "ring-[color:var(--color-sun)]/60"
        : "ring-white/20";
  return (
    <div className={`rounded-2xl bg-white/10 px-3.5 py-2 ring-1 ring-inset ${ring}`}>
      <p className="text-2xs font-semibold uppercase tracking-wider text-white/55">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold leading-none tracking-tight">{value}</p>
    </div>
  );
}

function ProfitPanel({
  title,
  description,
  icon,
  accent,
  rows,
  loading,
  showRank = false,
}: {
  title: string;
  description: string;
  icon: typeof TrendingUp;
  accent: string;
  rows: ProfitRow[];
  loading: boolean;
  showRank?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.revenueUsd), 0.000001);

  return (
    <Panel title={title} description={description} icon={icon} accent={accent} bodyClassName="p-0">
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-ink-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={BadgePercent}
            title="No billable activity yet"
            description="Once customers run builds in this window, revenue and margin appear here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-ink-200/70">
          {rows.map((row, index) => (
            <li key={row.key} className="px-4 py-3 transition hover:bg-ink-100/60">
              <div className="flex items-baseline gap-2">
                {showRank && (
                  <span className="w-5 shrink-0 font-mono text-2xs text-ink-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{row.label}</p>
                  {row.sub && (
                    <p className="truncate font-mono text-2xs text-ink-500">{row.sub}</p>
                  )}
                </div>
                <div className="ml-auto flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold text-ink-900">
                    {formatUsd(row.profitUsd)}
                  </span>
                  <Pill tone={row.marginPct >= 66 ? "good" : row.marginPct >= 33 ? "warn" : "bad"}>
                    {row.marginPct}%
                  </Pill>
                </div>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200/70">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (row.revenueUsd / max) * 100)}%`,
                    background: `linear-gradient(90deg, ${accent}, var(--color-iris-cyan))`,
                  }}
                />
              </div>

              <dl className="mt-2 grid grid-cols-4 gap-2 text-2xs text-ink-500">
                <Metric label="revenue" value={formatUsd(row.revenueUsd)} />
                <Metric label="cost" value={formatUsd(row.costUsd)} />
                <Metric label="credits" value={formatCredits(row.credits)} />
                <Metric label="requests" value={String(row.requests)} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="uppercase tracking-wider">{label}</dt>
      <dd className="font-mono text-xs text-ink-900">{value}</dd>
    </div>
  );
}
