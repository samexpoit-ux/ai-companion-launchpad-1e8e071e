/**
 * Headless browser runner (server only).
 *
 * Reliability rules baked in here, because an agent that hangs is worse than
 * one that fails:
 *  * every attempt runs under a hard deadline (`timeout_ms`);
 *  * a failed or timed-out attempt captures a screenshot before the browser
 *    closes, so the user can see what the agent saw;
 *  * attempts retry with backoff up to `max_attempts`;
 *  * every step is appended to `agent_actions` as it happens, with secrets
 *    redacted, so a crash still leaves a complete audit trail.
 *
 * Playwright is loaded lazily at runtime (installed on the VPS by
 * deploy/install-browser-agent.sh) so the app builds and boots without it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { redactSecrets, type AgentTask } from "@/lib/agent";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/* ------------------------------------------------ minimal Playwright surface */

interface PwLocator {
  count(): Promise<number>;
  first(): PwLocator;
  fill(value: string, options?: unknown): Promise<void>;
  click(options?: unknown): Promise<void>;
}
interface PwConsoleMessage {
  type(): string;
  text(): string;
}
interface PwPage {
  goto(url: string, options?: unknown): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  locator(selector: string): PwLocator;
  waitForLoadState(state: string, options?: unknown): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options?: unknown): Promise<Uint8Array>;
  setDefaultTimeout(ms: number): void;
  on: {
    (event: "console", cb: (message: PwConsoleMessage) => void): void;
    (event: "pageerror", cb: (error: Error) => void): void;
  };
}
interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(options?: unknown): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { launch(options?: unknown): Promise<PwBrowser> };
}

/** Resolved at runtime; absent in the build sandbox and in edge runtimes. */
export async function loadBrowserRuntime(): Promise<PwModule | null> {
  for (const name of ["playwright", "playwright-core"]) {
    try {
      const mod = (await import(/* @vite-ignore */ name)) as unknown as
        | PwModule
        | { default?: PwModule };
      const resolved = (mod as { default?: PwModule }).default ?? (mod as PwModule);
      if (resolved?.chromium) return resolved;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export const BROWSER_RUNTIME_MISSING =
  "The headless browser runtime is not installed on this server. Run deploy/install-browser-agent.sh on the VPS to enable agent logins.";

/* ------------------------------------------------------------------ recorder */

export interface RunnerInput {
  sessionId: string;
  userId: string;
  task: AgentTask;
  goal: string;
  targetUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  credential: { username: string; secret: string; loginUrl: string | null } | null;
}

export interface RunnerResult {
  status: "succeeded" | "failed" | "timed_out";
  attempts: number;
  summary: string;
  error?: string;
}

class Recorder {
  private seq = 0;
  attempt = 1;

  constructor(
    private readonly db: AnyClient,
    private readonly input: RunnerInput,
  ) {}

  private clean(value: string): string {
    return redactSecrets(value ?? "", [this.input.credential?.secret]);
  }

  async log(entry: {
    kind: string;
    label: string;
    ok?: boolean;
    durationMs?: number;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    this.seq += 1;
    const detail = JSON.parse(this.clean(JSON.stringify(entry.detail ?? {}))) as Record<
      string,
      unknown
    >;
    const { error } = await this.db.from("agent_actions").insert({
      session_id: this.input.sessionId,
      user_id: this.input.userId,
      seq: this.seq,
      attempt: this.attempt,
      kind: entry.kind,
      label: this.clean(entry.label),
      ok: entry.ok ?? true,
      duration_ms: entry.durationMs ?? null,
      detail,
    });
    // The audit log is monitoring, never a gate — a logging failure must not
    // abort a run the user approved.
    if (error) console.error("[agent] audit write failed", error.message);
  }

  /** Times a single step and logs it either way. */
  async step<T>(kind: string, label: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      await this.log({ kind, label, ok: true, durationMs: Date.now() - started });
      return result;
    } catch (err) {
      await this.log({
        kind,
        label,
        ok: false,
        durationMs: Date.now() - started,
        detail: { error: this.clean(err instanceof Error ? err.message : String(err)) },
      });
      throw err;
    }
  }

  async screenshot(page: PwPage | undefined, kind: string, caption: string): Promise<void> {
    if (!page) return;
    try {
      const shot = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
      const dataUrl = `data:image/jpeg;base64,${Buffer.from(shot).toString("base64")}`;
      if (dataUrl.length > 1_400_000) return; // keep rows small
      await this.db.from("agent_screenshots").insert({
        session_id: this.input.sessionId,
        user_id: this.input.userId,
        attempt: this.attempt,
        kind,
        caption: this.clean(caption),
        data_url: dataUrl,
      });
      await this.log({ kind: "screenshot", label: caption, ok: kind !== "failure" });
    } catch (err) {
      console.error("[agent] screenshot failed", err);
    }
  }
}

/* ------------------------------------------------------------------ helpers */

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`No response within the ${Math.round(ms / 1000)}s limit`);
    this.name = "TimeoutError";
  }
}

