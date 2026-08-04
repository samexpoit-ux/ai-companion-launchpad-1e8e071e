/**
 * Ship dialog — the only way a project leaves Nexura.
 *
 * Three routes, all from the live workspace: download a runnable zip, push
 * straight into a GitHub repository, or take a build bundle to a VPS/host.
 */
import { useEffect, useState } from "react";
import { FileArchive, Github, Rocket, Loader2, Check, ExternalLink, Unplug } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  connectGitHub,
  disconnectGitHub,
  getGitHubConnection,
  pushToConnectedRepo,
  setGitHubAutoPush,
  type GitHubConnection,
} from "@/lib/github.functions";
import { buildShipFiles, slugify, type ShipPayload } from "@/lib/ship-bundle";
import { GitHubStatusPanel } from "@/components/GitHubStatusPanel";
import { markPushFailed, markPushStarted, markPushSucceeded } from "@/lib/github-status";


export function ShipDialog({
  payload,
  trigger,
}: {
  payload: ShipPayload | null;
  trigger: React.ReactNode;
}) {
  const connect = useServerFn(connectGitHub);
  const push = useServerFn(pushToConnectedRepo);
  const disconnect = useServerFn(disconnectGitHub);
  const readConnection = useServerFn(getGitHubConnection);
  const toggleAuto = useServerFn(setGitHubAutoPush);

  const [zipping, setZipping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState(slugify(payload?.title));
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [result, setResult] = useState<{
    repoUrl: string;
    branch: string;
    commit: string;
    files: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void readConnection({})
      .then((c) => {
        if (mounted) setConnection(c);
      })
      .catch(() => {
        if (mounted) setConnection({ connected: false });
      });
    return () => {
      mounted = false;
    };
  }, [readConnection]);

  const fileCount = payload ? Object.keys(payload.files).length : 0;

  const downloadZip = async () => {
    if (!payload) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const [path, code] of Object.entries(buildShipFiles(payload))) zip.file(path, code);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(payload.title)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  const doConnect = async () => {
    if (!payload) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const conn = await connect({
        data: {
          token: token.trim(),
          repo: repo.trim() || slugify(payload.title),
          owner: owner.trim() || undefined,
          private: true,
          autoPush: false,
        },
      });
      setConnection(conn);
      setToken("");
      await doPush(conn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect the repository.");
    } finally {
      setBusy(false);
    }
  };

  const doPush = async (conn?: GitHubConnection) => {
    if (!payload) return;
    setBusy(true);
    setError(null);
    setResult(null);
    markPushStarted(false);
    try {
      const res = await push({
        data: {
          message: `Nexura AI — ${payload.title ?? "project"} update`,
          files: buildShipFiles(payload),
        },
      });
      setResult(res);
      const active = conn ?? connection;
      markPushSucceeded({
        commit: res.commit,
        files: res.files,
        branch: res.branch,
        ...(active?.owner ? { repo: `${active.owner}/${active.repo}` } : {}),
      });
      setConnection({
        ...(conn ?? connection ?? { connected: true }),
        connected: true,
        lastCommit: res.commit,
        lastPushedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "GitHub push failed.";
      setError(message);
      markPushFailed(message);
    } finally {
      setBusy(false);
    }
  };


  const doDisconnect = async () => {
    setBusy(true);
    try {
      await disconnect({});
      setConnection({ connected: false });
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const doToggleAuto = async (next: boolean) => {
    setConnection((c) => (c ? { ...c, autoPush: next } : c));
    try {
      await toggleAuto({ data: { autoPush: next } });
    } catch {
      setConnection((c) => (c ? { ...c, autoPush: !next } : c));
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Ship this project</DialogTitle>
          <DialogDescription>
            {fileCount} file{fileCount === 1 ? "" : "s"} from the live workspace, packaged as a
            runnable Vite + React app. Nothing to copy or paste.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="zip">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="zip">Download</TabsTrigger>
            <TabsTrigger value="github">GitHub</TabsTrigger>
            <TabsTrigger value="deploy">Deploy</TabsTrigger>
          </TabsList>

          <TabsContent value="zip" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Includes <code>package.json</code>, Vite config, entry HTML and a README, so
              <code> npm install &amp;&amp; npm run dev</code> just works.
            </p>
            <Button
              onClick={() => void downloadZip()}
              disabled={!payload || zipping}
              className="w-full"
            >
              {zipping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="mr-2 h-4 w-4" />
              )}
              {zipping ? "Packaging…" : "Download .zip"}
            </Button>
          </TabsContent>

          <TabsContent value="github" className="space-y-3 pt-4">
            {connection?.connected ? (
              <>
                <GitHubStatusPanel
                  connection={connection}
                  busy={busy}
                  onRetry={() => void doPush()}
                />

                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <Label htmlFor="gh-auto" className="text-sm">
                      Push after every build
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Keep the repo in sync automatically.
                    </p>
                  </div>
                  <Switch
                    id="gh-auto"
                    checked={Boolean(connection.autoPush)}
                    onCheckedChange={(v) => void doToggleAuto(v)}
                  />
                </div>
                <Button
                  onClick={() => void doPush()}
                  disabled={!payload || busy}
                  className="w-full"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="mr-2 h-4 w-4" />
                  )}
                  {busy ? "Pushing…" : "Push latest files"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void doDisconnect()}
                  disabled={busy}
                  className="w-full"
                >
                  <Unplug className="mr-2 h-4 w-4" />
                  Disconnect repository
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="gh-token">Personal access token (repo scope)</Label>
                  <Input
                    id="gh-token"
                    type="password"
                    autoComplete="off"
                    placeholder="ghp_…"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted on the server so later pushes are one click. Never exposed to
                    the browser.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="gh-owner">Owner / org (optional)</Label>
                    <Input
                      id="gh-owner"
                      placeholder="your-username"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gh-repo">Repository</Label>
                    <Input id="gh-repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
                  </div>
                </div>
                <Button
                  onClick={() => void doConnect()}
                  disabled={!payload || busy || token.trim().length < 20}
                  className="w-full"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="mr-2 h-4 w-4" />
                  )}
                  {busy ? "Connecting…" : "Connect repo & push"}
                </Button>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {result && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <Check className="h-4 w-4 text-[color:var(--color-iris,currentColor)]" />
                  Pushed {result.files} files to {result.branch} ({result.commit})
                </p>
                <a
                  href={result.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-primary underline"
                >
                  Open repository <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </TabsContent>

          <TabsContent value="deploy" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Push to GitHub first, then connect that repo to any host — or build it straight on
              your VPS:
            </p>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
              {`git clone <your-repo> app && cd app
npm install && npm run build
# serve dist/ with nginx (SPA fallback: try_files $uri /index.html;)`}
            </pre>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void downloadZip()}
              disabled={!payload}
            >
              <Rocket className="mr-2 h-4 w-4" />
              Download deploy bundle
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
