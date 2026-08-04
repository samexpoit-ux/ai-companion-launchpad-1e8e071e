/**
 * Project card thumbnail.
 *
 * A project's real preview lives in the sandbox, so instead of rendering an
 * iframe per card we derive a lightweight wireframe from the last build's
 * files: heading/section/image counts drive the blocks, so two projects never
 * look identical and the card still tells you what kind of app it is.
 *
 * Thumbnail derivation touches the database, so the card shows a skeleton
 * until the fetch settles.
 */
import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { listMessages } from "@/lib/chat-store";
import { parseArtifacts } from "@/lib/artifact";
import { cn } from "@/lib/utils";

const ACCENTS: Array<[string, string]> = [
  ["#3B82F6", "#93B4FA"],
  ["#7C3AED", "#C084FC"],
  ["#059669", "#5EEAD4"],
  ["#F59E0B", "#FCD34D"],
  ["#E11D48", "#FB7185"],
  ["#0EA5E9", "#67E8F9"],
];

export function accentPairFor(id: string): [string, string] {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return ACCENTS[sum % ACCENTS.length]!;
}

export function accentFor(id: string) {
  const [from, to] = accentPairFor(id);
  return `linear-gradient(135deg, ${from}, ${to})`;
}

interface Shape {
  /** Rough page structure: how many content rows and whether there's a grid. */
  rows: number;
  cards: number;
  sidebar: boolean;
  media: boolean;
  files: number;
}

function shapeFromCode(code: string, files: number): Shape {
  const lower = code.toLowerCase();
  const count = (re: RegExp) => (lower.match(re) ?? []).length;
  const sections = count(/<section|<main|<article/g);
  const cards = count(/class(name)?="[^"]*\b(card|grid|tile)\b/g);
  return {
    rows: Math.min(4, Math.max(2, sections || 3)),
    cards: cards > 0 ? Math.min(6, Math.max(3, cards)) : 0,
    sidebar: /\b(sidebar|aside|<nav)/.test(lower),
    media: count(/<img|<video|background-image/g) > 0,
    files,
  };
}

export function ProjectThumbnail({
  threadId,
  className,
}: {
  threadId: string;
  className?: string;
}) {
  const [shape, setShape] = useState<Shape | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, to] = accentPairFor(threadId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setShape(null);
    void listMessages(threadId)
      .then((messages) => {
        if (!alive) return;
        // Walk backwards: the newest assistant build is the truest preview.
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const message = messages[i];
          if (!message || message.role !== "assistant") continue;
          const project = parseArtifacts(message.content).at(-1);
          if (!project) continue;
          const code = Object.values(project.files).join("\n").slice(0, 20_000);
          setShape(shapeFromCode(code, project.order.length));
          return;
        }
        setShape(null);
      })
      .catch(() => {
        if (alive) setShape(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [threadId]);

  const blocks = useMemo(() => {
    if (!shape) return null;
    return Array.from({ length: shape.rows }, (_, i) => i);
  }, [shape]);

  if (loading) {
    return (
      <div
        className={cn("relative h-28 overflow-hidden bg-ink-100", className)}
        aria-hidden="true"
        data-testid="project-thumb-skeleton"
      >
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-ink-200/70 via-ink-100 to-ink-200/60" />
        <div className="absolute inset-x-4 top-4 space-y-2">
          <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-ink-300/70" />
          <div className="h-2 w-2/3 animate-pulse rounded-full bg-ink-200" />
        </div>
      </div>
    );
  }

  if (!shape || !blocks) {
    return (
      <div
        className={cn("relative grid h-28 place-items-center", className)}
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <Layers className="h-7 w-7 text-white opacity-90" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={cn("relative h-28 overflow-hidden", className)}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      role="img"
      aria-label={`Layout preview: ${shape.files} file${shape.files === 1 ? "" : "s"}`}
    >
      <div className="absolute inset-2.5 flex gap-1.5 rounded-lg bg-white/92 p-2 shadow-[0_10px_24px_-18px_rgba(16,24,40,0.6)]">
        {shape.sidebar ? (
          <div className="flex w-1/5 flex-col gap-1 rounded bg-ink-100/90 p-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1 rounded-full bg-ink-300/80" />
            ))}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-6 rounded-full" style={{ backgroundColor: from }} />
            <span className="h-1 w-4 rounded-full bg-ink-200" />
            <span className="ml-auto h-1.5 w-4 rounded-full bg-ink-200" />
          </div>
          {shape.media ? (
            <div
              className="h-6 rounded"
              style={{ background: `linear-gradient(120deg, ${from}33, ${to}55)` }}
            />
          ) : (
            <span className="h-2 w-3/5 rounded-full bg-ink-300/70" />
          )}
          {shape.cards ? (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: Math.min(6, shape.cards) }, (_, i) => (
                <span key={i} className="h-3 rounded bg-ink-100" />
              ))}
            </div>
          ) : (
            blocks.map((i) => (
              <span
                key={i}
                className="h-1 rounded-full bg-ink-200"
                style={{ width: `${90 - i * 18}%` }}
              />
            ))
          )}
        </div>
      </div>
      <span className="absolute bottom-1.5 right-2 rounded-full bg-black/25 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur">
        {shape.files} file{shape.files === 1 ? "" : "s"}
      </span>
    </div>
  );
}