function withDeadline<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([work, guard]).finally(() => clearTimeout(timer)) as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const USER_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[autocomplete="username"]',
  'input[id*="email" i]',
  'input[id*="user" i]',
];
const PASS_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]',
];
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Sign in")',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Continue")',
];

async function firstVisible(page: PwPage, selectors: string[]): Promise<PwLocator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if ((await locator.count()) > 0) return locator.first();
  }
  return null;
}

/* --------------------------------------------------------------- one attempt */

interface Live {
  browser?: PwBrowser;
  context?: PwContext;
  page?: PwPage;
}

async function runAttempt(
  pw: PwModule,
  rec: Recorder,
  input: RunnerInput,
  live: Live,
): Promise<string> {
  const problems: string[] = [];

  live.browser = await rec.step("launch", "Start headless browser", () =>
    pw.chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }),
  );
  live.context = await live.browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await live.context.newPage();
  live.page = page;
  page.setDefaultTimeout(Math.min(20_000, input.timeoutMs));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message.slice(0, 300)}`));

  const cred = input.credential;
  const loginUrl = cred?.loginUrl || input.targetUrl;

  if (cred) {
    await rec.step("navigate", `Open the login page (${loginUrl})`, async () => {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    });

    const userField = await firstVisible(page, USER_SELECTORS);
    if (!userField) throw new Error("No username or email field found on the login page.");
    await rec.step("fill", "Enter the saved username", () => userField.fill(cred.username));

    const passField = await firstVisible(page, PASS_SELECTORS);
    if (!passField) throw new Error("No password field found on the login page.");
    // The value is never logged — only that the step happened.
    await rec.step("fill", "Enter the decrypted password", () => passField.fill(cred.secret));

    const submit = await firstVisible(page, SUBMIT_SELECTORS);
    await rec.step("submit", "Submit the sign-in form", async () => {
      if (submit) await submit.click();
      else await passField.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    });

    await rec.step("verify", "Confirm the signed-in state", async () => {
      const stillHasPassword = (await page.locator('input[type="password"]').count()) > 0;
      if (stillHasPassword && page.url().replace(/\/$/, "") === loginUrl.replace(/\/$/, "")) {
        throw new Error("Still on the login page after submitting — the sign-in was rejected.");
      }
    });
  }

  if (input.task !== "login") {
    await rec.step("navigate", `Open the target page (${input.targetUrl})`, async () => {
      await page.goto(input.targetUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
    });
  }

  const title = await page.title().catch(() => "");
  await rec.screenshot(page, "result", `Final view: ${title || page.url()}`);
  await rec.log({
    kind: "collect",
    label: problems.length
      ? `Collected ${problems.length} browser error(s)`
      : "No browser errors detected",
    ok: true,
    detail: { url: page.url(), title, problems: problems.slice(0, 25) },
  });

  if (input.task === "verify" && problems.length > 0) {
    throw new Error(`Target page still reports ${problems.length} error(s).`);
  }

  const head = `Signed in as ${cred ? cred.username : "an anonymous visitor"} and reached ${page.url()}.`;
  return problems.length
    ? `${head}\n\nErrors found:\n${problems.slice(0, 12).join("\n")}`
    : `${head}\n\nNo console or page errors were detected.`;
}

/* ------------------------------------------------------------ run the session */

export async function runAgentSession(db: AnyClient, input: RunnerInput): Promise<RunnerResult> {
  const rec = new Recorder(db, input);
  const pw = await loadBrowserRuntime();
  if (!pw) {
    await rec.log({ kind: "error", label: BROWSER_RUNTIME_MISSING, ok: false });
    return { status: "failed", attempts: 0, summary: "", error: BROWSER_RUNTIME_MISSING };
  }

  let lastError = "Unknown failure";
  let timedOut = false;

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    rec.attempt = attempt;
    const live: Live = {};
    await db
      .from("agent_sessions")
      .update({ status: "running", attempt })
      .eq("id", input.sessionId);
    await rec.log({
      kind: "attempt",
      label: `Attempt ${attempt} of ${input.maxAttempts} started`,
      detail: { timeoutMs: input.timeoutMs },
    });

    try {
      const summary = await withDeadline(input.timeoutMs, runAttempt(pw, rec, input, live));
      await live.browser?.close().catch(() => undefined);
      return { status: "succeeded", attempts: attempt, summary };
    } catch (err) {
      timedOut = err instanceof TimeoutError;
      lastError = redactSecrets(err instanceof Error ? err.message : String(err), [
        input.credential?.secret,
      ]);
      await rec.screenshot(
        live.page,
        "failure",
        timedOut ? "State when the attempt timed out" : `State when the attempt failed: ${lastError}`,
      );
      await rec.log({
        kind: "error",
        label: timedOut ? `Attempt ${attempt} timed out` : `Attempt ${attempt} failed`,
        ok: false,
        detail: { error: lastError },
      });
      await live.browser?.close().catch(() => undefined);

      if (attempt < input.maxAttempts) {
        const backoff = Math.min(8000, 1000 * 2 ** (attempt - 1));
        await rec.log({ kind: "retry", label: `Retrying in ${backoff / 1000}s` });
        await sleep(backoff);
      }
    }
  }

  return {
    status: timedOut ? "timed_out" : "failed",
    attempts: input.maxAttempts,
    summary: "",
    error: lastError,
  };
}

/* ------------------------------------------------------------------- billing */

/**
 * Agent runs cost credits like any other delivery. The first attempt is charged
 * on approval; each retry is charged when it happens, so a run that needed
 * three tries is visibly more expensive than one that worked first time.
 */
export async function chargeAgentRun(
  userClient: AnyClient,
  opts: { credits: number; reason: string },
): Promise<{ charged: number; remaining: number | null; unlimited: boolean }> {
  const { data: admin } = await userClient.rpc("is_admin");
  const rpc = admin === true ? "reserve_unlimited_usage" : "spend_credits";
  const { data, error } = await userClient.rpc(rpc, {
    _action: "agent_run",
    _tier: "fast",
    _credits: opts.credits,
    _model: null,
    _thread_id: null,
    _reason: opts.reason,
  });

  if (error) {
    const message = error.message ?? "Credit check failed";
    if (/insufficient credits/i.test(message)) {
      const remaining = Number(/([\d.]+) remaining/.exec(message)?.[1] ?? 0);
      throw new Error(
        `An agent run costs ${opts.credits} credits but only ${remaining} remain. Top up to continue.`,
      );
    }
    if (admin === true) {
      return { charged: 0, remaining: null, unlimited: true };
    }
    throw new Error(message);
  }

  const row = (data ?? {}) as { charged?: number; remaining?: number };
  return {
    charged: Number(row.charged ?? opts.credits),
    remaining: row.remaining == null ? null : Number(row.remaining),
    unlimited: admin === true,
  };
}
