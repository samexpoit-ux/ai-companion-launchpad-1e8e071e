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
    note: "Low-cost DeepSeek / Gemini tier",
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
    note: "Claude coding tier when delivery needs it",
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
    note: "Cheapest image model (gemini-2.5-flash-image)",
    customerNote: "Image generation engine",
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

/** Map a chat composer mode ("Build" | "Chat" | "Plan") to a billable action. */
export function actionForMode(mode: string): CreditAction {
  const m = mode.toLowerCase();
  if (m === "plan") return "plan";
  if (m === "chat") return "chat";
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
