import { useMemo, useState } from "react";
import { ChevronDown, Compass, MousePointerClick, Code2, Camera, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TranscriptRow {
  id: string;
  seq: number;
  attempt: number;
  kind: string;
  label: string;
  ok: boolean;
  duration_ms: number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface TranscriptShot {
  id: string;
  attempt: number;
  kind: string;
  caption: string | null;
  data_url: string;
}

type Group = "navigation" | "action" | "dom" | "shot" | "other";

const GROUP_META: Record<Group, { label: string; icon: typeof Compass }> = {
  navigation: { label: "Navigation", icon: Compass },
  action: { label: "Interaction", icon: MousePointerClick },
  dom: { label: "DOM change", icon: Code2 },
  shot: { label: "Screenshot", icon: Camera },
  other: { label: "Step", icon: AlertTriangle },
};

/** Classifies an audit row so the transcript can label it like a browser trace. */
export function classifyAgentStep(row: Pick<TranscriptRow, "kind" | "label">): Group {
  const key = `${row.kind} ${row.label}`.toLowerCase();
  if (/nav|goto|url|redirect|load/.test(key)) return "navigation";
  if (/click|type|fill|press|submit|select|scroll|hover|upload/.test(key)) return "action";
  if (/dom|mutation|selector|element|render|text|attribute/.test(key)) return "dom";
  if (/screenshot|shot|capture/.test(key)) return "shot";
  return "other";
}

function detailLines(detail: Record<string, unknown> | null): Array<[string, string]> {
  if (!detail) return [];
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 12)
    .map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]);
}

/**
 * Browser-agent transcript: the executed actions, navigation events and DOM
 * changes of one run, grouped by attempt with per-attempt screenshots.
 */
export function AgentTranscript({
  rows,
  shots,
}: {
  rows: TranscriptRow[];
  shots: TranscriptShot[];
}) {
  const attempts = useMemo(() => {
    const map = new Map<number, TranscriptRow[]>();
    for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
      const list = map.get(row.attempt) ?? [];
      list.push(row);
      map.set(row.attempt, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  if (rows.length === 0)
    return <p className="text-sm text-ink-500">No transcript recorded for this run yet.</p>;

  return (
    <div data-testid="agent-transcript" className="space-y-3">
      {attempts.map(([attempt, steps]) => (
        <div key={attempt} className="rounded-xl border border-ink-200 bg-white">
          <header className="flex items-center gap-2 border-b border-ink-200/70 px-3 py-2">
            <h5 className="flex-1 text-xs font-semibold text-ink-900">Attempt {attempt || 1}</h5>
            <span className="font-mono text-2xs text-ink-500">
              {steps.length} steps ·{" "}
              {steps.filter((s) => classifyAgentStep(s) === "navigation").length} navigations ·{" "}
              {steps.filter((s) => !s.ok).length} failed
            </span>
          </header>
          <ol className="divide-y divide-ink-100">
            {steps.map((row) => (
              <TranscriptStep key={row.id} row={row} />
            ))}
          </ol>
          {shots.filter((shot) => shot.attempt === attempt).length > 0 ? (
            <div className="flex gap-2 overflow-x-auto border-t border-ink-200/70 p-2">
              {shots
                .filter((shot) => shot.attempt === attempt)
                .map((shot) => (
                  <figure key={shot.id} className="w-40 shrink-0">
                    <img
                      src={shot.data_url}
                      alt={shot.caption ?? `Agent screenshot (${shot.kind})`}
                      className="h-24 w-full rounded-lg border border-ink-200 object-cover"
                      loading="lazy"
                    />
                    <figcaption className="mt-1 truncate text-2xs text-ink-500">
                      {shot.caption ?? shot.kind}
                    </figcaption>
                  </figure>
                ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TranscriptStep({ row }: { row: TranscriptRow }) {
  const [open, setOpen] = useState(false);
  const group = classifyAgentStep(row);
  const meta = GROUP_META[group];
  const Icon = meta.icon;
  const lines = detailLines(row.detail);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={lines.length === 0}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-ink-50/70 disabled:hover:bg-transparent"
      >
        <Icon
          className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", row.ok ? "text-ink-400" : "text-rose-500")}
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", row.ok ? "text-ink-800" : "text-rose-700")}>
            {row.label}
          </span>
          <span className="block font-mono text-2xs text-ink-400">
            {meta.label}
            {row.duration_ms != null ? ` · ${row.duration_ms}ms` : ""} ·{" "}
            {new Date(row.created_at).toLocaleTimeString()}
          </span>
        </span>
        {lines.length > 0 ? (
          <ChevronDown
            className={cn(
              "mt-1 h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform",
              open && "rotate-180",
            )}
          />
        ) : null}
      </button>
      {open && lines.length > 0 ? (
        <dl className="space-y-1 border-t border-ink-100 bg-ink-50/60 px-3 py-2">
          {lines.map(([key, value]) => (
            <div key={key} className="flex gap-2 font-mono text-2xs">
              <dt className="w-24 shrink-0 text-ink-500">{key}</dt>
              <dd className="min-w-0 break-all text-ink-700">{value.slice(0, 400)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export default AgentTranscript;
