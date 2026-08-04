/**
 * Credit rules.
 *
 * Every billable action has a fixed base cost plus a small size factor, so the
 * UI can show "this will cost X" *before* the request and "Y credits left"
 * right after it. The same table is used by the server ledger write, so the
 * number the user saw is the number that gets charged.
 */
import type { PlanId } from "./plans";
import { planById } from "./plans";

export type CreditAction =
  | "chat" // everyday conversation
  | "plan" // plan / architecture mode
  | "code" // build or edit a project (coding tier)
  | "autofix" // AI patch for a runtime error
  | "image" // generate an image asset for the build
  | "preview_run" // compiling + running the sandbox preview
  | "agent_run" // headless browser agent attempt (login / reproduce / verify)
  | "export"; // download / export a project


export interface ActionRule {
  action: CreditAction;
  label: string;
  /** Credits charged for a normal-sized request. */
  base: number;
  /** Extra credits per 1000 characters of prompt/context. */
  perKChars: number;
  /** Router tier this action maps to. */
  tier: "fast" | "chat" | "reason" | "code" | "fix" | "image";
  /** Internal (admin-only) note — may name the upstream engines. */
  note: string;
  /** Customer-safe note — never names a model or provider. */
  customerNote: string;
}

export const ACTION_RULES: Record<CreditAction, ActionRule> = {
  chat: {
    action: "chat",
    label: "Chat message",
    base: 0.03,
    perKChars: 0.02,
    tier: "chat",
    note: "Low-cost chat tier",
    customerNote: "Fast conversation engine",
  },
  plan: {
    action: "plan",
    label: "Plan / architecture",
    base: 0.06,
    perKChars: 0.025,
    tier: "reason",
    note: "Low-cost planning tier",
    customerNote: "Planning & architecture engine",
  },
  code: {
    action: "code",
    label: "Build / edit code",
    base: 0.18,
    perKChars: 0.05,
    tier: "code",
    note: "Top build tier when delivery needs it",
    customerNote: "Highest-quality build engine",
  },
  autofix: {
    action: "autofix",
    label: "Auto-fix patch",
    base: 0.16,
    perKChars: 0.04,
    tier: "fix",
    note: "Focused coding repair",
    customerNote: "Focused repair engine",
  },
  image: {
    action: "image",
    label: "Generate image",
    base: 0.12,
    perKChars: 0.01,
    tier: "image",
    note: "Cheapest capable image model in the router",
    customerNote: "Image studio — thumbnails, posters & social art",

  },
  preview_run: {
    action: "preview_run",
    label: "Run preview",
    base: 0.02,
    perKChars: 0,
    tier: "fast",
    note: "Compile + run in the sandbox",
    customerNote: "Compile + run in the sandbox",
  },
  agent_run: {
    action: "agent_run",
    label: "Browser agent attempt",
    base: 0.08,
    perKChars: 0,
    tier: "fast",
    note: "Headless Chromium attempt on the customer's own site",
    customerNote: "Secure browser session that signs in and inspects your site",
  },

  export: {
    action: "export",
    label: "Export project",
    base: 0.02,
    perKChars: 0,
    tier: "fast",
    note: "Download files as a zip",
    customerNote: "Download files as a zip",
  },
};

/** Round to 2 decimals so displayed and charged values always match. */
const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------ word budgeting */

/**
 * Pricing is expressed in **words**, because that is the only unit a customer
 * can count for themselves. One word is billed as ~5.5 characters of context,
 * which is what the ledger and the model tokenizer see.
 */
export const CHARS_PER_WORD = 5.5;

/** Hard cap on a single composer prompt. Enforced in the UI *and* on the server. */
export const MAX_PROMPT_WORDS = 2000;

/** Words in a prompt (whitespace-separated, punctuation-tolerant). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Credits charged per 1 000 words of input for an action. */
export function perKWords(action: CreditAction): number {
  return round(ACTION_RULES[action].perKChars * CHARS_PER_WORD);
}

/** Cost of an action for a prompt of `words` words. */
export function estimateCostForWords(action: CreditAction, words = 0): number {
  return estimateCost(action, Math.max(0, words) * CHARS_PER_WORD);
}

export interface WordBudget {
  words: number;
  limit: number;
  remaining: number;
  overBy: number;
  overLimit: boolean;
  /** 0-100 for the meter. */
  pct: number;
}

export function wordBudget(text: string, limit = MAX_PROMPT_WORDS): WordBudget {
  const words = countWords(text);
  return {
    words,
    limit,
    remaining: Math.max(0, limit - words),
    overBy: Math.max(0, words - limit),
    overLimit: words > limit,
    pct: Math.min(100, Math.round((words / limit) * 100)),
  };
}

