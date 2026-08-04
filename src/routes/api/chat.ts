import { apiErrorResponse, codeFromUpstream } from "@/lib/api-error";
import { createFileRoute } from "@tanstack/react-router";
import { resolveRoute, runWithFallback } from "@/lib/ai-gateway.server";
import { isPlanId } from "@/lib/plans";
import {
  MAX_PROMPT_WORDS,
  actionForMode,
  actualUsageCost,
  countWords,
} from "@/lib/credits";

import { systemPromptFor } from "@/lib/prompts";
import { newTraceId, recordTrace, type TraceAttempt } from "@/lib/request-trace.server";
import {
  CreditError,
  chargeRequest,
  creditErrorCode,
  finalizeRequestCost,
} from "@/lib/credit-guard.server";
import { dispatchWebhooks } from "@/lib/webhooks.server";

interface IncomingMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatBody {
  messages?: IncomingMessage[];
  modelId?: string;
  /** Selected pricing plan — caps which model tiers the router may use. */
  plan?: string;
  /** Composer mode, used to bias task detection ("build" | "chat" | "plan"). */
  mode?: string;
  /** Thread the charge belongs to, for the ledger. */
  threadId?: string;
  attachments?: Array<{
    name?: string;
    type?: string;
    size?: number;
    kind?: "image" | "text";
    content?: string;
  }>;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ChatBody;
        try {
          body = (await request.json()) as ChatBody;
        } catch {
          return apiErrorResponse("invalid_json", "chat", "Invalid JSON body");
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return apiErrorResponse("missing_input", "chat", "No message was sent.");
        }

        const normalizedMessages = messages
          .filter((m) => m && typeof m.content === "string" && m.content.length > 0)
          .slice(-16)
          .map((m) => ({
            role:
              m.role === "assistant"
                ? ("assistant" as const)
                : m.role === "system"
                  ? ("system" as const)
                  : ("user" as const),
            content: m.content,
          }));

        const attachments = Array.isArray(body.attachments)
          ? body.attachments
              .filter((item) => item && typeof item.name === "string" && typeof item.content === "string")
              .slice(0, 5)
              .map((item) => ({
                name: String(item.name).slice(0, 180),
                type: String(item.type ?? "application/octet-stream").slice(0, 100),
                kind: item.kind === "image" ? ("image" as const) : ("text" as const),
                content: String(item.content).slice(0, item.kind === "image" ? 7_000_000 : 60_000),
              }))
          : [];

        const lastUser = [...normalizedMessages].reverse().find((m) => m.role === "user");
        const mode = (body.mode ?? "").toLowerCase();
        const forcedTask =
          mode === "plan"
            ? ("reason" as const)
            : mode === "chat"
              ? ("chat" as const)
              : mode === "image"
                ? ("image" as const)
                : mode === "build"
                  ? ("code" as const)
                  : undefined;

        const traceId = newTraceId();
        const threadId = typeof body.threadId === "string" ? body.threadId : null;
        const attempts: TraceAttempt[] = [];
        const requestStarted = Date.now();

        // ---- word budget (pricing is word-based, so the cap is authoritative) ----
        const promptWords = countWords(lastUser?.content ?? "");
        if (promptWords > MAX_PROMPT_WORDS) {
          return apiErrorResponse(
            "bad_request",
            "chat",
            `This prompt is ${promptWords} words. Keep a single message under ${MAX_PROMPT_WORDS} words — split larger specs into follow-up messages.`,
            { words: promptWords, limit: MAX_PROMPT_WORDS },
          );
        }




        // ---- server-side credit enforcement (before any provider call) ----
        let charge;
        try {
          charge = await chargeRequest(request, actionForMode(mode), {
            inputChars: lastUser?.content.length ?? 0,
            threadId,
          });
        } catch (err) {
          if (err instanceof CreditError) {
            await recordTrace(request, {
              traceId,
              endpoint: "chat",
              mode,
              attempts,
              status: "blocked",
              errorMessage: err.message,
              promptChars: lastUser?.content.length ?? 0,
              latencyMs: Date.now() - requestStarted,
              threadId,
            });
            return apiErrorResponse(creditErrorCode(err), "chat", err.message, {
              traceId,
              ...(err.remaining != null ? { remaining: err.remaining } : {}),
            });
          }
          throw err;
        }

