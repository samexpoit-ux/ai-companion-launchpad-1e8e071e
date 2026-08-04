import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Boxes,
  ChevronDown,
  Gift,
  Home,
  LayoutGrid,
  LogOut,
  PanelLeft,
  Plug,
  Webhook,
  Globe,
  Plus,
  Search,
  Settings,
  Star,
  Users,
  Compass,
  Zap,
  Coins,
  ShieldCheck,
  UserCircle,
} from "lucide-react";


import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/BrandMark";
import { useAdmin } from "@/hooks/useAdmin";

export type RecentProject = { id: string; title: string; updatedAt: number };

const NAV = [
  { label: "Dashboard", to: "/dashboard", icon: Home, hint: "" },
  { label: "Search", to: "/search", icon: Search, hint: "Ctrl K" },
  { label: "Resources", to: "/resources", icon: Compass, hint: "" },
  { label: "Browser agent", to: "/agent", icon: Bot, hint: "" },
  { label: "Connectors", to: "/connectors", icon: Plug, hint: "" },
  { label: "Webhooks", to: "/webhooks", icon: Webhook, hint: "" },
  { label: "Domains", to: "/domains", icon: Globe, hint: "" },
] as const;


const PROJECT_NAV = [
  { label: "All projects", icon: LayoutGrid, filter: "all" },
  { label: "Starred", icon: Star, filter: "starred" },
  { label: "Owned by me", icon: Users, filter: "owned" },
  { label: "Shared with me", icon: Boxes, filter: "shared" },
] as const;

export function WorkspaceSidebar({
  recents,
  workspaceName,
  userLabel,
  credits,
  onCollapse,
  className,
}: {
  recents: RecentProject[];
  workspaceName: string;
  userLabel: string;
  credits: { left: number; total: number };
  onCollapse?: () => void;
  className?: string;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { isAdmin } = useAdmin();
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!switcherOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) setSwitcherOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [switcherOpen]);

  const pct = useMemo(
    () => Math.max(2, Math.min(100, Math.round((credits.left / Math.max(1, credits.total)) * 100))),
    [credits.left, credits.total],
  );

  return (
    <aside
      className={cn(
        "flex h-dvh w-[248px] shrink-0 flex-col overflow-y-auto border-r border-ink-200 bg-ink-100/70",
        className,
      )}
    >

      <div className="flex items-center justify-between px-3 py-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <BrandMark size="sm" />
        </Link>
        <button
          type="button"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-400 transition hover:bg-ink-200/70 hover:text-ink-700"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Workspace switcher */}
      <div ref={switcherRef} className="relative px-3">
        <button
          type="button"
          onClick={() => setSwitcherOpen((open) => !open)}
          className="flex w-full items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-2 py-2 text-left shadow-ds-xs transition hover:bg-white"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold text-[color:var(--color-iris-fg)] iris-bg">
            {workspaceName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">
            {workspaceName}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-ink-400 transition", switcherOpen && "rotate-180")}
          />
        </button>

        {switcherOpen && (
          <div className="absolute left-3 right-3 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border border-ink-200 bg-ink-50 shadow-ds-lg">
            <div className="border-b border-ink-200 p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-[color:var(--color-iris-fg)] iris-bg">
                  {workspaceName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{workspaceName}</p>
                  <p className="text-xs text-ink-500">Free plan · 1 member</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-3 w-full">
                <Users className="h-3.5 w-3.5" />
                Invite members
              </Button>
            </div>

            <div className="border-b border-ink-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-700">Credits</span>
                <span className="text-xs font-medium text-[color:var(--color-iris-ink)]">
                  {credits.left} left
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200">
                <span className="block h-full rounded-full iris-bg" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
                Daily credits reset at midnight UTC
              </p>
            </div>

            <div className="p-2">
              <p className="px-1.5 pb-1 text-xs font-medium text-ink-400">Workspaces</p>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition hover:bg-ink-200/60"
              >
                <span className="grid h-6 w-6 place-items-center rounded-md bg-ink-800 text-2xs font-bold text-ink-50">
                  {userLabel.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-700">{userLabel}</span>
                <span className="rounded bg-ink-200 px-1.5 py-0.5 text-2xs text-ink-500">Free</span>
              </button>
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-xs text-ink-600 transition hover:bg-ink-200/60"
              >
                <Plus className="h-3.5 w-3.5" />
                New workspace
              </button>
            </div>

            <div className="border-t border-ink-200 p-2">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-xs text-ink-600 transition hover:bg-ink-200/60"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>
              <div className="mt-1 flex items-center justify-between rounded-md px-1.5 py-1.5">
                <span className="flex items-center gap-2 text-xs font-medium text-ink-800">
                  <Zap className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
                  Turn Pro
                </span>
                <span className="rounded bg-[color:var(--color-iris-soft)] px-1.5 py-0.5 text-2xs font-medium text-[color:var(--color-iris-ink)]">
                  Upgrade
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="mt-3 px-3">
        {NAV.map((item) => {
            const active = pathname === item.to;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition",
                active
                  ? "border border-ink-200 bg-ink-50 font-medium text-ink-900 shadow-ds-xs"
                  : "text-ink-600 hover:bg-ink-200/60 hover:text-ink-900",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && (
                <kbd className="rounded border border-ink-200 bg-ink-50 px-1 text-2xs text-ink-400">
                  {item.hint}
                </kbd>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 px-3">
        <p className="px-2 pb-1 text-xs font-medium text-ink-400">Projects</p>
        {PROJECT_NAV.map((item) => (
          <Link
            key={item.label}
            to="/projects"
            search={{ filter: item.filter }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-ink-600 transition hover:bg-ink-200/60 hover:text-ink-900"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </Link>
        ))}
        <Link
          to="/account"
          className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-600 transition hover:bg-ink-200/60 hover:text-ink-900"
        >
          <UserCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Account &amp; plan</span>
        </Link>
        <Link
          to="/credits"
          className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-600 transition hover:bg-ink-200/60 hover:text-ink-900"
        >
          <Coins className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Credit usage</span>
        </Link>

        {isAdmin && (
          <Link
            to="/admin"
            className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-600 transition hover:bg-ink-200/60 hover:text-ink-900"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Admin panel</span>
          </Link>
        )}
      </div>



      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-2 pb-1 text-xs font-medium text-ink-400">Recents</p>
        {recents.length === 0 ? (
          <p className="px-2 py-1 text-xs text-ink-400">No projects yet</p>
        ) : (
          recents.slice(0, 8).map((project) => (
            <Link
              key={project.id}
              to="/workspace"
              search={{ thread: project.id }}

              className="block truncate rounded-lg px-2 py-1.5 text-sm text-ink-600 transition hover:bg-ink-200/60 hover:text-ink-900"
            >
              {project.title}
            </Link>
          ))
        )}
      </div>

      <div className="border-t border-ink-200 p-3">
        <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 shadow-ds-xs">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-900">Share Nexura</p>
            <p className="truncate text-xs text-ink-400">100 credits per paid referral</p>
          </div>
          <Gift className="h-4 w-4 shrink-0 text-[color:var(--color-iris)]" />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-semibold text-ink-50">
            {userLabel.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-600">{userLabel}</span>
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => void supabase.auth.signOut()}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-400 transition hover:bg-ink-200/70 hover:text-ink-700"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
