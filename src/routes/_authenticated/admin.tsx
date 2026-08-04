import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  BadgeDollarSign,
  BarChart3,
  Layers,
  LayoutDashboard,
  Menu,
  Route as RouteIcon,
  ScrollText,
  ShieldAlert,
  Ticket,
  TrendingUp,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";

import { OverviewTab } from "@/components/admin/OverviewTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { UsageTab } from "@/components/admin/UsageTab";
import { PaymentsTab } from "@/components/admin/PaymentsTab";
import { PlansTab } from "@/components/admin/PlansTab";
import { ResellersTab } from "@/components/admin/ResellersTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { TracesTab } from "@/components/admin/TracesTab";
import { ProfitTab } from "@/components/admin/ProfitTab";
import { AuditTab } from "@/components/admin/AuditTab";
import { AdminCurrencyProvider, CurrencyToggle } from "@/components/admin/currency";
import { useAdmin } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin control panel — Nexura AI" },
      {
        name: "description",
        content:
          "Nexura AI admin console: monitor users, sales, payments, credit limits, plans, platform settings and the full admin audit trail.",
      },
      { property: "og:title", content: "Admin control panel — Nexura AI" },
      {
        property: "og:description",
        content: "Monitor users, sales, credits, plans and platform settings for Nexura AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    hint: "Growth & health",
    icon: LayoutDashboard,
    accent: "var(--color-iris)",
  },
  {
    id: "users",
    label: "Users",
    hint: "Manage accounts",
    icon: Users,
    accent: "var(--color-orchid)",
  },
  {
    id: "usage",
    label: "Usage & cost",
    hint: "Tokens & spend",
    icon: BarChart3,
    accent: "var(--color-mint)",
  },
  {
    id: "profit",
    label: "Profit & margin",
    hint: "Revenue vs cost",
    icon: TrendingUp,
    accent: "var(--color-iris)",
  },
  {
    id: "payments",
    label: "Payments",
    hint: "Sales & refunds",
    icon: BadgeDollarSign,
    accent: "var(--color-sun)",
  },
  {
    id: "plans",
    label: "Plans",
    hint: "Pricing tiers",
    icon: Layers,
    accent: "var(--color-iris-warm)",
  },
  {
    id: "resellers",
    label: "Resellers",
    hint: "Coupons & commission",
    icon: Ticket,
    accent: "var(--color-mint)",
  },
  {
    id: "settings",
    label: "Settings",
    hint: "Platform config",
    icon: SlidersHorizontal,
    accent: "var(--color-iris-cyan)",
  },
  {
    id: "traces",
    label: "Model traces",
    hint: "Routing & fallbacks",
    icon: RouteIcon,
    accent: "var(--color-orchid)",
  },
  {
    id: "audit",
    label: "Audit log",
    hint: "Admin trail",
    icon: ScrollText,
    accent: "var(--color-flare)",
  },
] as const;

type TabId = (typeof SECTIONS)[number]["id"];

function AdminPage() {
  const { isAdmin, loading } = useAdmin();
  const [tab, setTab] = useState<TabId>("overview");
  const [navOpen, setNavOpen] = useState(false);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-100">
        <p className="text-sm text-ink-500">Checking access…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-100 px-4">
        <div className="max-w-md rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-ds-xs">
          <ShieldAlert className="mx-auto h-8 w-8 text-[color:var(--color-flare)]" aria-hidden />
          <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Admins only
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            This control panel is limited to accounts with the admin role.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-iris-ink)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const active = SECTIONS.find((s) => s.id === tab) ?? SECTIONS[0];

  const nav = (
    <nav aria-label="Admin sections" className="flex flex-col gap-1">
      {SECTIONS.map((section) => {
        const selected = section.id === tab;
        return (
          <button
            key={section.id}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => {
              setTab(section.id);
              setNavOpen(false);
            }}
            className={cn(
              "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition",
              selected
                ? "bg-white/12 text-[color:var(--color-iris-fg)] shadow-ds-xs ring-1 ring-inset ring-white/20"
                : "text-white/65 hover:bg-white/8 hover:text-[color:var(--color-iris-fg)]",
            )}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition"
              style={{
                background: selected
                  ? `color-mix(in oklab, ${section.accent} 85%, white)`
                  : "rgba(255,255,255,0.08)",
              }}
            >
              <section.icon
                className="h-4 w-4"
                style={{ color: selected ? "#0B1220" : "rgba(255,255,255,0.8)" }}
                aria-hidden
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{section.label}</span>
              <span className="block truncate text-2xs text-white/45">{section.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <AdminCurrencyProvider>
    <main className="min-h-dvh bg-ink-100 text-ink-900 lg:flex">
      {/* Desktop sidebar */}
      <aside
        className="hidden w-[262px] shrink-0 flex-col justify-between p-5 lg:sticky lg:top-0 lg:flex lg:h-dvh"
        style={{ background: "var(--admin-gradient)" }}
      >
        <div className="min-h-0">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{ background: "var(--premium-gradient)" }}
            >
              <ShieldCheck className="h-4.5 w-4.5 text-[color:var(--color-iris-fg)]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-semibold tracking-tight text-[color:var(--color-iris-fg)]">
                Nexura Console
              </span>
              <span className="block text-2xs text-white/45">Admin control</span>
            </span>
          </div>

          <div className="mt-6">{nav}</div>
        </div>

        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-white/60 transition hover:bg-white/8 hover:text-[color:var(--color-iris-fg)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to dashboard
        </Link>
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close admin menu"
            className="absolute inset-0 bg-ink-900/50"
            onClick={() => setNavOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 w-[272px] p-5"
            style={{ background: "var(--admin-gradient)" }}
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-[color:var(--color-iris-fg)]">
                Admin control
              </span>
              <button
                type="button"
                aria-label="Close admin menu"
                onClick={() => setNavOpen(false)}
                className="rounded-lg p-1 text-white/70 hover:bg-white/10"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-white/75 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open admin menu"
              className="rounded-xl border border-ink-200 bg-white p-2 text-ink-600 shadow-ds-xs transition hover:border-ink-300 hover:text-ink-900 lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
            <span
              className="hidden h-10 w-10 shrink-0 place-items-center rounded-2xl text-[color:var(--color-iris-fg)] shadow-ds-xs sm:grid"
              style={{ background: `linear-gradient(135deg, ${active.accent}, var(--color-iris-deep))` }}
            >
              <active.icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">
                Admin console · {active.hint}
              </p>
              <h1 className="truncate font-display text-lg font-semibold tracking-tight text-ink-900">
                {active.label}
              </h1>
            </div>
            <CurrencyToggle className="ml-auto shrink-0" />
            <span
              className="hidden shrink-0 rounded-full px-3 py-1 text-2xs font-semibold text-[color:var(--color-iris-fg)] shadow-ds-xs lg:block"
              style={{ background: "var(--premium-gradient)" }}
            >
              Premium controls
            </span>
          </div>
        </header>


        <section
          aria-label={active.label}
          className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {tab === "overview" && <OverviewTab />}
          {tab === "users" && <UsersTab />}
          {tab === "usage" && <UsageTab />}
          {tab === "profit" && <ProfitTab />}
          {tab === "payments" && <PaymentsTab />}
          {tab === "plans" && <PlansTab />}
          {tab === "resellers" && <ResellersTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "traces" && <TracesTab />}
          {tab === "audit" && <AuditTab />}
        </section>
      </div>
    </main>
    </AdminCurrencyProvider>
  );
}
