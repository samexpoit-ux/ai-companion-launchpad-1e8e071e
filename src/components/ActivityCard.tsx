import { useState } from "react";
import { Check, ChevronDown, Coins, Loader2, Eye, ListTree, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreview } from "@/components/preview-context";
import type { ArtifactProject } from "@/lib/artifact";
import {
  chargeExplanation,
  formatCredits,
  type ChargeLine,
  type CreditAction,
} from "@/lib/credits";

function chargeLines(charge: ChargeSummary): ChargeLine[] {
  return chargeExplanation(charge.action, {
    credits: charge.credits,
    inputTokens: charge.inputTokens,
    outputTokens: charge.outputTokens,
    fileCount: charge.fileCount,
  });
}

export interface ActivityStep {
  label: string;
  detail?: string;
  done?: boolean;
}

/**
 * Lovable-style turn card: a one-line status header with `Details` and
 * `Preview` affordances. `Details` reveals what the model did (routing,
 * reasoning, files written); `Preview` pushes the result into the right-hand
 * live workspace.
 */
export interface ChargeSummary {
  action: CreditAction;
  credits?: number;
  inputTokens?: number;
  outputTokens?: number;
  fileCount?: number;
  /** Admin-only: real upstream provider spend for this turn. */
  costUsd?: number;
  /** Admin-only: the engines that were actually called. */
  models?: string[];
}

