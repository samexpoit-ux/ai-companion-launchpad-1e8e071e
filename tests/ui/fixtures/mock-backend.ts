/**
 * Unauthenticated UI test mode.
 *
 * The workspace normally lives behind the self-hosted backend, which makes
 * visual regression runs depend on a live database and real credentials. This
 * fixture replaces that dependency: every backend call the app makes (auth,
 * REST, RPC, chat/spend API routes) is answered from fixed mock data, so the
 * ChatWorkspace prompt and Live Workspace render deterministically in
 * Playwright without signing in anywhere.
 *
 * Usage:
 *   await installMockBackend(page);
 *   await openWorkspace(page);
 */
import { expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

export const MOCK_USER = {
  id: "00000000-0000-4000-8000-0000000000aa",
  email: "ui-test@nexuraai.dev",
  password: "ui-test-password",
  displayName: "UI Tester",
};

/** CSS that removes motion so screenshots are byte-stable. */
export const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

/** Fake (unsigned) JWT — the app only forwards it, never verifies it. */
function fakeJwt(): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: MOCK_USER.id, email: MOCK_USER.email, role: "authenticated", exp, aud: "authenticated" }),
    "ui-test-signature",
  ].join(".");
}

const mockUser = () => ({
  id: MOCK_USER.id,
  aud: "authenticated",
  role: "authenticated",
  email: MOCK_USER.email,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "",
  confirmed_at: "2026-01-01T00:00:00Z",
  last_sign_in_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: MOCK_USER.displayName },
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_anonymous: false,
});

const mockSession = () => ({
  access_token: fakeJwt(),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "ui-test-refresh-token",
  user: mockUser(),
});

const mockProfile = () => ({
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  display_name: MOCK_USER.displayName,
  avatar_url: null,
  plan: "pro",
  monthly_credit_cents: 0,
});

const mockBalance = () => ({
  plan: "pro",
  total: 500,
  used: 42,
  remaining: 458,
  period_start: "2026-07-01T00:00:00Z",
});

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });

/** Mocked assistant reply — includes an artifact so the Live Workspace fills. */
const MOCK_CHAT_REPLY = {
  content: "Here is a mocked reply used by the UI test mode.",
  model: "ui-test/mock-model",
  tokens: 128,
  latencyMs: 120,
  credits: { charged: 1, remaining: 457, total: 500, used: 43, plan: "pro" },
};

export async function installMockBackend(
  page: Page,
  chatReply: Record<string, unknown> = MOCK_CHAT_REPLY,
): Promise<void> {
  // Realtime websockets never reach a server in test mode.
  if (typeof page.routeWebSocket === "function") {
    await page.routeWebSocket(/realtime/, () => {
      /* swallow: no realtime in UI test mode */
    });
  }

  // ---- Supabase Auth (GoTrue) -------------------------------------------
  await page.route(/\/auth\/v1\/.*/, async (route) => {
    const url = route.request().url();
    if (url.includes("/token")) return json(route, mockSession());
    if (url.includes("/user")) return json(route, mockUser());
    if (url.includes("/logout")) return route.fulfill({ status: 204, body: "" });
    if (url.includes("/settings")) {
      return json(route, { external: { google: true }, disable_signup: false });
    }
    return json(route, {});
  });

  // ---- Supabase REST / RPC ----------------------------------------------
  await page.route(/\/rest\/v1\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.split("/rest/v1/")[1] ?? "";
    const method = route.request().method();

    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      if (fn.includes("balance")) return json(route, mockBalance());
      if (fn.includes("role") || fn.includes("admin")) return json(route, false);
      return json(route, null);
    }

    if (method !== "GET") {
      // Writes are accepted and echoed back so optimistic UI keeps working.
      const body = route.request().postDataJSON?.() ?? {};
      if (path.startsWith("chat_threads") && !Array.isArray(body)) {
        return json(route, [{ id: "00000000-0000-4000-8000-0000000000bb", ...body }], 201);
      }
      return json(route, Array.isArray(body) ? body : [body], 201);
    }

    if (path.startsWith("profiles")) return json(route, [mockProfile()]);
    if (path.startsWith("user_settings")) {
      return json(route, [{ user_id: MOCK_USER.id, plan: "pro", credit_total: 500 }]);
    }
    // chat_threads, chat_messages, credit_ledger, audit logs, … start empty.
    return json(route, []);
  });

  // ---- App API routes ----------------------------------------------------
  await page.route("**/api/chat", (route) => json(route, chatReply));
  await page.route("**/api/spend", (route) =>
    json(route, { credits: { charged: 1, remaining: 457, total: 500, used: 43, plan: "pro" } }),
  );
  await page.route("**/api/autofix", (route) =>
    json(route, { summary: "mocked auto-fix", files: {}, model: "ui-test/mock-model" }),
  );
}

/** Supabase URL used by the app (env or .env), for the auth storage key. */
function supabaseUrl(): string {
  if (process.env["VITE_SUPABASE_URL"]) return process.env["VITE_SUPABASE_URL"]!;
  try {
    const env = readFileSync(".env", "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("VITE_SUPABASE_URL="));
    if (line) return line.slice("VITE_SUPABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no .env in this environment */
  }
  return "http://localhost:54321";
}

/** Default storage key used by supabase-js: sb-<first host label>-auth-token. */
function authStorageKey(): string {
  let host = "localhost";
  try {
    host = new URL(supabaseUrl()).hostname;
  } catch {
    /* fall back */
  }
  return `sb-${host.split(".")[0]}-auth-token`;
}

/**
 * Puts the app in signed-in UI test mode without touching a real backend: a
 * mock session is written to the Supabase client's storage key, then the
 * workspace is opened. Falls back to the mocked sign-in form if needed.
 */
export async function openWorkspace(page: Page, path = "/workspace"): Promise<void> {
  const key = authStorageKey();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, session]) => window.localStorage.setItem(k as string, session as string),
    [key, JSON.stringify(mockSession())] as const,
  );

  await page.goto(path, { waitUntil: "domcontentloaded" });

  if (/\/auth/.test(page.url())) {
    // Storage key mismatch — sign in through the mocked auth endpoint instead.
    await page.getByLabel(/email/i).first().fill(MOCK_USER.email);
    await page.getByLabel(/password/i).first().fill(MOCK_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForURL(/dashboard|workspace/, { timeout: 30_000 });
    await page.goto(path, { waitUntil: "domcontentloaded" });
  }

  await page.getByTestId("composer").waitFor({ state: "visible", timeout: 30_000 });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.waitForTimeout(400);
}

/** Opens the right-hand Live Workspace panel with mocked project content. */
export async function openLiveWorkspace(page: Page): Promise<void> {
  const panel = page.getByTestId("live-workspace");
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByTestId("workspace-toggle").click();
  }
  await expect(panel).toBeVisible();

  const starter = page.getByRole("button", { name: /load starter project/i });
  if (await starter.isVisible().catch(() => false)) {
    await starter.click();
  }
  await expect(page.getByTestId("workspace-stage")).toBeVisible({ timeout: 20_000 });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.waitForTimeout(500);
}
