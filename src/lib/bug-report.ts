/**
 * One-click replayable bug reports.
 *
 * Captures everything needed to reproduce a broken preview without asking the
 * user for a description: the thread, the preview route state, console output,
 * build/runtime errors, the auto-fix attempts and the failing artifact context
 * (file list + the sources the error points at).
 */

import type { RunRecord } from "@/lib/run-timeline";

export const BUG_REPORT_VERSION = 1;

export interface BugReportInput {
  threadId?: string | undefined;
  threadTitle?: string | undefined;
  /** Last user prompts, newest last — the intent behind the failing build. */
  prompts?: string[];
  previewRoute?: string | undefined;
  previewTab?: string | undefined;
  device?: string | undefined;
  revision?: number | undefined;
  entry?: string | undefined;
  files?: Record<string, string> | undefined;
  buildError?: string | null | undefined;
  runtimeErrors?: string[] | undefined;
  consoleEntries?: Array<{ level: string; message: string }> | undefined;
  fixLog?: Array<{ attempt: number; summary: string; ok: boolean; at: number }> | undefined;
  fixStatus?: string | undefined;
  validation?: { ok: boolean; errors: number; warnings: number } | undefined;
  run?: RunRecord | null | undefined;
  appUrl?: string | undefined;
}

export interface BugReport {
  version: number;
  createdAt: string;
  replayUrl: string | null;
  thread: { id: string | null; title: string | null; prompts: string[] };
  preview: {
    route: string;
    tab: string;
    device: string;
    revision: number | null;
    entry: string | null;
    fileCount: number;
    files: string[];
  };
  failure: {
    buildError: string | null;
    runtimeErrors: string[];
    fixStatus: string | null;
    fixLog: Array<{ attempt: number; summary: string; ok: boolean; at: string }>;
    validation: { ok: boolean; errors: number; warnings: number } | null;
  };
  console: Array<{ level: string; message: string }>;
  timeline: Array<{ label: string; detail?: string; kind: string; at: string; ok?: boolean }>;
  /** Sources the failure points at, trimmed so the report stays shareable. */
  artifactContext: Array<{ path: string; source: string; truncated: boolean }>;
}

const MAX_CONSOLE = 60;
const MAX_SOURCE_CHARS = 6_000;
const MAX_CONTEXT_FILES = 4;

/** Extracts file paths mentioned by an error/console message. */
export function pathsFromMessages(messages: string[], files: string[]): string[] {
  const hits: string[] = [];
  for (const message of messages) {
    for (const path of files) {
      if (message.includes(path) && !hits.includes(path)) hits.push(path);
    }
  }
  return hits;
}

export function buildBugReport(input: BugReportInput): BugReport {
  const files = input.files ?? {};
  const paths = Object.keys(files);
  const failureText = [input.buildError ?? "", ...(input.runtimeErrors ?? [])];
  const suspects = pathsFromMessages(failureText, paths);
  const context = (suspects.length ? suspects : [input.entry ?? paths[0] ?? ""])
    .filter((path): path is string => Boolean(path) && path in files)
    .slice(0, MAX_CONTEXT_FILES)
    .map((path) => {
      const source = files[path] ?? "";
      return {
        path,
        source: source.slice(0, MAX_SOURCE_CHARS),
        truncated: source.length > MAX_SOURCE_CHARS,
      };
    });

  return {
    version: BUG_REPORT_VERSION,
    createdAt: new Date().toISOString(),
    replayUrl: replayUrl(input),
    thread: {
      id: input.threadId ?? null,
      title: input.threadTitle ?? null,
      prompts: (input.prompts ?? []).slice(-5),
    },
    preview: {
      route: input.previewRoute ?? "/",
      tab: input.previewTab ?? "preview",
      device: input.device ?? "desktop",
      revision: input.revision ?? null,
      entry: input.entry ?? null,
      fileCount: paths.length,
      files: paths,
    },
    failure: {
      buildError: input.buildError ?? null,
      runtimeErrors: input.runtimeErrors ?? [],
      fixStatus: input.fixStatus ?? null,
      fixLog: (input.fixLog ?? []).map((entry) => ({
        attempt: entry.attempt,
        summary: entry.summary,
        ok: entry.ok,
        at: new Date(entry.at).toISOString(),
      })),
      validation: input.validation ?? null,
    },
    console: (input.consoleEntries ?? [])
      .slice(-MAX_CONSOLE)
      .map((entry) => ({ level: entry.level, message: entry.message })),
    timeline: (input.run?.steps ?? []).map((step) => ({
      label: step.label,
      ...(step.detail ? { detail: step.detail } : {}),
      kind: step.kind,
      at: new Date(step.at).toISOString(),
      ...(step.ok === undefined ? {} : { ok: step.ok }),
    })),
    artifactContext: context,
  };
}

/** Deep link that reopens the same thread on the same preview route. */
export function replayUrl(input: BugReportInput): string | null {
  if (!input.threadId) return null;
  const base = input.appUrl?.replace(/\/$/, "") ?? "";
  const params = new URLSearchParams({ thread: input.threadId });
  if (input.previewRoute && input.previewRoute !== "/") params.set("route", input.previewRoute);
  if (input.previewTab && input.previewTab !== "preview") params.set("tab", input.previewTab);
  return `${base}/workspace?${params.toString()}`;
}

export function bugReportFilename(report: BugReport): string {
  const stamp = report.createdAt.replace(/[:.]/g, "-");
  const thread = report.thread.id ? report.thread.id.slice(0, 8) : "session";
  return `nexura-bug-${thread}-${stamp}.json`;
}

export function serializeBugReport(report: BugReport): string {
  return JSON.stringify(report, null, 2);
}

/** Human-readable digest used for the clipboard copy. */
export function bugReportDigest(report: BugReport): string {
  const lines = [
    `Nexura bug report · ${report.createdAt}`,
    report.replayUrl ? `Replay: ${report.replayUrl}` : null,
    `Route: ${report.preview.route} · tab ${report.preview.tab} · ${report.preview.fileCount} files`,
    report.failure.buildError ? `Build error: ${report.failure.buildError}` : null,
    report.failure.runtimeErrors.length
      ? `Runtime: ${report.failure.runtimeErrors.slice(0, 3).join(" | ")}`
      : null,
    report.failure.fixStatus ? `Auto-fix: ${report.failure.fixStatus}` : null,
    report.console.length ? `Console lines: ${report.console.length}` : null,
  ].filter(Boolean) as string[];
  return `${lines.join("\n")}\n\n${serializeBugReport(report)}`;
}

/** Triggers a download of the report (browser-only). */
export function downloadBugReport(report: BugReport): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([serializeBugReport(report)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = bugReportFilename(report);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
