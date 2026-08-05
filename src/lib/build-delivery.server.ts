import { transform } from "@babel/standalone";

import { mergeArtifactProjects, parseArtifacts, resolveAlias, resolveModule } from "./artifact";

const CODE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/i;
const STYLE_OR_ASSET_RE = /\.(?:css|scss|sass|less|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf)$/i;
const SAFE_PREVIEW_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-router-dom",
  "react-router",
  "lucide-react",
  "framer-motion",
  "motion",
  "clsx",
  "classnames",
  "tailwind-merge",
]);

function packageRoot(id: string): string {
  if (id.startsWith("@")) return id.split("/").slice(0, 2).join("/");
  return id.split("/")[0] ?? id;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function hasNamedExport(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|class|const|let|var)\\s+${escaped}\\b`).test(source) ||
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b(?:\\s+as\\s+\\w+)?[^}]*\\}`).test(source)
  );
}

function validateImports(path: string, source: string, files: Record<string, string>): DeliverySyntaxIssue[] {
  const issues: DeliverySyntaxIssue[] = [];
  const importRe = /(?:^|\n)\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source))) {
    const clause = (match[1] ?? "").trim();
    const id = match[2] ?? match[3] ?? "";
    if (STYLE_OR_ASSET_RE.test(id)) {
      if ((id.startsWith(".") || id.startsWith("/") || id.startsWith("@/")) &&
          !(resolveModule(files, path, id) ?? resolveAlias(files, id))) {
        issues.push({ path, line: lineOf(source, match.index), message: `Cannot resolve asset import "${id}"` });
      }
      continue;
    }
    if (!(id.startsWith(".") || id.startsWith("/") || id.startsWith("@/"))) {
      if (!SAFE_PREVIEW_PACKAGES.has(packageRoot(id))) {
        issues.push({
          path,
          line: lineOf(source, match.index),
          message: `Package "${id}" is not available in the live preview; use a preview-safe dependency or include it in package.json`,
        });
      }
      continue;
    }

    const resolved = resolveModule(files, path, id) ?? resolveAlias(files, id);
    if (!resolved) {
      issues.push({ path, line: lineOf(source, match.index), message: `Cannot resolve local import "${id}"` });
      continue;
    }
    const target = files[resolved] ?? "";
    if (!CODE_FILE_RE.test(resolved) || !clause) continue;
    const defaultPart = clause.split(",")[0]?.trim() ?? "";
    if (defaultPart && !defaultPart.startsWith("{") && !defaultPart.startsWith("*")) {
      if (!/\bexport\s+default\b/.test(target)) {
        issues.push({ path, line: lineOf(source, match.index), message: `"${id}" has no default export` });
      }
    }
    const named = clause.match(/\{([\s\S]*?)\}/)?.[1];
    if (named) {
      for (const item of named.split(",")) {
        const imported = item.trim().split(/\s+as\s+/)[0]?.trim();
        if (imported && !hasNamedExport(target, imported)) {
          issues.push({ path, line: lineOf(source, match.index), message: `"${id}" has no named export "${imported}"` });
        }
      }
    }
  }
  return issues;
}

export interface DeliverySyntaxIssue {
  path: string;
  line?: number;
  message: string;
}

/**
 * Parse and compile every generated source file before a build is allowed to
 * reach the browser preview. This deliberately checks syntax only: an
 * iterative artifact can import an unchanged file from an earlier turn that
 * is not repeated in the current response.
 */
export function validateBuildDeliverySyntax(content: string): DeliverySyntaxIssue[] {
  const project = mergeArtifactProjects(parseArtifacts(content));
  if (!project) {
    return [{ path: "artifact", message: "No parseable project artifact was returned" }];
  }

  const issues: DeliverySyntaxIssue[] = [];
  for (const [path, source] of Object.entries(project.files)) {
    if (path.endsWith(".json")) {
      try {
        JSON.parse(source);
      } catch (error) {
        issues.push({
          path,
          message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      continue;
    }
    if (!CODE_FILE_RE.test(path)) continue;

    try {
      transform(source, {
        filename: path,
        presets: [["react", { runtime: "classic" }], "typescript"],
        plugins: ["transform-modules-commonjs"],
      });
    } catch (error) {
      const parsed = error as Error & { loc?: { line?: number } };
      issues.push({
        path,
        line: parsed.loc?.line,
        message: parsed.message.replace(/^unknown file:\s*/i, "").split("\n")[0],
      });
    }
    issues.push(...validateImports(path, source, project.files));
  }

  return issues;
}