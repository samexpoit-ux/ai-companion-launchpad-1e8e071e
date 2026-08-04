/**
 * Shared browser-agent vocabulary (safe to import from the browser).
 *
 * The agent is the subsystem that can sign in to a customer's own site in a
 * headless browser and reproduce/fix a bug there. Because it handles real
 * credentials, every run is: requested → explicitly approved → monitored →
 * audited. This module holds the pieces both the UI and the server agree on.
 */

export type AgentTask = "login" | "bugfix" | "verify";

export type AgentStatus =
  | "pending_approval"
  | "approved"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export interface AgentTaskMeta {
  id: AgentTask;
  label: string;
  description: string;
  /** What the agent is permitted to do — shown verbatim in the approval UI. */
  permissions: string[];
}

export const AGENT_TASKS: AgentTaskMeta[] = [
  {
    id: "login",
    label: "Sign in only",
    description: "Log in with the saved identity and confirm the session works.",
    permissions: [
      "Open the login page in a headless browser",
      "Type the saved username and decrypted password",
      "Submit the form and confirm the signed-in state",
    ],
  },
  {
    id: "bugfix",
    label: "Sign in and reproduce a bug",
    description:
      "Log in, open the page you point at, and collect the console/page errors so the repair engine can patch them.",
    permissions: [
      "Open the login page in a headless browser",
      "Type the saved username and decrypted password",
      "Navigate to the target page after signing in",
      "Record console errors, failed requests and a screenshot",
    ],
  },
  {
    id: "verify",
    label: "Verify a fix",
    description: "Log in, reload the target page and confirm the error is gone.",
    permissions: [
      "Open the login page in a headless browser",
      "Type the saved username and decrypted password",
      "Reload the target page and re-check for errors",
    ],
  },
];

export function agentTaskMeta(task: string): AgentTaskMeta {
  return AGENT_TASKS.find((t) => t.id === task) ?? AGENT_TASKS[0]!;
}

export const AGENT_STATUS_META: Record<
  AgentStatus,
  { label: string; tone: "pending" | "active" | "good" | "bad" | "muted" }
> = {
  pending_approval: { label: "Waiting for your approval", tone: "pending" },
  approved: { label: "Approved", tone: "active" },
  running: { label: "Running", tone: "active" },
  succeeded: { label: "Succeeded", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  timed_out: { label: "Timed out", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export const AGENT_TIMEOUT = { min: 10_000, max: 300_000, step: 5_000, default: 60_000 };
export const AGENT_ATTEMPTS = { min: 1, max: 5, default: 3 };

/** Typed word the user must enter before the agent may touch a credential. */
export const AGENT_APPROVAL_PHRASE = "APPROVE";

export function isTerminalStatus(status: string): boolean {
  return ["succeeded", "failed", "timed_out", "cancelled"].includes(status);
}

/**
 * Strips secret values out of any text before it is stored or displayed.
 * Applied to every audit row, error message and summary the runner produces.
 */
export function redactSecrets(text: string, secrets: Array<string | null | undefined>): string {
  let out = text ?? "";
  for (const secret of secrets) {
    if (!secret || secret.length < 3) continue;
    out = out.split(secret).join("••••••••");
  }
  return out;
}

export function maskUsername(username: string): string {
  const [name, domain] = username.split("@");
  if (!name) return "••••";
  const head = name.slice(0, 2);
  const masked = `${head}${"•".repeat(Math.max(2, name.length - 2))}`;
  return domain ? `${masked}@${domain}` : masked;
}

export function formatDuration(ms?: number | null): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** Normalises a user-typed site into an origin we can compare against. */
export function originOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).origin;
  } catch {
    return "";
  }
}
