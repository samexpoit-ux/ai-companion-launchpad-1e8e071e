/**
 * Server-side admin directory.
 *
 * The admin console used to read `public.profiles` straight from the browser,
 * which silently returned zero rows whenever an RLS edge case or a missing
 * profile row got in the way — the Users tab looked empty and the cost/profit
 * tables fell back to raw UUIDs instead of names.
 *
 * Here we resolve identities once, on the server, from the auth directory
 * itself (the only place that always has an email) and enrich it with profile,
 * plan, role and ledger data. The caller's admin role is verified against the
 * database first, through their own RLS-scoped client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DirectoryEntry {
  id: string;
  email: string | null;
  displayName: string | null;
  plan: string;
}

export interface AdminUserRecord extends DirectoryEntry {
  creditsTotal: number;
  creditsUsed: number;
  isAdmin: boolean;
  createdAt: string;
  status: "active" | "suspended";
  suspendedReason: string | null;
  suspendedAt: string | null;
}

/** Throws unless the signed-in caller really holds the admin role. */
export async function assertAdmin(
  supabase: SupabaseClient,
  callerId: string | null | undefined,
): Promise<string> {
  if (!callerId) throw new Error("Sign in as an admin to view this data.");
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: callerId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin role required.");
  return callerId;
}

const round = (n: number) => Math.round(n * 100) / 100;

async function loadRaw() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // auth.users is the source of truth for emails and signup dates.
  const authUsers: { id: string; email: string | null; created_at: string }[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const batch = data?.users ?? [];
    for (const u of batch) {
      authUsers.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? new Date().toISOString(),
      });
    }
    if (batch.length < 200) break;
  }

  const [profiles, settings, roles, ledger] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,email,display_name,plan,created_at,status,suspended_reason,suspended_at"),
    supabaseAdmin.from("user_settings").select("user_id,plan,credits_total"),
    supabaseAdmin.from("user_roles").select("user_id,role"),
    supabaseAdmin.from("credit_ledger").select("user_id,credits"),
  ]);

  return { authUsers, profiles, settings, roles, ledger };
}

/** Every known account, newest first, with plan/credit/role context. */
export async function adminUserRecords(search = ""): Promise<AdminUserRecord[]> {
  const { authUsers, profiles, settings, roles, ledger } = await loadRaw();

  type ProfileRow = {
    id: string;
    email: string | null;
    display_name: string | null;
    plan: string | null;
    created_at: string;
    status?: string | null;
    suspended_reason?: string | null;
    suspended_at?: string | null;
  };

  const profileBy = new Map<string, ProfileRow>(
    ((profiles.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );
  const settingsBy = new Map(
    (settings.data ?? []).map((s) => [s.user_id, s as { plan: string | null; credits_total: number | null }]),
  );
  const adminIds = new Set(
    (roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
  );
  const usedBy = new Map<string, number>();
  for (const row of ledger.data ?? []) {
    usedBy.set(row.user_id, (usedBy.get(row.user_id) ?? 0) + Number(row.credits ?? 0));
  }

  // Union of auth users and profile rows so nobody can go missing either way.
  const ids = new Set<string>([...authUsers.map((u) => u.id), ...profileBy.keys()]);
  const authBy = new Map(authUsers.map((u) => [u.id, u]));

  const rows: AdminUserRecord[] = [...ids].map((id) => {
    const a = authBy.get(id);
    const p = profileBy.get(id);
    const s = settingsBy.get(id);
    return {
      id,
      email: a?.email ?? p?.email ?? null,
      displayName: p?.display_name ?? null,
      plan: s?.plan ?? p?.plan ?? "free",
      creditsTotal: Number(s?.credits_total ?? 0),
      creditsUsed: round(usedBy.get(id) ?? 0),
      isAdmin: adminIds.has(id),
      createdAt: p?.created_at ?? a?.created_at ?? new Date().toISOString(),
      status: p?.status === "suspended" ? "suspended" : "active",
      suspendedReason: p?.suspended_reason ?? null,
      suspendedAt: p?.suspended_at ?? null,
    };
  });

  const term = search.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) =>
        `${r.email ?? ""} ${r.displayName ?? ""} ${r.id}`.toLowerCase().includes(term),
      )
    : rows;

  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Lightweight id → identity map used to label usage, cost and profit rows. */
export async function adminDirectory(): Promise<DirectoryEntry[]> {
  const rows = await adminUserRecords();
  return rows.map(({ id, email, displayName, plan }) => ({ id, email, displayName, plan }));
}
