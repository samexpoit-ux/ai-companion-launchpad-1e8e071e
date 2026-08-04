/**
 * Live GitHub push status (shared between the auto-push hook and the UI).
 *
 * The push itself happens on the server, but the workspace needs one place to
 * read "what happened to the last push" from anywhere — the Ship dialog, the
 * status panel, a toast. This is a tiny external store so any component can
 * subscribe without prop-drilling.
 */
import { useSyncExternalStore } from "react";

export type PushPhase = "idle" | "pushing" | "success" | "error";

export interface PushStatus {
  phase: PushPhase;
  /** Short commit sha of the last successful push. */
  commit?: string | null;
  /** ISO timestamp of the last successful push. */
  at?: string | null;
  files?: number;
  branch?: string | null;
  repo?: string | null;
  /** Failure text from the last attempt, cleared on the next success. */
  error?: string | null;
  /** True when the push was started automatically after a build. */
  automatic?: boolean;
}

let status: PushStatus = { phase: "idle" };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setPushStatus(next: Partial<PushStatus>) {
  status = { ...status, ...next };
  emit();
}

export function markPushStarted(automatic: boolean) {
  status = { ...status, phase: "pushing", error: null, automatic };
  emit();
}

export function markPushSucceeded(result: {
  commit: string;
  files: number;
  branch?: string;
  repo?: string;
}) {
  status = {
    phase: "success",
    commit: result.commit,
    at: new Date().toISOString(),
    files: result.files,
    branch: result.branch ?? status.branch ?? null,
    repo: result.repo ?? status.repo ?? null,
    error: null,
    automatic: status.automatic,
  };
  emit();
}

export function markPushFailed(message: string) {
  status = { ...status, phase: "error", error: message };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return status;
}

export function useGitHubPushStatus(): PushStatus {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** "3 minutes ago" style label; falls back to a locale date for older pushes. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleString();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString();
}
