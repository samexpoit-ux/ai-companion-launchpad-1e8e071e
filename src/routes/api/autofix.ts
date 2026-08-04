import { apiErrorResponse, codeFromUpstream } from "@/lib/api-error";
import { createFileRoute } from "@tanstack/react-router";
import {
  CreditError,
  chargeRequest,
  creditErrorCode,
  finalizeRequestCost,
} from "@/lib/credit-guard.server";
import { resolveRoute, runWithFallback } from "@/lib/ai-gateway.server";
import { FreePoolError, poolKey } from "@/lib/free-pool.server";

import { newTraceId, recordTrace, type TraceAttempt } from "@/lib/request-trace.server";

interface AutofixBody {
  code?: string;
  lang?: string;
  errors?: string[];
  attempt?: number;
  modelId?: string;
  /** Multi-file artifact project (path -> source). */
  files?: Record<string, string>;
  entry?: string;
  /** true when the exact same failure survived the previous patch. */
  persisted?: boolean;
  /** What earlier attempts in this session tried, newest last. */
  history?: Array<{ attempt?: number; summary?: string; ok?: boolean }>;
  /** Recent user requests from the conversation, newest last. */
  intent?: string[];
}

const FIX_SYSTEM = `You are Nexura AI Auto-Fix — an expert runtime debugger.
You receive a single code file that crashed in a browser sandbox, plus the captured console errors.
Return the COMPLETE corrected file, nothing else.

Rules:
- Output exactly one fenced code block containing the full fixed file. No prose before or after, except one short line starting with "FIX:" describing the change.
- Keep the original intent, structure, styling and API of the code. Change only what is required to remove the errors.
- Never invent imports that are unavailable in a sandbox (only react/react-dom for React files, otherwise plain browser APIs).
- Guard against undefined/null access, fix typos, close JSX tags, add missing default exports, and fix bad hooks usage.
- If the errors are not caused by the code (network/CDN noise), return the file unchanged.`;

const FIX_SYSTEM_PROJECT = `You are Nexura AI Auto-Fix — an expert runtime debugger for multi-file React projects.
You receive every file of a virtual project that crashed in a browser sandbox, plus the captured console errors.

Rules:
- Rewrite ONLY the files that must change. Never touch files that are already correct.
- Output format, exactly:
FIX: <one short line describing the change>
<nexusArtifact id="autofix" title="Auto-fix">
<nexusAction type="file" filePath="src/Foo.tsx">
...complete new file content...
</nexusAction>
</nexusArtifact>
- Every emitted file must be COMPLETE (no "...", no diffs, no partial snippets).
- Allowed imports: react, react-dom, lucide-react, react-router-dom, react-router, framer-motion, motion, clsx, classnames, tailwind-merge, and relative imports to files that exist in the project (or files you create in the same response).
- Never use package sub-paths such as react-router-dom/dist or react-router-dom/client, and never replace the router with another package.
- Keep the original design, structure and Tailwind class usage. Change only what removes the errors.
- Fix undefined/null access, typos, unclosed JSX, missing exports/imports, wrong hook usage, and broken relative paths.
- If the errors are only sandbox/network noise, emit no nexusAction blocks and just return the FIX: line.`;

function extractCode(raw: string): { code: string | null; summary: string } {
  const summaryMatch = raw.match(/^\s*FIX:\s*(.+)$/m);
  const summary = summaryMatch ? summaryMatch[1].trim() : "Applied AI patch";
  const fence = raw.match(/```[a-zA-Z0-9+-]*\n([\s\S]*?)```/);
  if (fence) return { code: fence[1].trim(), summary };
  const stripped = raw.replace(/^\s*FIX:.*$/m, "").trim();
  return { code: stripped.length > 20 ? stripped : null, summary };
}

