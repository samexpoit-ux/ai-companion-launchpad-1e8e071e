/**
 * SINGLE SOURCE OF TRUTH FOR MODELS (edit only this file).
 *
 * Nexura hides models from users — the smart router picks the cheapest model
 * that can do the job (same behaviour as Lovable). Swap any OpenRouter model id
 * below and the whole app follows: chat, plan, coding, auto-fix and images.
 *
 * COST POLICY (Aug 2026): every paid id below stays UNDER $1 / 1M tokens for
 * BOTH input and output. Verified against the live OpenRouter catalogue:
 *   openai/gpt-5.6-luna-pro      $0.10  / $0.60   1.05M ctx  (build primary)
 *   deepseek/deepseek-v4-flash   $0.14  / $0.28   1.05M ctx  (build #2 + chat)
 *   deepseek/deepseek-v4-flash-0731 $0.09 / $0.18           (paid chat)
 *   nvidia/nemotron-3-nano-30b-a3b $0.05 / $0.20             (cheapest, fast)
 *   qwen/qwen3-coder-next        $0.12  / $0.80   262K ctx
 *   kwaipilot/kat-coder-air-v2.5 $0.15  / $0.60   256K ctx
 *   deepseek/deepseek-v4-pro     $0.435 / $0.87   1.05M ctx  (deep reasoning)
 *   google/gemini-2.5-flash-lite $0.10  / $0.40             (plan, multimodal)
 *   google/gemma-4-31b-it        $0.10  / $0.34             (cheap chat)
 *
 * Removed for cost: z-ai/glm-5.2 ($0.70/$2.20) and Claude Sonnet 4.6
 * ($3/$15) — both break the sub-$1 rule.
 *
 * Image note: no image model on OpenRouter is under $1 output. The cheapest
 * usable one is google/gemini-2.5-flash-image ($0.30 / $2.50), so image
 * generation is charged as its own heavier action.
 *
 * Cost policy per tier:
 *   fast   — greetings/one-liners       → cheapest
 *   chat   — everyday chat              → cheap, smart
 *   reason — architecture, plans        → cheap Google multimodal
 *   code   — building, refactors        → best value coding model
 *   fix    — runtime error auto-fix     → best cheap patcher
 *   image  — image generation           → cheapest image model
 *
 * IMPORTANT: every id here must exist on https://openrouter.ai/api/v1/models.
 */

/** Coding tier — best value first, strong cheap coders as fallback. */
export const CODING_PRIMARY = "openai/gpt-5.6-luna-pro";
export const CODING_SECONDARY = "deepseek/deepseek-v4-flash";
/** Cheap specialist coders (agentic, long context) used before giving up. */
export const CODING_TERTIARY = "qwen/qwen3-coder-next";
export const CODING_BUDGET = "kwaipilot/kat-coder-air-v2.5";

/** Cheap tier — paid chat. */
export const CHEAP_CHAT = "deepseek/deepseek-v4-flash-0731";
/** Ultra-cheap tier — greetings, titles, one-liners. */
export const NANO_CHAT = "nvidia/nemotron-3-nano-30b-a3b";
/** Cheap Google model for plans / architecture (multimodal, sub-$1). */
export const CHEAP_PLAN = "google/gemini-2.5-flash-lite";
/** Cheap non-Google chat alternative. */
export const CHEAP_SMART = "google/gemma-4-31b-it";
/** Cheap deep-reasoning model with a very large context window. */
export const CHEAP_REASON = "deepseek/deepseek-v4-pro";
/** Cheapest image generation/editing model. */
export const IMAGE_MODEL = "google/gemini-2.5-flash-image";

/** Free safety net — free plan runs entirely on these. */
export const FREE_CODE = "poolside/laguna-s-2.1:free";
export const FREE_CODE_LITE = "poolside/laguna-xs-2.1:free";
export const FREE_POWER = "nvidia/nemotron-3-ultra-550b-a55b:free";
export const FREE_SUPER = "nvidia/nemotron-3-super-120b-a12b:free";
export const FREE_SMART = "google/gemma-4-31b-it:free";
export const FREE_SMART_LITE = "google/gemma-4-26b-a4b-it:free";
export const FREE_FAST = "nvidia/nemotron-3-nano-30b-a3b:free";
export const FREE_OSS = "openai/gpt-oss-20b:free";

/** Every free model, ordered strongest → fastest. Free plan gets all of them. */
export const FREE_MODELS: readonly string[] = [
  FREE_CODE,
  FREE_POWER,
  FREE_SUPER,
  FREE_CODE_LITE,
  FREE_SMART,
  FREE_SMART_LITE,
  FREE_FAST,
  FREE_OSS,
];

/** Ordered chains: [primary, ...fallbacks]. */
export const TIER_CHAINS = {
  code: [
    CODING_PRIMARY,
    CODING_SECONDARY,
    CODING_TERTIARY,
    CODING_BUDGET,
    CHEAP_REASON,
    ...FREE_MODELS,
  ],
  // Bug fixing / auto-fix: cheap specialist coders write the tightest patches.
  fix: [
    CODING_PRIMARY,
    CODING_TERTIARY,
    CODING_BUDGET,
    CODING_SECONDARY,
    CHEAP_REASON,
    ...FREE_MODELS,
  ],
  // Plans stay cheap — Google Flash Lite plans at chat-model prices.
  reason: [CHEAP_PLAN, CHEAP_REASON, CODING_PRIMARY, FREE_POWER, FREE_SMART, FREE_OSS],
  chat: [CHEAP_CHAT, NANO_CHAT, CHEAP_SMART, FREE_POWER, FREE_SMART, FREE_OSS],
  fast: [NANO_CHAT, CHEAP_CHAT, FREE_FAST, FREE_SMART_LITE, FREE_OSS],
  image: [IMAGE_MODEL],
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
export const PREMIUM_MODELS: readonly string[] = [CODING_PRIMARY, IMAGE_MODEL];
export const CHEAP_MODELS: readonly string[] = [
  CHEAP_CHAT,
  NANO_CHAT,
  CHEAP_PLAN,
  CHEAP_SMART,
  CHEAP_REASON,
  CODING_SECONDARY,
  CODING_TERTIARY,
  CODING_BUDGET,
];

/**
 * Clamp a routing chain to what the selected plan is allowed to use.
 *   "premium" — everything.
 *   "cheap"   — no premium models (cheap + free only).
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
  return [...FREE_MODELS];
}
