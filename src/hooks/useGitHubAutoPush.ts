/**
 * Auto-push to the connected GitHub repository after a build.
 *
 * Lovable-parity: once a repo is connected with "push after every build" on,
 * a finished build lands as a commit without the user opening the Ship dialog.
 * Pushes are de-duplicated by a signature of the workspace files, so re-renders
 * and tab switches never create empty commits. Every outcome is published to
 * the shared push-status store so the Ship dialog panel and toasts agree.
 */
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getGitHubConnection, pushToConnectedRepo } from "@/lib/github.functions";
import {
  markPushFailed,
  markPushStarted,
  markPushSucceeded,
  setPushStatus,
} from "@/lib/github-status";
import { buildShipFiles, type ShipPayload } from "@/lib/ship-bundle";

function signature(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([path, code]) => `${path}:${code.length}`)
    .sort()
    .join("|");
}

export function useGitHubAutoPush(payload: ShipPayload | null) {
  const readConnection = useServerFn(getGitHubConnection);
  const push = useServerFn(pushToConnectedRepo);
  const lastPushed = useRef<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!payload || Object.keys(payload.files).length === 0) return;
    const sig = signature(payload.files);
    if (sig === lastPushed.current || running.current) return;

    let cancelled = false;
    running.current = true;

    void (async () => {
      try {
        const connection = await readConnection({});
        if (cancelled || !connection.connected) return;
        setPushStatus({
          repo: connection.owner ? `${connection.owner}/${connection.repo}` : null,
          branch: connection.branch ?? null,
          commit: connection.lastCommit ?? null,
          at: connection.lastPushedAt ?? null,
        });
        if (!connection.autoPush) return;

        markPushStarted(true);
        const result = await push({
          data: {
            message: `Nexura AI — ${payload.title ?? "project"} update`,
            files: buildShipFiles(payload),
          },
        });
        if (cancelled) return;
        lastPushed.current = sig;
        markPushSucceeded({
          commit: result.commit,
          files: result.files,
          branch: result.branch,
          repo: `${connection.owner}/${connection.repo}`,
        });
        toast.success(`Pushed ${result.files} files to ${connection.owner}/${connection.repo}`, {
          description: `${result.branch} · ${result.commit}`,
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "GitHub rejected the push. Try again.";
        markPushFailed(message);
        toast.error("Auto-push to GitHub failed", {
          description: message,
          duration: 10000,
          action: {
            label: "Details",
            onClick: () => {
              /* the Ship dialog's status panel shows the full failure */
            },
          },
        });
      } finally {
        running.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payload, push, readConnection]);
}
