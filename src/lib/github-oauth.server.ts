/**
 * GitHub OAuth App helpers (server only).
 *
 * Lovable-style connect: the platform owns one OAuth App, each user authorizes
 * it against their own GitHub account, and we exchange the returned code for a
 * user access token server-side. No personal access tokens, no pasting.
 *
 * Never import this file from a component.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const CLIENT_ID_ENV = ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_CLIENT_ID"] as const;
const CLIENT_SECRET_ENV = ["GITHUB_OAUTH_CLIENT_SECRET", "GITHUB_CLIENT_SECRET"] as const;

/** OAuth scopes: create/read/write repositories the user owns or can access. */
export const GITHUB_SCOPES = "repo read:org read:user";

/** Path the OAuth App must have registered as its callback URL. */
export const GITHUB_CALLBACK_PATH = "/api/public/github-callback";

function pick(names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function githubClientId(): string | null {
  return pick(CLIENT_ID_ENV);
}

export function githubClientSecret(): string | null {
  return pick(CLIENT_SECRET_ENV);
}

export function githubOAuthConfigured(): boolean {
  return Boolean(githubClientId() && githubClientSecret());
}

/** Configured public site origin, used so the callback URL is always stable. */
export function siteOrigin(fallback?: string): string {
  const configured = pick(["PUBLIC_SITE_URL", "SITE_URL", "APP_ORIGIN"]);
  const origin = configured ?? fallback ?? "";
  return origin.replace(/\/+$/, "");
}

export function callbackUrl(fallbackOrigin?: string): string {
  const explicit = pick(["GITHUB_OAUTH_REDIRECT_URI"]);
  if (explicit) return explicit;
  return `${siteOrigin(fallbackOrigin)}${GITHUB_CALLBACK_PATH}`;
}

interface StatePayload {
  userId: string;
  origin: string;
  exp: number;
}

function hmac(value: string): string {
  const secret = githubClientSecret() ?? "nexura-github-oauth";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Sign the OAuth `state` so the public callback can trust who started it. */
export function signState(userId: string, origin: string): string {
  const payload: StatePayload = { userId, origin, exp: Date.now() + 10 * 60_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyState(state: string): StatePayload | null {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;
  const expected = hmac(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as StatePayload;
    if (!payload.userId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: githubClientId() ?? "",
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES,
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** Exchange the one-time code for a user access token. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ token: string; scope: string }> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: githubClientId(),
      client_secret: githubClientSecret(),
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const token = typeof body["access_token"] === "string" ? body["access_token"] : "";
  if (!res.ok || !token) {
    const reason =
      (body["error_description"] as string | undefined) ??
      (body["error"] as string | undefined) ??
      `GitHub returned ${res.status}`;
    throw new Error(`GitHub authorization failed: ${reason}`);
  }
  return { token, scope: String(body["scope"] ?? "") };
}
