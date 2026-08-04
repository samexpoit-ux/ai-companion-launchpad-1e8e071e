/**
 * Admin panel data layer.
 *
 * Every call goes through the browser Supabase client, so RLS is the real
 * guard: the admin-only policies added for `profiles`, `payments`, `plans`,
 * `platform_settings`, `user_roles`, `user_settings` and the credit tables
 * mean a non-admin session simply sees nothing instead of relying on the UI
 * to hide it.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getAdminDirectory, listAdminUsers } from "@/lib/admin-directory.functions";


/* ------------------------------------------------------------------ types */

export interface AdminOverview {
  users: number;
  newUsers7d: number;
  projects: number;
  threads: number;
  messages: number;
  revenueCents: number;
  pendingPayments: number;
  creditsUsed30d: number;
  creditsRefunded30d: number;
  activeUsers7d: number;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  plan: string;
  creditsTotal: number;
  creditsUsed: number;
  isAdmin: boolean;
  createdAt: string | null;
  status: "active" | "suspended";
  suspendedReason: string | null;
  suspendedAt: string | null;
}

export interface AdminUserStats {
  total: number;
  premium: number;
  suspended: number;
  admins: number;
}

export interface PaymentRow {
  id: string;
  userId: string;
  email?: string | null;
  planSlug: string | null;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerRef: string | null;
  creditsGranted: number;
  note: string | null;
  createdAt: string;
}

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  monthlyCredits: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface SettingRow {
  key: string;
  value: Record<string, unknown>;
  isPublic: boolean;
  updatedAt: string;
}

export interface AdminAuditRow {
  id: string;
  actorId: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/* --------------------------------------------------------------- overview */

export async function fetchOverview(): Promise<AdminOverview> {
  const since30 = daysAgo(30);
  const since7 = daysAgo(7);

  const count = async (
    table: "profiles" | "projects" | "chat_threads" | "chat_messages",
    since?: string,
  ) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    if (since) q = q.gte("created_at", since);
    const { count: c, error } = await q;
    if (error) console.error(`[admin] count ${table} failed`, error.message);
    return c ?? 0;
  };

  const [users, newUsers7d, projects, threads, messages] = await Promise.all([
    count("profiles"),
    count("profiles", since7),
    count("projects"),
    count("chat_threads"),
    count("chat_messages"),
  ]);

  const payments = await supabase.from("payments").select("amount_cents,status");
  if (payments.error) console.error("[admin] payments read failed", payments.error.message);
  const rows = payments.data ?? [];
  const revenueCents = rows
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0);
  const pendingPayments = rows.filter((r) => r.status === "pending").length;

  const ledger = await supabase
    .from("credit_ledger")
    .select("credits,user_id,created_at")
    .gte("created_at", since30);
  if (ledger.error) console.error("[admin] ledger read failed", ledger.error.message);
  const ledgerRows = ledger.data ?? [];
  const creditsUsed30d = round(
    ledgerRows.filter((r) => Number(r.credits) > 0).reduce((s, r) => s + Number(r.credits), 0),
  );
  const creditsRefunded30d = round(
    ledgerRows
      .filter((r) => Number(r.credits) < 0)
      .reduce((s, r) => s + Math.abs(Number(r.credits)), 0),
  );
  const activeUsers7d = new Set(
    ledgerRows.filter((r) => r.created_at >= since7).map((r) => r.user_id),
  ).size;

  return {
    users,
    newUsers7d,
    projects,
    threads,
    messages,
    revenueCents,
    pendingPayments,
    creditsUsed30d,
    creditsRefunded30d,
    activeUsers7d,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ users */

export async function fetchUserStats(): Promise<AdminUserStats> {
  const [total, premium, suspended, admins] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("user_settings")
      .select("user_id", { count: "exact", head: true })
      .neq("plan", "free"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "suspended"),
    supabase
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin"),
  ]);
  return {
    total: total.count ?? 0,
    premium: premium.count ?? 0,
    suspended: suspended.count ?? 0,
    admins: admins.count ?? 0,
  };
}

