// Nexura AI — single-provider gateway (OpenRouter only).
//
// SMART COST ROUTER
// The user never picks a model (same as Lovable). We inspect the task and the
// complexity of the prompt and send it to the cheapest model that can do the job
// well:
//   trivial / short chat  -> free or ultra-cheap model
//   normal chat / plan    -> cheap chat tier
//   coding / bug fixing   -> best coding tier (used only when needed)
// Every route has a fallback chain that ends on free models, so the service keeps
// working even if the paid credit runs out.
//
// All model ids live in `model-tiers.ts` — edit that file, not this one.

import {
  CHEAP_CHAT,
  CODING_PRIMARY,
  CHEAP_PLAN,
  CODING_SECONDARY,
  CODING_TERTIARY,
  NANO_CHAT,
  FREE_CODE,
  FREE_FAST,
  FREE_OSS,
  FREE_POWER,
  FREE_SMART,
  IMAGE_MODEL,
  LIGHT_CODE_CHAIN,
  TIER_CHAINS,
  clampChainToCeiling,
} from "./model-tiers";
import { planById, type PlanId } from "./plans";


export type TaskKind = "chat" | "code" | "reason" | "fix" | "fast" | "image";

export interface OpenRouterConfig {
  baseURL: string;
  apiKey: string;
  extraHeaders: Record<string, string>;
}

export interface ResolvedRoute {
  config: OpenRouterConfig;
  upstream: string;
  friendlyId: string;
  task: TaskKind;
  /** Ordered fallbacks if the primary model fails. */
  fallbacks: string[];
}

export type GatewayMessageContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export function openRouterConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    extraHeaders: {
      "HTTP-Referer": "https://nexuraai.dev",
      "X-Title": "Nexura AI",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Model catalogue — ids come from model-tiers.ts                       */
/* ------------------------------------------------------------------ */

/** Friendly ids kept for backwards compatibility with stored threads. */
export const MODEL_ROUTES: Record<string, { upstream: string; task: TaskKind }> = {
  "nx-auto": { upstream: CHEAP_CHAT, task: "chat" },
  "nx-builder": { upstream: CODING_PRIMARY, task: "code" },
  "nx-reasoner": { upstream: CODING_PRIMARY, task: "reason" },
  "nx-flash": { upstream: CHEAP_CHAT, task: "fast" },
  "nx-vision": { upstream: CHEAP_PLAN, task: "chat" },
};

/** Cheap tier first, expensive tier only for heavy work. */
const TASK_MODELS: Record<TaskKind, string[]> = {
  code: [...TIER_CHAINS.code],
  fix: [...TIER_CHAINS.fix],
  reason: [...TIER_CHAINS.reason],
  chat: [...TIER_CHAINS.chat],
  fast: [...TIER_CHAINS.fast],
  image: [...TIER_CHAINS.image],
};

const FRIENDLY_BY_UPSTREAM: Record<string, string> = {
  [CODING_PRIMARY]: "nx-builder",
  [CODING_SECONDARY]: "nx-vision",
  [CODING_TERTIARY]: "nx-builder",
  [CHEAP_CHAT]: "nx-flash",
  [NANO_CHAT]: "nx-flash",
  [FREE_CODE]: "nx-builder",
  [FREE_POWER]: "nx-auto",
  [FREE_SMART]: "nx-auto",
  [FREE_FAST]: "nx-flash",
  [FREE_OSS]: "nx-auto",
  [IMAGE_MODEL]: "nx-vision",
};


/* ------------------------------------------------------------------ */
/* Task + complexity detection                                         */
/* ------------------------------------------------------------------ */

const BUILD_HINTS =
  /\b(build|create|make|generate|component|app|page|dashboard|website|landing|ui|refactor|implement|api|function|css|tailwind|react|tsx|typescript|javascript|python|sql|code|bug|error|fix)\b/i;
const REASON_HINTS =
  /\b(why|explain|compare|analy[sz]e|architect|strategy|trade[- ]?off|plan|design a system|prove|step by step|reason)\b/i;
const HEAVY_HINTS =
  /\b(full|complete|entire|multi[- ]?file|project|architecture|production|refactor|migrate|optimi[sz]e|debug|stack trace|test suite|end[- ]to[- ]end)\b/i;
const TRIVIAL_HINTS =
  /^(hi|hey|hello|yo|thanks|thank you|ok|okay|cool|nice|hmm|what'?s up|assalamu.*|salam)\b/i;

/** Auto-detect which kind of work the prompt needs. */
export function detectTask(prompt: string): TaskKind {
  const text = (prompt || "").slice(0, 4000);
  if (!text.trim()) return "chat";
  if (TRIVIAL_HINTS.test(text.trim()) && text.length < 60) return "fast";
  if (/```|<nexusArtifact|\.tsx|\.jsx|\bimport \w/.test(text) || BUILD_HINTS.test(text)) {
    return "code";
  }
  if (REASON_HINTS.test(text)) return "reason";
  if (text.length < 120) return "fast";
  return "chat";
}

/** 0 = trivial, 1 = normal, 2 = heavy. Drives the cost tier. */
export function complexityScore(prompt: string): 0 | 1 | 2 {
  const text = (prompt || "").slice(0, 8000);
  const len = text.length;
  let score = 0;
  if (len > 400) score += 1;
  if (len > 1500) score += 1;
  if (HEAVY_HINTS.test(text)) score += 1;
  if ((text.match(/```/g)?.length ?? 0) >= 2) score += 1;
  if (/\b(file|files)\b/i.test(text) && BUILD_HINTS.test(text)) score += 1;
  if (score >= 2) return 2;
  if (score === 1) return 1;
  return 0;
}

