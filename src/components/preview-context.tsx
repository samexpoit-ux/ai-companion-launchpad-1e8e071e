import { buildApiError, parseApiError, type ApiError } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ArtifactProject } from "@/lib/artifact";

export type PreviewLang = "react" | "react-ts" | "html" | "vanilla" | "vanilla-ts" | "css" | "mdx";
export type PreviewTab = "preview" | "code" | "console" | "stack";

/** One line in the right-hand Details timeline. */
export interface TimelineStep {
  label: string;
  detail?: string;
}

/**
 * Lovable-style "Details" view: the trajectory of one assistant turn, shown in
 * the right-hand panel instead of the preview until the user goes back to the
 * latest state.
 */
export interface TimelineView {
  messageId: string;
  title: string;
  steps: TimelineStep[];
  files: string[];
  charge?: TimelineStep[];
  durationMs?: number;
  at?: number;
}
export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const DEVICE_WIDTH: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 390,
};

export interface PreviewPayload {
  code: string;
  lang: PreviewLang;
  /** Multi-file virtual project (artifact mode). */
  files?: Record<string, string>;
  /** Entry file path inside `files`. */
  entry?: string;
  title?: string;
}

/** One element picked with the visual "select to edit" tool. */
export interface PreviewSelection {
  /** Human label, e.g. `h1.text-4xl`. */
  label: string;
  /** Text content of the element, used to locate it in the source. */
  text: string;
  /** File the text was found in, when we could locate it. */
  file: string | null;
  /** Tag name, for the picker card. */
  tag: string;
  className: string;
}

export type FixStatus =
  | "idle"
  | "detected"
  | "fixing"
  | "review"
  | "fixed"
  | "failed"
  | "exhausted";

export interface FixEntry {
  attempt: number;
  summary: string;
  model?: string;
  at: number;
  ok: boolean;
}

/** A proposed AI patch, held until the user reviews the diff. */
export interface PendingPatch {
  attempt: number;
  summary: string;
  model?: string;
  changedPaths: string[];
  /** Snapshot of the project/file state the patch would produce. */
  next: PreviewPayload;
  /** State it replaces, used for the diff and for rollback. */
  previous: PreviewPayload;
}

/** An applied version we can roll back to. */
export interface PatchVersion {
  id: string;
  at: number;
  label: string;
  model?: string;
  changedPaths: string[];
  payload: PreviewPayload;
  /** true for the version that is currently loaded */
  current: boolean;
}

export const MAX_FIX_ATTEMPTS = 3;
/** Selectable retry ceilings for the auto-fixer. */
export const FIX_ATTEMPT_CHOICES = [1, 2, 3, 5] as const;

/** Why the fixer decided not to spend a credit on the current errors. */
export interface FixSkip {
  reason: string;
  detail?: string;
  at: number;
  /** true when the sandbox healed itself and no code change was needed. */
  benign: boolean;
}

/** Credits consumed by the most recent repair, straight from the server. */
export interface FixCharge {
  charged: number;
  remaining: number;
  unlimited: boolean;
}

interface AutoFixSettings {
  autoFixEnabled: boolean;
  reviewBeforeApply: boolean;
  maxFixAttempts: number;
}

const SETTINGS_KEY = "nexura.autofix.settings";
const DEFAULT_SETTINGS: AutoFixSettings = {
  autoFixEnabled: true,
  reviewBeforeApply: false,
  maxFixAttempts: MAX_FIX_ATTEMPTS,
};

