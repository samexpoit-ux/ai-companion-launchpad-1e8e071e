/**
 * GitHub OAuth callback.
 *
 * GitHub redirects the user here after they authorize the Nexura AI OAuth App.
 * The signed `state` tells us which signed-in user started the flow, so this
 * public route never trusts anything the browser sends on its own. The access
 * token is sealed with the server vault key before it touches the database and
 * is never returned to the browser.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/github-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");

        const { verifyState, exchangeCode, callbackUrl } = await import(
          "@/lib/github-oauth.server"
        );

        if (denied) return closePopup({ ok: false, error: denied });

        const payload = verifyState(state);
        if (!payload) {
          return closePopup({
            ok: false,
            error: "This authorization link expired. Start the GitHub connection again.",
          });
        }
        if (!code) return closePopup({ ok: false, error: "GitHub did not return a code." });

        try {
          const { token } = await exchangeCode(code, callbackUrl(url.origin));
          const { gh } = await import("@/lib/github.server");
          const me = await gh(token, "/user");
          if (!me.ok) throw new Error("Could not read the GitHub account for this token.");
          const login = String(me.json["login"] ?? "");

          const { sealSecret } = await import("@/lib/agent-vault.server");
          const sealed = await sealSecret(token);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as unknown as {
            from: (table: string) => {
              upsert: (
                value: unknown,
                options?: unknown,
              ) => Promise<{ error: { message: string } | null }>;
              select: (columns: string) => {
                eq: (
                  column: string,
                  value: string,
                ) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
              };
            };
          };

          const secret = await admin.from("github_connection_secrets").upsert(
            {
              user_id: payload.userId,
              ciphertext: sealed.ciphertext,
              iv: sealed.iv,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
          if (secret.error) throw new Error(secret.error.message);

          const { data: existing } = await admin
            .from("github_connections")
            .select("owner, repo, branch, auto_push")
            .eq("user_id", payload.userId)
            .maybeSingle();

          const meta = await admin.from("github_connections").upsert(
            {
              user_id: payload.userId,
              login,
              owner: String(existing?.["owner"] ?? login),
              repo: String(existing?.["repo"] ?? ""),
              branch: String(existing?.["branch"] ?? "main"),
              auto_push: Boolean(existing?.["auto_push"] ?? true),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
          if (meta.error) throw new Error(meta.error.message);

          return closePopup({ ok: true, login });
        } catch (error) {
          return closePopup({
            ok: false,
            error: error instanceof Error ? error.message : "GitHub authorization failed.",
          });
        }
      },
    },
  },
});

/** Tiny page that reports the outcome to the opener window and closes itself. */
function closePopup(result: { ok: boolean; login?: string; error?: string }) {
  const json = JSON.stringify({ type: "nexura:github-oauth", ...result });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GitHub</title>
<style>body{font:14px/1.5 system-ui,sans-serif;padding:2rem;color:#0f172a;background:#f8fafc}</style>
</head><body>
<p>${result.ok ? `Connected as ${escapeHtml(result.login ?? "")}. You can close this window.` : escapeHtml(result.error ?? "Authorization failed.")}</p>
<script>
  var payload = ${json};
  try { if (window.opener) window.opener.postMessage(payload, "*"); } catch (e) {}
  setTimeout(function () { window.close(); }, payload.ok ? 400 : 4000);
</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
