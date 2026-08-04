import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, RefreshCw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchRequestTraces, type RequestTraceRow, type TraceReport } from "@/lib/admin-api";
import { formatUsd } from "@/lib/credit-ledger";
import { formatCredits } from "@/lib/credits";
import { cn } from "@/lib/utils";

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

const EMPTY: TraceReport = {
  rows: [],
  totals: { requests: 0, errors: 0, fallbacks: 0, avgLatencyMs: 0, costUsd: 0 },
};

const shortModel = (value: string | null) => value?.split("/").pop() ?? "—";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ok"
      ? "bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]"
      : status === "blocked"
        ? "bg-[color:var(--color-sun-soft)] text-[color:var(--color-sun)]"
        : "bg-[color:var(--color-flare-soft)] text-[color:var(--color-flare)]";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold capitalize", tone)}>
      {status}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-2 text-ink-500">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-2xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 font-display text-xl font-semibold tracking-tight text-ink-900">{value}</p>
      {hint ? <p className="mt-0.5 text-2xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

function AttemptChain({ row }: { row: RequestTraceRow }) {
  if (row.attempts.length === 0) return <span className="text-ink-400">no provider call</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {row.attempts.map((a, i) => (
        <span key={`${a.model}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span className="text-ink-400">→</span> : null}
          <span
            title={a.error ?? undefined}
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-2xs",
              a.ok
                ? "bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]"
                : "bg-[color:var(--color-flare-soft)] text-[color:var(--color-flare)]",
            )}
          >
            {shortModel(a.model)} · {a.ms}ms
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Admin-only view of model routing: which model handled each request, which
 * fallbacks fired, latency, tokens and cost — keyed by the trace id that the
 * API returns to the client. Users never see this data (RLS blocks the table).
 */
export function TracesTab() {
  const [days, setDays] = useState<number>(7);
  const [report, setReport] = useState<TraceReport>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setReport(await fetchRequestTraces(range));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return report.rows.filter((r) => {
      if (onlyProblems && r.status === "ok" && r.fallbackCount === 0) return false;
      if (!term) return true;
      return `${r.traceId} ${r.email ?? ""} ${r.finalModel ?? ""} ${r.primaryModel ?? ""} ${r.mode ?? ""} ${r.task ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [report.rows, search, onlyProblems]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CheckCircle2}
          label="Requests"
          value={String(report.totals.requests)}
          hint={`last ${days === 1 ? "24 hours" : `${days} days`}`}
        />
        <Metric
          icon={AlertTriangle}
          label="Failures"
          value={String(report.totals.errors)}
          hint="error or credit-blocked"
        />
        <Metric
          icon={GitBranch}
          label="Fallbacks used"
          value={String(report.totals.fallbacks)}
          hint="primary model failed"
        />
        <Metric
          icon={Timer}
          label="Avg latency"
          value={`${report.totals.avgLatencyMs} ms`}
          hint={`provider cost ${formatUsd(report.totals.costUsd)}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-ink-200 bg-white p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                days === r.days ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search trace id, email or model…"
          className="h-9 w-full sm:w-72"
          aria-label="Search traces"
        />
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
            className="h-3.5 w-3.5 accent-[color:var(--color-iris)]"
          />
          Only failures & fallbacks
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(days)}
          disabled={loading}
          className="ml-auto"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="bg-ink-50 text-2xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Time</th>
                <th className="px-4 py-2.5 font-semibold">Trace</th>
                <th className="px-4 py-2.5 font-semibold">User</th>
                <th className="px-4 py-2.5 font-semibold">Mode / task</th>
                <th className="px-4 py-2.5 font-semibold">Routing</th>
                <th className="px-4 py-2.5 text-right font-semibold">Tokens</th>
                <th className="px-4 py-2.5 text-right font-semibold">Cost</th>
                <th className="px-4 py-2.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-500">
                    {loading ? "Loading traces…" : "No traces recorded in this window."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="cursor-pointer border-t border-ink-100 align-top hover:bg-ink-50/60"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink-600">
                        {when(r.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-2xs text-ink-700">{r.traceId}</td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-ink-700">
                        {r.email ?? r.userId?.slice(0, 8) ?? "anon"}
                      </td>
                      <td className="px-4 py-2.5 text-ink-600">
                        {r.mode || r.endpoint}
                        <span className="text-ink-400"> · {r.task ?? "—"}</span>
                        <span className="block text-2xs text-ink-400">{r.plan ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <AttemptChain row={r} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">
                        {r.inputTokens + r.outputTokens}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">
                        {formatUsd(r.costUsd)}
                        <span className="block text-2xs text-ink-400">
                          {formatCredits(r.creditsCharged)} cr
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                    {expanded === r.id ? (
                      <tr className="border-t border-ink-100 bg-ink-50/50">
                        <td colSpan={8} className="px-4 py-3">
                          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <dt className="text-2xs uppercase tracking-wider text-ink-500">
                                Primary model
                              </dt>
                              <dd className="font-mono text-2xs text-ink-800">
                                {r.primaryModel ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-2xs uppercase tracking-wider text-ink-500">
                                Served by
                              </dt>
                              <dd className="font-mono text-2xs text-ink-800">
                                {r.finalModel ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-2xs uppercase tracking-wider text-ink-500">
                                Prompt size
                              </dt>
                              <dd className="text-2xs text-ink-800">{r.promptChars} chars</dd>
                            </div>
                            <div>
                              <dt className="text-2xs uppercase tracking-wider text-ink-500">
                                Latency
                              </dt>
                              <dd className="text-2xs text-ink-800">{r.latencyMs} ms</dd>
                            </div>
                          </dl>
                          {r.errorMessage ? (
                            <p className="mt-2 rounded-lg bg-[color:var(--color-flare-soft)] px-3 py-2 font-mono text-2xs break-words text-[color:var(--color-flare)]">
                              {r.errorMessage}
                            </p>
                          ) : null}
                          {r.threadId ? (
                            <p className="mt-2 text-2xs text-ink-500">
                              Thread <span className="font-mono">{r.threadId}</span>
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-2xs text-ink-500">
        Traces are private admin telemetry. Users only receive the opaque trace id with their
        response, so routing, fallbacks and provider cost stay internal.
      </p>
    </div>
  );
}
