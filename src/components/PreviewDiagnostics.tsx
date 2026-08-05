import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Copy,
  Download,
  FileWarning,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Terminal,
  Wand2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { previewRouter } from "@/lib/preview-shims";
import { checkAssetImports, type AssetCheckResult } from "@/lib/asset-check";
import { validateProject, type ValidationResult } from "@/lib/validate";
import { getRun } from "@/lib/run-timeline";
import {
  bugReportDigest,
  buildBugReport,
  downloadBugReport,
  type BugReport,
} from "@/lib/bug-report";
import { usePreview } from "./preview-context";

/**
 * One place that answers "why is the preview broken?" — build status, asset
 * import validation, console errors and every auto-fix attempt, plus a
 * one-click replayable bug report of the whole state.
 */
export default function PreviewDiagnostics() {
  const {
    payload,
    revision,
    buildError,
    runtimeErrors,
    consoleEntries,
    clearConsole,
    fixStatus,
    fixAttempts,
    maxFixAttempts,
    fixLog,
    fixError,
    fixSkip,
    fixCharge,
    runAutoFix,
    device,
    tab,
  } = usePreview();

  const files = useMemo(
    () =>
      payload?.files ?? {
        [payload?.lang.includes("ts") ? "App.tsx" : "App.jsx"]: payload?.code ?? "",
      },
    [payload],
  );

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const route = useSyncExternalStore(
    previewRouter.subscribe,
    previewRouter.getPath,
    () => "/",
  );

  useEffect(() => {
    if (!payload) return;
    let alive = true;
    setValidation(null);
    setBusy(true);
    validateProject(files, payload.entry)
      .then((result) => alive && setValidation(result))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [payload, files, revision, nonce]);

  const assets: AssetCheckResult = useMemo(() => checkAssetImports(files), [files]);
  const errorLines = useMemo(
    () => consoleEntries.filter((entry) => entry.level === "error" || entry.level === "warn"),
    [consoleEntries],
  );

  const report = useCallback((): BugReport => {
    const threadId =
      typeof window === "undefined"
        ? undefined
        : new URLSearchParams(window.location.search).get("thread") ?? undefined;
    return buildBugReport({
      threadId,
      previewRoute: route,
      previewTab: tab,
      device,
      revision,
      entry: payload?.entry,
      files,
      buildError,
      runtimeErrors,
      consoleEntries: consoleEntries.map((entry) => ({
        level: entry.level,
        message: entry.message,
      })),
      fixLog,
      fixStatus,
      validation: validation
        ? { ok: validation.ok, errors: validation.errors, warnings: validation.warnings }
        : undefined,
      run: getRun(threadId ?? undefined),
      appUrl: typeof window === "undefined" ? undefined : window.location.origin,
    });
  }, [
    route,
    tab,
    device,
    revision,
    payload,
    files,
    buildError,
    runtimeErrors,
    consoleEntries,
    fixLog,
    fixStatus,
    validation,
  ]);

  const copyReport = useCallback(async () => {
    const text = bugReportDigest(report());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      downloadBugReport(report());
    }
  }, [report]);

  if (!payload) return null;

  const buildOk = !busy && validation !== null && !buildError && validation.ok;

  return (
    <div
      data-testid="preview-diagnostics"
      className="h-full overflow-auto bg-ink-50/60 px-3 py-3 sm:px-4"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {/* Build status ------------------------------------------------- */}
        <Section
          icon={
            busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
            ) : buildOk ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )
          }
          title="Build status"
          meta={
            busy
              ? "checking"
              : buildOk
                ? `clean · ${validation?.checkedFiles ?? 0} files checked`
                : `${validation?.errors ?? (buildError ? 1 : 0)} error${
                    (validation?.errors ?? 1) === 1 ? "" : "s"
                  }`
          }
          action={
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-2xs text-ink-600 transition hover:text-ink-900"
            >
              <RefreshCw className="h-3 w-3" /> Re-check
            </button>
          }
        >
          <dl className="grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
            <Stat label="Route" value={route} />
            <Stat label="Revision" value={`#${revision}`} />
            <Stat label="Files" value={String(Object.keys(files).length)} />
            <Stat
              label="Warnings"
              value={String(validation?.warnings ?? 0)}
              tone={validation?.warnings ? "warn" : "ok"}
            />
          </dl>
          {buildError ? (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 p-2 font-mono text-2xs text-rose-800">
              {buildError}
            </pre>
          ) : null}
          {validation && validation.issues.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {validation.issues.slice(0, 12).map((issue, index) => (
                <li
                  key={`${issue.path}-${index}`}
                  className="flex items-start gap-2 font-mono text-2xs"
                >
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      issue.level === "error" ? "bg-rose-500" : "bg-amber-500",
                    )}
                  />
                  <span className="min-w-0 break-words text-ink-600">
                    <span className="text-ink-800">
                      {issue.path}
                      {issue.line ? `:${issue.line}` : ""}
                    </span>{" "}
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        {/* Asset imports ------------------------------------------------ */}
        <Section
          icon={
            assets.ok ? (
              <ImageIcon className="h-4 w-4 text-emerald-600" />
            ) : (
              <FileWarning className="h-4 w-4 text-rose-600" />
            )
          }
          title="Asset imports"
          meta={
            assets.imports.length === 0
              ? "none used"
              : assets.ok
                ? `${assets.imports.length} resolved`
                : `${assets.missing.length} missing`
          }
        >
          {assets.imports.length === 0 ? (
            <p className="text-2xs text-ink-500">
              This project imports no images, fonts or media files.
            </p>
          ) : (
            <ul className="space-y-1">
              {assets.imports.slice(0, 20).map((item, index) => (
                <li
                  key={`${item.from}-${item.specifier}-${index}`}
                  className="flex items-start gap-2 font-mono text-2xs"
                >
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      item.status === "missing"
                        ? "bg-rose-500"
                        : item.status === "external"
                          ? "bg-sky-500"
                          : "bg-emerald-500",
                    )}
                  />
                  <span className="min-w-0 break-words text-ink-600">
                    <span className="text-ink-800">{item.specifier}</span>{" "}
                    {item.status === "missing"
                      ? `not emitted by the build (imported in ${item.from})`
                      : item.status === "external"
                        ? "remote URL"
                        : `→ ${item.resolved}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Console ------------------------------------------------------ */}
        <Section
          icon={<Terminal className="h-4 w-4 text-ink-500" />}
          title="Console errors"
          meta={`${errorLines.length} of ${consoleEntries.length} lines`}
          action={
            consoleEntries.length > 0 ? (
              <button
                type="button"
                onClick={clearConsole}
                className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-2xs text-ink-600 transition hover:text-ink-900"
              >
                Clear
              </button>
            ) : null
          }
        >
          {runtimeErrors.length > 0 ? (
            <ul className="mb-2 space-y-1">
              {runtimeErrors.slice(-5).map((message, index) => (
                <li
                  key={`runtime-${index}`}
                  className="break-words rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 font-mono text-2xs text-rose-800"
                >
                  {message}
                </li>
              ))}
            </ul>
          ) : null}
          {errorLines.length === 0 ? (
            <p className="text-2xs text-ink-500">No errors or warnings logged for this run.</p>
          ) : (
            <ul className="space-y-1">
              {errorLines.slice(-15).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 font-mono text-2xs">
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      entry.level === "error" ? "bg-rose-500" : "bg-amber-500",
                    )}
                  />
                  <span className="min-w-0 break-words text-ink-600">{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Auto-fix ----------------------------------------------------- */}
        <Section
          icon={<Wand2 className="h-4 w-4 text-[color:var(--color-iris)]" />}
          title="Auto-fix attempts"
          meta={`${fixStatus} · ${fixAttempts}/${maxFixAttempts}`}
          action={
            buildError || runtimeErrors.length > 0 ? (
              <button
                type="button"
                onClick={runAutoFix}
                disabled={fixStatus === "fixing"}
                className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 px-2 py-1 text-2xs text-ink-900 transition disabled:opacity-50"
              >
                {fixStatus === "fixing" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Run fix
              </button>
            ) : null
          }
        >
          {fixLog.length === 0 ? (
            <p className="text-2xs text-ink-500">No repair has been attempted for this build.</p>
          ) : (
            <ol className="space-y-1">
              {fixLog.map((entry) => (
                <li key={`${entry.attempt}-${entry.at}`} className="flex items-start gap-2 text-2xs">
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      entry.ok ? "bg-emerald-500" : "bg-rose-500",
                    )}
                  />
                  <span className="min-w-0 flex-1 break-words text-ink-600">
                    <span className="text-ink-800">Attempt {entry.attempt}</span> {entry.summary}
                  </span>
                  <time className="shrink-0 font-mono text-ink-400">
                    {new Date(entry.at).toLocaleTimeString()}
                  </time>
                </li>
              ))}
            </ol>
          )}
          {fixSkip ? (
            <p className="mt-2 text-2xs text-ink-500">
              Skipped: {fixSkip.reason}
              {fixSkip.detail ? ` — ${fixSkip.detail}` : ""}
            </p>
          ) : null}
          {fixError ? <p className="mt-2 text-2xs text-rose-700">{fixError}</p> : null}
          {fixCharge ? (
            <p className="mt-2 text-2xs text-ink-500">
              Last repair charged {fixCharge.charged} credits
              {fixCharge.unlimited ? "" : ` · ${fixCharge.remaining} remaining`}.
            </p>
          ) : null}
        </Section>

        {/* Bug report --------------------------------------------------- */}
        <Section
          icon={<Bug className="h-4 w-4 text-ink-500" />}
          title="Replayable bug report"
          meta="thread · route · console · artifact"
        >
          <p className="text-2xs text-ink-500">
            Captures this thread, the preview route, console output, the auto-fix trail and the
            failing files so the exact state can be replayed.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="bug-report-copy"
              onClick={() => void copyReport()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-2xs font-medium text-ink-700 transition hover:text-ink-900"
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy report"}
            </button>
            <button
              type="button"
              data-testid="bug-report-download"
              onClick={() => downloadBugReport(report())}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-2xs font-medium text-ink-700 transition hover:text-ink-900"
            >
              <Download className="h-3 w-3" /> Download JSON
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  meta,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <header className="flex items-center gap-2 border-b border-ink-200/70 px-3 py-2">
        {icon}
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-900">{title}</h3>
        {meta ? <span className="shrink-0 font-mono text-2xs text-ink-500">{meta}</span> : null}
        {action}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-ink-200/70 bg-ink-50/70 px-2 py-1.5">
      <dt className="text-ink-500">{label}</dt>
      <dd
        className={cn(
          "truncate font-mono text-ink-900",
          tone === "warn" && "text-amber-700",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