export function ActivityCard({
  title,
  steps,
  busy = false,
  project = null,
  charge = null,
  adminView = false,
  messageId = "turn",
  durationMs,
}: {
  title: string;
  steps: ActivityStep[];
  busy?: boolean;
  /** Identifies the turn so the side panel can highlight the open one. */
  messageId?: string;
  durationMs?: number;
  project?: ArtifactProject | null;
  /** Per-turn credit breakdown; customers see workload only, never engines. */
  charge?: ChargeSummary | null;
  adminView?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { payload, openProject, openWorkspace, setTab, openTimeline, timeline } = usePreview();
  const canPreview = Boolean(project) || Boolean(payload);

  const detailsOpen = timeline?.messageId === messageId;

  /**
   * Lovable behaviour: `Details` sends the turn's trajectory to the right-hand
   * panel (with "Back to latest" to return to preview/code/console). On narrow
   * screens there is no side panel, so it falls back to the inline list.
   */
  const showDetails = () => {
    const narrow = typeof window !== "undefined" && window.innerWidth < 768;
    if (narrow) {
      setOpen((o) => !o);
      return;
    }
    openTimeline({
      messageId,
      title,
      steps: steps.map((s) => ({ label: s.label, detail: s.detail })),
      files: project?.order ?? [],
      charge: charge
        ? chargeLines(charge).map((line) => ({ label: line.label, detail: line.detail }))
        : undefined,
      durationMs,
      at: Date.now(),
    });
  };

  const showPreview = () => {
    if (project) openProject(project);
    else {
      openWorkspace();
      setTab("preview");
    }
  };

  return (
    <div
      data-testid="activity-card"
      className="not-prose mb-3 overflow-hidden rounded-lg border border-ink-200 bg-white/80 shadow-ds-sm"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            busy ? "text-[color:var(--color-iris)]" : "text-[color:var(--color-iris)]",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
          ) : (
            <Check className="h-4 w-4" strokeWidth={2.75} />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium text-ink-900",
            busy && "animate-pulse",
          )}
        >
          {title}
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-ink-200/70 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="activity-details"
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
        >
          <ListTree className="h-3.5 w-3.5" />
          Details
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-ink-400 transition-transform", open && "rotate-180")}
          />
        </button>
        <button
          type="button"
          onClick={showDetails}
          title="Open this turn in the side timeline"
          aria-label="Open this turn in the side timeline"
          className={cn(
            "hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-ink-500 transition hover:text-ink-900 md:inline-flex",
            detailsOpen
              ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-900"
              : "border-ink-200 bg-white hover:border-ink-300",
          )}
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={showPreview}
          disabled={!canPreview}
          className={cn(
            "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition",
            canPreview
              ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-900 hover:brightness-105"
              : "cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400",
          )}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-ink-200/70 bg-ink-100/50 px-3 py-3 text-xs">
          <Disclosure
            icon={<BrainCircuit className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />}
            title="How this was thought through"
            meta={`${steps.length} step${steps.length === 1 ? "" : "s"}`}
            defaultOpen
          >
            {steps.length === 0 ? (
              <p className="text-ink-500">No activity recorded for this turn.</p>
            ) : (
              <ol className="space-y-1">
                {steps.map((s, i) => (
                  <li key={`${s.label}-${i}`} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-iris)]/70" />
                    <span className="min-w-0">
                      <span className="font-medium text-ink-800">{s.label}</span>
                      {s.detail && (
                        <span className="ml-1.5 break-words font-mono text-2xs text-ink-500">
                          {s.detail}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Disclosure>

          {project && (
            <Disclosure
              icon={<FileCode2 className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />}
              title="Edited files"
              meta={`${project.order.length} file${project.order.length === 1 ? "" : "s"}`}
            >
              <ul className="max-h-44 overflow-auto">
                {project.order.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => {
                        openProject(project);
                        setTab("code");
                      }}
                      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-2xs leading-5 text-ink-600 transition hover:bg-white hover:text-ink-900"
                      title={`Open ${path} in the code view`}
                    >
                      <FileCode2 className="h-3 w-3 shrink-0 text-ink-400" />
                      <span className="truncate">{path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          {charge && (
            <Disclosure
              icon={<Coins className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />}
              title="Credits used and why"
              meta={charge.credits != null ? formatCredits(charge.credits) : undefined}
            >
              <ul className="space-y-1">
                {chargeLines(charge).map((line: ChargeLine) => (
                  <li key={line.label} className="flex gap-2">
                    <span className="shrink-0 text-ink-700">{line.label}</span>
                    <span className="min-w-0 break-words text-ink-500">{line.detail}</span>
                  </li>
                ))}
                {adminView && charge.models && charge.models.length > 0 && (
                  <li className="flex gap-2">
                    <span className="shrink-0 text-ink-700">API calls</span>
                    <span className="min-w-0 break-words font-mono text-2xs text-ink-500">
                      {charge.models.join(" → ")}
                    </span>
                  </li>
                )}
                {adminView && charge.costUsd != null && (
                  <li className="flex gap-2">
                    <span className="shrink-0 text-ink-700">Provider cost</span>
                    <span className="font-mono text-2xs text-ink-500">
                      ${charge.costUsd.toFixed(4)}
                    </span>
                  </li>
                )}
              </ul>
            </Disclosure>
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsible sub-section inside a turn card's inline details. */
function Disclosure({
  icon,
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string | undefined;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white/80">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-ink-100/60"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{title}</span>
        {meta ? <span className="shrink-0 text-2xs text-ink-500">{meta}</span> : null}
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="border-t border-ink-200/70 px-2.5 py-2">{children}</div> : null}
    </div>
  );
}


/** Builds the Details timeline for a completed assistant turn. */
export function stepsForMessage(opts: {
  /** Only rendered for admin viewers — customers never see engine names. */
  modelName?: string;
  /** True when the viewer holds the admin role. */
  adminView?: boolean;
  action?: CreditAction;
  latencyMs?: number;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  credits?: number;
  fileCount?: number;
  traceId?: string;
  task?: string;
  attempts?: Array<{ model: string; ok: boolean; ms: number; error?: string }>;
}): ActivityStep[] {
  const steps: ActivityStep[] = [
    {
      label: "Understood the request",
      detail: opts.task ? `${opts.task} workflow` : "smart workflow selected",
      done: true,
    },
  ];
  steps.push({
    label: "Planned the delivery",
    detail: opts.fileCount
      ? "component structure and file changes"
      : "response structure and checks",
    done: true,
  });
  if (opts.modelName && opts.adminView) {
    steps.push({ label: "Selected the AI engine", detail: opts.modelName, done: true });
  } else {
    steps.push({
      label: "Selected the best-value engine",
      detail: "smart cost router",
      done: true,
    });
  }
  for (const [index, attempt] of (opts.attempts ?? []).entries()) {
    const timing = attempt.ok
      ? `${attempt.ms}ms`
      : `${attempt.ms}ms · ${attempt.error?.slice(0, 90) ?? "delivery incomplete"}`;
    steps.push({
      label: attempt.ok ? "Delivery check passed" : `Fallback check ${index + 1}`,
      detail: opts.adminView ? `${attempt.model} · ${timing}` : timing,
      done: true,
    });
  }
  steps.push({
    label: "Generated the response",
    detail:
      [
        opts.latencyMs ? `${(opts.latencyMs / 1000).toFixed(2)}s` : null,
        opts.tokens ? `${opts.tokens} total tokens` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    done: true,
  });
  if (opts.inputTokens != null || opts.outputTokens != null) {
    steps.push({
      label: "Measured delivery",
      detail: `${opts.inputTokens ?? 0} input · ${opts.outputTokens ?? 0} output tokens`,
      done: true,
    });
  }
  if (opts.fileCount) {
    steps.push({
      label: "Delivered and previewed files",
      detail: `${opts.fileCount} files`,
      done: true,
    });
  }
  if (opts.credits != null) {
    steps.push({
      label: "Charged credits",
      detail: `${formatCredits(opts.credits)} credits`,
      done: true,
    });
  }
  if (opts.traceId) steps.push({ label: "Recorded this run", detail: opts.traceId, done: true });
  return steps;
}