export async function listUsers(search = ""): Promise<AdminUserRow[]> {
  // Preferred path: resolved on the server from the auth directory, so accounts
  // without a profile row (or blocked by an RLS edge case) still show up.
  try {
    return await listAdminUsers({ data: { search } });
  } catch (error) {
    console.error("[admin] server user directory failed, falling back", error);
  }

  let q = supabase
    .from("profiles")
    .select("id,email,display_name,plan,created_at,status,suspended_reason,suspended_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    q = q.or(`email.ilike.${term},display_name.ilike.${term}`);
  }
  const profiles = await q;
  if (profiles.error) {
    console.error("[admin] listUsers failed", profiles.error.message);
    return [];
  }


  const ids = (profiles.data ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const [settings, roles, ledger] = await Promise.all([
    supabase.from("user_settings").select("user_id,plan,credits_total").in("user_id", ids),
    supabase.from("user_roles").select("user_id,role").in("user_id", ids),
    supabase.from("credit_ledger").select("user_id,credits").in("user_id", ids),
  ]);

  const settingsBy = new Map((settings.data ?? []).map((s) => [s.user_id, s]));
  const adminIds = new Set(
    (roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
  );
  const usedBy = new Map<string, number>();
  for (const row of ledger.data ?? []) {
    usedBy.set(row.user_id, (usedBy.get(row.user_id) ?? 0) + Number(row.credits ?? 0));
  }

  return (profiles.data ?? []).map((p) => {
    const s = settingsBy.get(p.id);
    return {
      id: p.id,
      email: p.email,
      displayName: p.display_name,
      plan: s?.plan ?? p.plan ?? "free",
      creditsTotal: Number(s?.credits_total ?? 0),
      creditsUsed: round(usedBy.get(p.id) ?? 0),
      isAdmin: adminIds.has(p.id),
      createdAt: p.created_at,
      status: (p as { status?: string }).status === "suspended" ? "suspended" : "active",
      suspendedReason: (p as { suspended_reason?: string | null }).suspended_reason ?? null,
      suspendedAt: (p as { suspended_at?: string | null }).suspended_at ?? null,
    };
  });
}

export async function setUserPlan(userId: string, plan: string, creditsTotal: number) {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, plan, credits_total: creditsTotal }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await supabase.from("profiles").update({ plan }).eq("id", userId);
  await logAdmin("user.plan_changed", "user_settings", userId, { plan, creditsTotal });
}

export async function setUserCreditLimit(userId: string, creditsTotal: number) {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, credits_total: creditsTotal }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await logAdmin("user.credit_limit_changed", "user_settings", userId, { creditsTotal });
}

/** Suspends or reactivates an account (admin-only database routine). */
export async function setUserStatus(
  userId: string,
  status: "active" | "suspended",
  reason?: string,
) {
  const { error } = await supabase.rpc("admin_set_user_status", {
    _user_id: userId,
    _status: status,
    _reason: reason ?? undefined,
  });
  if (error) throw new Error(error.message);
}

/** Adds (or with a negative amount removes) credits from an account balance. */
export async function grantCredits(userId: string, credits: number, note?: string) {
  const { error } = await supabase.rpc("admin_grant_credits", {
    _user_id: userId,
    _credits: credits,
    _note: note ?? undefined,
  });
  if (error) throw new Error(error.message);
}

/** Permanently deletes an account — routed through a privileged server function. */
export async function deleteUser(userId: string) {
  const { deleteUserAccount } = await import("@/lib/admin-users.functions");
  await deleteUserAccount({ data: { userId } });
}

export async function setUserAdmin(userId: string, makeAdmin: boolean) {
  if (makeAdmin) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
  }
  await logAdmin(makeAdmin ? "user.admin_granted" : "user.admin_revoked", "user_roles", userId, {});
}

/* --------------------------------------------------------------- payments */

export async function listPayments(status?: string): Promise<PaymentRow[]> {
  let q = supabase
    .from("payments")
    .select(
      "id,user_id,plan_slug,amount_cents,currency,status,provider,provider_ref,credits_granted,note,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) {
    console.error("[admin] listPayments failed", error.message);
    return [];
  }
  const rows = (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    planSlug: r.plan_slug,
    amountCents: Number(r.amount_cents ?? 0),
    currency: r.currency,
    status: r.status,
    provider: r.provider,
    providerRef: r.provider_ref,
    creditsGranted: Number(r.credits_granted ?? 0),
    note: r.note,
    createdAt: r.created_at,
  }));

  const ids = [...new Set(rows.map((r) => r.userId))];
  if (ids.length === 0) return rows;
  const profiles = await supabase.from("profiles").select("id,email").in("id", ids);
  const emailBy = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));
  return rows.map((r) => ({ ...r, email: emailBy.get(r.userId) ?? null }));
}

