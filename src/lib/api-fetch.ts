/**
 * Authenticated fetch for the app's own API routes.
 *
 * Server routes (`/api/chat`, `/api/autofix`) enforce credits per user, so they
 * need the Supabase access token on every call. Keeping this in one helper
 * means no endpoint can accidentally be called anonymously.
 */
import { supabase } from "@/integrations/supabase/client";

export async function apiFetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Charges a cheap non-model action (preview run, export) through `/api/spend`.
 * Returns the authoritative balance, or throws with a readable message.
 */
export async function spendAction(
  action: "preview_run" | "export",
  opts?: { threadId?: string },
): Promise<{ remaining: number; total: number; used: number; plan: string; charged: number }> {
  const res = await apiFetch("/api/spend", { action, threadId: opts?.threadId });
  const data = (await res.json().catch(() => ({}))) as {
    credits?: { remaining: number; total: number; used: number; plan: string; charged: number };
    error?: { message?: string };
  };
  if (!res.ok || !data.credits) {
    throw new Error(data.error?.message ?? "Could not charge credits for this action.");
  }
  return data.credits;
}
