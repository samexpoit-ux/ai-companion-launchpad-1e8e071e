import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Camera,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBar, PageBody, PageHeader, PageSection, PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  AGENT_APPROVAL_PHRASE,
  AGENT_ATTEMPTS,
  AGENT_STATUS_META,
  AGENT_TASKS,
  AGENT_TIMEOUT,
  agentTaskMeta,
  formatDuration,
  isTerminalStatus,
  maskUsername,
  type AgentStatus,
  type AgentTask,
} from "@/lib/agent";
import {
  agentRuntimeStatus,
  approveAgentSession,
  cancelAgentSession,
  deleteAgentCredential,
  requestAgentSession,
  saveAgentCredential,
} from "@/lib/agent.functions";
import { estimateCost, formatCredits } from "@/lib/credits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agent")({
  component: AgentPage,
  head: () => ({
    meta: [
      { title: "Browser agent — Nexura AI" },
      {
        name: "description",
        content:
          "Let Nexura AI sign in to your own site in a monitored headless browser to reproduce and fix bugs — with explicit approval, timeouts, retries and a full audit log.",
      },
      { property: "og:title", content: "Browser agent — Nexura AI" },
      {
        property: "og:description",
        content: "Approval-gated headless browser sessions with a complete action audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/* --------------------------------------------------------------------- types */

interface Credential {
  id: string;
  label: string;
  origin: string;
  login_url: string | null;
  username: string;
  last_used_at: string | null;
}

interface Session {
  id: string;
  credential_id: string | null;
  task: AgentTask;
  goal: string;
  target_url: string;
  status: AgentStatus;
  timeout_ms: number;
  attempt: number;
  max_attempts: number;
  approved_at: string | null;
  approval_note: string | null;
  duration_ms: number | null;
  summary: string | null;
  error: string | null;
  skip_reason: string | null;
  credits_charged: number;
  created_at: string;
}

interface AuditRow {
  id: string;
  session_id: string;
  seq: number;
  attempt: number;
  kind: string;
  label: string;
  ok: boolean;
  duration_ms: number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

interface Shot {
  id: string;
  session_id: string;
  kind: string;
  caption: string | null;
  data_url: string;
  attempt: number;
}

const TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-sky-50 text-sky-700 border-sky-200",
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  bad: "bg-rose-50 text-rose-700 border-rose-200",
  muted: "bg-ink-100 text-ink-500 border-ink-200",
};

/* ---------------------------------------------------------------------- page */

function AgentPage() {
  const [runtime, setRuntime] = useState<{ browserReady: boolean; vaultReady: boolean } | null>(
    null,
  );
  const [creds, setCreds] = useState<Credential[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [approving, setApproving] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase
        .from("agent_credentials")
        .select("id,label,origin,login_url,username,last_used_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("agent_sessions")
        .select(
          "id,credential_id,task,goal,target_url,status,timeout_ms,attempt,max_attempts,approved_at,approval_note,duration_ms,summary,error,skip_reason,credits_charged,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    setCreds((c.data as Credential[] | null) ?? []);
    setSessions((s.data as Session[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
    void agentRuntimeStatus()
      .then(setRuntime)
      .catch(() => setRuntime(null));
  }, [load]);

  // While a run is live, poll so the status/timeline advance without a refresh.
  const liveRun = sessions.some((s) => !isTerminalStatus(s.status));
  useEffect(() => {
    if (!liveRun) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [liveRun, load]);

  const loadDetail = useCallback(async (sessionId: string) => {
    const [a, sc] = await Promise.all([
      supabase
        .from("agent_actions")
        .select("id,session_id,seq,attempt,kind,label,ok,duration_ms,detail,created_at")
        .eq("session_id", sessionId)
        .order("seq", { ascending: true }),
      supabase
        .from("agent_screenshots")
        .select("id,session_id,kind,caption,data_url,attempt")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);
    setAudit((a.data as AuditRow[] | null) ?? []);
    setShots((sc.data as Shot[] | null) ?? []);
  }, []);

  const toggleDetail = useCallback(
    (id: string) => {
      setOpenSession((current) => {
        if (current === id) return null;
        void loadDetail(id);
        return id;
      });
    },
    [loadDetail],
  );

  const onApproved = useCallback(
    async (session: Session, confirmation: string, note: string) => {
      setBusy(true);
      try {
        const res = await approveAgentSession({
          data: { sessionId: session.id, confirmation, note: note || undefined },
        });
        setApproving(null);
        await load();
        void loadDetail(session.id);
        setOpenSession(session.id);
        if (res.status === "succeeded") toast.success("Agent finished the run.");
        else if (res.status === "timed_out") toast.error("The agent timed out — see the timeline.");
        else toast.error(res.error ?? "The agent could not finish this run.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approval failed.");
      } finally {
        setBusy(false);
      }
    },
    [load, loadDetail],
  );

  const perAttempt = estimateCost("agent_run");

  return (
    <PageShell width="xl">
      <PageBar>
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Dashboard
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </PageBar>

      <PageHeader
        title="Browser agent"
        description="Nexura can sign in to your own site in a monitored headless browser, reproduce the bug you describe and hand the errors to the repair engine. Nothing runs until you approve it, and every single action is written to an audit log you can read."
      />

      <PageBody>
        <RuntimeBanner runtime={runtime} />

        <PageSection
          title="Credential vault"
          description="Passwords are encrypted on the server with a key the browser never sees, and stored in a table no signed-in session can read."
        >
          <CredentialForm onSaved={load} disabled={runtime?.vaultReady === false} />
          <ul className="mt-4 space-y-2">
            {creds.length === 0 ? (
              <li className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
                No saved identities yet. Add the login the agent should use.
              </li>
            ) : (
              creds.map((cred) => (
                <li
                  key={cred.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200/80 bg-white/70 px-4 py-3"
                >
                  <KeyRound className="h-4 w-4 shrink-0 text-ink-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{cred.label}</p>
                    <p className="truncate text-xs text-ink-500">
                      {maskUsername(cred.username)} · {cred.origin}
                    </p>
                  </div>
                  <span className="text-xs text-ink-400">
                    {cred.last_used_at
                      ? `used ${new Date(cred.last_used_at).toLocaleDateString()}`
                      : "never used"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${cred.label}`}
                    onClick={async () => {
                      await deleteAgentCredential({ data: { id: cred.id } });
                      toast.success("Credential removed.");
                      void load();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </PageSection>

        <PageSection
          title="Request a run"
          description={`Each attempt costs ${formatCredits(perAttempt)} credits — retries are charged as they happen, so you always see what a stubborn bug cost.`}
        >
          <RequestForm credentials={creds} onQueued={load} />
        </PageSection>

        <PageSection
          title="Runs & audit log"
          description="Every request, approval, keystroke class, navigation, timeout and screenshot in order."
        >
          {sessions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
              No runs yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  credential={creds.find((c) => c.id === session.credential_id) ?? null}
                  expanded={openSession === session.id}
                  audit={openSession === session.id ? audit : []}
                  shots={openSession === session.id ? shots : []}
                  onToggle={() => toggleDetail(session.id)}
                  onApprove={() => setApproving(session)}
                  onCancel={async () => {
                    await cancelAgentSession({ data: { sessionId: session.id } });
                    void load();
                  }}
                />
              ))}
            </ul>
          )}
        </PageSection>
      </PageBody>

      {approving ? (
        <ApprovalDialog
          session={approving}
          credential={creds.find((c) => c.id === approving.credential_id) ?? null}
          busy={busy}
          onClose={() => setApproving(null)}
          onConfirm={(confirmation, note) => void onApproved(approving, confirmation, note)}
        />
      ) : null}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ sections */

function RuntimeBanner({
  runtime,
}: {
  runtime: { browserReady: boolean; vaultReady: boolean } | null;
}) {
  if (!runtime) return null;
  if (runtime.browserReady && runtime.vaultReady) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <ShieldCheck className="h-4 w-4" /> Headless browser and credential vault are ready on this
        server.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Agent runtime incomplete</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
        {runtime.browserReady ? null : (
          <li>
            Headless browser missing — run <code>bash deploy/install-browser-agent.sh</code> on the
            VPS.
          </li>
        )}
        {runtime.vaultReady ? null : (
          <li>
            Credential vault key missing — set <code>CREDENTIAL_VAULT_KEY</code> in the server
            environment.
          </li>
        )}
      </ul>
    </div>
  );
}

function CredentialForm({ onSaved, disabled }: { onSaved: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" /> Add saved identity
      </Button>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-xl border border-ink-200/80 bg-white/70 p-4 sm:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await saveAgentCredential({ data: { label, loginUrl, username, secret } });
          toast.success("Credential encrypted and saved.");
          setLabel("");
          setLoginUrl("");
          setUsername("");
          setSecret("");
          setOpen(false);
          onSaved();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="text-xs font-medium text-ink-600">
        Name
        <Input
          className="mt-1"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Staging admin"
        />
      </label>
      <label className="text-xs font-medium text-ink-600">
        Login page URL
        <Input
          className="mt-1"
          required
          type="url"
          value={loginUrl}
          onChange={(e) => setLoginUrl(e.target.value)}
          placeholder="https://example.com/login"
        />
      </label>
      <label className="text-xs font-medium text-ink-600">
        Username or email
        <Input
          className="mt-1"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="text-xs font-medium text-ink-600">
        Password
        <Input
          className="mt-1"
          required
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <p className="sm:col-span-2 flex items-start gap-2 text-xs text-ink-500">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Encrypted with AES-256-GCM before it reaches the database. It is decrypted only for a run
        you personally approve, and never appears in logs or the audit trail.
      </p>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RequestForm({
  credentials,
  onQueued,
}: {
  credentials: Credential[];
  onQueued: () => void;
}) {
  const [credentialId, setCredentialId] = useState("");
  const [task, setTask] = useState<AgentTask>("bugfix");
  const [goal, setGoal] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(AGENT_TIMEOUT.default);
  const [maxAttempts, setMaxAttempts] = useState(AGENT_ATTEMPTS.default);
  const [saving, setSaving] = useState(false);

  const selected = credentialId || credentials[0]?.id || "";

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selected) {
          toast.error("Add a saved identity first.");
          return;
        }
        setSaving(true);
        try {
          await requestAgentSession({
            data: { credentialId: selected, task, goal, targetUrl, timeoutMs, maxAttempts },
          });
          toast.success("Run queued — approve it below to start.");
          setGoal("");
          onQueued();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not queue the run.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="text-xs font-medium text-ink-600">
        Identity
        <select
          className="mt-1 h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-sm"
          value={selected}
          onChange={(e) => setCredentialId(e.target.value)}
        >
          {credentials.length === 0 ? <option value="">No saved identity</option> : null}
          {credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — {c.origin}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-ink-600">
        Task
        <select
          className="mt-1 h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-sm"
          value={task}
          onChange={(e) => setTask(e.target.value as AgentTask)}
        >
          {AGENT_TASKS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-ink-600 sm:col-span-2">
        Page to open after signing in
        <Input
          className="mt-1"
          required
          type="url"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://example.com/dashboard"
        />
      </label>
      <label className="text-xs font-medium text-ink-600 sm:col-span-2">
        What should it look for? (optional)
        <Input
          className="mt-1"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Checkout button throws an error after login"
        />
      </label>
      <label className="text-xs font-medium text-ink-600">
        Timeout per attempt: {Math.round(timeoutMs / 1000)}s
        <input
          className="mt-2 w-full accent-[color:var(--color-iris)]"
          type="range"
          min={AGENT_TIMEOUT.min}
          max={AGENT_TIMEOUT.max}
          step={AGENT_TIMEOUT.step}
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(Number(e.target.value))}
        />
      </label>
      <label className="text-xs font-medium text-ink-600">
        Automatic retries: up to {maxAttempts} attempt{maxAttempts > 1 ? "s" : ""}
        <input
          className="mt-2 w-full accent-[color:var(--color-iris)]"
          type="range"
          min={AGENT_ATTEMPTS.min}
          max={AGENT_ATTEMPTS.max}
          step={1}
          value={maxAttempts}
          onChange={(e) => setMaxAttempts(Number(e.target.value))}
        />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Bot className="mr-1.5 h-4 w-4" />
          )}
          Queue run for approval
        </Button>
      </div>
    </form>
  );
}

function StatusChip({ status }: { status: AgentStatus }) {
  const meta = AGENT_STATUS_META[status] ?? AGENT_STATUS_META.failed;
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        TONE[meta.tone] ?? TONE.muted,
      )}
    >
      {meta.label}
    </span>
  );
}

function SessionCard({
  session,
  credential,
  expanded,
  audit,
  shots,
  onToggle,
  onApprove,
  onCancel,
}: {
  session: Session;
  credential: Credential | null;
  expanded: boolean;
  audit: AuditRow[];
  shots: Shot[];
  onToggle: () => void;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const meta = agentTaskMeta(session.task);
  return (
    <li className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white/75">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <StatusChip status={session.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">
            {meta.label} · {session.target_url}
          </p>
          <p className="truncate text-xs text-ink-500">
            {credential ? maskUsername(credential.username) : "identity removed"} ·{" "}
            {new Date(session.created_at).toLocaleString()} · attempt {session.attempt}/
            {session.max_attempts} · {formatDuration(session.duration_ms)} ·{" "}
            {formatCredits(session.credits_charged)} credits
          </p>
        </div>
        {session.status === "pending_approval" ? (
          <>
            <Button size="sm" onClick={onApprove}>
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Review & approve
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Discard
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {expanded ? "Hide" : "Details"}
        </Button>
      </div>

      {expanded ? (
        <div className="border-t border-ink-200/70 bg-ink-50/60 px-4 py-4">
          {session.goal ? (
            <p className="mb-3 text-sm text-ink-700">
              <span className="font-medium">Goal:</span> {session.goal}
            </p>
          ) : null}
          {session.error ? (
            <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {session.error}
            </p>
          ) : null}
          {session.skip_reason ? (
            <p className="mb-3 text-sm text-ink-500">Skipped: {session.skip_reason}</p>
          ) : null}
          {session.summary ? (
            <pre className="mb-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-200 bg-white p-3 text-xs text-ink-700">
              {session.summary}
            </pre>
          ) : null}

          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Audit log</h4>
          <ol className="mt-2 space-y-1.5">
            {audit.length === 0 ? (
              <li className="text-sm text-ink-500">No steps recorded yet.</li>
            ) : (
              audit.map((row) => (
                <li key={row.id} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      row.ok ? "bg-emerald-500" : "bg-rose-500",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={row.ok ? "text-ink-800" : "text-rose-700"}>{row.label}</span>
                    <span className="ml-2 text-xs text-ink-400">
                      {row.kind}
                      {row.attempt ? ` · try ${row.attempt}` : ""}
                      {row.duration_ms != null ? ` · ${formatDuration(row.duration_ms)}` : ""}
                    </span>
                  </span>
                  <time className="shrink-0 text-xs text-ink-400">
                    {new Date(row.created_at).toLocaleTimeString()}
                  </time>
                </li>
              ))
            )}
          </ol>

          <AgentScreenshotGallery shots={shots} />

        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ approval */

function ApprovalDialog({
  session,
  credential,
  busy,
  onClose,
  onConfirm,
}: {
  session: Session;
  credential: Credential | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (confirmation: string, note: string) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const meta = useMemo(() => agentTaskMeta(session.task), [session.task]);
  const ready = confirmation.trim().toUpperCase() === AGENT_APPROVAL_PHRASE;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-approval-title"
        className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="agent-approval-title" className="font-display text-lg font-semibold text-ink-900">
            Approve this agent sign-in
          </h2>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-ink-500">Site</dt>
            <dd className="min-w-0 break-all text-ink-900">{credential?.origin ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-ink-500">Signs in as</dt>
            <dd className="min-w-0 break-all text-ink-900">
              {credential ? maskUsername(credential.username) : "—"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-ink-500">Then opens</dt>
            <dd className="min-w-0 break-all text-ink-900">{session.target_url}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-ink-500">Limits</dt>
            <dd className="flex items-center gap-1.5 text-ink-900">
              <Clock className="h-3.5 w-3.5 text-ink-400" />
              {Math.round(session.timeout_ms / 1000)}s per attempt · up to {session.max_attempts}{" "}
              attempts
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">
          What the agent may do
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-ink-700">
          {meta.permissions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <label className="mt-4 block text-xs font-medium text-ink-600">
          Note for the audit log (optional)
          <Input
            className="mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Approved to reproduce the checkout bug"
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-ink-600">
          Type {AGENT_APPROVAL_PHRASE} to confirm
          <Input
            className="mt-1"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={AGENT_APPROVAL_PHRASE}
            autoComplete="off"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready || busy} onClick={() => onConfirm(confirmation, note)}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1.5 h-4 w-4" />
            )}
            Approve and start
          </Button>
        </div>
      </div>
    </div>
  );
}
