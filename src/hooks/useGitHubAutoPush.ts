/**
 * Auto-push to the connected GitHub repository after a build.
 *
 * Lovable-parity: once a repo is connected with "push after every build" on,
 * a finished build lands as a commit without the user opening the Ship dialog.
 * Pushes are de-duplicated by a signature of the workspace files, so re-renders
 * and tab switches never create empty commits.
 */
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getGitHubConnection, pushToConnectedRepo } from "@/lib/github.functions";
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
        if (cancelled || !connection.connected || !connection.autoPush) return;
        const result = await push({
          data: {
            message: `Nexura AI — ${payload.title ?? "project"} update`,
            files: buildShipFiles(payload),
          },
        });
        if (cancelled) return;
        lastPushed.current = sig;
        toast.success(`Pushed ${result.files} files to ${connection.owner}/${connection.repo}`, {
          description: `${result.branch} · ${result.commit}`,
        });
      } catch (error) {
        if (!cancelled) {
          toast.error("Auto-push to GitHub failed", {
            description:
              error instanceof Error ? error.message : "Try pushing from the Ship dialog.",
          });
        }
      } finally {
        running.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payload, push, readConnection]);
}
