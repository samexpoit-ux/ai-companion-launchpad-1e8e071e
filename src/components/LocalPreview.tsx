import { useEffect, useRef, useState } from "react";
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as LucideIcons from "lucide-react";
import { transform } from "@babel/standalone";
import { resolveAlias, resolveModule } from "@/lib/artifact";
import { previewStyleTag } from "@/lib/preview-theme";
import { injectTailwind } from "@/lib/preview-tailwind";

import { classNameShims, framerMotion, reactRouterDom } from "@/lib/preview-shims";

import {
  DEVICE_WIDTH,
  usePreview,
  type PreviewDevice,
  type PreviewPayload,
} from "./preview-context";

/**
 * Offline-first preview engine.
 *
 * Runs entirely on our own origin: the snippet is transpiled in the browser with
 * Babel standalone and mounted into a same-origin iframe. No remote bundler, so
 * the preview keeps working even when third-party sandboxes are unreachable.
 */

const BASE_HTML = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&family=Space+Grotesk:wght@400..700&display=swap" rel="stylesheet" />
<style>html,body{height:100%;margin:0}#root{min-height:100%}</style>
</head><body><div id="root"></div></body></html>`;


const PREVIEW_BRIDGE = `<script>(function(){
  var send=function(type,level,message){ parent.postMessage({source:'nexura-preview',type:type,level:level,message:String(message)}, '*'); };
  ['log','info','warn','error'].forEach(function(level){ var native=console[level].bind(console); console[level]=function(){ var args=[].slice.call(arguments); send('console',level,args.map(function(v){ try{return typeof v==='object'?JSON.stringify(v):String(v)}catch(e){return String(v)} }).join(' ')); native.apply(console,args); }; });
  window.addEventListener('error',function(e){send('error','error',e.message||'Preview error')});
  window.addEventListener('unhandledrejection',function(e){send('error','error',e.reason&&e.reason.message||e.reason||'Unhandled rejection')});
})();</script>`;

function withBridge(html: string): string {
  // Standalone HTML documents still get the shared theme tokens so a previewed
  // page uses the same palette as the product shell.
  const injected = `${PREVIEW_BRIDGE}${previewStyleTag()}`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${injected}`);
  return `${injected}${html}`;
}

const CSS_HTML = (css: string) => `<!doctype html><html><head><meta charset="utf-8" />
${PREVIEW_BRIDGE}${previewStyleTag()}
<style>${css}</style></head><body>
<h1>Heading 1</h1><h2>Heading 2</h2>
<p>The quick brown fox jumps over the lazy dog.</p>
<button>Button</button>
<div class="demo-card">Card surface</div>
</body></html>`;

const JS_HTML = (js: string) => `<!doctype html><html><head><meta charset="utf-8" />
${previewStyleTag()}
</head><body><div id="app"></div>${PREVIEW_BRIDGE}<script type="module">
try {
${js}
} catch (e) { console.error(e); document.body.innerHTML = '<pre style="color:var(--nx-danger);white-space:pre-wrap">' + (e && e.stack || e) + '</pre>'; }
</script></body></html>`;

const MD_HTML = (md: string) => `<!doctype html><html><head><meta charset="utf-8" />
${PREVIEW_BRIDGE}${previewStyleTag(`body{line-height:1.65}`)}</head>
<body><pre style="white-space:pre-wrap;background:transparent;padding:0">${md
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")}</pre></body></html>`;