function chainFor(task: TaskKind, prompt: string): string[] {
  const heaviness = complexityScore(prompt);
  if ((task === "code" || task === "fix") && heaviness === 0) return LIGHT_CODE_CHAIN;
  if (task === "chat" && heaviness === 2) return TASK_MODELS.reason;
  return TASK_MODELS[task] ?? TASK_MODELS.chat;
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve the model for a request. The UI never sends a model id anymore —
 * routing is fully automatic (Lovable-style). Legacy ids are still honoured.
 */
export function resolveRoute(
  friendlyId: string | undefined,
  options?: { prompt?: string; task?: TaskKind; plan?: PlanId },
): ResolvedRoute | { error: string } {
  const config = openRouterConfig();
  if (!config) {
    return {
      error:
        "The AI provider is not configured on this server. Set OPENROUTER_API_KEY in the server environment (/var/www/nexuraai/.env) and restart the service.",
    };
  }

  const prompt = options?.prompt ?? "";
  const task: TaskKind = options?.task ?? detectTask(prompt);
  const ceiling = planById(options?.plan).ceiling;
  // Image generation has exactly one cheap model — clamping it away would leave
  // the request unrunnable, so the image chain is used as-is.
  const chain =
    task === "image" ? [...TASK_MODELS.image] : clampChainToCeiling(chainFor(task, prompt), ceiling);

  // A legacy explicit pick only nudges the chain to the front; it never
  // overrides a cheaper-is-fine decision for trivial prompts.
  const explicit =
    friendlyId && friendlyId !== "nx-auto" ? MODEL_ROUTES[friendlyId]?.upstream : undefined;
  const upstream = explicit && chain.includes(explicit) ? explicit : chain[0];
  const fallbacks = chain.filter((m) => m !== upstream);

  return {
    config,
    upstream,
    friendlyId: FRIENDLY_BY_UPSTREAM[upstream] ?? "nx-auto",
    task,
    fallbacks,
  };
}

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

/** Keep paid calls bounded so cost stays predictable. */
function maxTokensFor(model: string, task: TaskKind): number {
  const paid = !model.endsWith(":free");
  if (!paid) return 4096;
  if (task === "image") return 2400;
  if (task === "code" || task === "fix") return 9000;
  if (task === "reason") return 3000;
  return 1600;
}

/** Per-attempt wall clock. A hung provider must never hold the whole request. */
export function attemptTimeoutMs(task: TaskKind): number {
  if (task === "code" || task === "fix") return 110_000;
  if (task === "image") return 90_000;
  if (task === "reason") return 90_000;
  return 60_000;
}

/** Whole-request budget: after this we stop walking the chain and report. */
export function totalBudgetMs(task: TaskKind): number {
  return task === "code" || task === "fix" ? 240_000 : 120_000;
}

/**
 * Errors that mean "this model can never run on this account" (bad id, no
 * endpoint for our data policy, model gone). Retrying wastes minutes, so the
 * chain skips these instantly instead of timing them out.
 */
export function isPermanentModelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    /No endpoints found/i.test(msg) ||
    /data policy/i.test(msg) ||
    /is not a valid model/i.test(msg) ||
    /No allowed providers/i.test(msg)
  );
}

