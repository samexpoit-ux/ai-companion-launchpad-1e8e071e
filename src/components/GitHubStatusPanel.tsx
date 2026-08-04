/**
 * GitHub push status panel.
 *
 * Answers three questions at a glance: which repo is connected, when the last
 * push landed (with its commit hash), and — when something went wrong — what
 * failed and how to retry it.
 */
import { AlertTriangle, Check, ExternalLink, GitCommitHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GitHubConnection } from "@/lib/github.functions";
import { relativeTime, useGitHubPushStatus } from "@/lib/github-status";

export function GitHubStatusPanel({
  connection,
  busy = false,
  onRetry,
}: {
  connection: GitHubConnection;
  busy?: boolean;
  onRetry?: () => void;
}) {
  const live = useGitHubPushStatus();

  const pushing = busy || live.phase === "pushing";
  const commit = live.commit ?? connection.lastCommit ?? null;
  const pushedAt = live.at ?? connection.lastPushedAt ?? null;
  const failed = live.phase === "error" && !pushing;

  return (
    <div
      className={cn(
        "rounded-md border p-3 text-sm",
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Connected as {connection.login}</p>
          <a
            href={connection.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 truncate text-primary underline"
          >
            {connection.owner}/{connection.repo} · {connection.branch}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
            pushing
              ? "border-sky-200 bg-sky-50 text-sky-700"
              : failed
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : pushedAt
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-border bg-background text-muted-foreground",
          )}
        >
          {pushing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Pushing
            </>
          ) : failed ? (
            <>
              <AlertTriangle className="h-3 w-3" /> Failed
            </>
          ) : pushedAt ? (
            <>
              <Check className="h-3 w-3" /> In sync
            </>
          ) : (
            "Not pushed yet"
          )}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Last push</dt>
          <dd className="mt-0.5 font-medium">
            {relativeTime(pushedAt)}
            {live.automatic && live.phase === "success" ? " · automatic" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Commit</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-mono font-medium">
            {commit ? (
              <>
                <GitCommitHorizontal className="h-3 w-3 text-muted-foreground" />
                {connection.repoUrl ? (
                  <a
                    href={`${connection.repoUrl}/commit/${commit}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {commit}
                  </a>
                ) : (
                  commit
                )}
              </>
            ) : (
              <span className="font-sans text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        {live.files != null && live.phase === "success" ? (
          <div>
            <dt className="text-muted-foreground">Files</dt>
            <dd className="mt-0.5 font-medium">{live.files} committed</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Auto-push</dt>
          <dd className="mt-0.5 font-medium">{connection.autoPush ? "On" : "Off"}</dd>
        </div>
      </dl>

      {failed ? (
        <div className="mt-3 rounded border border-destructive/30 bg-background/60 p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            Last push failed
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{live.error}</p>
          {onRetry ? (
            <Button size="sm" variant="secondary" className="mt-2 h-7 text-xs" onClick={onRetry}>
              Retry push
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