export async function createPayment(input: {
  userId: string;
  planSlug: string;
  amountCents: number;
  creditsGranted: number;
  status: string;
  provider: string;
  note?: string;
}) {
  const { error } = await supabase.from("payments").insert({
    user_id: input.userId,
    plan_slug: input.planSlug,
    amount_cents: input.amountCents,
    credits_granted: input.creditsGranted,
    status: input.status,
    provider: input.provider,
    note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  await logAdmin("payment.created", "payments", input.userId, { ...input });
}

export async function updatePaymentStatus(id: string, status: string) {
  const { error } = await supabase.from("payments").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAdmin("payment.status_changed", "payments", id, { status });
}

/* ------------------------------------------------------------------ plans */

function planFromRow(r: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  monthly_credits: number;
  features: unknown;
  is_active: boolean;
  sort_order: number;
}): PlanRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    priceCents: Number(r.price_cents ?? 0),
    currency: r.currency,
    monthlyCredits: Number(r.monthly_credits ?? 0),
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    isActive: r.is_active,
    sortOrder: r.sort_order,
  };
}

const PLAN_COLUMNS =
  "id,slug,name,description,price_cents,currency,monthly_credits,features,is_active,sort_order";

export async function listPlans(): Promise<PlanRow[]> {
  const { data, error } = await supabase.from("plans").select(PLAN_COLUMNS).order("sort_order");
  if (error) {
    console.error("[admin] listPlans failed", error.message);
    return [];
  }
  return (data ?? []).map(planFromRow);
}

export async function savePlan(plan: PlanRow) {
  const { error } = await supabase
    .from("plans")
    .update({
      name: plan.name,
      description: plan.description,
      price_cents: plan.priceCents,
      monthly_credits: plan.monthlyCredits,
      features: plan.features,
      is_active: plan.isActive,
      sort_order: plan.sortOrder,
    })
    .eq("id", plan.id);
  if (error) throw new Error(error.message);
  await logAdmin("plan.updated", "plans", plan.id, { slug: plan.slug });
}

/* --------------------------------------------------------------- settings */

export async function listSettings(): Promise<SettingRow[]> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key,value,is_public,updated_at")
    .order("key");
  if (error) {
    console.error("[admin] listSettings failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    key: r.key,
    value: (r.value ?? {}) as Record<string, unknown>,
    isPublic: r.is_public,
    updatedAt: r.updated_at,
  }));
}

export async function saveSetting(key: string, value: Record<string, unknown>) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("platform_settings")
    .upsert(
      { key, value: value as Json, updated_by: auth.user?.id ?? null },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);
  await logAdmin("setting.updated", "platform_settings", key, value);
}

/* ------------------------------------------------------------------ audit */

export async function listAdminAudit(limit = 200): Promise<AdminAuditRow[]> {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id,actor_id,action,target_table,target_id,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin] listAdminAudit failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    action: r.action,
    targetTable: r.target_table,
    targetId: r.target_id,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}

/** Best-effort audit write — never blocks the action it describes. */
export async function logAdmin(
  action: string,
  targetTable: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_id: auth.user?.id ?? null,
    action,
    target_table: targetTable,
    target_id: targetId,
    details: details as Json,
  });
  if (error) console.error("[admin] audit write failed", error.message);
}

export const formatMoney = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/* ------------------------------------------------------------------ usage */

export interface UsageUserRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  plan: string;
  requests: number;
  credits: number;
  refunded: number;
  tokens: number;
  costUsd: number;
  lastUsedAt: string | null;
}

export interface UsageRequestRow {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  action: string;

  tier: string;
  credits: number;
  tokens: number;
  costUsd: number;
  model: string | null;
  upstreamModel: string | null;
  threadId: string | null;
  reason: string | null;
  reversedAt: string | null;
  createdAt: string;
}