/**
 * Prompt coach — short, actionable hints that make a prompt cheaper *and*
 * better. Deliberately model-free and never blocking (except the hard cap).
 */
export function promptCoach(text: string, limit = MAX_PROMPT_WORDS): string[] {
  const budget = wordBudget(text, limit);
  const tips: string[] = [];
  if (budget.overLimit) {
    tips.push(
      `Trim ${budget.overBy} words — a prompt can be at most ${limit} words. Split large specs into follow-up messages.`,
    );
    return tips;
  }
  if (budget.words === 0) return tips;
  if (budget.words < 8) tips.push("Add the goal, the screen and the outcome you expect — short prompts cost the same but deliver less.");
  if (budget.words > limit * 0.8)
    tips.push(`You're at ${budget.words}/${limit} words; the last ${budget.remaining} words are the priciest part of this request.`);
  if (!/\b(page|screen|component|route|api|table|form|button|layout|style|fix|bug)\b/i.test(text))
    tips.push("Name the page, component or file you want changed so the build stays focused.");
  if (budget.words > 350)
    tips.push("Long prompts bill per word — move background context into an attachment instead of pasting it.");
  return tips.slice(0, 3);
}

/** What this action will cost, given the size of its input. */
export function estimateCost(action: CreditAction, inputChars = 0): number {
  const rule = ACTION_RULES[action];
  return round(rule.base + (rule.perKChars * inputChars) / 1000);
}


export function actualUsageCost(
  action: CreditAction,
  usage: { inputTokens?: number; outputTokens?: number },
): number {
  const rule = ACTION_RULES[action];
  const inputTokens = Math.max(0, usage.inputTokens ?? 0);
  const outputTokens = Math.max(0, usage.outputTokens ?? 0);
  const inputRate = rule.perKChars * 0.35;
  const outputRate =
    action === "code" || action === "autofix"
      ? 0.05
      : action === "image"
        ? 0.06
        : action === "plan"
          ? 0.025
          : 0.02;
  return Math.max(
    0.01,
    round(rule.base + (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate),
  );
}

/** Maximum expected delivery reservation; unused credits are returned later. */
export function usageReservationCost(action: CreditAction, inputChars = 0): number {
  const inputTokens = Math.ceil(Math.max(0, inputChars) / 3.6);
  const maxOutputTokens =
    action === "code" || action === "autofix" ? 4200 : action === "plan" ? 1800 : 1200;
  return actualUsageCost(action, { inputTokens, outputTokens: maxOutputTokens });
}

/** Map a composer mode ("Build" | "Chat" | "Plan" | "Image") to a billable action. */
export function actionForMode(mode: string): CreditAction {
  const m = mode.toLowerCase();
  if (m === "plan") return "plan";
  if (m === "chat") return "chat";
  if (m === "image") return "image";
  return "code";
}


export function creditsForPlan(plan: PlanId): number {
  return planById(plan).credits;
}

export function usedPct(used: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

export function formatCredits(value: number): string {
  const rounded = round(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

/** Legacy display constant kept so older imports keep compiling. */
export const CREDITS = { left: 40, total: 40 };

export interface ChargeLine {
  label: string;
  detail: string;
}

/**
 * Customer-safe explanation of why an action cost what it cost.
 *
 * Deliberately model-free: customers see the workload (request size, generated
 * output, files delivered) and never the engine or provider that ran it.
 */
export function chargeExplanation(
  action: CreditAction,
  opts: {
    credits?: number;
    inputTokens?: number;
    outputTokens?: number;
    fileCount?: number;
  } = {},
): ChargeLine[] {
  const rule = ACTION_RULES[action] ?? ACTION_RULES.chat;
  const lines: ChargeLine[] = [
    { label: rule.label, detail: `${formatCredits(rule.base)} credits base rate` },
    { label: "Engine class", detail: rule.customerNote },
  ];
  if (opts.inputTokens) {
    lines.push({
      label: "Request size",
      detail: `${opts.inputTokens.toLocaleString()} input tokens read from your prompt and project context`,
    });
  }
  if (opts.outputTokens) {
    lines.push({
      label: "Generated output",
      detail: `${opts.outputTokens.toLocaleString()} tokens written back to you`,
    });
  }
  if (opts.fileCount) {
    lines.push({
      label: "Files delivered",
      detail: `${opts.fileCount} file(s) written to the workspace`,
    });
  }
  if (opts.credits != null) {
    lines.push({ label: "Total charged", detail: `${formatCredits(opts.credits)} credits` });
  }
  return lines;
}
