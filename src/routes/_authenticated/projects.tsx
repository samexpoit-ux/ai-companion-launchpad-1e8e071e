import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { PageBar, PageBody, PageHeader, PageShell } from "@/components/page-shell";
import { deleteThread, listThreads, renameThread, type StoredThread } from "@/lib/chat-store";
import { listSharedThreadIds, listStarredThreadIds, setThreadStar } from "@/lib/collab";
import { ShareDialog } from "@/components/ShareDialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ProjectThumbnail } from "@/components/ProjectThumbnail";

export const Route = createFileRoute("/_authenticated/projects")({
  validateSearch: (search: Record<string, unknown>) => ({
    filter: typeof search.filter === "string" ? search.filter : "all",
  }),
  component: ProjectsPage,
  head: () => ({
    meta: [
      { title: "Projects — Nexura AI" },
      { name: "description", content: "Browse, star, rename and reopen your Nexura AI projects." },
      { property: "og:title", content: "Projects — Nexura AI" },
      { property: "og:description", content: "Browse projects in your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const FILTERS = [
  { id: "all", label: "All projects" },
  { id: "starred", label: "Starred" },
  { id: "owned", label: "Owned by me" },
  { id: "shared", label: "Shared with me" },
] as const;

function ProjectsPage() {
  const { filter } = Route.useSearch();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [stars, setStars] = useState<string[]>([]);
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shareTarget, setShareTarget] = useState<StoredThread | null>(null);

  useEffect(() => {
    // Stars and share membership live in the database, so they follow the
    // account across devices instead of sitting in one browser.
    void listThreads().then(setThreads);
    void listStarredThreadIds().then(setStars);
    void listSharedThreadIds().then(setSharedIds);
    void supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  const toggleStar = useCallback((id: string) => {
    setStars((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      void setThreadStar(id, !prev.includes(id));
      return next;
    });
  }, []);

  const rename = useCallback(async (thread: StoredThread) => {
    const next = window.prompt("Rename project", thread.title)?.trim();
    if (!next || next === thread.title) return;
    await renameThread(thread.id, next);
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, title: next } : t)));
  }, []);

  const remove = useCallback(async (thread: StoredThread) => {
    if (!window.confirm(`Delete "${thread.title}"? This cannot be undone.`)) return;
    await deleteThread(thread.id);
    setThreads((prev) => prev.filter((t) => t.id !== thread.id));
  }, []);

  const counts = useMemo(
    () => ({
      all: threads.length,
      starred: threads.filter((t) => stars.includes(t.id)).length,
      owned: threads.filter((t) => !myId || t.ownerId === myId).length,
      shared: threads.filter((t) => sharedIds.includes(t.id) || (myId ? t.ownerId !== myId : false))
        .length,
    }),
    [threads, stars, sharedIds, myId],
  );

  const visible = useMemo(() => {
    const isShared = (t: StoredThread) =>
      sharedIds.includes(t.id) || (myId ? t.ownerId !== myId : false);
    const base =
      filter === "starred"
        ? threads.filter((t) => stars.includes(t.id))
        : filter === "shared"
          ? threads.filter(isShared)
          : filter === "owned"
            ? threads.filter((t) => !myId || t.ownerId === myId)
            : threads;
    const q = query.trim().toLowerCase();
    return q ? base.filter((t) => t.title.toLowerCase().includes(q)) : base;
  }, [filter, threads, stars, sharedIds, myId, query]);

  const title = FILTERS.find((f) => f.id === filter)?.label ?? "All projects";

  return (
    <PageShell width="xl">
      <PageBar>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-ink-500 transition hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
        <Button size="sm" className="ml-auto" onClick={() => void navigate({ to: "/workspace" })}>
          New project
        </Button>
      </PageBar>

      <PageHeader
        title={title}
        description="Every build lives in its own workspace with chat history, code and preview."
      />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-ink-200 bg-white p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              to="/projects"
              search={{ filter: f.id }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                filter === f.id
                  ? "bg-[color:var(--color-iris)] text-white shadow-sm"
                  : "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-2xs",
                  filter === f.id ? "bg-white/25" : "bg-ink-100 text-ink-500",
                )}
              >
                {counts[f.id]}
              </span>
            </Link>
          ))}
        </div>

        <label className="relative lg:ml-auto lg:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
            className="w-full rounded-full border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-[color:var(--color-iris)] focus:ring-2 focus:ring-[color:var(--color-iris)]/20"
          />
        </label>
      </div>

      <PageBody className="mt-6">
        {visible.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((thread) => {
              const starred = stars.includes(thread.id);
              return (
                <article
                  key={thread.id}
                  className="group relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-ds-xs transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(16,24,40,0.45)]"
                >
                  <Link
                    to="/workspace"
                    search={{ thread: thread.id }}
                    className="block focus-visible:outline-none"
                  >
                    <ProjectThumbnail threadId={thread.id} />
                    <div className="p-4">
                      <p className="truncate text-sm font-semibold text-ink-900">{thread.title}</p>
                      <p className="mt-1 text-xs text-ink-500">
                        Updated {new Date(thread.lastMessageAt).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>

                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleStar(thread.id)}
                      aria-label={starred ? "Remove star" : "Star project"}
                      aria-pressed={starred}
                      className="rounded-full bg-black/20 p-1.5 text-white backdrop-blur transition hover:bg-black/35"
                    >
                      <Star className={cn("h-3.5 w-3.5", starred && "fill-current")} />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Project options"
                          className="rounded-full bg-black/20 p-1.5 text-white backdrop-blur transition hover:bg-black/35"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => setShareTarget(thread)}>
                          <Share2 className="mr-2 h-3.5 w-3.5" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void rename(thread)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-[color:var(--color-rose,#E11D48)]"
                          onSelect={() => void remove(thread)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-white/60 py-16 text-center">
            <p className="text-sm font-medium text-ink-900">
              {filter === "shared"
                ? "Nothing shared with you yet"
                : filter === "starred"
                  ? "No starred projects yet"
                  : "No projects yet"}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs text-ink-500">
              {filter === "starred"
                ? "Star a project from its card to pin it here."
                : filter === "shared"
                  ? "Ask a teammate to invite you, or share one of your projects from its ⋯ menu."
                  : "Describe what you want to build and Nexura ships a working project."}
            </p>
            <Button size="sm" className="mt-4" onClick={() => void navigate({ to: "/workspace" })}>
              Start building
            </Button>
          </div>
        )}
      </PageBody>

      {shareTarget ? (
        <ShareDialog
          threadId={shareTarget.id}
          title={shareTarget.title}
          open
          onOpenChange={(open) => {
            if (!open) setShareTarget(null);
            void listSharedThreadIds().then(setSharedIds);
          }}
        />
      ) : null}
    </PageShell>
  );
}