export interface UsageReport {
  users: UsageUserRow[];
  requests: UsageRequestRow[];
  totals: { requests: number; credits: number; tokens: number; costUsd: number };
}

const money = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Per-user usage + the full per-request breakdown (tokens, provider cost in USD
 * and the upstream model that answered). Admin-only through RLS.
 */
export async function fetchUsageReport(days = 30, limit = 500): Promise<UsageReport> {
  const since = daysAgo(days);
  const [ledger, profiles, settings, directory] = await Promise.all([
    supabase
      .from("credit_ledger")
      .select(
        "id,user_id,action,tier,credits,model,upstream_model,tokens,cost_usd,thread_id,reason,reversed_at,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("profiles").select("id,email,display_name,plan").limit(1000),
    supabase.from("user_settings").select("user_id,plan").limit(1000),
    // Authoritative identities (auth directory) so cost rows never show a bare UUID.
    getAdminDirectory().catch((error) => {
      console.error("[admin] directory lookup failed", error);
      return [] as { id: string; email: string | null; displayName: string | null; plan: string }[];
    }),
  ]);

  if (ledger.error) console.error("[admin] usage read failed", ledger.error.message);

  const profileBy = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const planBy = new Map((settings.data ?? []).map((s) => [s.user_id, s.plan]));
  const dirBy = new Map(directory.map((d) => [d.id, d]));

  const identity = (userId: string) => {
    const d = dirBy.get(userId);
    const p = profileBy.get(userId);
    return {
      email: d?.email ?? p?.email ?? null,
      displayName: d?.displayName ?? p?.display_name ?? null,
      plan: planBy.get(userId) ?? d?.plan ?? p?.plan ?? "free",
    };
  };

  const requests: UsageRequestRow[] = (ledger.data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: identity(r.user_id).email,
    displayName: identity(r.user_id).displayName,
    action: r.action,
    tier: r.tier,

    credits: Number(r.credits ?? 0),
    tokens: Number(r.tokens ?? 0),
    costUsd: Number(r.cost_usd ?? 0),
    model: r.model,
    upstreamModel: r.upstream_model ?? null,
    threadId: r.thread_id,
    reason: r.reason ?? null,
    reversedAt: r.reversed_at ?? null,
    createdAt: r.created_at,
  }));

  const byUser = new Map<string, UsageUserRow>();
  for (const row of requests) {
    const who = identity(row.userId);
    const agg =
      byUser.get(row.userId) ??
      ({
        userId: row.userId,
        email: who.email,
        displayName: who.displayName,
        plan: who.plan,

        requests: 0,
        credits: 0,
        refunded: 0,
        tokens: 0,
        costUsd: 0,
        lastUsedAt: null,
      } satisfies UsageUserRow);

    if (row.credits < 0) agg.refunded = round(agg.refunded + Math.abs(row.credits));
    else {
      agg.requests += 1;
      agg.credits = round(agg.credits + row.credits);
    }
    agg.tokens += row.tokens;
    agg.costUsd = money(agg.costUsd + row.costUsd);
    if (!agg.lastUsedAt || row.createdAt > agg.lastUsedAt) agg.lastUsedAt = row.createdAt;
    byUser.set(row.userId, agg);
  }

  const users = [...byUser.values()].sort((a, b) => b.credits - a.credits);
  const totals = {
    requests: requests.filter((r) => r.credits >= 0).length,
    credits: round(requests.reduce((s, r) => s + r.credits, 0)),
    tokens: requests.reduce((s, r) => s + r.tokens, 0),
    costUsd: money(requests.reduce((s, r) => s + r.costUsd, 0)),
  };

  return { users, requests, totals };
}

/* ------------------------------------------------- model routing traces */