function loadSettings(): AutoFixSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AutoFixSettings>;
    const limit = Number(parsed.maxFixAttempts);
    return {
      autoFixEnabled: parsed.autoFixEnabled !== false,
      reviewBeforeApply: parsed.reviewBeforeApply === true,
      maxFixAttempts: FIX_ATTEMPT_CHOICES.includes(limit as 1) ? limit : MAX_FIX_ATTEMPTS,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface PreviewContextValue {
  payload: PreviewPayload | null;
  isOpen: boolean;
  tab: PreviewTab;
  setTab: (t: PreviewTab) => void;
  device: PreviewDevice;
  setDevice: (d: PreviewDevice) => void;
  openPreview: (code: string, rawLang: string) => void;
  openProject: (project: ArtifactProject) => void;
  /** Empty the workspace (used when switching to a conversation with no build yet). */
  clearProject: () => void;
  /** Opens the split workspace panel even when nothing has been generated yet. */
  openWorkspace: () => void;
  toggleWorkspace: () => void;
  loadStarterProject: () => void;

  activeFile: string | null;
  setActiveFile: (path: string) => void;
  updateFile: (path: string, code: string) => void;
  /** Live keystroke sync: refreshes the preview without creating a version. */
  liveUpdateFile: (path: string, code: string) => void;
  liveEdit: boolean;
  setLiveEdit: (v: boolean) => void;
  // ---- visual edit ----
  selectMode: boolean;
  setSelectMode: (v: boolean) => void;
  selection: PreviewSelection | null;
  setSelection: (s: PreviewSelection | null) => void;
  /** Replace the selected element's text everywhere it appears in the source. */
  applySelectionText: (nextText: string) => boolean;
  /** Compile/build failure surfaced by the preview engine. */
  buildError: string | null;
  setBuildError: (m: string | null) => void;
  closePreview: () => void;

  /** bumped whenever the sandbox source is replaced, used to remount Sandpack */
  revision: number;
  // ---- auto bug-fix loop ----
  runtimeErrors: string[];
  reportRuntimeError: (message: string) => void;
  clearRuntimeErrors: () => void;
  consoleEntries: Array<{ id: number; level: "log" | "info" | "warn" | "error"; message: string }>;
  reportConsole: (level: "log" | "info" | "warn" | "error", message: string) => void;
  clearConsole: () => void;
  autoFixEnabled: boolean;
  setAutoFixEnabled: (v: boolean) => void;
  /** Retry ceiling before the fixer stops spending credits. */
  maxFixAttempts: number;
  setMaxFixAttempts: (v: number) => void;
  /** Why the last repair opportunity was skipped, shown in the UI. */
  fixSkip: FixSkip | null;
  clearFixSkip: () => void;
  /** Credits the last repair actually consumed (server-reported). */
  fixCharge: FixCharge | null;
  /**
   * Recent user requests from the conversation. The fixer sends them along so a
   * patch respects what the user actually asked for instead of only reacting to
   * the stack trace.
   */
  setFixIntent: (notes: string[]) => void;
  reviewBeforeApply: boolean;
  setReviewBeforeApply: (v: boolean) => void;
  fixStatus: FixStatus;
  fixAttempts: number;
  fixLog: FixEntry[];
  fixError: string | null;
  apiError: ApiError | null;
  clearApiError: () => void;
  runAutoFix: () => void;
  cancelAutoFix: () => void;
  resetAutoFix: () => void;
  // ---- review + history ----
  pendingPatch: PendingPatch | null;
  applyPendingPatch: () => void;
  discardPendingPatch: () => void;
  versions: PatchVersion[];
  activeVersionId: string | null;
  rollbackTo: (id: string) => void;
  // ---- details timeline ----
  /** Non-null while the right panel shows a turn's timeline instead of preview. */
  timeline: TimelineView | null;
  openTimeline: (view: TimelineView) => void;
  /** Leaves the timeline and restores preview / code / console. */
  backToLatest: () => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

const PREVIEWABLE = new Set([
  "jsx",
  "tsx",
  "js",
  "javascript",
  "ts",
  "typescript",
  "html",
  "htm",
  "css",
  "mdx",
  "md",
  "markdown",
]);

export function isPreviewable(lang: string) {
  return PREVIEWABLE.has(lang.toLowerCase());
}

const hasJsx = (code: string) =>
  /<\/[A-Za-z][\w.-]*>|<[A-Z][\w.-]*[\s/>]|<[a-z]+[^<>]*\/>/.test(code) ||
  /\bimport\s+React\b|from\s+["']react["']/.test(code);

function smartDetect(code: string, rawLang: string): PreviewLang {
  const l = rawLang.toLowerCase();
  if (l === "html" || l === "htm") return "html";
  if (l === "css") return "css";
  if (l === "mdx" || l === "md" || l === "markdown") return "mdx";
  if (l === "tsx") return "react-ts";
  if (l === "jsx") return "react";
  if (l === "ts" || l === "typescript") return hasJsx(code) ? "react-ts" : "vanilla-ts";
  if (l === "js" || l === "javascript") {
    if (hasJsx(code)) return "react";
    if (/<!doctype html>|<html[\s>]|<body[\s>]/i.test(code)) return "html";
    return "vanilla";
  }
  return "vanilla";
}

// Sandbox noise that is never worth an AI patch. These still show up in the
// Console tab — they just don't inflate the error badge or wake the auto-fixer.
const IGNORED = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /sandpack/i,
  /net::ERR_/i,
  /^Warning:/i,
  /unique "?key"? prop/i,
  /validateDOMNesting/i,
  /defaultProps will be removed/i,
  /useLayoutEffect does nothing on the server/i,
  /Failed to load resource/i,
  /fonts\.(googleapis|gstatic)\.com/i,
  /allow-scripts and allow-same-origin/i,
  /was preloaded using link preload/i,
  /Extra attributes from the server/i,
  /source ?map/i,
];

/**
 * Faults that come from the preview sandbox itself (an unmodelled shim export,
 * a package we do not bundle) rather than from the generated code. Sending
 * these to the model wastes credits and can never succeed, so the fixer
 * self-heals instead: reload the sandbox, keep the code, log what happened.
 */
const SANDBOX_FAULT = [
  /_framerMotion\./,
  /_reactRouterDom\./,
  /_lucideReact\./,
  /_motion\w*\.\w+ is not a function/,
  /is not available in the live preview/i,
];

function isSandboxFault(message: string) {
  return SANDBOX_FAULT.some((re) => re.test(message));
}

function isNoise(message: string) {
  const m = message.trim();
  if (m.length < 4) return true;
  return IGNORED.some((re) => re.test(m));
}

/**
 * Stable fingerprint of an error batch: line numbers, hashes and object ids are
 * stripped so "the same failure again" is recognised across reloads. Used to
 * (a) tell the fixer a previous patch did not work and (b) give a genuinely new
 * error a fresh attempt budget instead of dying on "exhausted".
 */
function errorSignature(errors: string[]) {
  return errors
    .map((e) => e.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 160))
    .sort()
    .join(" | ");
}

function normalizedError(message: string) {
  return message.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 240);
}

