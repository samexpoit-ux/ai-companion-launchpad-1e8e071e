/**
 * SINGLE SOURCE OF TRUTH FOR MODELS (edit only this file).
 *
 * Nexura hides models from users — the smart router picks the cheapest model
 * that can do the job (same behaviour as Lovable). Swap any OpenRouter model id
 * below and the whole app follows: chat, plan, coding and auto-fix.
 *
 * Selected from the live OpenRouter catalogue (prices per 1M tokens):
 *   openai/gpt-5.6-luna-pro      $0.10 / $0.60   1.05M ctx  (pro reasoning)
 *   openai/gpt-5.6-luna          $0.10 / $0.60   1.05M ctx
 *   z-ai/glm-5.2                 $0.70 / $2.20   1.05M ctx  (strongest patcher)
 *   qwen/qwen3-coder-next        $0.12 / $0.80   262K ctx
 *   kwaipilot/kat-coder-air-v2.5 $0.15 / $0.60   256K ctx
 *   deepseek/deepseek-v4-pro     $0.435 / $0.87  1.05M ctx  (cheap reasoning)
 *   deepseek/deepseek-v4-flash   $0.09 / $0.18   1.05M ctx  (cheapest)
 *
 * Claude Sonnet 4.6 ($3 / $15) was removed: a build turn cost ~$0.078 there
 * versus ~$0.003 on GPT-5.6 Luna Pro, which is what made the 200-credit plan
 * unprofitable.
 *
 * Cost policy:
 *   fast   — greetings/one-liners       → cheapest
 *   chat   — everyday chat              → cheap, smart
 *   reason — architecture, plans        → cheap reasoning
 *   code   — building, refactors        → best value coding model
 *   fix    — runtime error auto-fix     → best patching model
 *
 * IMPORTANT: every id here must exist on https://openrouter.ai/api/v1/models.
 * Retired ids silently fall through the fallback chain and builds land on a
 * weak model — that is why generated code used to be inaccurate.
 */

/** Coding tier — best value first, strong cheap coders as fallback. */
export const CODING_PRIMARY = "openai/gpt-5.6-luna-pro";
export const CODING_SECONDARY = "z-ai/glm-5.2";
/** Cheap specialist coders (agentic, long context) used before giving up. */
export const CODING_TERTIARY = "qwen/qwen3-coder-next";
export const CODING_BUDGET = "kwaipilot/kat-coder-air-v2.5";

/** Cheap tier — chat, titles. */
export const CHEAP_CHAT = "openai/gpt-5.6-luna";
/** Ultra-cheap tier — greetings, titles, one-liners. */
export const NANO_CHAT = "deepseek/deepseek-v4-flash";
/** Cheap reasoning/plan model with a very large context window. */
export const CHEAP_REASON = "deepseek/deepseek-v4-pro";

/** Free safety net so the product keeps working when credit runs out. */
export const FREE_CODE = "poolside/laguna-s-2.1:free";
export const FREE_POWER = "nvidia/nemotron-3-ultra-550b-a55b:free";
export const FREE_SMART = "google/gemma-4-31b-it:free";
export const FREE_FAST = "nvidia/nemotron-3-nano-30b-a3b:free";
export const FREE_OSS = "openai/gpt-oss-20b:free";

/** Ordered chains: [primary, ...fallbacks]. */
export const TIER_CHAINS = {
  code: [
    CODING_PRIMARY,
    CODING_SECONDARY,
    CODING_TERTIARY,
    CODING_BUDGET,
    CHEAP_REASON,
    FREE_CODE,
    FREE_POWER,
    FREE_OSS,
  ],
  // Bug fixing / auto-fix: GLM-5.2 writes the most reliable patches.
  fix: [
    CODING_SECONDARY,
    CODING_PRIMARY,
    CODING_TERTIARY,
    CODING_BUDGET,
    CHEAP_REASON,
    FREE_CODE,
    FREE_POWER,
    FREE_OSS,
  ],
  // Plans stay cheap — Luna Pro reasons at chat-model prices.
  reason: [CODING_PRIMARY, CHEAP_REASON, CHEAP_CHAT, FREE_POWER, FREE_SMART, FREE_OSS],
  chat: [CHEAP_CHAT, NANO_CHAT, FREE_POWER, FREE_SMART, FREE_OSS],
  fast: [NANO_CHAT, CHEAP_CHAT, FREE_FAST, FREE_POWER, FREE_OSS],
} as const;

/** Small code question — no need to pay the top coding tier. */
export const LIGHT_CODE_CHAIN = [
  CODING_TERTIARY,
  CODING_BUDGET,
  CHEAP_CHAT,
  FREE_CODE,
  FREE_POWER,
  FREE_OSS,
];

/** Models that cost real money, grouped by how expensive they are. */
export const PREMIUM_MODELS: readonly string[] = [CODING_SECONDARY];
export const CHEAP_MODELS: readonly string[] = [
  CHEAP_CHAT,
  NANO_CHAT,
  CHEAP_REASON,
  CODING_PRIMARY,
  CODING_TERTIARY,
  CODING_BUDGET,
];

/**
 * Clamp a routing chain to what the selected plan is allowed to use.
 *   "premium" — everything.
 *   "cheap"   — no premium coding models (cheap + free only).
 *   "free"    — free models only.
 * The chain always keeps at least one entry so a request can still run.
 */
export function clampChainToCeiling(
  chain: readonly string[],
  ceiling: "free" | "cheap" | "premium",
): string[] {
  if (ceiling === "premium") return [...chain];
  const blocked = ceiling === "free" ? [...PREMIUM_MODELS, ...CHEAP_MODELS] : PREMIUM_MODELS;
  const allowed = chain.filter((m) => !blocked.includes(m));
  if (allowed.length > 0) return allowed;
  // Nothing survived the clamp: fall back to the strongest free models so a
  // free / out-of-credit account still gets a good answer instead of an error.
  return [FREE_CODE, FREE_POWER, FREE_OSS];
}