export interface TraceAttemptRow {
  model: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface RequestTraceRow {
  id: string;
  traceId: string;
  userId: string | null;
  email: string | null;
  endpoint: string;
  mode: string | null;
  task: string | null;
  plan: string | null;
  primaryModel: string | null;
  finalModel: string | null;
  attempts: TraceAttemptRow[];
  fallbackCount: number;
  status: string;
  errorMessage: string | null;
  promptChars: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  creditsCharged: number;
  latencyMs: number;
  threadId: string | null;
  createdAt: string;
}

export interface TraceReport {
  rows: RequestTraceRow[];
  totals: {
    requests: number;
    errors: number;
    fallbacks: number;
    avgLatencyMs: number;
    costUsd: number;
  };
}

/**
 * Model routing traces. RLS restricts `request_traces` to admins, so a
 * non-admin session simply gets an empty list.
 */
export async function fetchRequestTraces(days = 7, limit = 200): Promise<TraceReport> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  // `request_traces` is admin-only telemetry and is not part of the generated
  // Data API types, so the table name is passed untyped on purpose.
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        gte: (
          col: string,
          value: string,
        ) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
          };
        };
      };
    };
  };

  const { data } = await client
    .from("request_traces")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  const raw = data ?? [];
  const userIds = [...new Set(raw.map((r) => r["user_id"]).filter(Boolean) as string[])];
  const profiles = userIds.length
    ? await supabase.from("profiles").select("id, email").in("id", userIds)
    : { data: [] as { id: string; email: string | null }[] };
  const emailBy = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));

  const rows: RequestTraceRow[] = raw.map((r) => ({
    id: String(r["id"]),
    traceId: String(r["trace_id"] ?? ""),
    userId: (r["user_id"] as string | null) ?? null,
    email: emailBy.get(String(r["user_id"])) ?? null,
    endpoint: String(r["endpoint"] ?? ""),
    mode: (r["mode"] as string | null) ?? null,
    task: (r["task"] as string | null) ?? null,
    plan: (r["plan"] as string | null) ?? null,
    primaryModel: (r["primary_model"] as string | null) ?? null,
    finalModel: (r["final_model"] as string | null) ?? null,
    attempts: Array.isArray(r["attempts"]) ? (r["attempts"] as TraceAttemptRow[]) : [],
    fallbackCount: Number(r["fallback_count"] ?? 0),
    status: String(r["status"] ?? "ok"),
    errorMessage: (r["error_message"] as string | null) ?? null,
    promptChars: Number(r["prompt_chars"] ?? 0),
    inputTokens: Number(r["input_tokens"] ?? 0),
    outputTokens: Number(r["output_tokens"] ?? 0),
    costUsd: Number(r["cost_usd"] ?? 0),
    creditsCharged: Number(r["credits_charged"] ?? 0),
    latencyMs: Number(r["latency_ms"] ?? 0),
    threadId: (r["thread_id"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
  }));

  const totals = {
    requests: rows.length,
    errors: rows.filter((r) => r.status !== "ok").length,
    fallbacks: rows.filter((r) => r.fallbackCount > 0).length,
    avgLatencyMs: rows.length
      ? Math.round(rows.reduce((s, r) => s + r.latencyMs, 0) / rows.length)
      : 0,
    costUsd: money(rows.reduce((s, r) => s + r.costUsd, 0)),
  };

  return { rows, totals };
}

/* -------------------------------------------------- reseller coupons */

import {
  normalizeCouponCode,
  type Coupon,
  type CouponDraft,
  type CouponKind,
} from "@/lib/resellers";

const COUPON_COLUMNS =
  "id,code,kind,value,plan_slug,bonus_credits,reseller_email,reseller_name,commission_pct,max_redemptions,times_redeemed,expires_at,is_active,note,created_at";

function couponFromRow(r: Record<string, unknown>): Coupon {
  return {
    id: String(r["id"]),
    code: String(r["code"]),
    kind: String(r["kind"] ?? "percent") as CouponKind,
    value: Number(r["value"] ?? 0),
    planSlug: (r["plan_slug"] as string | null) ?? null,
    bonusCredits: Number(r["bonus_credits"] ?? 0),
    resellerEmail: (r["reseller_email"] as string | null) ?? null,
    resellerName: (r["reseller_name"] as string | null) ?? null,
    commissionPct: Number(r["commission_pct"] ?? 0),
    maxRedemptions:
      r["max_redemptions"] == null ? null : Number(r["max_redemptions"]),
    timesRedeemed: Number(r["times_redeemed"] ?? 0),
    expiresAt: (r["expires_at"] as string | null) ?? null,
    isActive: r["is_active"] !== false,
    note: (r["note"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from("coupons")
    .select(COUPON_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin] listCoupons failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => couponFromRow(r as Record<string, unknown>));
}

function couponPayload(draft: CouponDraft) {
  return {
    code: normalizeCouponCode(draft.code),
    kind: draft.kind,
    value: draft.value,
    plan_slug: draft.planSlug,
    bonus_credits: Math.max(0, Math.round(draft.bonusCredits)),
    reseller_email: draft.resellerEmail?.trim() || null,
    reseller_name: draft.resellerName?.trim() || null,
    commission_pct: draft.commissionPct,
    max_redemptions: draft.maxRedemptions,
    expires_at: draft.expiresAt,
    is_active: draft.isActive,
    note: draft.note?.trim() || null,
  };
}

export async function createCoupon(draft: CouponDraft): Promise<Coupon> {
  const payload = couponPayload(draft);
  if (!payload.code) throw new Error("Coupon code is required");
  const { data, error } = await supabase
    .from("coupons")
    .insert(payload)
    .select(COUPON_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await logAdmin("coupon.created", "coupons", data.id, { code: payload.code });
  return couponFromRow(data as Record<string, unknown>);
}

export async function saveCoupon(coupon: Coupon) {
  const { error } = await supabase
    .from("coupons")
    .update(couponPayload(coupon))
    .eq("id", coupon.id);
  if (error) throw new Error(error.message);
  await logAdmin("coupon.updated", "coupons", coupon.id, { code: coupon.code });
}

export async function deleteCoupon(id: string, code: string) {
  const { error } = await supabase.from("coupons").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAdmin("coupon.deleted", "coupons", id, { code });
}

export interface CouponRedemptionRow {
  id: string;
  code: string;
  userId: string;
  planSlug: string | null;
  creditsGranted: number;
  paidCents: number;
  discountCents: number;
  commissionCents: number;
  createdAt: string;
}

export async function listCouponRedemptions(limit = 200): Promise<CouponRedemptionRow[]> {
  const { data, error } = await supabase
    .from("coupon_redemptions")
    .select("id,code,user_id,plan_slug,credits_granted,paid_cents,discount_cents,commission_cents,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin] listCouponRedemptions failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    code: String(r.code),
    userId: String(r.user_id),
    planSlug: r.plan_slug ?? null,
    creditsGranted: Number(r.credits_granted ?? 0),
    paidCents: Number(r.paid_cents ?? 0),
    discountCents: Number(r.discount_cents ?? 0),
    commissionCents: Number(r.commission_cents ?? 0),
    createdAt: String(r.created_at),
  }));
}

/** Record a coupon sale: grants the package + bonus credits and logs commission. */
export async function redeemCouponForUser(input: {
  code: string;
  userId: string;
  planSlug: string;
  credits: number;
  paidCents: number;
}) {
  const { error } = await supabase.rpc("record_coupon_redemption", {
    _code: normalizeCouponCode(input.code),
    _user_id: input.userId,
    _plan_slug: input.planSlug,
    _credits: Math.round(input.credits),
    _paid_cents: Math.round(input.paidCents),
  });
  if (error) throw new Error(error.message);
  await logAdmin("coupon.redeemed", "coupons", input.userId, {
    code: input.code,
    plan: input.planSlug,
  });
}

/* ------------------------------------------------------- reseller pricing */

/**
 * Reseller wholesale price list (BDT per package).
 *
 * Stored as one `platform_settings` row so the price an admin types in the
 * Resellers tab survives reloads and is shared by every admin.
 */
export async function fetchResellerPrices(): Promise<ResellerPriceOverrides> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "reseller_pricing")
    .maybeSingle();
  if (error || !data?.value) return {};
  const raw = data.value as Record<string, unknown>;
  const out: ResellerPriceOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    const price = Number(value);
    if (isPlanId(key) && Number.isFinite(price) && price > 0) out[key] = price;
  }
  return out;
}

export async function saveResellerPrices(prices: ResellerPriceOverrides) {
  await saveSetting("reseller_pricing", prices as Record<string, unknown>);
}