function combineSignals(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error("attempt timed out")), timeoutMs);
  const onAbort = () => ctl.abort(external?.reason);
  if (external) {
    if (external.aborted) onAbort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

export async function callChatCompletion(
  config: OpenRouterConfig,
  upstreamModel: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: GatewayMessageContent }>,
  task: TaskKind = "chat",
  signal?: AbortSignal,
): Promise<{ content: string; tokens: number; inputTokens: number; outputTokens: number; costUsd: number }> {
  const isFree = upstreamModel.endsWith(":free");
  const guard = combineSignals(attemptTimeoutMs(task), signal);
  let res: Response;
  try {
    res = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({
        model: upstreamModel,
        messages,
        temperature: task === "code" || task === "fix" ? 0.2 : 0.7,
        ...(task === "image" ? { modalities: ["image", "text"] } : {}),
        max_tokens: maxTokensFor(upstreamModel, task),
        stream: false,
        // Real token + dollar cost of the call comes back in `usage`.
        usage: { include: true },
        // OpenRouter provider routing: cheapest healthy provider, but never
        // silently drop to a provider that can't serve the full context.
        // Free endpoints only exist for accounts that allow prompt training, so
        // asking them to deny data collection leaves zero endpoints (404).
        provider: {
          sort: "price",
          allow_fallbacks: true,
          ...(isFree ? {} : { data_collection: "deny" }),
        },
      }),
      signal: guard.signal,
    });
  } finally {
    guard.done();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`[openrouter:${upstreamModel}] ${res.status} ${text.slice(0, 400)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        images?: Array<{ image_url?: { url?: string }; type?: string }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(`[openrouter:${upstreamModel}] ${data.error.message}`);
  }
  const message = data.choices?.[0]?.message;
  const images = (message?.images ?? [])
    .map((img) => img?.image_url?.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  // Generated images come back as data URLs; render them as markdown so the
  // chat bubble shows the artwork inline and the user can save it.
  const content = images.length
    ? `${images.map((url, i) => `![Generated image ${i + 1}](${url})`).join("\n\n")}${
        message?.content ? `\n\n${message.content}` : ""
      }`
    : (message?.content ?? "");
  const tokens = data.usage?.total_tokens ?? Math.round(content.length / 3.6);
  const costUsd = typeof data.usage?.cost === "number" ? data.usage.cost : 0;
  return {
    content,
    tokens,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? Math.round(content.length / 3.6),
    costUsd,
  };
}

/**
 * Run the primary model, then walk the fallback chain on failure.
 * Guardrails: every attempt has its own timeout, permanently broken models are
 * skipped instantly, and the whole walk stops at a total budget so the user
 * gets a real answer (or a real error) instead of an endless spinner.
 */
export async function runWithFallback(
  route: ResolvedRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: GatewayMessageContent }>,
  onAttempt?: (attempt: { model: string; ok: boolean; ms: number; error?: string }) => void,
  signal?: AbortSignal,
  /** Caller bucket for the shared free-model pool (see free-pool.server.ts). */
  userKey?: string,
): Promise<{ content: string; tokens: number; inputTokens: number; outputTokens: number; costUsd: number; upstream: string }> {
  const chain = [route.upstream, ...route.fallbacks];
  const deadline = Date.now() + totalBudgetMs(route.task);
  let lastError: unknown;
  let ran = 0;
  // Set when the shared free pool refused us: every remaining `:free` model
  // shares the same account-wide limit, so we stop asking and report once.
  let freeDenial: FreeSlotDenial | null = null;
  for (const model of chain) {
    // A permanent failure costs no time, so only real attempts consume budget.
    if (ran > 0 && Date.now() + attemptTimeoutMs(route.task) > deadline + attemptTimeoutMs(route.task) / 2) {
      lastError =
        lastError ?? new Error("The build took too long and was stopped before finishing.");
      break;
    }

    const isFree = model.endsWith(":free");
    let release: (() => void) | null = null;
    if (isFree) {
      if (freeDenial) continue; // free pool already said no — don't re-queue
      const slot = await reserveFreeSlot(userKey ?? "anon", signal);
      if (!slot.ok) {
        freeDenial = slot;
        onAttempt?.({ model, ok: false, ms: 0, error: `free pool ${slot.reason}: ${slot.message}` });
        continue;
      }
      release = slot.release;
    }

    const started = Date.now();
    try {
      const out = await callChatCompletion(route.config, model, messages, route.task, signal);
      ran += 1;
      if (out.content.trim()) {
        // Build mode is a delivery contract, not a normal chat answer. If a
        // provider only explains the page, continue to the next coding model.
        if (route.task === "code") {
          const hasArtifact = /<nexusArtifact\b[\s\S]*?<\/nexusArtifact>/i.test(out.content);
          // A build can target any stack, so accept a React entry, a static web
          // entry, or a real backend/infra file as proof of delivery.
          const hasEntry =
            /<nexusAction\b[^>]*filePath=["'][^"']*\.(?:tsx|jsx|html|php|blade\.php|ts|js|py|go|rb|java|sql|ya?ml|toml)["']/i.test(
              out.content,
            ) || /<nexusAction\b[^>]*filePath=["'][^"']*Dockerfile[^"']*["']/i.test(out.content);
          if (!hasArtifact || !hasEntry) {
            lastError = new Error(`[openrouter:${model}] incomplete build delivery`);
            onAttempt?.({
              model,
              ok: false,
              ms: Date.now() - started,
              error: "incomplete build delivery: missing artifact or entry file",
            });
            continue;
          }
        }

        onAttempt?.({ model, ok: true, ms: Date.now() - started });
        return { ...out, upstream: model };
      }
      lastError = new Error(`[openrouter:${model}] empty response`);
      onAttempt?.({ model, ok: false, ms: Date.now() - started, error: "empty response" });
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
      const permanent = isPermanentModelError(err);
      const limited = isRateLimitError(err);
      if (limited && isFree) {
        // Account-wide limit: cool the pool down and stop trying free models.
        const wait = retryAfterFromError(err);
        noteFreeRateLimit(wait);
        freeDenial = {
          ok: false,
          reason: "cooldown",
          retryAfterSec: Math.max(20, wait ?? 30),
          message:
            "Nexura's free engines are rate limited right now (shared across all free accounts). Retry in about half a minute, or upgrade for a dedicated paid lane.",
        };
      }
      if (!permanent && !limited) ran += 1;
      onAttempt?.({
        model,
        ok: false,
        ms: Date.now() - started,
        error: `${permanent ? "unavailable: " : limited ? "rate limited: " : ""}${
          err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
        }`,
      });
    } finally {
      release?.();
    }
  }
  // A free-pool refusal is not a provider failure — report it as a clear,
  // retryable message instead of a raw upstream error.
  if (freeDenial) {
    throw new FreePoolError(freeDenial.message, freeDenial.retryAfterSec, freeDenial.reason);
  }
  throw lastError instanceof Error ? lastError : new Error("All OpenRouter models failed");
}

