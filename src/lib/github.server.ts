/**
 * GitHub REST helpers (server only).
 *
 * One commit per push: blobs → tree → commit → ref, so a project lands in the
 * repository as a single reviewable change instead of hundreds of file writes.
 */

const API = "https://api.github.com";

export async function gh(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "nexura-ai",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { ok: res.ok, status: res.status, json };
}

/** Fetch the repository, creating it first when it does not exist yet. */
export async function ensureRepo(
  token: string,
  owner: string,
  repo: string,
  opts: { isOrg: boolean; private: boolean },
): Promise<{ branch: string }> {
  let repoRes = await gh(token, `/repos/${owner}/${repo}`);
  if (!repoRes.ok) {
    const body = JSON.stringify({ name: repo, private: opts.private, auto_init: true });
    const created = opts.isOrg
      ? await gh(token, `/orgs/${owner}/repos`, { method: "POST", body })
      : await gh(token, "/user/repos", { method: "POST", body });
    if (!created.ok) {
      throw new Error(
        `Could not create ${owner}/${repo}: ${String(created.json["message"] ?? created.status)}`,
      );
    }
    repoRes = await gh(token, `/repos/${owner}/${repo}`);
  }
  return { branch: (repoRes.json["default_branch"] as string) || "main" };
}

export interface CommitRequest {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: Record<string, string>;
}

export async function commitFiles(token: string, req: CommitRequest) {
  const { owner, repo, branch } = req;

  const refRes = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const baseCommit = refRes.ok
    ? ((refRes.json["object"] as { sha?: string } | undefined)?.sha ?? null)
    : null;

  let baseTree: string | null = null;
  if (baseCommit) {
    const commit = await gh(token, `/repos/${owner}/${repo}/git/commits/${baseCommit}`);
    baseTree = (commit.json["tree"] as { sha?: string } | undefined)?.sha ?? null;
  }

  const tree: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const [path, content] of Object.entries(req.files)) {
    const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    if (!blob.ok)
      throw new Error(`Failed to upload ${path}: ${String(blob.json["message"] ?? blob.status)}`);
    tree.push({ path, mode: "100644", type: "blob", sha: blob.json["sha"] as string });
  }

  const treeRes = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify(baseTree ? { base_tree: baseTree, tree } : { tree }),
  });
  if (!treeRes.ok)
    throw new Error(`Failed to build tree: ${String(treeRes.json["message"] ?? treeRes.status)}`);

  const commitRes = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: req.message,
      tree: treeRes.json["sha"],
      parents: baseCommit ? [baseCommit] : [],
    }),
  });
  if (!commitRes.ok)
    throw new Error(`Failed to commit: ${String(commitRes.json["message"] ?? commitRes.status)}`);

  const commitSha = commitRes.json["sha"] as string;
  const update = await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commitSha, force: true }),
  });
  if (!update.ok) {
    const create = await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha }),
    });
    if (!create.ok)
      throw new Error(
        `Failed to update ${branch}: ${String(create.json["message"] ?? create.status)}`,
      );
  }

  return {
    ok: true as const,
    repoUrl: `https://github.com/${owner}/${repo}`,
    branch,
    commit: commitSha.slice(0, 7),
    files: Object.keys(req.files).length,
  };
}
