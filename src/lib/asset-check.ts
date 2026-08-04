/**
 * Asset import validation for generated projects.
 *
 * The preview sandbox serves local images/fonts as data URLs. An import that
 * points at a file the artifact never emitted used to fail deep inside the
 * module loader with an unhelpful message, so we surface it up front in the
 * Preview diagnostics panel instead.
 */

import { resolveAlias, resolveModule } from "@/lib/artifact";

const ASSET_RE =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|pdf)$/i;

const IMPORT_RE = /(?:import\s+[^"';]*?from\s*|import\s*|require\(\s*)["']([^"']+)["']/g;
const CSS_URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/g;

export type AssetStatus = "ok" | "missing" | "external";

export interface AssetImport {
  from: string;
  specifier: string;
  resolved: string | null;
  status: AssetStatus;
}

export interface AssetCheckResult {
  imports: AssetImport[];
  missing: AssetImport[];
  external: AssetImport[];
  ok: boolean;
}

function isCode(path: string) {
  return /\.(tsx?|jsx?|mjs|cjs|css)$/i.test(path);
}

/** Scans every source file for asset imports and resolves them in the project. */
export function checkAssetImports(files: Record<string, string>): AssetCheckResult {
  const imports: AssetImport[] = [];
  const seen = new Set<string>();

  for (const [path, source] of Object.entries(files)) {
    if (!isCode(path)) continue;
    const specifiers: string[] = [];
    for (const match of source.matchAll(IMPORT_RE)) if (match[1]) specifiers.push(match[1]);
    if (path.endsWith(".css")) {
      for (const match of source.matchAll(CSS_URL_RE)) if (match[1]) specifiers.push(match[1]);
    }

    for (const specifier of specifiers) {
      if (!ASSET_RE.test(specifier.split("?")[0] ?? "")) continue;
      const key = `${path}|${specifier}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (/^(https?:)?\/\//.test(specifier) || specifier.startsWith("data:")) {
        imports.push({ from: path, specifier, resolved: null, status: "external" });
        continue;
      }
      const clean = specifier.split("?")[0] ?? specifier;
      const resolved = clean.startsWith("@/")
        ? resolveAlias(files, clean)
        : resolveModule(files, path, clean.startsWith(".") || clean.startsWith("/") ? clean : `./${clean}`);
      imports.push({
        from: path,
        specifier,
        resolved,
        status: resolved ? "ok" : "missing",
      });
    }
  }

  const missing = imports.filter((i) => i.status === "missing");
  return {
    imports,
    missing,
    external: imports.filter((i) => i.status === "external"),
    ok: missing.length === 0,
  };
}
