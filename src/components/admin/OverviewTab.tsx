import { useEffect, useState } from "react";
import {
  Activity,
  CreditCard,
  FolderKanban,
  Gauge,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { fetchOverview, formatMoney, type AdminOverview } from "@/lib/admin-api";
import { formatCredits } from "@/lib/credits";
import { EmptyState, Panel, SectionHeading, StatCard, StatSkeleton } from "./ui";

export function OverviewTab() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void fetchOverview().then((res) => {
      if (!alive) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <StatSkeleton />
        <StatSkeleton count={3} />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={Gauge}
        title="Metrics unavailable"
        description="The platform metrics could not be loaded. Check the backend connection and reload."
      />
    );
  }

  const growth = data.users > 0 ? data.newUsers7d / data.users : 0;
  const activeShare = data.users > 0 ? data.activeUsers7d / data.users : 0;
  const netCredits = Math.max(0, data.creditsUsed30d - data.creditsRefunded30d);

  return (
    <div className="space-y-6">
      {/* Hero strip — the console's headline numbers */}
      <div
        className="relative overflow-hidden rounded-3xl px-5 py-5 text-[color:var(--color-iris-fg)] shadow-ds-md"
        style={{ background: "var(--admin-gradient)" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--premium-gradient)" }}
        />
        <div className="relative flex flex-wrap items-end gap-6">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-white/60">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Platform health
            </p>
            <p className="mt-1.5 font-display text-3xl font-semibold tracking-tight">
              {formatMoney(data.revenueCents)}
            </p>
            <p className="text-xs text-white/60">
              Lifetime revenue · {data.pendingPayments} payment(s) pending
            </p>
          </div>
          <dl className="ml-auto grid grid-cols-2 gap-x-8 gap-y-2 text-right sm:grid-cols-3">
            {[
              { k: "Users", v: String(data.users) },
              { k: "Active 7d", v: String(data.activeUsers7d) },
              { k: "Credits 30d", v: formatCredits(netCredits) },
            ].map((item) => (
              <div key={item.k}>
                <dt className="text-2xs uppercase tracking-wider text-white/50">{item.k}</dt>
                <dd className="font-display text-lg font-semibold tracking-tight">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <SectionHeading title="Growth" hint="Accounts, revenue and credit consumption" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={String(data.users)}
          hint={`${data.newUsers7d} joined in the last 7 days`}
          delta={data.newUsers7d > 0 ? `+${data.newUsers7d}` : "0"}
          progress={growth}
          icon={Users}
          accent="var(--color-iris)"
        />
        <StatCard
          label="Revenue"
          value={formatMoney(data.revenueCents)}
          hint={`${data.pendingPayments} payment(s) awaiting confirmation`}
          icon={CreditCard}
          accent="var(--color-sun)"
        />
        <StatCard
          label="Credits used (30d)"
          value={formatCredits(data.creditsUsed30d)}
          hint={`${formatCredits(data.creditsRefunded30d)} refunded`}
          icon={TrendingUp}
          accent="var(--color-mint)"
        />
        <StatCard
          label="Active builders (7d)"
          value={String(data.activeUsers7d)}
          hint="Accounts that spent credits"
          progress={activeShare}
          icon={Activity}
          accent="var(--color-orchid)"
        />
      </div>

      <Panel title="Product usage" description="What people are building" icon={FolderKanban}>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Projects"
            value={String(data.projects)}
            icon={FolderKanban}
            accent="var(--color-iris-warm)"
          />
          <StatCard
            label="Conversations"
            value={String(data.threads)}
            icon={MessageSquare}
            accent="var(--color-iris-cyan)"
          />
          <StatCard
            label="Messages"
            value={String(data.messages)}
            icon={MessageSquare}
            accent="var(--color-orchid)"
          />
        </div>
      </Panel>
    </div>
  );
}
