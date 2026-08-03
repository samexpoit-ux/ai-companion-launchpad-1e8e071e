import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { analyzeStack } from "@/lib/stack";

import { ShipDialog } from "@/components/ShipDialog";
import {
  X,
  Code2,
  Eye,
  Terminal,
  RefreshCw,
  Monitor,
  Tablet,
  Smartphone,
  Wand2,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  History,
  GitCompare,
  MoreHorizontal,
  Rocket,
  MousePointerClick,
  Check,
  Layers,
  Square,
  Info,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";
import { CreditMeter } from "@/components/CreditMeter";
import { formatCredits } from "@/lib/credits";
import {
  usePreview,
  FIX_ATTEMPT_CHOICES,
  type FixCharge,
  type FixSkip,
  type PreviewPayload,
  type PreviewDevice,
} from "./preview-context";

// Sandpack touches window at import; keep it out of the SSR graph.
const SandpackStage = lazy(() => import("./SandpackStage"));
// Offline-first renderer for the Preview tab (no remote bundler needed).
const LocalPreview = lazy(() => import("./LocalPreview"));
// Multi-file artifact explorer (file tree + inline editor).
const ProjectExplorer = lazy(() => import("./ProjectExplorer"));
// Diff review gate + patch history + lint/build validation (Babel is client-only).
const PatchReview = lazy(() => import("./PatchReview"));
const VersionHistory = lazy(() => import("./VersionHistory"));
const ValidationBadge = lazy(() => import("./ValidationBadge"));
// Build/runtime failure overlay with logs + next steps.
const ErrorOverlay = lazy(() => import("./ErrorOverlay"));
// Blueprint view for stacks the sandbox cannot execute (Laravel/PHP, Node, SQL, Docker…).
const StackPreview = lazy(() => import("./StackPreview"));
// Lovable-style "Details" trajectory view (timeline + changed files).
const TimelinePanel = lazy(() => import("./TimelinePanel"));


export function PreviewPanel() {
  const {
    isOpen,
    payload,
    closePreview,
    tab,
    setTab,
    device,
    setDevice,
    revision,
    runtimeErrors,
    autoFixEnabled,
    setAutoFixEnabled,
    maxFixAttempts,
    setMaxFixAttempts,
    fixSkip,
    clearFixSkip,
    fixCharge,
    fixStatus,
    fixAttempts,
    fixLog,
    fixError,
    runAutoFix,
    cancelAutoFix,
    resetAutoFix,
    reviewBeforeApply,
    setReviewBeforeApply,
    pendingPatch,
    versions,
    buildError,
    consoleEntries,
    clearConsole,
    selectMode,
    setSelectMode,
    selection,
    setSelection,
    applySelectionText,
    timeline,
  } = usePreview();

  const [reloadKey, setReloadKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { loadStarterProject } = usePreview();
  const credits = useCredits();

  // What kind of project is loaded? Drives the Stack tab and the preview fallback.
  const stackReport = useMemo(
    () => (payload?.files ? analyzeStack(payload.files) : null),
    [payload?.files],
  );



  // Safe run flow: nothing executes in the sandbox until the user explicitly
  // arms this revision. A new AI patch (new revision) re-locks the preview.
  const [armedRevision, setArmedRevision] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    setRunError(null);
  }, [revision]);

  // The preview compiles and runs entirely in the browser sandbox — it costs no
  // credits and never touches the server, so arm every revision automatically.
  useEffect(() => {
    setArmedRevision(revision);
    setReloadKey((k) => k + 1);
  }, [revision]);

  // A repair is billable, so the meter follows the server's authoritative
  // balance from the /api/autofix response instead of a client-side guess.
  useEffect(() => {
    if (!fixCharge) return;
    credits.applyServerBalance(fixCharge);
  }, [fixCharge, credits]);

  const chargedAutoFix = useCallback(async () => {
    if (!credits.canAfford("autofix")) {
      setRunError("Not enough credits for an auto-fix attempt.");
      return;
    }
    clearFixSkip();
    // The /api/autofix route charges the account server-side; refresh after.
    runAutoFix();
    void credits.refresh();
  }, [credits, runAutoFix, clearFixSkip]);

  if (!isOpen) return null;
  // The details timeline replaces the workspace until "Back to latest".
  if (timeline)
    return (
      <Suspense fallback={null}>
        <TimelinePanel view={timeline} />
      </Suspense>
    );
  if (!payload) return <EmptyWorkspace onClose={closePreview} onStart={loadStarterProject} />;

  return (
    <aside
      data-testid="live-workspace"
      className="relative flex h-full min-w-0 flex-col border-l border-ink-200 bg-ink-100"
    >
      {/* Header — Lovable-style single row: segmented tabs left, viewport + actions right */}
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-ink-200 bg-white px-2 sm:px-3">
        <div className="flex min-w-0 shrink items-center gap-0.5 rounded-full border border-ink-200 bg-ink-100 p-0.5 sm:gap-1">
          <TabBtn
            active={tab === "preview"}
            onClick={() => setTab("preview")}
            icon={Eye}
            label="Preview"
          />
          <TabBtn
            active={tab === "code"}
            onClick={() => setTab("code")}
            icon={Code2}
            label="Code"
          />
          <TabBtn
            active={tab === "console"}
            onClick={() => setTab("console")}
            icon={Terminal}
            label="Console"
          />
          {stackReport?.hasBackend && (
            <TabBtn
              active={tab === "stack"}
              onClick={() => setTab("stack")}
              icon={Layers}
              label="Stack"
            />
          )}
        </div>


        <span className="pointer-events-none hidden min-w-0 shrink truncate rounded-full border border-ink-200 bg-ink-100 px-2 py-1 font-mono text-2xs text-ink-500 lg:inline">
          {payload.files ? `${Object.keys(payload.files).length} files` : payload.lang}
        </span>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
          {tab === "preview" && (
            <div className="hidden items-center gap-0.5 rounded-full border border-ink-200 bg-ink-100 p-0.5 sm:flex">
              <DeviceBtn
                active={device === "desktop"}
                onClick={() => setDevice("desktop")}
                icon={Monitor}
                label="Desktop"
              />
              <DeviceBtn
                active={device === "tablet"}
                onClick={() => setDevice("tablet")}
                icon={Tablet}
                label="Tablet"
              />
              <DeviceBtn
                active={device === "mobile"}
                onClick={() => setDevice("mobile")}
                icon={Smartphone}
                label="Mobile"
              />
            </div>
          )}

          <Suspense fallback={null}>
            <ValidationBadge />
          </Suspense>

          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="hidden rounded-full p-1.5 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900 active:scale-95 sm:inline-flex"
            aria-label="Reload preview"
            title="Reload"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          {/* Visual edit: pick an element in the preview and rewrite its copy. */}
          <button
            type="button"
            onClick={() => {
              setSelectMode(!selectMode);
              setSelection(null);
            }}
            aria-pressed={selectMode}
            aria-label="Select element to edit"
            title="Select element to edit"
            className={
              selectMode
                ? "rounded-full bg-[color:var(--color-iris)]/12 p-1.5 text-[color:var(--color-iris)] transition active:scale-95"
                : "rounded-full p-1.5 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900 active:scale-95"
            }
          >
            <MousePointerClick className="h-3.5 w-3.5" />
          </button>

          {/* Shipping is the end of every build, so it stays one click away. */}
          <ShipDialog
            payload={{
              title: payload.title ?? "Nexura project",
              entry: payload.entry ?? "App.jsx",
              files: payload.files ?? { "App.jsx": payload.code },
            }}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-iris)] px-2.5 py-1.5 text-2xs font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-95"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Ship</span>
              </button>
            }
          />



          {/* Secondary controls collapse into one menu so the bar never wraps */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Workspace options"
                className="rounded-full p-1.5 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900 active:scale-95 data-[state=open]:bg-ink-900/5 data-[state=open]:text-ink-900"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-[0.18em] text-ink-400">
                Live Workspace
                <span className="font-mono text-2xs normal-case tracking-normal text-ink-500">
                  {payload.files ? `${Object.keys(payload.files).length} files` : payload.lang}
                </span>
              </DropdownMenuLabel>
              <div className="px-2 pb-1.5">
                <CreditMeter
                  plan={credits.plan}
                  remaining={credits.remaining}
                  total={credits.total}
                  unlimited={credits.unlimited}
                  compact
                  className="w-full px-2 py-1"
                />
              </div>
              <DropdownMenuSeparator />
              {tab === "preview" && (
                <div className="flex items-center gap-1 px-2 py-1.5 sm:hidden">
                  <span className="mr-auto text-xs text-ink-600">Viewport</span>
                  <DeviceBtn
                    active={device === "desktop"}
                    onClick={() => setDevice("desktop")}
                    icon={Monitor}
                    label="Desktop"
                  />
                  <DeviceBtn
                    active={device === "tablet"}
                    onClick={() => setDevice("tablet")}
                    icon={Tablet}
                    label="Tablet"
                  />
                  <DeviceBtn
                    active={device === "mobile"}
                    onClick={() => setDevice("mobile")}
                    icon={Smartphone}
                    label="Mobile"
                  />
                </div>
              )}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setReviewBeforeApply(!reviewBeforeApply);
                }}
              >
                <GitCompare className="mr-2 h-3.5 w-3.5" />
                Review patches
                <span className="ml-auto text-2xs text-ink-500">
                  {reviewBeforeApply ? "On" : "Off"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setAutoFixEnabled(!autoFixEnabled);
                }}
              >
                <Wand2 className="mr-2 h-3.5 w-3.5" />
                Auto-fix errors
                <span className="ml-auto text-2xs text-ink-500">
                  {autoFixEnabled ? "On" : "Off"}
                </span>
              </DropdownMenuItem>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <span className="mr-auto text-xs text-ink-600">Max retries</span>
                {FIX_ATTEMPT_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxFixAttempts(n)}
                    aria-pressed={maxFixAttempts === n}
                    title={`Stop automatic repair after ${n} attempt${n > 1 ? "s" : ""}`}
                    className={cn(
                      "h-6 w-6 rounded-md border text-2xs font-semibold transition",
                      maxFixAttempts === n
                        ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/12 text-[color:var(--color-iris)]"
                        : "border-ink-200 text-ink-500 hover:bg-ink-900/5",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="px-2 pb-1.5 text-2xs leading-snug text-ink-500">
                Each AI repair spends credits ({formatCredits(credits.quote("autofix"))} per attempt).
                Sandbox-only faults are healed for free.
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setHistoryOpen((h) => !h)}>
                <History className="mr-2 h-3.5 w-3.5" />
                Patch history
                <span className="ml-auto font-mono text-2xs text-ink-500">{versions.length}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={closePreview}
            className="rounded-full p-1.5 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900 active:scale-95"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {historyOpen && (
        <Suspense fallback={null}>
          <VersionHistory onClose={() => setHistoryOpen(false)} />
        </Suspense>
      )}

      <AutoFixBar
        status={fixStatus}
        attempts={fixAttempts}
        limit={maxFixAttempts}
        enabled={autoFixEnabled}
        skip={fixSkip}
        charge={fixCharge}
        onToggleEnabled={() => setAutoFixEnabled(!autoFixEnabled)}
        errors={runtimeErrors}
        log={fixLog}
        error={fixError}
        onFix={() => void chargedAutoFix()}
        onCancel={cancelAutoFix}
        onReset={resetAutoFix}
      />

      {/* Canvas — inset rounded stage, like Lovable's right-hand preview surface */}
      <div className="relative min-h-0 flex-1 p-2 sm:p-3">
        <div
          data-testid="workspace-stage"
          className="relative h-full w-full overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_24px_60px_-38px_rgba(16,24,40,0.35)]"
        >
          <Suspense fallback={<LoadingSkeleton />}>
            {tab === "preview" ? (
              stackReport && !stackReport.webEntry && payload.files ? (
                // Backend / infra-only project: nothing for the iframe to run, so
                // show the stack blueprint instead of a blank frame.
                <StackPreview key={`stack-${revision}`} files={payload.files} />
              ) : (
                <LocalPreview
                  key={`local-${payload.lang}-${revision}`}
                  payload={payload}
                  device={device}
                  reloadKey={reloadKey}
                />
              )
            ) : tab === "stack" && payload.files ? (
              <StackPreview key={`stack-tab-${revision}`} files={payload.files} />
            ) : tab === "console" ? (
              <PreviewConsole entries={consoleEntries} onClear={clearConsole} />
            ) : tab === "code" && payload.files ? (
              <ProjectExplorer key={`explorer-${revision}`} />
            ) : (
              <SandpackStage
                key={`${payload.lang}-${reloadKey}-${revision}`}
                payload={payload}
                tab={tab === "stack" ? "code" : tab}
                device={device}
              />
            )}

          </Suspense>

          {selection && tab === "preview" ? (
            <SelectionEditor
              selection={selection}
              onClose={() => setSelection(null)}
              onApply={applySelectionText}
            />
          ) : null}

          {buildError &&
            !pendingPatch &&
            (!autoFixEnabled || fixStatus === "failed" || fixStatus === "exhausted") && (
            <Suspense fallback={null}>
              <ErrorOverlay onReload={() => setReloadKey((k) => k + 1)} />
            </Suspense>
          )}

          {pendingPatch && (
            <Suspense fallback={null}>
              <PatchReview />
            </Suspense>
          )}
        </div>
      </div>
    </aside>
  );
}