let versionSeq = 0;
const newVersionId = () => `v${Date.now().toString(36)}-${(versionSeq++).toString(36)}`;

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("preview");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [revision, setRevision] = useState(0);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [liveEdit, setLiveEdit] = useState(true);
  const fixAbortRef = useRef<AbortController | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const [consoleEntries, setConsoleEntries] = useState<
    Array<{ id: number; level: "log" | "info" | "warn" | "error"; message: string }>
  >([]);
  const [settings, setSettings] = useState<AutoFixSettings>(DEFAULT_SETTINGS);
  const { autoFixEnabled, reviewBeforeApply, maxFixAttempts } = settings;
  const [fixSkip, setFixSkip] = useState<FixSkip | null>(null);
  const [fixCharge, setFixCharge] = useState<FixCharge | null>(null);

  // Read persisted controls after hydration so SSR and the first client render
  // agree, then keep every later change in localStorage.
  useEffect(() => {
    setSettings(loadSettings());
  }, []);
  const patchSettings = useCallback((patch: Partial<AutoFixSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }, []);
  const setAutoFixEnabled = useCallback(
    (v: boolean) => {
      patchSettings({ autoFixEnabled: v });
      if (v) setFixSkip(null);
    },
    [patchSettings],
  );
  const setReviewBeforeApply = useCallback(
    (v: boolean) => patchSettings({ reviewBeforeApply: v }),
    [patchSettings],
  );
  const setMaxFixAttempts = useCallback(
    (v: number) => {
      patchSettings({ maxFixAttempts: v });
      setFixSkip(null);
    },
    [patchSettings],
  );
  const clearFixSkip = useCallback(() => setFixSkip(null), []);
  const intentRef = useRef<string[]>([]);
  const setFixIntent = useCallback((notes: string[]) => {
    intentRef.current = notes
      .map((n) => n.trim().slice(0, 400))
      .filter(Boolean)
      .slice(-3);
  }, []);
  const [fixStatus, setFixStatus] = useState<FixStatus>("idle");
  const [fixAttempts, setFixAttempts] = useState(0);
  const [fixLog, setFixLog] = useState<FixEntry[]>([]);
  const [fixError, setFixError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const clearApiError = useCallback(() => setApiError(null), []);
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null);
  const [versions, setVersions] = useState<PatchVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineView | null>(null);

  const payloadRef = useRef<PreviewPayload | null>(null);
  payloadRef.current = payload;
  const errorsRef = useRef<string[]>([]);
  errorsRef.current = runtimeErrors;
  const attemptsRef = useRef(0);
  attemptsRef.current = fixAttempts;
  const reviewRef = useRef(true);
  reviewRef.current = reviewBeforeApply;
  const limitRef = useRef(MAX_FIX_ATTEMPTS);
  limitRef.current = maxFixAttempts;
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingPatch | null>(null);
  pendingRef.current = pendingPatch;
  const versionsRef = useRef<PatchVersion[]>([]);
  versionsRef.current = versions;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Fingerprint of the error batch the last patch tried to fix. */
  const lastSignatureRef = useRef<string>("");
  /** Short rolling log of what previous attempts tried, sent to the fixer. */
  const historyRef = useRef<Array<{ attempt: number; summary: string; ok: boolean }>>([]);

  const resetFixState = useCallback(() => {
    setRuntimeErrors([]);
    setFixStatus("idle");
    setFixAttempts(0);
    setFixError(null);
    setFixLog([]);
    setPendingPatch(null);
    setFixSkip(null);
    lastSignatureRef.current = "";
    historyRef.current = [];
  }, []);

  const resetAutoFix = resetFixState;

  const seedHistory = useCallback((next: PreviewPayload, label: string) => {
    const id = newVersionId();
    setVersions([{ id, at: Date.now(), label, changedPaths: [], payload: next, current: true }]);
    setActiveVersionId(id);
  }, []);

  const openPreview = useCallback(
    (code: string, rawLang: string) => {
      const next: PreviewPayload = { code, lang: smartDetect(code, rawLang) };
      setPayload(next);
      setIsOpen(true);
      setTab("preview");
      setRevision((r) => r + 1);
      resetFixState();
      seedHistory(next, "Original snippet");
    },
    [resetFixState, seedHistory],
  );

  const openProject = useCallback(
    (project: ArtifactProject) => {
      const entry = project.entry;
      const code = project.files[entry] ?? "";
      const next: PreviewPayload = {
        code,
        lang: smartDetect(code, entry.endsWith(".tsx") || entry.endsWith(".ts") ? "tsx" : "jsx"),
        files: project.files,
        entry,
        title: project.title,
      };
      setPayload(next);
      setActiveFile(entry);
      setIsOpen(true);
      setTimeline(null);
      setTab("preview");
      setRevision((r) => r + 1);
      resetFixState();
      seedHistory(next, `Original · ${project.title || "project"}`);
    },
    [resetFixState, seedHistory],
  );

  const pushVersion = useCallback(
    (next: PreviewPayload, label: string, changedPaths: string[], model?: string) => {
      const id = newVersionId();
      setVersions((prev) => [
        ...prev.map((v) => ({ ...v, current: false })),
        { id, at: Date.now(), label, model, changedPaths, payload: next, current: true },
      ]);
      setActiveVersionId(id);
    },
    [],
  );

  const updateFile = useCallback(
    (path: string, code: string) => {
      const prev = payloadRef.current;
      if (!prev?.files) return;
      const files = { ...prev.files, [path]: code };
      const next = { ...prev, files, code: path === prev.entry ? code : prev.code };
      setPayload(next);
      pushVersion(next, `Manual edit · ${path}`, [path]);
      setRevision((r) => r + 1);
    },
    [pushVersion],
  );

  /** Hot-reload the running preview from an in-progress edit (no version entry). */
  const liveUpdateFile = useCallback((path: string, code: string) => {
    const prev = payloadRef.current;
    if (!prev?.files) return;
    if (prev.files[path] === code) return;
    const files = { ...prev.files, [path]: code };
    setPayload({ ...prev, files, code: path === prev.entry ? code : prev.code });
    setBuildError(null);
    setRevision((r) => r + 1);
  }, []);

  /**
   * Visual edit: rewrite the picked element's text in the source file so the
   * change survives a rebuild, an export and a GitHub push — not just the DOM.
   */
  const applySelectionText = useCallback(
    (nextText: string) => {
      const prev = payloadRef.current;
      const current = selection?.text?.trim();
      if (!prev || !current || nextText === current) return false;

      if (prev.files) {
        const hit =
          (selection?.file && prev.files[selection.file]?.includes(current)
            ? selection.file
            : null) ??
          Object.keys(prev.files).find((path) => prev.files?.[path]?.includes(current));
        if (!hit) return false;
        const source = prev.files[hit] ?? "";
        const files = { ...prev.files, [hit]: source.split(current).join(nextText) };
        const next = {
          ...prev,
          files,
          code: hit === prev.entry ? (files[hit] ?? prev.code) : prev.code,
        };
        setPayload(next);
        pushVersion(next, `Visual edit · ${hit}`, [hit]);
        setRevision((r) => r + 1);
        setSelection((sel) => (sel ? { ...sel, text: nextText } : sel));
        return true;
      }

      if (!prev.code.includes(current)) return false;
      const next = { ...prev, code: prev.code.split(current).join(nextText) };
      setPayload(next);
      pushVersion(next, "Visual edit", []);
      setRevision((r) => r + 1);
      setSelection((sel) => (sel ? { ...sel, text: nextText } : sel));
      return true;
    },
    [pushVersion, selection],
  );

  const closePreview = useCallback(() => setIsOpen(false), []);

  const openTimeline = useCallback((view: TimelineView) => {
    setTimeline(view);
    setIsOpen(true);
  }, []);
  const backToLatest = useCallback(() => setTimeline(null), []);

  const openWorkspace = useCallback(() => setIsOpen(true), []);
  const toggleWorkspace = useCallback(() => setIsOpen((o) => !o), []);

  const loadStarterProject = useCallback(() => {
    void import("@/lib/starter-project").then((mod) => openProject(mod.createStarterProject()));
  }, [openProject]);

  const clearProject = useCallback(() => {
    setPayload(null);
    setTimeline(null);
    setActiveFile(null);
    setVersions([]);
    setActiveVersionId(null);
    setBuildError(null);
    setConsoleEntries([]);
    resetFixState();
    setRevision((r) => r + 1);
  }, [resetFixState]);

  const clearRuntimeErrors = useCallback(() => {
    setRuntimeErrors([]);
    setFixStatus("idle");
  }, []);

  const reportRuntimeError = useCallback((message: string) => {
    const clean = String(message ?? "")
      .trim()
      .slice(0, 1200);
    if (!clean || isNoise(clean)) return;
    const signature = normalizedError(clean);
    setRuntimeErrors((prev) =>
      prev.some((existing) => normalizedError(existing) === signature)
        ? prev
        : [...prev, clean].slice(-8),
    );
    setFixStatus((s) => (s === "fixing" || s === "review" ? s : "detected"));
  }, []);

  const reportConsole = useCallback((level: "log" | "info" | "warn" | "error", message: string) => {
    const clean = String(message ?? "")
      .trim()
      .slice(0, 4000);
    if (!clean) return;
    setConsoleEntries((prev) =>
      [...prev, { id: Date.now() + prev.length, level, message: clean }].slice(-200),
    );
  }, []);
  const clearConsole = useCallback(() => setConsoleEntries([]), []);

  const commitPatch = useCallback(
    (patch: PendingPatch) => {
      setPayload(patch.next);
      setActiveFile(patch.changedPaths[0] ?? patch.next.entry ?? null);
      setRevision((r) => r + 1);
      setRuntimeErrors([]);
      setPendingPatch(null);
      const note = patch.changedPaths.length ? ` (${patch.changedPaths.join(", ")})` : "";
      historyRef.current = [
        ...historyRef.current,
        { attempt: patch.attempt, summary: patch.summary + note, ok: true },
      ].slice(-5);
      setFixLog((l) => [
        ...l,
        {
          attempt: patch.attempt,
          summary: patch.summary + note,
          model: patch.model,
          at: Date.now(),
          ok: true,
        },
      ]);

      pushVersion(
        patch.next,
        `AI patch · attempt ${patch.attempt}`,
        patch.changedPaths,
        patch.model,
      );
      setFixStatus("fixed");
    },
    [pushVersion],
  );

  const applyPendingPatch = useCallback(() => {
    const p = pendingRef.current;
    if (p) commitPatch(p);
  }, [commitPatch]);

  const discardPendingPatch = useCallback(() => {
    setPendingPatch(null);
    setFixStatus("detected");
    setFixLog((l) => [
      ...l,
      {
        attempt: attemptsRef.current,
        summary: "Patch discarded after review",
        at: Date.now(),
        ok: false,
      },
    ]);
  }, []);

  const rollbackTo = useCallback((id: string) => {
    const target = versionsRef.current.find((v) => v.id === id);
    if (!target) return;
    setPayload(target.payload);
    setActiveFile(target.payload.entry ?? null);
    setRevision((r) => r + 1);
    setRuntimeErrors([]);
    setPendingPatch(null);
    setFixStatus("idle");
    setActiveVersionId(id);
    setVersions((prev) => prev.map((v) => ({ ...v, current: v.id === id })));
  }, []);

  // How many times each sandbox-level fault has already been self-healed.
  const sandboxHealRef = useRef<Map<string, number>>(new Map());

  const runAutoFix = useCallback(async () => {
    const current = payloadRef.current;
    if (!current || busyRef.current) return;

    busyRef.current = true;
    const attempt = attemptsRef.current + 1;
    setFixAttempts(attempt);
    setFixStatus("fixing");
    setFixError(null);
    setFixSkip(null);
    const controller = new AbortController();
    fixAbortRef.current = controller;

    try {
      // Pre-flight: static build/lint pass gives the model precise, file-scoped
      // diagnostics (unresolved imports, syntax, missing default export) instead
      // of only the vague runtime message the sandbox managed to capture.
      let staticIssues: string[] = [];
      try {
        const { validateProject, validateSingle } = await import("@/lib/validate");
        const result = current.files
          ? await validateProject(current.files, current.entry)
          : await validateSingle(current.code, current.lang);
        staticIssues = result.issues
          .filter((i) => i.level === "error")
          .slice(0, 8)
          .map((i) => `${i.path}${i.line ? `:${i.line}` : ""} — ${i.message}`);
      } catch {
        /* validation is best-effort */
      }

      const errors = [...new Set([...staticIssues, ...errorsRef.current])].slice(0, 10);
      if (errors.length === 0) {
        setFixSkip({
          reason: "Nothing to repair",
          detail: "The preview compiled cleanly, so no credits were spent.",
          at: Date.now(),
          benign: true,
        });
        setFixStatus("fixed");
        return;
      }

      // Environment faults never reach the model — reload the sandbox instead.
      if (errors.every(isSandboxFault)) {
        const key = errorSignature(errors);
        const healed = sandboxHealRef.current.get(key) ?? 0;
        sandboxHealRef.current.set(key, healed + 1);
        setRuntimeErrors([]);
        setFixLog((l) => [
          ...l,
          {
            attempt,
            summary: "Preview sandbox reloaded (environment issue, no code change needed)",
            at: Date.now(),
            ok: true,
          },
        ]);
        setFixSkip({
          reason: "Skipped — preview environment issue, not your code",
          detail: `${errors[0].slice(0, 200)} · the sandbox was reloaded instead, so no credits were spent.`,
          at: Date.now(),
          benign: true,
        });
        // Reload at most once per distinct fault so a shim gap can never turn
        // into an endless reload loop.
        if (healed === 0) setRevision((r) => r + 1);
        setFixAttempts(0);
        setFixStatus("fixed");
        return;
      }

      const signature = errorSignature(errors);
      const persisted = signature === lastSignatureRef.current;
      lastSignatureRef.current = signature;

      const res = await apiFetch(
        "/api/autofix",
        {
          code: current.code,
          lang: current.lang,
          errors,
          attempt,
          persisted,
          history: historyRef.current.slice(-3),
          intent: intentRef.current,
          files: current.files,
          entry: current.entry,
        },
        controller.signal,
      );

      const data = (await res.json()) as {
        code?: string;
        files?: Record<string, string>;
        changedPaths?: string[];
        summary?: string;
        changed?: boolean;
        model?: string;
        credits?: { charged?: number; remaining?: number; unlimited?: boolean };
        error?: unknown;
      };
      if (data.credits) {
        setFixCharge({
          charged: Number(data.credits.charged ?? 0),
          remaining: Number(data.credits.remaining ?? 0),
          unlimited: data.credits.unlimited === true,
        });
      }
      if (!res.ok || (!data.code && !data.files)) {
        const parsed = res.ok
          ? buildApiError("bad_model_output", "autofix", "The model did not return a usable patch.")
          : parseApiError(data, "autofix");
        setApiError(parsed);
        throw new Error(parsed.message);
      }
      setApiError(null);

      let next: PreviewPayload;
      let changedPaths: string[] = [];

      if (data.files && current.files) {
        const merged = { ...current.files, ...data.files };
        const entry = current.entry ?? Object.keys(merged)[0];
        next = { ...current, files: merged, code: merged[entry] ?? current.code };
        changedPaths = data.changedPaths?.length
          ? data.changedPaths
          : Object.keys(data.files).filter((p) => current.files?.[p] !== data.files?.[p]);
      } else if (current.files && data.code) {
        const entry = current.entry ?? Object.keys(current.files)[0];
        next = { ...current, files: { ...current.files, [entry]: data.code }, code: data.code };
        changedPaths = [entry];
      } else {
        next = { ...current, code: data.code!, files: undefined, entry: undefined };
        changedPaths = ["snippet"];
      }

      const actuallyChanged = changedPaths.some((path) => {
        if (path === "snippet") return next.code.trim() !== current.code.trim();
        return next.files?.[path]?.trim() !== current.files?.[path]?.trim();
      });
      if (data.changed === false || !actuallyChanged) {
        throw new Error("The repair produced no code changes. Manual review is needed.");
      }

      // Never apply a patch that still fails the same parser/import checks. This
      // keeps a bad AI response from replacing the last usable preview.
      const { validateProject, validateSingle } = await import("@/lib/validate");
      const validation = next.files
        ? await validateProject(next.files, next.entry)
        : await validateSingle(next.code, next.lang);
      if (!validation.ok) {
        const diagnostic = validation.issues
          .filter((issue) => issue.level === "error")
          .slice(0, 3)
          .map((issue) => `${issue.path}${issue.line ? `:${issue.line}` : ""} — ${issue.message}`)
          .join("; ");
        throw new Error(`Proposed patch did not pass validation: ${diagnostic}`);
      }

      const patch: PendingPatch = {
        attempt,
        summary: data.summary || "Applied AI patch",
        model: data.model,
        changedPaths,
        next,
        previous: current,
      };

      if (reviewRef.current) {
        setPendingPatch(patch);
        setFixStatus("review");
      } else {
        commitPatch(patch);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setFixStatus("detected");
        setFixError("Repair canceled.");
        return;
      }
      const message = err instanceof Error ? err.message : "Auto-fix failed";
      setApiError((prev) => prev ?? parseApiError(err, "autofix"));
      setFixError(message);
      historyRef.current = [...historyRef.current, { attempt, summary: message, ok: false }].slice(
        -5,
      );
      setFixLog((l) => [...l, { attempt, summary: message, at: Date.now(), ok: false }]);
      setFixStatus("failed");
    } finally {
      if (fixAbortRef.current === controller) fixAbortRef.current = null;
      busyRef.current = false;
    }
  }, [commitPatch]);

  // The loop: new errors -> debounce -> patch -> re-run -> repeat until clean or capped.
  // A genuinely different failure (new fingerprint) gets a fresh attempt budget,
  // so one exhausted problem never blocks the fixer for the rest of the session.
  useEffect(() => {
    if (!isOpen || runtimeErrors.length === 0) return;
    if (!autoFixEnabled) {
      // Explicit, visible reason — the user turned automatic repair off, so we
      // never silently spend a credit on their behalf.
      setFixSkip({
        reason: "Auto-fix is off",
        detail: `${runtimeErrors.length} issue${runtimeErrors.length > 1 ? "s" : ""} detected. Run "Fix with AI" to repair (this spends credits).`,
        at: Date.now(),
        benign: true,
      });
      setFixStatus((s) => (s === "fixing" || s === "review" ? s : "detected"));
      return;
    }
    if (fixStatus === "fixing" || fixStatus === "review") return;
    if (pendingPatch) return;
    if (fixAttempts >= limitRef.current) {
      if (lastSignatureRef.current && errorSignature(runtimeErrors) !== lastSignatureRef.current) {
        setFixAttempts(0);
        setFixError(null);
        setFixStatus("detected");
        return;
      }
      setFixSkip({
        reason: `Retry limit reached (${limitRef.current})`,
        detail:
          "Automatic repair stopped so it cannot keep burning credits. Raise the limit or fix manually.",
        at: Date.now(),
        benign: false,
      });
      setFixStatus("exhausted");
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runAutoFix();
    }, 1400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    runtimeErrors,
    autoFixEnabled,
    maxFixAttempts,
    isOpen,
    fixStatus,
    fixAttempts,
    pendingPatch,
    runAutoFix,
  ]);

  return (
    <PreviewContext.Provider
      value={{
        payload,
        isOpen,
        tab,
        setTab,
        device,
        setDevice,
        openPreview,
        openProject,
        clearProject,
        openWorkspace,
        toggleWorkspace,
        loadStarterProject,

        activeFile,
        setActiveFile,
        updateFile,
        liveUpdateFile,
        selectMode,
        setSelectMode,
        selection,
        setSelection,
        applySelectionText,
        liveEdit,
        setLiveEdit,
        buildError,
        setBuildError,
        closePreview,

        revision,
        runtimeErrors,
        reportRuntimeError,
        clearRuntimeErrors,
        consoleEntries,
        reportConsole,
        clearConsole,
        autoFixEnabled,
        setAutoFixEnabled,
        maxFixAttempts,
        setMaxFixAttempts,
        fixSkip,
        clearFixSkip,
        fixCharge,
        setFixIntent,
        reviewBeforeApply,
        setReviewBeforeApply,
        fixStatus,
        fixAttempts,
        fixLog,
        fixError,
        apiError,
        clearApiError,
        runAutoFix: () => void runAutoFix(),
        cancelAutoFix: () => fixAbortRef.current?.abort(),
        resetAutoFix,
        pendingPatch,
        applyPendingPatch,
        discardPendingPatch,
        versions,
        activeVersionId,
        rollbackTo,
        timeline,
        openTimeline,
        backToLatest,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
}
