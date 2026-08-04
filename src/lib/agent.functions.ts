/**
 * Browser-agent server functions.
 *
 * Trust boundary: the browser may only *request* a run and *approve* it. The
 * password is decrypted, the browser is driven, and the audit trail is written
 * here — never in client code.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENT_APPROVAL_PHRASE, AGENT_ATTEMPTS, AGENT_TIMEOUT } from "@/lib/agent";

/** Is the headless browser + vault available on this server? */
export const agentRuntimeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const [{ loadBrowserRuntime }, { vaultConfigured }] = await Promise.all([
    import("@/lib/agent-runner.server"),
    import("@/lib/agent-vault.server"),
  ]);
  const browser = await loadBrowserRuntime();
  return { browserReady: browser !== null, vaultReady: vaultConfigured() };
});

export const saveAgentCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(2).max(60),
        loginUrl: z.string().trim().url(),
        username: z.string().trim().min(1).max(200),
        secret: z.string().min(1).max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in to save a credential.");

    const { sealSecret, vaultConfigured } = await import("@/lib/agent-vault.server");
    if (!vaultConfigured()) {
      throw new Error(
        "Credential vault is not configured on the server. Set CREDENTIAL_VAULT_KEY before saving passwords.",
      );
    }
    const { originOf } = await import("@/lib/agent");
    const origin = originOf(data.loginUrl);
    if (!origin) throw new Error("Enter a full login page URL, e.g. https://example.com/login.");

    const row = {
      user_id: userId,
      label: data.label,
      origin,
      login_url: data.loginUrl,
      username: data.username,
      updated_at: new Date().toISOString(),
    };

    const saved = data.id
      ? await context.supabase
          .from("agent_credentials")
          .update(row)
          .eq("id", data.id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle()
      : await context.supabase.from("agent_credentials").insert(row).select("id").maybeSingle();

    if (saved.error || !saved.data) {
      throw new Error(saved.error?.message ?? "Could not save this credential.");
    }
    const credentialId = (saved.data as { id: string }).id;

    if (data.secret) {
      const sealed = await sealSecret(data.secret);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("agent_credential_secrets").upsert(
        {
          credential_id: credentialId,
          user_id: userId,
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "credential_id" },
      );
      if (error) throw new Error("Could not store the encrypted password.");
    } else if (!data.id) {
      throw new Error("A password is required for a new credential.");
    }

    return { id: credentialId };
  });

export const deleteAgentCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in first.");
    const { error } = await context.supabase
      .from("agent_credentials")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Step 1 — queue a run. Nothing touches the credential until it is approved. */
export const requestAgentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        credentialId: z.string().uuid(),
        task: z.enum(["login", "bugfix", "verify"]),
        goal: z.string().trim().max(500).default(""),
        targetUrl: z.string().trim().url(),
        timeoutMs: z.number().int().min(AGENT_TIMEOUT.min).max(AGENT_TIMEOUT.max),
        maxAttempts: z.number().int().min(AGENT_ATTEMPTS.min).max(AGENT_ATTEMPTS.max),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in first.");

    const cred = await context.supabase
      .from("agent_credentials")
      .select("id")
      .eq("id", data.credentialId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!cred.data) throw new Error("That saved identity no longer exists.");

    const inserted = await context.supabase
      .from("agent_sessions")
      .insert({
        user_id: userId,
        credential_id: data.credentialId,
        task: data.task,
        goal: data.goal,
        target_url: data.targetUrl,
        timeout_ms: data.timeoutMs,
        max_attempts: data.maxAttempts,
        status: "pending_approval",
      })
      .select("id")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? "Could not queue this run.");
    }
    const sessionId = (inserted.data as { id: string }).id;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("agent_actions").insert({
      session_id: sessionId,
      user_id: userId,
      seq: 0,
      attempt: 0,
      kind: "requested",
      label: "Run requested — waiting for explicit approval",
      detail: { task: data.task, targetUrl: data.targetUrl },
    });

    return { id: sessionId };
  });