        // The browser cannot grant itself a premium model by spoofing `plan`.
        // Route from the authoritative server-side plan returned by the guard.
        let route;
        try {
          route = resolveRoute(body.modelId, {
            prompt: lastUser?.content ?? "",
            task: forcedTask,
            plan: isPlanId(charge.plan) ? charge.plan : undefined,
          });
        } catch (err) {
          await finalizeRequestCost(request, charge.id, actionForMode(mode), { failed: true });
          const message = err instanceof Error ? err.message : "Model routing failed.";
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            plan: charge.plan,
            attempts,
            status: "error",
            errorMessage: message,
            promptChars: lastUser?.content.length ?? 0,
            latencyMs: Date.now() - requestStarted,
            threadId,
          });
          return apiErrorResponse("no_provider", "chat", message, { traceId });
        }
        if ("error" in route) {
          await finalizeRequestCost(request, charge.id, actionForMode(mode), { failed: true });
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            plan: charge.plan,
            attempts,
            status: "error",
            errorMessage: route.error,
            promptChars: lastUser?.content.length ?? 0,
            latencyMs: Date.now() - requestStarted,
            threadId,
          });
          return apiErrorResponse("no_provider", "chat", route.error, { traceId });
        }

        const started = Date.now();
        const textAttachments = attachments.filter((item) => item.kind === "text");
        const imageAttachments = attachments.filter(
          (item) => item.kind === "image" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(item.content),
        );
        const attachmentContext = textAttachments.length
          ? `\n\nAttached files:\n${textAttachments
              .map((item) => `--- ${item.name} ---\n${item.content}`)
              .join("\n\n")}`
          : "";
        const cleanMessages: Array<{
          role: "system" | "user" | "assistant";
          content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
        }> = [
          { role: "system" as const, content: systemPromptFor(route.task) },
          ...normalizedMessages.map((message, index) => {
            const isLastUser = message === lastUser ||
              (message.role === "user" && index === normalizedMessages.length - 1);
            if (!isLastUser) return message;
            const text = `${message.content}${attachmentContext}`;
            if (imageAttachments.length === 0) return { ...message, content: text };
            return {
              ...message,
              content: [
                { type: "text" as const, text },
                ...imageAttachments.map((item) => ({
                  type: "image_url" as const,
                  image_url: { url: item.content },
                })),
              ],
            };
          }),
        ];
        const promptChars = cleanMessages.reduce(
          (sum, message) =>
            sum +
            (typeof message.content === "string"
              ? message.content.length
              : message.content.reduce(
                  (partSum, part) => partSum + (part.type === "text" ? part.text.length : 0),
                  0,
                )),
          0,
        );

        try {
          const { content, tokens, inputTokens, outputTokens, costUsd, upstream } =
            await runWithFallback(route, cleanMessages, (attempt) => attempts.push(attempt), request.signal);
          const finalCharge = await finalizeRequestCost(request, charge.id, actionForMode(mode), {
            costUsd,
            inputTokens,
            outputTokens,
            upstream,
          });
          // Finalization reports the real token cost but not the caller's plan class, so the
          // unlimited flag from the reservation is carried over — otherwise an admin's meter
          // would flip from "Unlimited" to a metered balance after every request.
          const balance = finalCharge
            ? { ...finalCharge, unlimited: finalCharge.unlimited || charge.unlimited === true }
            : charge;
          const displayedCharge = charge.unlimited
            ? actualUsageCost(actionForMode(mode), { inputTokens, outputTokens })
            : balance.charged;
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            task: route.task,
            plan: balance.plan,
            primaryModel: route.upstream,
            finalModel: upstream,
            attempts,
            status: "ok",
            promptChars,
            inputTokens,
            outputTokens,
            costUsd,
            creditsCharged: displayedCharge,
            latencyMs: Date.now() - started,
            threadId,
          });
          // Outbound webhooks are fire-and-forget: a slow receiver must never
          // delay the build response.
          void dispatchWebhooks(request, "project.built", {
            mode,
            model: route.friendlyId,
            upstream,
            traceId,
            threadId,
            latencyMs: Date.now() - started,
          }).catch(() => {});

          return Response.json({
            content,
            model: route.friendlyId,
            provider: "openrouter",
            upstream,
            task: route.task,
            traceId,
            tokens,
            inputTokens,
            outputTokens,
            costUsd,
            latencyMs: Date.now() - started,
            attempts,
            credits: {
              charged: displayedCharge,
              remaining: balance.remaining,
              total: balance.total,
              used: balance.used,
              plan: balance.plan,
              unlimited: balance.unlimited === true,
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          await finalizeRequestCost(request, charge.id, actionForMode(mode), { failed: true });
          const e = err as Error & { status?: number };
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            task: route.task,
            plan: charge.plan,
            primaryModel: route.upstream,
            attempts,
            status: "error",
            errorMessage: e.message,
            promptChars,
            latencyMs: Date.now() - started,
            threadId,
          });
          return apiErrorResponse(codeFromUpstream(e.status), "chat", e.message, {
            model: route.friendlyId,
            provider: "openrouter",
            traceId,
          });
        }
      },
    },
  },
});