/** Pull `<nexusAction type="file" filePath="...">…</nexusAction>` blocks out of a patch response. */
function extractFiles(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re =
    /<(?:nexus|bolt)Action\b[^>]*filePath\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:nexus|bolt)Action>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const path = m[1].trim();
    let body = m[2].replace(/^\s*\n/, "").replace(/\s+$/, "");
    const fence = body.match(/^```[a-zA-Z0-9+-]*\n([\s\S]*?)```$/);
    if (fence) body = fence[1];
    if (path && body.trim()) out[path] = body;
  }
  return out;
}

export const Route = createFileRoute("/api/autofix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: AutofixBody;
        try {
          body = (await request.json()) as AutofixBody;
        } catch {
          return apiErrorResponse("invalid_json", "autofix", "Invalid JSON body");
        }

        const code = typeof body.code === "string" ? body.code : "";
        const errors = Array.isArray(body.errors) ? body.errors.filter(Boolean).slice(0, 8) : [];
        const files =
          body.files && typeof body.files === "object" && Object.keys(body.files).length > 0
            ? body.files
            : null;
        const isProject = Boolean(files);
        if (!isProject && !code.trim())
          return apiErrorResponse("missing_input", "autofix", "No code was supplied to repair.");
        if (errors.length === 0)
          return apiErrorResponse("missing_input", "autofix", "No captured errors to repair.");

        const route = resolveRoute(body.modelId, { task: "fix" });
        if ("error" in route) return apiErrorResponse("no_provider", "autofix", route.error);

        // ---- server-side credit enforcement (before any provider call) ----
        let charge;
        try {
          charge = await chargeRequest(request, "autofix", {
            inputChars: files ? JSON.stringify(files).length : code.length,
            model: route.friendlyId,
            reason: `autofix attempt ${body.attempt ?? 1}`,
          });
        } catch (err) {
          if (err instanceof CreditError) {
            return apiErrorResponse(creditErrorCode(err), "autofix", err.message, {
              ...(err.remaining != null ? { remaining: err.remaining } : {}),
            });
          }
          throw err;
        }

        const history = Array.isArray(body.history)
          ? body.history
              .slice(-3)
              .map(
                (h, i) =>
                  `${h.attempt ?? i + 1}. ${h.ok === false ? "[failed] " : ""}${String(h.summary ?? "").slice(0, 300)}`,
              )
          : [];
        const intent = Array.isArray(body.intent)
          ? body.intent.filter((v) => typeof v === "string" && v.trim()).slice(-3)
          : [];
        const intentNotes = intent.length
          ? [
              "",
              "What the user asked this project to do (newest last) — preserve this intent while fixing:",
              intent.map((v, i) => `${i + 1}. ${v.slice(0, 400)}`).join("\n"),
            ]
          : [];

        const retryNotes = [
          ...(history.length
            ? ["", "Previous repair attempts in this session:", history.join("\n")]
            : []),
          ...(body.persisted
            ? [
                "",
                "IMPORTANT: these exact errors survived the previous patch. Do not repeat the same change — find the real root cause (wrong import path, missing export, state used before it exists, wrong data shape) and fix that instead.",
              ]
            : []),
        ];

        const userPrompt = isProject
          ? [
              `Entry file: ${body.entry ?? "src/App.tsx"}`,
              `Repair attempt: ${body.attempt ?? 1}`,
              "",
              "Console errors captured in the live preview:",
              errors.map((e, i) => `${i + 1}. ${e}`).join("\n"),
              ...intentNotes,
              ...retryNotes,
              "",
              "Project files:",
              Object.entries(files!)
                .map(([path, source]) => `--- ${path} ---\n${source}`)
                .join("\n\n"),
            ].join("\n")
          : [
              `Language / template: ${body.lang ?? "unknown"}`,
              `Repair attempt: ${body.attempt ?? 1}`,
              "",
              "Console errors captured in the live preview:",
              errors.map((e, i) => `${i + 1}. ${e}`).join("\n"),
              ...intentNotes,
              ...retryNotes,
              "",
              "Current file:",
              "```",
              code,
              "```",
            ].join("\n");

        const messages = [
          { role: "system" as const, content: isProject ? FIX_SYSTEM_PROJECT : FIX_SYSTEM },
          { role: "user" as const, content: userPrompt },
        ];

        const started = Date.now();
        const traceId = newTraceId();
        const attempts: TraceAttempt[] = [];
        try {
          const result = await runWithFallback(
            route,
            messages,
            (a) => attempts.push(a),
            request.signal,
            poolKey(request),
          );

          const finalCharge = await finalizeRequestCost(request, charge.id, "autofix", {
            costUsd: result.costUsd,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            upstream: result.upstream,
          });
          // Finalization reports the real token cost but not the caller's plan class, so the
          // unlimited flag from the reservation is carried over — otherwise an admin's meter
          // would flip from "Unlimited" to a metered balance after every request.
          const balance = finalCharge
            ? { ...finalCharge, unlimited: finalCharge.unlimited || charge.unlimited === true }
            : charge;
          await recordTrace(request, {
            traceId,
            endpoint: "autofix",
            mode: "fix",
            task: route.task,
            plan: balance.plan,
            primaryModel: route.upstream,
            finalModel: result.upstream,
            attempts,
            status: "ok",
            promptChars: messages.reduce((sum, m) => sum + m.content.length, 0),
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            creditsCharged: balance.charged,
            latencyMs: Date.now() - started,
          });

          if (isProject) {
            const patched = extractFiles(result.content);
            const summary =
              result.content.match(/^\s*FIX:\s*(.+)$/m)?.[1].trim() ?? "Applied AI patch";
            const changedPaths = Object.keys(patched).filter(
              (p) => (files![p] ?? "").trim() !== patched[p].trim(),
            );
            if (changedPaths.length === 0) {
              // Model ignored the artifact format — fall back to a single-file patch
              // that the client applies to the entry file.
              const { code: fenced, summary: fenceSummary } = extractCode(result.content);
              if (fenced) {
                return Response.json({
                  code: fenced,
                  summary: fenceSummary,
                  changed: true,
                  model: route.friendlyId,
                  tokens: result.tokens,
                  costUsd: result.costUsd,
                  latencyMs: Date.now() - started,
                  credits: {
                    charged: balance.charged,
                    remaining: balance.remaining,
                    unlimited: balance.unlimited === true,
                  },
                });
              }
              return apiErrorResponse(
                "bad_model_output",
                "autofix",
                "The model did not return a usable patch.",
              );
            }
            return Response.json({
              files: patched,
              changedPaths,
              summary,
              changed: true,
              model: route.friendlyId,
              tokens: result.tokens,
              costUsd: result.costUsd,
              latencyMs: Date.now() - started,
              credits: {
                charged: balance.charged,
                remaining: balance.remaining,
                unlimited: balance.unlimited === true,
              },
            });
          }

          const { code: fixed, summary } = extractCode(result.content);
          if (!fixed) {
            return apiErrorResponse(
              "bad_model_output",
              "autofix",
              "The model did not return a usable patch.",
            );
          }

          return Response.json({
            code: fixed,
            summary,
            changed: fixed.trim() !== code.trim(),
            model: route.friendlyId,
            tokens: result.tokens,
            costUsd: result.costUsd,
            latencyMs: Date.now() - started,
            credits: {
              charged: balance.charged,
              remaining: balance.remaining,
              unlimited: balance.unlimited === true,
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          await finalizeRequestCost(request, charge.id, "autofix", { failed: true });
          const e = err as Error & { status?: number };
          await recordTrace(request, {
            traceId,
            endpoint: "autofix",
            mode: "fix",
            task: route.task,
            plan: charge.plan,
            primaryModel: route.upstream,
            attempts,
            status: "error",
            errorMessage: e.message,
            latencyMs: Date.now() - started,
          });
          return apiErrorResponse(codeFromUpstream(e.status), "autofix", e.message, {
            traceId,
            ...(err instanceof FreePoolError ? { retryAfterSec: err.retryAfterSec } : {}),
          });

        }
      },
    },
  },
});