function PreviewConsole({
  entries,
  onClear,
}: {
  entries: Array<{ id: number; level: "log" | "info" | "warn" | "error"; message: string }>;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-ink-900 text-ink-100">
      <div className="flex h-10 shrink-0 items-center border-b border-ink-700 px-3">
        <span className="font-mono text-2xs uppercase text-ink-400">Browser console</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded px-2 py-1 text-2xs text-ink-300 hover:bg-ink-800"
        >
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
        {entries.length === 0 ? (
          <p className="text-ink-500">No output yet. Preview logs and errors appear here.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "border-b border-ink-800 py-1.5",
                entry.level === "error"
                  ? "text-red-300"
                  : entry.level === "warn"
                    ? "text-amber-300"
                    : "text-ink-200",
              )}
            >
              <span className="mr-2 text-ink-500">[{entry.level}]</span>
              {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AutoFixBar({
  status,
  attempts,
  limit,
  enabled,
  skip,
  charge,
  onToggleEnabled,
  errors,
  log,
  error,
  onFix,
  onCancel,
  onReset,
}: {
  status: string;
  attempts: number;
  limit: number;
  enabled: boolean;
  skip: FixSkip | null;
  charge: FixCharge | null;
  onToggleEnabled: () => void;
  errors: string[];
  log: Array<{ attempt: number; summary: string; model?: string; ok: boolean }>;
  error: string | null;
  onFix: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  if (status === "idle" && errors.length === 0 && !skip) return null;

  const last = log[log.length - 1];

  const tone =
    status === "review"
      ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-800"
      : status === "fixed"
        ? "border-emerald-300/60 bg-emerald-50/80 text-emerald-900"
        : status === "failed" || status === "exhausted"
          ? "border-sky-300/70 bg-sky-50/80 text-sky-900"
          : "border-[color:var(--color-iris)]/35 bg-[color:var(--color-iris)]/8 text-ink-800";

  return (
    <div className={cn("flex items-start gap-2 border-b px-3 py-2 text-xs", tone)}>
      <span className="mt-0.5 shrink-0">
        {status === "fixing" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : status === "fixed" ? (
          <ShieldCheck className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {status === "fixing" && `Auto-fixing… attempt ${attempts} of ${limit}`}
          {status === "review" && `Patch ready for review — attempt ${attempts}`}
          {status === "detected" &&
            (enabled
              ? `Preview check found ${errors.length} issue${errors.length > 1 ? "s" : ""} · repairing in the background`
              : `Preview check found ${errors.length} issue${errors.length > 1 ? "s" : ""} · automatic repair is off`)}
          {status === "fixed" && (last?.summary ?? "Patch applied")}
          {status === "failed" && (error ?? "Auto-fix failed")}
          {status === "exhausted" &&
            `Stopped after ${limit} AI attempt${limit > 1 ? "s" : ""} — retry limit reached`}
        </div>
        {/* Always say WHY a repair did not run, so a skipped fix never looks broken. */}
        {skip && (
          <div
            className={cn(
              "mt-1 flex flex-wrap items-center gap-x-1.5 text-2xs",
              skip.benign ? "opacity-80" : "font-medium opacity-90",
            )}
          >
            <Info className="h-3 w-3 shrink-0" />
            <span>{skip.reason}</span>
            {skip.detail && <span className="opacity-75">— {skip.detail}</span>}
          </div>
        )}
        {charge ? (
          <div className="mt-0.5 font-mono text-2xs opacity-70">
            {charge.unlimited
              ? "repair credits: unlimited"
              : `repair cost ${formatCredits(charge.charged)} · ${formatCredits(charge.remaining)} credits left`}
          </div>
        ) : null}
        {errors.length > 0 && (status === "failed" || status === "exhausted") && (
          <pre className="mt-1 max-h-16 overflow-auto whitespace-pre-wrap break-words font-mono text-2xs opacity-80">
            {errors.slice(-2).join("\n")}
          </pre>
        )}
        {status === "fixed" && last?.model && (
          <div className="mt-0.5 font-mono text-2xs opacity-70">
            patched by {last.model} · attempt {last.attempt}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleEnabled}
          aria-pressed={enabled}
          title={enabled ? "Disable automatic repair" : "Enable automatic repair"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs transition",
            enabled
              ? "border-current/25 bg-white/70 hover:bg-white/90"
              : "border-current/20 bg-white/40 opacity-80 hover:opacity-100",
          )}
        >
          {enabled ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
          Auto {enabled ? "on" : "off"}
        </button>
        {status === "fixing" && (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md border border-current/25 bg-white/70 px-2 py-1 text-2xs hover:bg-white/90"
            aria-label="Cancel auto-fix"
          >
            <Square className="h-3 w-3 fill-current" />
            Cancel
          </button>
        )}
        {(status === "detected" || status === "failed" || status === "exhausted") &&
          errors.length > 0 && (
            <button
              onClick={onFix}
              className="inline-flex items-center gap-1 rounded-md border border-current/25 bg-white/70 px-2 py-1 text-2xs hover:bg-white/90"
            >
              <Wand2 className="h-3 w-3" />
              Fix with AI
            </button>
          )}
        <button
          onClick={onReset}
          className="rounded-md p-1 opacity-60 hover:opacity-100"
          aria-label="Dismiss auto-fix status"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Eye;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        active
          ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200"
          : "text-ink-500 hover:text-ink-900",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function DeviceBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Monitor;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label} viewport`}
      aria-pressed={active}
      title={label}
      className={cn(
        "rounded-md p-1.5 transition",
        active
          ? "bg-white/80 text-[color:var(--color-iris-ink)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-iris)_35%,transparent)]"
          : "text-ink-500 hover:text-ink-900",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function EmptyWorkspace({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  return (
    <aside
      data-testid="live-workspace"
      className="relative flex h-full min-w-0 flex-col border-l border-ink-200 bg-ink-100"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-ink-200 bg-white px-2 sm:px-3">
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.18em] text-ink-400">
          Live Workspace
        </span>
        <span className="rounded-md border border-ink-200 bg-ink-100 px-1.5 py-0.5 font-mono text-2xs text-ink-500">
          idle
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-1.5 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
          aria-label="Close preview"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid flex-1 place-items-center px-6 text-center">
        <div className="max-w-xs">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-ink-200 bg-white shadow-sm">
            <Eye className="h-5 w-5 text-[color:var(--color-iris)]" />
          </div>
          <p className="text-sm font-medium text-ink-900">Nothing to preview yet</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
            Ask Nexura to build something — generated projects open here with live preview, a file
            explorer and console.
          </p>
          <button
            onClick={onStart}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-iris)]/40 bg-white px-3 py-1.5 text-xs font-medium text-ink-800 shadow-sm transition hover:bg-[color:var(--color-iris)]/10"
          >
            <Code2 className="h-3.5 w-3.5" />
            Load starter project
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Floating editor for the element picked in the preview. Text edits are written
 * back into the source file; "Ask AI" hands the selection to the chat composer.
 */
function SelectionEditor({
  selection,
  onClose,
  onApply,
}: {
  selection: NonNullable<ReturnType<typeof usePreview>["selection"]>;
  onClose: () => void;
  onApply: (text: string) => boolean;
}) {
  const [draft, setDraft] = useState(selection.text);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(selection.text);
    setError(null);
    setSaved(false);
  }, [selection]);

  const apply = () => {
    const next = draft.trim();
    if (!next) {
      setError("Text can't be empty.");
      return;
    }
    if (onApply(next)) {
      setSaved(true);
      setError(null);
    } else {
      setError("Couldn't match that text in the source — try Ask AI instead.");
    }
  };

  return (
    <div className="absolute bottom-3 left-3 right-3 z-20 mx-auto max-w-md rounded-2xl border border-ink-200 bg-white/95 p-3 shadow-[0_24px_60px_-30px_rgba(16,24,40,0.45)] backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate rounded-full bg-[color:var(--color-iris)]/10 px-2 py-0.5 font-mono text-2xs text-[color:var(--color-iris)]">
          {selection.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close element editor"
          className="rounded-full p-1 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        rows={2}
        aria-label="Element text"
        className="mt-2 w-full resize-none rounded-xl border border-ink-200 bg-white px-2.5 py-2 text-xs text-ink-900 outline-none focus:border-[color:var(--color-iris)]"
      />

      {error ? <p className="mt-1 text-2xs text-[color:var(--nx-danger,#DC2626)]">{error}</p> : null}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("nexura:ask-ai", {
                detail: `Update the ${selection.label} element (currently "${selection.text.slice(0, 120)}"): `,
              }),
            )
          }
          className="rounded-full px-2.5 py-1.5 text-2xs font-semibold text-ink-600 transition hover:bg-ink-900/5"
        >
          Ask AI
        </button>
        <button
          type="button"
          onClick={apply}
          className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-iris)] px-3 py-1.5 text-2xs font-semibold text-white transition hover:brightness-105 active:scale-95"
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saved ? "Applied" : "Apply text"}
        </button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-xs text-ink-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--color-iris)]" />
        Booting live workspace…
      </div>
    </div>
  );
}

export type { PreviewPayload, PreviewDevice };
