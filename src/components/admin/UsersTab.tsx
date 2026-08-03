import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Coins,
  Crown,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Sparkles,
  Trash2,
  UserCheck,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteUser,
  fetchUserStats,
  grantCredits,
  listUsers,
  setUserAdmin,
  setUserCreditLimit,
  setUserPlan,
  setUserStatus,
  type AdminUserRow,
  type AdminUserStats,
} from "@/lib/admin-api";
import { formatCredits } from "@/lib/credits";
import { MIN_TOPUP_CREDITS, PLANS, PREMIUM_PLAN_ID, planById } from "@/lib/plans";
import { cn } from "@/lib/utils";

type Filter = "all" | "premium" | "free" | "suspended" | "admins";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "premium", label: "Premium" },
  { id: "free", label: "Free" },
  { id: "suspended", label: "Suspended" },
  { id: "admins", label: "Admins" },
];

const PREMIUM_PLAN = PREMIUM_PLAN_ID;

export function UsersTab() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminUserStats>({
    total: 0,
    premium: 0,
    suspended: 0,
    admins: 0,
  });

  const load = useCallback(async (term: string) => {
    setLoading(true);
    const [users, userStats] = await Promise.all([listUsers(term), fetchUserStats()]);
    setRows(users);
    setStats(userStats);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const run = async (row: AdminUserRow, label: string, fn: () => Promise<unknown>) => {
    setBusy(row.id);
    try {
      await fn();
      toast.success(label);
      await load(search);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const changePlan = (row: AdminUserRow, plan: string) =>
    run(row, `${row.email ?? "User"} moved to ${planById(plan).name}`, () =>
      setUserPlan(row.id, plan, planById(plan).credits),
    );

  const makePremium = (row: AdminUserRow) =>
    run(row, `${row.email ?? "User"} upgraded to ${planById(PREMIUM_PLAN).name}`, () =>
      setUserPlan(row.id, PREMIUM_PLAN, planById(PREMIUM_PLAN).credits),
    );

  const changeLimit = (row: AdminUserRow, value: string) => {
    const credits = Number(value);
    if (!Number.isFinite(credits) || credits < 0) return;
    return run(row, "Credit limit updated", () => setUserCreditLimit(row.id, credits));
  };

  const topUp = (row: AdminUserRow) => {
    const input = window.prompt(
      `Grant credits to ${row.email ?? "this account"} — minimum top-up is ${MIN_TOPUP_CREDITS} (negative removes)`,
      String(MIN_TOPUP_CREDITS),
    );
    if (input === null) return;
    const credits = Number(input);
    if (!Number.isFinite(credits) || credits === 0) {
      toast.error("Enter a non-zero number of credits");
      return;
    }
    if (credits > 0 && credits < MIN_TOPUP_CREDITS) {
      toast.error(`Minimum top-up is ${MIN_TOPUP_CREDITS} credits`);
      return;
    }
    return run(row, `${credits > 0 ? "Granted" : "Removed"} ${Math.abs(credits)} credits`, () =>
      grantCredits(row.id, credits, "admin console"),
    );
  };

  const toggleAdmin = (row: AdminUserRow) =>
    run(row, row.isAdmin ? "Admin access revoked" : "Admin access granted", () =>
      setUserAdmin(row.id, !row.isAdmin),
    );

  const toggleSuspend = (row: AdminUserRow) => {
    if (row.status === "suspended") {
      return run(row, "Account reactivated", () => setUserStatus(row.id, "active"));
    }
    const reason = window.prompt(
      `Why are you suspending ${row.email ?? "this account"}?`,
      "Abuse of credit system",
    );
    if (reason === null) return;
    return run(row, "Account suspended", () => setUserStatus(row.id, "suspended", reason));
  };

  const removeUser = (row: AdminUserRow) => {
    if (!window.confirm(`Permanently delete ${row.email ?? row.id}? This cannot be undone.`))
      return;
    return run(row, "Account deleted", () => deleteUser(row.id));
  };

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === "premium") return r.plan !== "free";
        if (filter === "free") return r.plan === "free";
        if (filter === "suspended") return r.status === "suspended";
        if (filter === "admins") return r.isAdmin;
        return true;
      }),
    [rows, filter],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Accounts"
          value={stats.total}
          icon={UsersIcon}
          accent="var(--color-iris)"
        />
        <MetricCard
          label="Premium"
          value={stats.premium}
          icon={Crown}
          accent="var(--color-orchid)"
        />
        <MetricCard
          label="Suspended"
          value={stats.suspended}
          icon={Ban}
          accent="var(--color-flare)"
        />
        <MetricCard label="Admins" value={stats.admins} icon={Shield} accent="var(--color-mint)" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-ds-xs sm:flex-row sm:items-center">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(search);
          }}
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or name"
              aria-label="Search users"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Refresh users"
            onClick={() => void load(search)}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
          </Button>
        </form>

        <div role="group" aria-label="Filter users" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                filter === f.id
                  ? "border-transparent font-semibold text-[color:var(--color-iris-fg)]"
                  : "border-ink-200 text-ink-600 hover:bg-ink-100",
              )}
              style={filter === f.id ? { background: "var(--premium-gradient)" } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading users…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-ink-200 bg-white p-6 text-center text-sm text-ink-500">
          No accounts match this view.
        </p>
      ) : (
        <ul className="grid gap-3">
          {visible.map((row) => (
            <li
              key={row.id}
              className={cn(
                "rounded-2xl border bg-white p-4 shadow-ds-xs transition",
                row.status === "suspended"
                  ? "border-[color:var(--color-flare)]/35 bg-[color:var(--color-flare-soft)]"
                  : "border-ink-200 hover:border-[color:var(--color-iris)]/40",
                busy === row.id && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm font-semibold text-[color:var(--color-iris-fg)]"
                  style={{
                    background:
                      row.plan === "free" ? "var(--iris-gradient)" : "var(--premium-gradient)",
                  }}
                  aria-hidden
                >
                  {(row.displayName ?? row.email ?? "?").slice(0, 1).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {row.displayName ?? row.email ?? row.id}
                    </p>
                    {row.plan !== "free" && (
                      <Tag tone="orchid" icon={Crown}>
                        {planById(row.plan).name}
                      </Tag>
                    )}
                    {row.isAdmin && (
                      <Tag tone="mint" icon={Shield}>
                        Admin
                      </Tag>
                    )}
                    {row.status === "suspended" ? (
                      <Tag tone="flare" icon={Ban}>
                        Suspended
                      </Tag>
                    ) : (
                      <Tag tone="mint" icon={CheckCircle2}>
                        Active
                      </Tag>
                    )}
                  </div>
                  <p className="truncate text-xs text-ink-500">{row.email ?? row.id}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatCredits(row.creditsUsed)} of {formatCredits(row.creditsTotal)} credits
                    used
                    {row.createdAt
                      ? ` · joined ${new Date(row.createdAt).toLocaleDateString()}`
                      : ""}
                  </p>
                  {row.status === "suspended" && row.suspendedReason && (
                    <p className="mt-1 text-xs text-[color:var(--color-flare)]">
                      Reason: {row.suspendedReason}
                    </p>
                  )}
                  <div
                    className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-ink-200"
                    role="img"
                    aria-label={`${formatCredits(row.creditsUsed)} of ${formatCredits(row.creditsTotal)} credits used`}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, row.creditsTotal ? (row.creditsUsed / row.creditsTotal) * 100 : 0)}%`,
                        background: "var(--premium-gradient)",
                      }}
                    />
                  </div>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <label className="text-2xs font-semibold uppercase tracking-wider text-ink-500">
                    <span className="sr-only">Plan for {row.email ?? row.id}</span>
                    <select
                      aria-label={`Plan for ${row.email ?? row.id}`}
                      value={row.plan}
                      disabled={busy === row.id}
                      onChange={(e) => void changePlan(row, e.target.value)}
                      className="rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-normal normal-case tracking-normal text-ink-800"
                    >
                      {PLANS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Input
                    type="number"
                    min={0}
                    defaultValue={row.creditsTotal}
                    disabled={busy === row.id}
                    aria-label={`Credit limit for ${row.email ?? row.id}`}
                    className="h-9 w-24 text-xs"
                    onBlur={(e) => {
                      if (Number(e.target.value) !== row.creditsTotal) {
                        void changeLimit(row, e.target.value);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-200 pt-3">
                <Button
                  size="sm"
                  disabled={busy === row.id || row.plan === PREMIUM_PLAN}
                  onClick={() => void makePremium(row)}
                  className="text-[color:var(--color-iris-fg)]"
                  style={{ background: "var(--premium-gradient)" }}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Make premium
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === row.id}
                  onClick={() => void topUp(row)}
                >
                  <Coins className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Grant credits
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === row.id}
                  onClick={() => void toggleSuspend(row)}
                >
                  {row.status === "suspended" ? (
                    <>
                      <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Reactivate
                    </>
                  ) : (
                    <>
                      <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Suspend
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={row.isAdmin ? "secondary" : "outline"}
                  disabled={busy === row.id}
                  onClick={() => void toggleAdmin(row)}
                >
                  {row.isAdmin ? (
                    <>
                      <ShieldOff className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Revoke admin
                    </>
                  ) : (
                    <>
                      <Shield className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Make admin
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === row.id || row.isAdmin}
                  onClick={() => void removeUser(row)}
                  className="ml-auto border-[color:var(--color-flare)]/40 text-[color:var(--color-flare)] hover:bg-[color:var(--color-flare-soft)]"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof UsersIcon;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-ds-xs">
      <div className="flex items-center gap-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-xl"
          style={{ background: `color-mix(in oklab, ${accent} 14%, white)` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} aria-hidden />
        </span>
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900">
        {value}
      </p>
    </div>
  );
}

function Tag({
  tone,
  icon: Icon,
  children,
}: {
  tone: "mint" | "flare" | "orchid";
  icon: typeof Shield;
  children: React.ReactNode;
}) {
  const accent = `var(--color-${tone})`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold"
      style={{ background: `var(--color-${tone}-soft)`, color: accent }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}