/** Step 2 — explicit approval. Only here is the password ever decrypted. */
export const approveAgentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        confirmation: z.string(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in first.");
    if (data.confirmation.trim().toUpperCase() !== AGENT_APPROVAL_PHRASE) {
      throw new Error(`Type ${AGENT_APPROVAL_PHRASE} to confirm the agent may sign in.`);
    }

    const session = await context.supabase
      .from("agent_sessions")
      .select("id,user_id,credential_id,task,goal,target_url,status,timeout_ms,max_attempts")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    const row = session.data as {
      id: string;
      credential_id: string | null;
      task: "login" | "bugfix" | "verify";
      goal: string;
      target_url: string;
      status: string;
      timeout_ms: number;
      max_attempts: number;
    } | null;
    if (!row) throw new Error("Run not found.");
    if (row.status !== "pending_approval") {
      throw new Error(`This run is already ${row.status.replace("_", " ")}.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { openSecret } = await import("@/lib/agent-vault.server");
    const { chargeAgentRun, runAgentSession } = await import("@/lib/agent-runner.server");
    const { estimateCost } = await import("@/lib/credits");

    // Load + decrypt the credential (service role only — the browser cannot).
    const meta = await supabaseAdmin
      .from("agent_credentials")
      .select("id,username,login_url")
      .eq("id", row.credential_id ?? "")
      .eq("user_id", userId)
      .maybeSingle();
    const secretRow = await supabaseAdmin
      .from("agent_credential_secrets")
      .select("ciphertext,iv")
      .eq("credential_id", row.credential_id ?? "")
      .eq("user_id", userId)
      .maybeSingle();
    if (!meta.data || !secretRow.data) {
      await supabaseAdmin
        .from("agent_sessions")
        .update({
          status: "failed",
          error: "The saved identity or its stored password is missing.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      throw new Error("The saved identity or its stored password is missing. Re-save it.");
    }

    const credentialMeta = meta.data as { username: string; login_url: string | null };
    const secret = await openSecret(secretRow.data as { ciphertext: string; iv: string });

    // First attempt is charged now; retries are charged as they happen.
    const perAttempt = estimateCost("agent_run");
    const firstCharge = await chargeAgentRun(context.supabase, {
      credits: perAttempt,
      reason: `Browser agent: ${row.task} on ${row.target_url}`,
    });

    const approvedAt = new Date().toISOString();
    await supabaseAdmin
      .from("agent_sessions")
      .update({
        status: "approved",
        approved_at: approvedAt,
        approval_note: data.note ?? null,
        started_at: approvedAt,
        credits_charged: firstCharge.charged,
      })
      .eq("id", row.id);
    await supabaseAdmin.from("agent_actions").insert({
      session_id: row.id,
      user_id: userId,
      seq: 1,
      attempt: 0,
      kind: "approved",
      label: "Approved by the account owner",
      detail: { note: data.note ?? null, credits: firstCharge.charged },
    });

    const startedAt = Date.now();
    const result = await runAgentSession(supabaseAdmin, {
      sessionId: row.id,
      userId,
      task: row.task,
      goal: row.goal,
      targetUrl: row.target_url,
      timeoutMs: row.timeout_ms,
      maxAttempts: row.max_attempts,
      credential: {
        username: credentialMeta.username,
        secret,
        loginUrl: credentialMeta.login_url,
      },
    });

    // Retries beyond the first attempt are billed too — best effort, so a
    // billing hiccup never hides a completed run's result.
    let totalCharged = firstCharge.charged;
    const extraAttempts = Math.max(0, result.attempts - 1);
    if (extraAttempts > 0) {
      try {
        const extra = await chargeAgentRun(context.supabase, {
          credits: Number((perAttempt * extraAttempts).toFixed(2)),
          reason: `Browser agent retries (${extraAttempts})`,
        });
        totalCharged = Number((totalCharged + extra.charged).toFixed(2));
      } catch (err) {
        console.error("[agent] retry billing skipped", err);
      }
    }

    await supabaseAdmin
      .from("agent_sessions")
      .update({
        status: result.status,
        attempt: result.attempts,
        summary: result.summary || null,
        error: result.error ?? null,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        credits_charged: totalCharged,
      })
      .eq("id", row.id);
    await supabaseAdmin.from("agent_credentials").update({ last_used_at: new Date().toISOString() }).eq("id", row.credential_id ?? "");

    return {
      status: result.status,
      attempts: result.attempts,
      summary: result.summary,
      error: result.error ?? null,
      credits: totalCharged,
    };
  });

export const cancelAgentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ sessionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in first.");
    const { error } = await context.supabase
      .from("agent_sessions")
      .update({
        status: "cancelled",
        skip_reason: "Cancelled before approval",
        finished_at: new Date().toISOString(),
      })
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .eq("status", "pending_approval");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
