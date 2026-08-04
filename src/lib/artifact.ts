/**
 * Multi-file artifact protocol.
 *
 * The model is asked to emit projects as:
 *
 *   <nexusArtifact id="todo-app" title="Todo App">
 *     <nexusAction type="file" filePath="src/App.tsx">...code...</nexusAction>
 *     <nexusAction type="file" filePath="src/components/Item.tsx">...code...</nexusAction>
 *   </nexusArtifact>
 *
 * `boltArtifact` / `boltAction` are accepted as aliases so pasted bolt.new-style
 * output also works.
 */

import { prismLangFor } from "@/lib/stack";


export interface ArtifactProject {
  id: string;
  title: string;
  files: Record<string, string>;
  entry: string;
  order: string[];
}

const ARTIFACT_RE =
  /<(nexusArtifact|boltArtifact)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

// Tolerant scanners: models regularly forget a closing tag on long deliveries.
const ARTIFACT_OPEN_RE = /<(nexusArtifact|boltArtifact)\b([^>]*)>/gi;
const ARTIFACT_ANY_RE = /<\/?(nexusArtifact|boltArtifact)\b[^>]*>/gi;
const ACTION_OPEN_RE = /<(nexusAction|boltAction)\b([^>]*)>/gi;
// Any boundary that must terminate an action body, closed properly or not.
const BOUNDARY_RE =
  /<\/?(nexusAction|boltAction|nexusArtifact|boltArtifact)\b[^>]*>/gi;

function attr(raw: string, name: string): string | undefined {
  const m = raw.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3]) : undefined;
}

function cleanCode(input: string): string {
  let code = input.replace(/\r\n/g, "\n");
  // Models often wrap the file body in a markdown fence anyway.
  code = code.replace(/^\s*```[a-zA-Z0-9+-]*\n/, "").replace(/\n?```\s*$/, "");
  // Safety net: a protocol tag must never survive inside a source file — it is
  // not valid code in any language and used to surface as "Unexpected token".
  code = code.replace(BOUNDARY_RE, "");
  return code.replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
}


const ENTRY_PRIORITY = [
  "src/App.tsx",
  "src/App.jsx",
  "src/app.tsx",
  "App.tsx",
  "App.jsx",
  "src/index.tsx",
  "src/main.tsx",
  "index.tsx",
];

export function pickEntry(files: Record<string, string>, order: string[]): string {
  for (const candidate of ENTRY_PRIORITY) {
    if (files[candidate]) return candidate;
  }
  const renderable = order.find((p) => /\.(tsx|jsx)$/.test(p));
  if (renderable) return renderable;
  const js = order.find((p) => /\.(ts|js)$/.test(p));
  if (js) return js;
  return order[0] ?? "";
}

/**
 * Extract every artifact found in an assistant message.
 *
 * Deliberately tolerant: on long builds models drop closing tags. A missing
 * `</nexusAction>` used to make the lazy regex swallow the next tags into the
 * file body, which the preview then reported as `Unexpected token`. Instead
 * every action body ends at the first following protocol tag, and a missing
 * `</nexusArtifact>` ends at the next artifact or end of text.
 */
export function parseArtifacts(text: string): ArtifactProject[] {
  const projects: ArtifactProject[] = [];

  ARTIFACT_OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = ARTIFACT_OPEN_RE.exec(text))) {
    const head = m[2] ?? "";
    const bodyStart = m.index + m[0].length;

    // Body runs to the artifact's own closing tag, or to whatever tag comes
    // first if that closer was never emitted.
    ARTIFACT_ANY_RE.lastIndex = bodyStart;
    const next = ARTIFACT_ANY_RE.exec(text);
    const bodyEnd = next ? next.index : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    // Resume after a real closer; a nested/next opening tag must still be
    // parsed as its own artifact, so stop right before it.
    ARTIFACT_OPEN_RE.lastIndex = !next
      ? text.length
      : next[0].startsWith("</")
        ? next.index + next[0].length
        : next.index;


    const files: Record<string, string> = {};
    const order: string[] = [];

    ACTION_OPEN_RE.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ACTION_OPEN_RE.exec(body))) {
      const meta = a[2] ?? "";
      const start = a.index + a[0].length;

      BOUNDARY_RE.lastIndex = start;
      const stop = BOUNDARY_RE.exec(body);
      const end = stop ? stop.index : body.length;
      const raw = body.slice(start, end);
      // Resume after a proper closing tag, but never past an opening tag —
      // that one still has to be parsed as its own action.
      ACTION_OPEN_RE.lastIndex = stop && stop[0].startsWith("</") ? stop.index + stop[0].length : end;

      const type = (attr(meta, "type") ?? "file").toLowerCase();
      if (type !== "file") continue;
      const path = (attr(meta, "filePath") ?? attr(meta, "filepath") ?? "")
        .trim()
        .replace(/^\.?\//, "");
      if (!path) continue;
      const code = cleanCode(raw);
      if (!code.trim()) continue;
      if (!(path in files)) order.push(path);
      files[path] = code;
    }

    if (order.length === 0) continue;

    projects.push({
      id: attr(head, "id") ?? `artifact-${projects.length + 1}`,
      title: attr(head, "title") ?? "Generated project",
      files,
      order,
      entry: pickEntry(files, order),
    });
  }

  return projects;
}


/** Remove artifact blocks from markdown so the chat bubble stays readable. */
export function stripArtifacts(text: string): string {
  return text
    .replace(ARTIFACT_RE, "")
    // An artifact whose closing tag never arrived: drop it and everything after.
    .replace(/<(nexusArtifact|boltArtifact)\b[\s\S]*$/i, "")
    // Stray leftovers from truncated deliveries.
    .replace(BOUNDARY_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/**
 * Chat prose for a build reply.
 *
 * Nexura never delivers code by hand: when a message carries a project the
 * files land in the live workspace, so the bubble keeps only the summary and
 * every fenced snippet is dropped.
 */
export function chatProse(text: string): string {
  if (!hasArtifact(text)) return text;
  const prose = stripArtifacts(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return prose || "Built it — the project is live in the workspace on the right.";
}

export function hasArtifact(text: string): boolean {
  return /<(nexusArtifact|boltArtifact)\b/i.test(text);
}

export function langForPath(path: string): string {
  // The builder ships React, PHP/Laravel, Node, Python, SQL, Docker … so the
  // language map lives in one place next to the stack analyser.
  return prismLangFor(path);
}


// ---------- module resolution for the local preview engine ----------

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

const EXTS = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json"];

/** Resolve a relative import specifier against the virtual file map. */
export function resolveModule(
  files: Record<string, string>,
  fromFile: string,
  specifier: string,
): string | null {
  const base = fromFile.split("/").slice(0, -1).join("/");
  const joined = normalize(specifier.startsWith("/") ? specifier : `${base}/${specifier}`);

  for (const ext of EXTS) {
    const candidate = `${joined}${ext}`;
    if (files[candidate] != null) return candidate;
  }
  for (const ext of EXTS.slice(1)) {
    const candidate = `${joined}/index${ext}`;
    if (files[candidate] != null) return candidate;
  }
  return null;
}

/** Resolve alias imports like "@/components/Foo" onto src/. */
export function resolveAlias(
  files: Record<string, string>,
  specifier: string,
): string | null {
  if (!specifier.startsWith("@/")) return null;
  const rest = specifier.slice(2);
  for (const prefix of ["src/", ""]) {
    const hit = resolveModule(files, "root.tsx", `./${prefix}${rest}`);
    if (hit) return hit;
  }
  return null;
}
