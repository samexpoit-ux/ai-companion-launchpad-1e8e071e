/**
 * Browser-agent screenshot gallery.
 *
 * The agent's screenshots are the only way to see what the headless browser
 * actually looked at, so they get a real viewer: a filmstrip of thumbnails,
 * per-attempt filtering, and a full-size lightbox with keyboard navigation.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Download, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentShot {
  id: string;
  kind: string;
  caption: string | null;
  data_url: string;
  attempt: number;
  created_at?: string;
}

export function AgentScreenshotGallery({ shots }: { shots: AgentShot[] }) {
  const [attempt, setAttempt] = useState<number | "all">("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const attempts = useMemo(
    () => Array.from(new Set(shots.map((s) => s.attempt))).sort((a, b) => a - b),
    [shots],
  );

  const visible = useMemo(
    () => (attempt === "all" ? shots : shots.filter((s) => s.attempt === attempt)),
    [shots, attempt],
  );

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null || visible.length === 0) return current;
        return (current + delta + visible.length) % visible.length;
      });
    },
    [visible.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenIndex(null);
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, step]);

  if (shots.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-ink-300 bg-white/60 px-3 py-6 text-center text-sm text-ink-500">
        <Camera className="mx-auto mb-1.5 h-4 w-4 text-ink-400" />
        No screenshots captured for this run yet.
      </div>
    );
  }

  const active = openIndex !== null ? visible[openIndex] : null;

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
          <Camera className="h-3.5 w-3.5" /> Screenshots
          <span className="font-normal normal-case tracking-normal text-ink-400">
            ({shots.length})
          </span>
        </h4>
        {attempts.length > 1 ? (
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Filter screenshots by attempt"
          >
            <FilterChip active={attempt === "all"} onClick={() => setAttempt("all")}>
              All
            </FilterChip>
            {attempts.map((a) => (
              <FilterChip key={a} active={attempt === a} onClick={() => setAttempt(a)}>
                Try {a}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((shot, index) => (
          <figure
            key={shot.id}
            className="group overflow-hidden rounded-lg border border-ink-200 bg-white shadow-ds-xs"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="relative block w-full focus-visible:outline-none"
              aria-label={`Open screenshot: ${shot.caption ?? shot.kind}`}
            >
              <img
                src={shot.data_url}
                alt={shot.caption ?? `Agent screenshot (${shot.kind})`}
                loading="lazy"
                className="aspect-[16/10] w-full bg-ink-100 object-cover object-top transition group-hover:brightness-[0.97]"
              />
              <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/45 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                <Maximize2 className="h-3 w-3" />
              </span>
            </button>
            <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-500">
              <span className="min-w-0 truncate">{shot.caption ?? shot.kind}</span>
              <span className="shrink-0 text-ink-400">try {shot.attempt}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {active ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Agent screenshot viewer"
          className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpenIndex(null)}
        >
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 pb-3 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{active.caption ?? active.kind}</p>
              <p className="text-xs text-white/70">
                {active.kind} · try {active.attempt} ·{" "}
                {(openIndex ?? 0) + 1} of {visible.length}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={active.data_url}
                download={`agent-${active.kind}-${active.attempt}.png`}
                onClick={(e) => e.stopPropagation()}
                className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 hover:bg-white/25"
                aria-label="Download screenshot"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 hover:bg-white/25"
                aria-label="Close viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {visible.length > 1 ? (
              <NavButton side="left" onClick={() => step(-1)} />
            ) : null}
            <img
              src={active.data_url}
              alt={active.caption ?? `Agent screenshot (${active.kind})`}
              className="max-h-full w-auto max-w-full rounded-lg bg-white object-contain shadow-2xl"
            />
            {visible.length > 1 ? <NavButton side="right" onClick={() => step(1)} /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs transition",
        active
          ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-900"
          : "border-ink-200 bg-white text-ink-500 hover:text-ink-800",
      )}
    >
      {children}
    </button>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous screenshot" : "Next screenshot"}
      className={cn(
        "absolute z-10 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30",
        side === "left" ? "left-1" : "right-1",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
