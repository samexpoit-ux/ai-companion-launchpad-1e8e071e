// Client-side lint + build validation for artifact projects.
// Build = Babel parse/transform of every module (same pipeline the live
// preview runs). Lint = a small set of high-signal static checks.

import { resolveAlias, resolveModule } from "@/lib/artifact";

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  level: IssueLevel;
  path: string;
  line?: number;
  message: string;
  source: "build" | "lint";
}

export interface ValidationResult {
  ok: boolean;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
  checkedFiles: number;
}

// Keep this list aligned with LocalPreview.EXTERNALS. A generated project that
// uses one of our browser-safe shims must not be falsely rejected by preflight.
const EXTERNAL_MODULES = new Set([
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "lucide-react",
  "react-router-dom",
  "react-router",
  "framer-motion",
  "motion",
  "motion/react",
  "motion/react-client",
  "react/jsx-dev-runtime",
  "clsx",
  "classnames",
  "tailwind-merge",
]);

const CODE_RE = /\.(jsx?|tsx?|mjs|cjs)$/;
const STYLE_RE = /\.(css|scss|sass|less)$/;

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[^'"]*?from\s*)?["']([^"']+)["']/g;
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

function isPreviewExternal(id: string) {
  if (EXTERNAL_MODULES.has(id)) return true;
  // sub-path imports of shimmed packages resolve to the same shim in the sandbox
  const base = id.split("/")[0];
  return EXTERNAL_MODULES.has(base);
}

function lineOf(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

/**
 * Build/tooling files (vite.config.ts, tailwind.config.js, server entries, tests…)
 * never execute inside the sandbox iframe, so their npm imports are not preview
 * problems. Flagging them produced false "N errors" badges on perfectly good
 * projects, so their package imports are informational only.
 */
const TOOLING_RE =
  /(^|\/)(vite|vitest|tailwind|postcss|rollup|webpack|next|babel|jest|eslint|prettier|svelte|astro|nuxt|drizzle|playwright)\.config\.[cm]?[jt]sx?$|(^|\/)(server|middleware)\.[cm]?[jt]sx?$|\.(test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/;

function isToolingFile(path: string) {
  return TOOLING_RE.test(path);
}

function lintFile(path: string, source: string, files: Record<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tooling = isToolingFile(path);
  const push = (level: IssueLevel, message: string, index?: number) =>
    issues.push({ level, path, message, source: "lint", line: index != null ? lineOf(source, index) : undefined });

  // Unresolvable imports break the preview at runtime, so treat them as errors.
  const seen = new Set<string>();
  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const id = m[1];
      if (isPreviewExternal(id) || STYLE_RE.test(id)) continue;
      if (id.startsWith(".") || id.startsWith("@/") || id.startsWith("/")) {
        const resolved = resolveModule(files, path, id) ?? resolveAlias(files, id);
        if (!resolved) push(tooling ? "warning" : "error", `Cannot resolve import "${id}"`, m.index);
      } else if (!tooling) {
        push("error", `Package "${id}" is not available in the live preview`, m.index);
      }

      if (seen.has(id)) push("warning", `Duplicate import of "${id}"`, m.index);
      seen.add(id);
    }
  }

  const debuggerAt = source.indexOf("debugger");
  if (debuggerAt >= 0) push("warning", "`debugger` statement left in code", debuggerAt);

  const varMatch = /(^|\n)\s*var\s+/.exec(source);
  if (varMatch) push("warning", "Prefer `const`/`let` over `var`", varMatch.index);

  const todo = /\b(TODO|FIXME)\b/.exec(source);
  if (todo) push("warning", `Unfinished marker: ${todo[1]}`, todo.index);

  return issues;
}

export async function validateProject(
  files: Record<string, string>,
  entry?: string,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const { transform } = await import("@babel/standalone");

  const paths = Object.keys(files);
  let checked = 0;

  for (const path of paths) {
    const source = files[path] ?? "";

    if (path.endsWith(".json")) {
      try {
        JSON.parse(source || "{}");
      } catch (err) {
        issues.push({
          level: "error",
          path,
          message: `Invalid JSON: ${(err as Error).message}`,
          source: "build",
        });
      }
      continue;
    }
    if (!CODE_RE.test(path)) continue;

    checked++;
    try {
      transform(source, {
        filename: path,
        presets: [["react", { runtime: "classic" }], "typescript"],
        plugins: ["transform-modules-commonjs"],
      });
    } catch (err) {
      const e = err as Error & { loc?: { line?: number } };
      issues.push({
        level: "error",
        path,
        line: e.loc?.line,
        message: e.message.replace(/^unknown file:\s*/i, "").split("\n")[0],
        source: "build",
      });
    }

    issues.push(...lintFile(path, source, files));
  }

  if (entry && !(entry in files)) {
    issues.push({ level: "error", path: entry, message: "Entry file is missing from the project", source: "build" });
  }
  if (entry && files[entry] && !/export\s+default/.test(files[entry])) {
    issues.push({
      level: "error",
      path: entry,
      message: "Entry file has no default export — the preview cannot mount it",
      source: "build",
    });
  }

  const errors = issues.filter((i) => i.level === "error").length;
  return {
    ok: errors === 0,
    errors,
    warnings: issues.length - errors,
    issues,
    checkedFiles: checked,
  };
}

export async function validateSingle(code: string, lang: string): Promise<ValidationResult> {
  const path = lang === "react-ts" || lang === "vanilla-ts" ? "App.tsx" : "App.jsx";
  return validateProject({ [path]: code });
}
