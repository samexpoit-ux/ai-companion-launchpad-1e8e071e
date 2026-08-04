/**
 * Prompt activity timeline.
 *
 * Every prompt run (chat, build, plan, image, auto-fix) records its own steps
 * here as they happen, so the inline turn card and the right-hand Details panel
 * render the *same* full trajectory — including work that never shows up in the
 * final message (routing fallbacks, artifact merges, validation, credit spend).
 *
 * The store is client-only, survives a reload through localStorage, and is
 * bounded so a long session can never grow without limit.
 */

export type RunStepKind =
  | "prompt"
  | "plan"
  | "route"
  | "delivery"
  | "artifact"
  | "file"
  | "validation"
  | "credits"
  | "preview"
  | "error";

export interface RunStep {
  kind: RunStepKind;
  label: string;
  detail?: string;
  /** false marks a failed/degraded step; undefined means informational. */
  ok?: boolean;
  /** Milliseconds this step took, when measured. */
  ms?: number;
  at: number;
}

export interface RunRecord {
  runId: string;
  threadId?: string;
  /** Assistant message this run produced, once known. */
  messageId?: string;
  title?: string;
  startedAt: number;
  endedAt?: number;
  steps: RunStep[];
}

const STORAGE_KEY = "nexura.run.timeline.v2";
const MAX_RUNS = 24;
const MAX_STEPS = 80;

interface Snapshot {
  runs: RunRecord[];
  /** messageId -> runId, so a stored reply can find its run after a reload. */
  byMessage: Record<string, string>;
}

let state: Snapshot = { runs: [], byMessage: {} };
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Snapshot;
    if (Array.isArray(parsed?.runs)) {
      state = { runs: parsed.runs.slice(0, MAX_RUNS), byMessage: parsed.byMessage ?? {} };
    }
  } catch {
    /* corrupt payload — start clean */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode — the in-memory store still works */
  }
}

function commit(next: Snapshot) {
  state = next;
  persist();
  for (const listener of listeners) listener();
}

function prune(runs: RunRecord[]): RunRecord[] {
  return runs.slice(0, MAX_RUNS);
}

/** Reactive snapshot for `useSyncExternalStore`. */
export function runTimelineSnapshot(): Snapshot {
  hydrate();
  return state;
}

export function subscribeRunTimeline(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens a run and returns its id. */
export function startRun(opts: { runId: string; threadId?: string; title?: string }): string {
  hydrate();
  const record: RunRecord = {
    runId: opts.runId,
    ...(opts.threadId ? { threadId: opts.threadId } : {}),
    ...(opts.title ? { title: opts.title } : {}),
    startedAt: Date.now(),
    steps: [],
  };
  const runs = prune([record, ...state.runs.filter((r) => r.runId !== opts.runId)]);
  const byMessage = { ...state.byMessage };
  for (const [messageId, runId] of Object.entries(byMessage)) {
    if (!runs.some((r) => r.runId === runId)) delete byMessage[messageId];
  }
  commit({ runs, byMessage });
  return opts.runId;
}

/** Appends one step to an open run (no-op when the run was pruned away). */
export function recordStep(
  runId: string,
  step: Omit<RunStep, "at"> & { at?: number },
): void {
  hydrate();
  const index = state.runs.findIndex((r) => r.runId === runId);
  if (index === -1) return;
  const run = state.runs[index]!;
  const next: RunStep = { ...step, at: step.at ?? Date.now() };
  const steps = [...run.steps, next].slice(-MAX_STEPS);
  const runs = [...state.runs];
  runs[index] = { ...run, steps };
  commit({ ...state, runs });
}

/** Records several steps in one commit. */
export function recordSteps(
  runId: string,
  steps: Array<Omit<RunStep, "at"> & { at?: number }>,
): void {
  for (const step of steps) recordStep(runId, step);
}

/** Closes a run and links it to the assistant message it produced. */
export function finishRun(
  runId: string,
  patch: { messageId?: string; title?: string } = {},
): void {
  hydrate();
  const index = state.runs.findIndex((r) => r.runId === runId);
  if (index === -1) return;
  const run = state.runs[index]!;
  const runs = [...state.runs];
  runs[index] = {
    ...run,
    endedAt: Date.now(),
    ...(patch.messageId ? { messageId: patch.messageId } : {}),
    ...(patch.title ? { title: patch.title } : {}),
  };
  const byMessage = { ...state.byMessage };
  if (patch.messageId) byMessage[patch.messageId] = runId;
  commit({ runs, byMessage });
}

/** Looks a run up by its own id or by the assistant message id it produced. */
export function getRun(id: string | undefined): RunRecord | null {
  hydrate();
  if (!id) return null;
  const direct = state.runs.find((r) => r.runId === id || r.messageId === id);
  if (direct) return direct;
  const mapped = state.byMessage[id];
  return mapped ? state.runs.find((r) => r.runId === mapped) ?? null : null;
}

/** Recorded steps for a run/message, ready for the Details timeline. */
export function recordedSteps(id: string | undefined): Array<{ label: string; detail?: string }> {
  const run = getRun(id);
  if (!run) return [];
  return run.steps.map((step) => ({
    label: step.label,
    ...(stepDetail(step) ? { detail: stepDetail(step) } : {}),
  }));
}

function stepDetail(step: RunStep): string | undefined {
  const bits = [step.detail, step.ms != null ? `${step.ms}ms` : null].filter(Boolean);
  return bits.length ? bits.join(" · ") : undefined;
}

/**
 * Merges recorded steps with the derived summary steps, keeping recorded work
 * first and dropping duplicate labels so the list never repeats itself.
 */
export function mergeTimelineSteps<T extends { label: string; detail?: string }>(
  recorded: Array<{ label: string; detail?: string }>,
  derived: T[],
): Array<{ label: string; detail?: string }> {
  const seen = new Set<string>();
  const out: Array<{ label: string; detail?: string }> = [];
  for (const step of [...recorded, ...derived]) {
    const key = `${step.label}|${step.detail ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(step.detail ? { label: step.label, detail: step.detail } : { label: step.label });
  }
  return out;
}

/** Test/debug helper — drops every recorded run. */
export function clearRunTimeline(): void {
  hydrated = true;
  commit({ runs: [], byMessage: {} });
}
