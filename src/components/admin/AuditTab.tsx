import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { listAdminAudit, type AdminAuditRow } from "@/lib/admin-api";
import { EmptyState, Pill } from "./ui";

export function AuditTab() {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void listAdminAudit().then((res) => {
      if (!alive) return;
      setRows(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-ink-200/70 bg-ink-100/70"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No admin actions yet"
        description="Every plan change, credit adjustment and setting update will appear here with actor and payload."
      />
    );
  }

  return (
    <ol className="relative space-y-2 border-l border-ink-200 pl-4">
      {rows.map((row) => (
        <li
          key={row.id}
          className="relative rounded-2xl border border-ink-200/80 bg-white/85 p-3 shadow-ds-xs"
        >
          <span
            aria-hidden
            className="absolute -left-[21px] top-5 h-2 w-2 rounded-full ring-4 ring-ink-100"
            style={{ background: "var(--color-iris)" }}
          />
          <div className="flex flex-wrap items-baseline gap-2">
            <Pill tone="accent">{row.action}</Pill>
            <span className="text-xs text-ink-500">
              {row.targetTable ?? "—"}
              {row.targetId ? ` · ${row.targetId}` : ""}
            </span>
            <span className="ml-auto text-2xs text-ink-400">
              {new Date(row.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5 text-xs text-ink-600">by {row.actorId ?? "system"}</div>
          {row.details && Object.keys(row.details).length > 0 && (
            <pre className="mt-2 overflow-x-auto rounded-xl border border-ink-200/70 bg-ink-100/70 p-2 font-mono text-2xs leading-relaxed text-ink-700">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}
