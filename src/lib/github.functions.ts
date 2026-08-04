/**
 * GitHub connection (Lovable-style "connect once, push forever").
 *
 * The personal access token is verified, then sealed with the server vault key
 * and stored in `github_connection_secrets`, a table the browser has no grants
 * on. After connecting, pushing a project is one click: the client only sends
 * the project files, never a token.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const repoName = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._-]+$/, "Repository name may only contain letters, numbers, . _ and -");

const connectInput = z.object({
  token: z.string().min(20, "Paste a GitHub personal access token with repo scope."),
  repo: repoName,
  owner: z.string().trim().optional(),
  private: z.boolean().default(true),
  autoPush: z.boolean().default(false),
});

const pushInput = z.object({
  message: z.string().default("Update from Nexura AI"),
  files: z.record(z.string(), z.string()),
});

export interface GitHubConnection {
  connected: boolean;
  login?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  autoPush?: boolean;
  repoUrl?: string;
  lastCommit?: string | null;
  lastPushedAt?: string | null;
}

/** Read the signed-in user's saved connection (never returns the token). */
export const getGitHubConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GitHubConnection> => {
    const { data } = await context.supabase
      .from("github_connections")
      .select("login, owner, repo, branch, auto_push, last_commit, last_pushed_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return { connected: false };
    const row = data as Record<string, unknown>;
    return {
      connected: true,
      login: String(row["login"] ?? ""),
      owner: String(row["owner"] ?? ""),
      repo: String(row["repo"] ?? ""),
      branch: String(row["branch"] ?? "main"),
      autoPush: Boolean(row["auto_push"]),
      repoUrl: `https://github.com/${String(row["owner"])}/${String(row["repo"])}`,
      lastCommit: (row["last_commit"] as string | null) ?? null,
      lastPushedAt: (row["last_pushed_at"] as string | null) ?? null,
    };
  });

/** Verify the token, make sure the repo exists, then store the connection. */
export const connectGitHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => connectInput.parse(data))
  .handler(async ({ data, context }): Promise<GitHubConnection> => {
    const { gh, ensureRepo } = await import("@/lib/github.server");
    const { sealSecret } = await import("@/lib/agent-vault.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const me = await gh(data.token, "/user");
    if (!me.ok) throw new Error("GitHub rejected the token. Check that it has `repo` scope.");
    const login = String(me.json["login"] ?? "");
    const owner = data.owner?.trim() || login;

    const { branch } = await ensureRepo(data.token, owner, data.repo, {
      isOrg: Boolean(data.owner?.trim() && data.owner.trim() !== login),
      private: data.private,
    });

    const sealed = await sealSecret(data.token);
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        upsert: (v: unknown, o?: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };

    const secret = await admin.from("github_connection_secrets").upsert(
      {
        user_id: context.userId,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (secret.error) throw new Error(`Could not store the token: ${secret.error.message}`);

    const meta = await admin.from("github_connections").upsert(
      {
        user_id: context.userId,
        login,
        owner,
        repo: data.repo,
        branch,
        auto_push: data.autoPush,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (meta.error) throw new Error(`Could not save the connection: ${meta.error.message}`);

    return {
      connected: true,
      login,
      owner,
      repo: data.repo,
      branch,
      autoPush: data.autoPush,
      repoUrl: `https://github.com/${owner}/${data.repo}`,
      lastCommit: null,
      lastPushedAt: null,
    };
  });

/** Turn automatic pushes on or off for the saved connection. */
export const setGitHubAutoPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ autoPush: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        update: (v: unknown) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const { error } = await admin
      .from("github_connections")
      .update({ auto_push: data.autoPush, updated_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const, autoPush: data.autoPush };
  });

/** Forget the connection and destroy the stored token. */
export const disconnectGitHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<unknown> } };
    };
    await admin.from("github_connection_secrets").delete().eq("user_id", context.userId);
    await admin.from("github_connections").delete().eq("user_id", context.userId);
    return { ok: true as const };
  });

/** One-click push of the live workspace into the connected repository. */
export const pushToConnectedRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => pushInput.parse(data))
  .handler(async ({ data, context }) => {
    const { commitFiles } = await import("@/lib/github.server");
    const { openSecret } = await import("@/lib/agent-vault.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: meta } = await context.supabase
      .from("github_connections")
      .select("owner, repo, branch")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!meta) throw new Error("No GitHub repository is connected yet.");
    const row = meta as Record<string, unknown>;

    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
        };
        update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> };
      };
    };

    const { data: sealed } = await admin
      .from("github_connection_secrets")
      .select("ciphertext, iv")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sealed) throw new Error("The stored GitHub token is missing — reconnect the repository.");

    const token = await openSecret({
      ciphertext: String(sealed["ciphertext"]),
      iv: String(sealed["iv"]),
    });

    const result = await commitFiles(token, {
      owner: String(row["owner"]),
      repo: String(row["repo"]),
      branch: String(row["branch"] ?? "main"),
      message: data.message,
      files: data.files,
    });

    await admin
      .from("github_connections")
      .update({ last_commit: result.commit, last_pushed_at: new Date().toISOString() })
      .eq("user_id", context.userId);

    try {
      const { dispatchWithClient } = await import("@/lib/webhooks.server");
      await dispatchWithClient(context.supabase, context.userId, "project.shipped", {
        target: "github",
        ...result,
      });
    } catch {
      /* webhook problems never fail a successful push */
    }

    return result;
  });
