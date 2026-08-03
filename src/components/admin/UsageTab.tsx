import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Cpu, DollarSign, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchUsageReport,
  type UsageReport,
  type UsageRequestRow,
} from "@/lib/admin-api";
import { ACTION_RULES, formatCredits, type CreditAction } from "@/lib/credits";
import { formatUsd } from "@/lib/credit-ledger";

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

const actionLabel = (action: string) =>
  ACTION_RULES[action as CreditAction]?.label ?? action;

const shortModel = (value: string | null) => value?.split("/").pop() ?? "—";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function UsageTab() {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<UsageReport>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setReport(await fetchUsageReport(range));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const users = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return report.users;
    return report.users.filter((u) =>
      `${u.email ?? ""} ${u.displayName ?? ""}`.toLowerCase().includes(term),
    );
  }, [report.users, search]);

  const requests: UsageRequestRow[] = useMemo(
    () =>
      selected ? report.requests.filter((r) => r.userId === selected) : report.requests,
    [report.requests, selected],
  );

  const selectedUser = report.users.find((u) => u.userId === selected) ?? null;

  return (
    <div className="space-y-4">
      {/* Range + totals */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Usage range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                days === r.days
                  ? "border-[color:var(--color-iris)] bg-[color:var(--color-iris)]/10 font-medium text-ink-900"
                  : "border-ink-200 bg-white text-ink-600 hover:bg-ink-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(days)} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Coins className="h-4 w-4" aria-hidden />} label="Requests" value={String(report.totals.requests)} />
        <StatCard icon={<Coins className="h-4 w-4" aria-hidden />} label="Credits used" value={formatCredits(report.totals.credits)} />
        <StatCard icon={<Cpu className="h-4 w-4" aria-hidden />} label="Tokens" value={report.totals.tokens.toLocaleString()} />
        <StatCard icon={<DollarSign className="h-4 w-4" aria-hidden />} label="Provider cost" value={formatUsd(report.totals.costUsd)} />
      </div>

      {/* Side-by-side: users | per-request breakdown */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="rounded-xl border border-ink-200 bg-white">
          <header className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-medium text-ink-900">Usage per user</h2>
            <span className="text-xs text-ink-500">{users.length}</span>
          </header>
          <div className="p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email or name"
              className="h-9 text-sm"
              aria-label="Search users"
            />
          </div>
          <ul className="max-h-[32rem] divide-y divide-ink-200 overflow-y-auto">
            {loading && <li className="px-4 py-6 text-sm text-ink-500">Loading usage…</li>}
            {!loading && users.length === 0 && (
              <li className="px-4 py-6 text-sm text-ink-500">No usage in this range.</li>
            )}
            {users.map((u) => {
              const active = selected === u.userId;
              return (
                <li key={u.userId}>
                  <button
                    type="button"
                    onClick={() => setSelected(active ? null : u.userId)}
                    aria-pressed={active}
                    className={`w-full px-4 py-3 text-left transition ${
                      active ? "bg-[color:var(--color-iris)]/8" : "hover:bg-ink-100"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-ink-900">
                        {u.displayName ?? u.email ?? `Account ${u.userId.slice(0, 8)}`}
                        {u.displayName && u.email && (
                          <span className="ml-1.5 font-normal text-ink-500">{u.email}</span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full border border-ink-200 px-2 py-0.5 text-[11px] uppercase tracking-wide text-ink-500">
                        {u.plan}
                      </span>
                    </div>

                    <dl className="mt-1.5 grid grid-cols-4 gap-2 text-[11px] text-ink-500">
                      <Cell label="reqs" value={String(u.requests)} />
                      <Cell label="credits" value={formatCredits(u.credits)} />
                      <Cell label="tokens" value={u.tokens.toLocaleString()} />
                      <Cell label="cost" value={formatUsd(u.costUsd)} />
                    </dl>
                    {u.refunded > 0 && (
                      <p className="mt-1 text-[11px] text-ink-500">
                        refunded {formatCredits(u.refunded)}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-xl border border-ink-200 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-medium text-ink-900">
              Per-request breakdown
              {selectedUser && (
                <span className="ml-1.5 font-normal text-ink-500">
                  — {selectedUser.email ?? selectedUser.userId.slice(0, 8)}
                </span>
              )}
            </h2>
            {selected && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Show all users
              </Button>
            )}
          </header>
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="sticky top-0 bg-ink-100/80 text-left text-xs uppercase tracking-wide text-ink-500 backdrop-blur">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">When</th>
                  {!selected && <th scope="col" className="px-4 py-2 font-medium">User</th>}
                  <th scope="col" className="px-4 py-2 font-medium">Action</th>
                  <th scope="col" className="px-4 py-2 font-medium">Model</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Tokens</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">cost_usd</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {!loading && requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-sm text-ink-500">
                      No requests recorded in this range.
                    </td>
                  </tr>
                )}
                {requests.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500">
                      {when(r.createdAt)}
                    </td>
                    {!selected && (
                      <td className="max-w-[12rem] truncate px-4 py-2.5 text-xs text-ink-600">
                        {r.email ?? r.userId.slice(0, 8)}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-ink-900">
                      {actionLabel(r.action)}
                      <span className="ml-1.5 text-[11px] uppercase tracking-wide text-ink-500">
                        {r.tier}
                      </span>
                      {r.reversedAt && (
                        <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">
                          rolled back
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-ink-900">
                        {shortModel(r.upstreamModel ?? r.model)}
                      </span>
                      {r.upstreamModel && (
                        <span className="block font-mono text-[10px] text-ink-500">
                          {r.upstreamModel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600">
                      {r.tokens ? r.tokens.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600">
                      {r.costUsd ? formatUsd(r.costUsd) : "—"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono text-xs ${
                        r.credits < 0 ? "text-emerald-600" : "text-ink-900"
                      }`}
                    >
                      {r.credits < 0 ? `+${formatCredits(Math.abs(r.credits))}` : formatCredits(r.credits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-500">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 font-display text-xl font-semibold tracking-tight text-ink-900">{value}</p>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="uppercase tracking-wide">{label}</dt>
      <dd className="font-mono text-[12px] text-ink-900">{value}</dd>
    </div>
  );
}