function ensureDefaultExport(src: string): string {
  if (/\bexport\s+default\b/.test(src)) return src;
  const named = src.match(/export\s+(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/);
  if (named) return `${src}\n\nexport default ${named[1]};\n`;
  const any = src.match(/(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/);
  if (any) return `${src}\n\nexport default ${any[1]};\n`;
  return `${src}\n\nexport default function App(){ return null; }\n`;
}

/**
 * Unknown icon names render a neutral square instead of crashing the tree with
 * "Element type is invalid" — the most common preview failure after a model
 * invents an icon that does not exist in the installed lucide version.
 */
const lucideShim = new Proxy(LucideIcons as unknown as Record<string, unknown>, {
  get: (target, prop: string) => {
    if (prop in target) return target[prop];
    if (prop === "__esModule") return true;
    const Fallback = (props: Record<string, unknown>) =>
      React.createElement("svg", {
        ...props,
        width: (props.size as number) ?? 24,
        height: (props.size as number) ?? 24,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        "aria-hidden": true,
      });
    (Fallback as React.ComponentType).displayName = `Lucide(${prop})`;
    return Fallback;
  },
});

const EXTERNALS: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": React,
  "react/jsx-dev-runtime": React,
  "react-dom": ReactDOMClient,
  "react-dom/client": ReactDOMClient,
  "lucide-react": lucideShim,
  // Shimmed dependencies: generated projects commonly import these, and the
  // sandbox has no bundler, so we hand them API-compatible stand-ins instead of
  // failing the build. Exported projects install the real packages.
  "react-router-dom": reactRouterDom,
  "react-router": reactRouterDom,
  "framer-motion": framerMotion,
  motion: framerMotion,
  "motion/react": framerMotion,
  "motion/react-client": framerMotion,
  clsx: classNameShims.clsx,
  classnames: classNameShims.clsx,
  "tailwind-merge": classNameShims.twMerge,
};

/** Resolve a bare package id (including sub-paths) to a shimmed module. */
function resolveExternal(id: string): unknown | undefined {
  const normalized = id.trim().replace(/\/$/, "");
  if (normalized in EXTERNALS) return EXTERNALS[normalized];
  const base = normalized.split("/")[0];
  if (base === "react-router-dom" || base === "react-router") return reactRouterDom;
  if (base === "framer-motion" || base === "motion") return framerMotion;
  if (base === "lucide-react") return lucideShim;
  if (base === "clsx" || base === "classnames") return classNameShims.clsx;
  if (base === "tailwind-merge") return classNameShims.twMerge;
  return undefined;
}

function makeRequire() {
  return (id: string) => {
    const external = resolveExternal(id);
    if (external !== undefined) return external;
    if (/\.(css|scss|sass|less)$/.test(id)) return {};
    throw new Error(
      `Module "${id}" is not available in the live preview. Available: react, react-dom, lucide-react, react-router-dom, framer-motion, clsx, tailwind-merge.`,
    );
  };
}


function compileModule(path: string, source: string) {
  return transform(source, {
    filename: path,
    presets: [["react", { runtime: "classic" }], "typescript"],
    plugins: ["transform-modules-commonjs"],
  }).code;
}

/**
 * Evaluate a multi-file virtual project. Relative and `@/` imports resolve
 * against the artifact file map; CSS files are injected into the frame.
 */
function runProject(
  files: Record<string, string>,
  entry: string,
  doc: Document,
  win: Window,
): Record<string, unknown> {
  const cache = new Map<string, Record<string, unknown>>();

  const load = (path: string): Record<string, unknown> => {
    const cached = cache.get(path);
    if (cached) return cached;

    const source = files[path] ?? "";

    if (/\.css$/.test(path)) {
      const style = doc.createElement("style");
      style.textContent = source;
      doc.head.appendChild(style);
      const empty = {};
      cache.set(path, empty);
      return empty;
    }
    if (/\.json$/.test(path)) {
      const parsed = JSON.parse(source || "{}") as Record<string, unknown>;
      cache.set(path, parsed);
      return parsed;
    }

    const out = compileModule(path, source);
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    cache.set(path, mod.exports);

    const req = (id: string) => {
      if (id in EXTERNALS) return EXTERNALS[id];
      const resolved = resolveModule(files, path, id) ?? resolveAlias(files, id);
      if (resolved) return load(resolved);
      if (/\.(css|scss|sass|less)$/.test(id)) return {};
      throw new Error(`Module "${id}" is not available in the live preview (imported by ${path}).`);
    };

    // eslint-disable-next-line no-new-func
    const run = new Function(
      "require",
      "module",
      "exports",
      "React",
      "window",
      "document",
      "globalThis",
      out ?? "",
    );
    run(req, mod, mod.exports, React, win, doc, win);
    cache.set(path, mod.exports);
    return mod.exports;
  };

  return load(entry);
}

function pickComponent(exports: Record<string, unknown>): React.ComponentType | undefined {
  const def = exports.default;
  if (typeof def === "function") return def as React.ComponentType;
  return Object.values(exports).find((v) => typeof v === "function") as
    | React.ComponentType
    | undefined;
}

interface Props {
  payload: PreviewPayload;
  device: PreviewDevice;
  reloadKey: number;
}

export default function LocalPreview({ payload, device, reloadKey }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<ReactDOMClient.Root | null>(null);
  const { reportRuntimeError, reportConsole, setBuildError, selectMode, setSelection } =
    usePreview();
  const [compileError, setCompileError] = useState<string | null>(null);

  const isReact = payload.lang === "react" || payload.lang === "react-ts" || !!payload.files;

  // Non-React languages render as plain documents.
  let plainCode = payload.code;
  let plainCompileError: string | null = null;
  if (payload.lang === "vanilla-ts") {
    try {
      plainCode =
        transform(payload.code, { filename: "index.ts", presets: ["typescript"] }).code ?? "";
    } catch (err) {
      plainCompileError = err instanceof Error ? err.message : String(err);
    }
  }
  const srcDoc = isReact
    ? BASE_HTML
    : payload.lang === "css"
      ? CSS_HTML(payload.code)
      : payload.lang === "html"
        ? withBridge(payload.code)
        : payload.lang === "mdx"
          ? MD_HTML(payload.code)
          : JS_HTML(
              plainCompileError
                ? `throw new Error(${JSON.stringify(plainCompileError)})`
                : plainCode,
            );

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as {
        source?: string;
        type?: string;
        level?: string;
        message?: string;
      };
      if (data?.source !== "nexura-preview" || !data.message) return;
      if (data.type === "console") {
        const level = ["log", "info", "warn", "error"].includes(data.level ?? "")
          ? (data.level as "log" | "info" | "warn" | "error")
          : "log";
        reportConsole(level, data.message);
      }
      if (data.type === "error" || data.level === "error") reportRuntimeError(data.message);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [reportConsole, reportRuntimeError]);

  useEffect(() => {
    setCompileError(null);
    setBuildError(null);

    if (!isReact) return;
    const frame = frameRef.current;
    if (!frame) return;

    let cancelled = false;

    const mount = () => {
      if (cancelled) return;
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!win || !doc) return;

      // Run the real Tailwind compiler inside the frame. The previewed project
      // owns its own look, so we deliberately do NOT clone the product shell's
      // stylesheet or tokens in here — that used to repaint generated pages with
      // Nexura's palette and leave utility classes unstyled.
      void injectTailwind(doc);


      // Pipe sandbox errors into the auto-fix loop.
      const frameConsole = (win as unknown as { console: Console }).console;
      for (const level of ["log", "info", "warn", "error"] as const) {
        const native = frameConsole[level].bind(frameConsole);
        frameConsole[level] = (...args: unknown[]) => {
          const message = args
            .map((a) => {
              if (a instanceof Error) return a.message;
              if (a && typeof a === "object") {
                try {
                  return JSON.stringify(a);
                } catch {
                  return String(a);
                }
              }
              return String(a);
            })
            .join(" ");
          reportConsole(level, message);
          if (level === "error") reportRuntimeError(message);
          native(...args);
        };
      }
      win.addEventListener("error", (e) => reportRuntimeError(String((e as ErrorEvent).message)));
      win.addEventListener("unhandledrejection", (e) =>
        reportRuntimeError(String((e as PromiseRejectionEvent).reason)),
      );

      const host = doc.getElementById("root");
      if (!host) return;

      try {
        let Component: React.ComponentType | undefined;

        if (payload.files && payload.entry) {
          const files = payload.files;
          // Bootstrap entries call createRoot themselves. Running those in the
          // host realm can mount outside the iframe and leave a blank preview.
          const appPath = Object.keys(files).find((p) => /(^|\/)App\.(tsx|jsx|ts|js)$/.test(p));
          const renderEntry = payload.entry ?? appPath;
          Component = pickComponent(runProject(files, renderEntry, doc, win));
        } else {
          const source = ensureDefaultExport(payload.code);
          const out = compileModule(payload.lang === "react-ts" ? "App.tsx" : "App.jsx", source);
          const module: { exports: Record<string, unknown> } = { exports: {} };
          // eslint-disable-next-line no-new-func
          const run = new Function(
            "require",
            "module",
            "exports",
            "React",
            "window",
            "document",
            "globalThis",
            out ?? "",
          );
          run(makeRequire(), module, module.exports, React, win, doc, win);
          Component = pickComponent(module.exports);
        }

        if (!Component) throw new Error("No React component was exported from this project.");

        rootRef.current?.unmount();
        rootRef.current = ReactDOMClient.createRoot(host);
        rootRef.current.render(
          React.createElement(
            PreviewErrorBoundary,
            { onError: reportRuntimeError },
            React.createElement(Component),
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setCompileError(message);
        setBuildError(message);
        reportRuntimeError(message);
      }
    };

    if (frame.contentDocument?.readyState === "complete") mount();
    frame.addEventListener("load", mount);
    return () => {
      cancelled = true;
      frame.removeEventListener("load", mount);
      const root = rootRef.current;
      rootRef.current = null;
      if (root) setTimeout(() => root.unmount(), 0);
    };
  }, [
    payload.code,
    payload.lang,
    payload.files,
    payload.entry,
    isReact,
    reloadKey,
    reportConsole,
    reportRuntimeError,
    setBuildError,
  ]);

  // Static HTML previews are Tailwind-authored too, so give them the compiler.
  useEffect(() => {
    if (isReact) return;
    const frame = frameRef.current;
    if (!frame) return;
    const run = () => {
      const doc = frame.contentDocument;
      if (doc) void injectTailwind(doc);
    };
    if (frame.contentDocument?.readyState === "complete") run();
    frame.addEventListener("load", run);
    return () => frame.removeEventListener("load", run);
  }, [isReact, payload.code, payload.lang, reloadKey]);



  /**
   * Visual "select element to edit": while the picker is armed we outline the
   * element under the cursor inside the same-origin frame and hand the click
   * back to the workspace so the user can rewrite its text or ask the AI.
   */
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!selectMode || !doc) return;

    const HIGHLIGHT = "2px solid #7C3AED";
    let hovered: HTMLElement | null = null;
    const clear = () => {
      if (hovered) hovered.style.outline = "";
      hovered = null;
    };

    const over = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (!el || el === hovered || el.id === "root") return;
      clear();
      hovered = el;
      el.style.outline = HIGHLIGHT;
      el.style.outlineOffset = "1px";
    };

    const pick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const el = event.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      const className = typeof el.className === "string" ? el.className : "";
      const text = (el.textContent ?? "").trim().slice(0, 400);
      setSelection({
        tag,
        className,
        text,
        file: null,
        label: className ? `${tag}.${className.split(/\s+/)[0]}` : tag,
      });
    };

    doc.addEventListener("mouseover", over, true);
    doc.addEventListener("click", pick, true);
    doc.body?.style.setProperty("cursor", "crosshair");

    return () => {
      doc.removeEventListener("mouseover", over, true);
      doc.removeEventListener("click", pick, true);
      doc.body?.style.removeProperty("cursor");
      clear();
    };
  }, [selectMode, setSelection, reloadKey, payload]);

  const width = DEVICE_WIDTH[device];

  const frame = (
    <iframe
      key={`${payload.lang}-${reloadKey}`}
      ref={frameRef}
      title="Live preview"
      srcDoc={srcDoc}
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );

  return (
    <div className="relative h-full w-full">
      {width ? (
        <div className="flex h-full w-full items-start justify-center overflow-auto bg-ink-100/60 p-4">
          <div
            className="h-full max-w-full overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_30px_80px_-40px_rgba(37,74,140,0.45)]"
            style={{ width }}
          >
            {frame}
          </div>
        </div>
      ) : (
        frame
      )}

      {compileError && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          Build failed — see the error overlay for details.
        </div>
      )}
    </div>
  );
}

class PreviewErrorBoundary extends React.Component<
  { onError: (m: string) => void; children?: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        "pre",
        {
          style: {
            color: "#b91c1c",
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, monospace",
          },
        },
        this.state.error,
      );
    }
    return this.props.children;
  }
}
