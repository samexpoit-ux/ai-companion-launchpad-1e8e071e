/**
 * Free-model pool governor (server only).
 *
 * Every `:free` OpenRouter endpoint is limited **per account key**, not per
 * user: roughly 20 requests/minute and ~1000 requests/day for the whole
 * Nexura key. With hundreds of free users that ceiling is the real bottleneck,
 * so free traffic goes through this governor:
 *
 *   - a minute window (leaky bucket) keeps us safely under 20/min
 *   - a daily counter stops us before the provider starts 429-ing everything
 *   - a small concurrency pool + a per-user slot stops one tab from hogging it
 *   - a cooldown, set whenever the provider *does* answer 429, backs the whole
 *     pool off instead of hammering every remaining free model
 *
 * Paid models never touch this module — a paying build must never queue behind
 * the free pool.
 */

export const FREE_POOL_LIMITS = {
  /** Provider allows 20/min on the account; stay under it. */
  perMinute: 17,
  /** Provider allows ~1000/day; keep headroom for retries + auto-fix. */
  perDay: 900,
  /** Simultaneous free calls in flight. */
  maxConcurrent: 4,
  /** Simultaneous free calls per caller. */
  perUserConcurrent: 1,
  /** How long a request is willing to wait in the queue before giving up. */
  maxWaitMs: 20_000,
} as const;

type State = {
  minuteWindow: number[];
  dayKey: string;
  dayCount: number;
  active: number;
  perUser: Map<string, number>;
  cooldownUntil: number;
};

const state: State = {
  minuteWindow: [],
  dayKey: "",
  dayCount: 0,
  active: 0,
  perUser: new Map(),
  cooldownUntil: 0,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollDay() {
  const key = today();
  if (state.dayKey !== key) {
    state.dayKey = key;
    state.dayCount = 0;
  }
}

function trimMinute(now: number) {
  const cutoff = now - 60_000;
  if (state.minuteWindow.length && state.minuteWindow[0] < cutoff) {
    state.minuteWindow = state.minuteWindow.filter((t) => t >= cutoff);
  }
}

export type FreeSlotDenial = {
  ok: false;
  reason: "daily" | "cooldown" | "busy";
  retryAfterSec: number;
  message: string;
};

export type FreeSlot = { ok: true; release: () => void } | FreeSlotDenial;

/** A stable, non-identifying key for the caller (bearer token or IP). */
export function poolKey(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.split(" ")[1];
  if (token) {
    // Cheap non-cryptographic digest — we only need a bucket id, not identity.
    let h = 0;
    for (let i = 0; i < token.length; i += 1) h = (h * 31 + token.charCodeAt(i)) | 0;
    return `u${h}`;
  }
  return `ip:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon"}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Reserves one free-model call. Waits (up to `maxWaitMs`) when the pool is
 * merely busy, but fails fast on the daily cap or an active provider cooldown —
 * waiting there would only burn the user's time.
 */
export async function reserveFreeSlot(userKey: string, signal?: AbortSignal): Promise<FreeSlot> {
  const deadline = Date.now() + FREE_POOL_LIMITS.maxWaitMs;

  for (;;) {
    const now = Date.now();
    rollDay();
    trimMinute(now);

    if (state.dayCount >= FREE_POOL_LIMITS.perDay) {
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      return {
        ok: false,
        reason: "daily",
        retryAfterSec: Math.max(60, Math.round((midnight.getTime() - now) / 1000)),
        message:
          "Nexura's free engines have hit today's shared daily limit. They reset within a few hours — or upgrade to a paid plan for uninterrupted builds.",
      };
    }

    if (now < state.cooldownUntil) {
      const wait = Math.ceil((state.cooldownUntil - now) / 1000);
      if (state.cooldownUntil <= deadline) {
        await sleep(Math.min(1500, state.cooldownUntil - now), signal);
        if (signal?.aborted) return { ok: false, reason: "busy", retryAfterSec: wait, message: "Request cancelled." };
        continue;
      }
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSec: wait,
        message: `The free engines are cooling down after a burst of traffic. Try again in about ${wait} second${wait === 1 ? "" : "s"} — paid plans are unaffected.`,
      };
    }

    const userActive = state.perUser.get(userKey) ?? 0;
    const free =
      state.active < FREE_POOL_LIMITS.maxConcurrent &&
      userActive < FREE_POOL_LIMITS.perUserConcurrent &&
      state.minuteWindow.length < FREE_POOL_LIMITS.perMinute;

    if (free) {
      state.active += 1;
      state.perUser.set(userKey, userActive + 1);
      state.minuteWindow.push(now);
      state.dayCount += 1;
      let released = false;
      return {
        ok: true,
        release: () => {
          if (released) return;
          released = true;
          state.active = Math.max(0, state.active - 1);
          const left = (state.perUser.get(userKey) ?? 1) - 1;
          if (left <= 0) state.perUser.delete(userKey);
          else state.perUser.set(userKey, left);
        },
      };
    }

    if (now >= deadline || signal?.aborted) {
      const perUserBlocked = userActive >= FREE_POOL_LIMITS.perUserConcurrent;
      return {
        ok: false,
        reason: "busy",
        retryAfterSec: 30,
        message: perUserBlocked
          ? "You already have a request running on the free engines. Wait for it to finish before sending another."
          : "Nexura's free engines are busy right now. Wait about 30 seconds and retry — paid plans skip this queue entirely.",
      };
    }

    await sleep(300, signal);
  }
}

/** Provider said 429: back the whole free pool off instead of retrying blindly. */
export function noteFreeRateLimit(retryAfterSec?: number) {
  const wait = Math.min(120, Math.max(20, Math.round(retryAfterSec ?? 30)));
  state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + wait * 1000);
}

export function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\b429\b|rate ?limit|too many requests|temporarily rate-limited/i.test(msg);
}

/** Seconds the provider asked us to wait, if it said so. */
export function retryAfterFromError(err: unknown): number | undefined {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = /retry[- ]?after["':\s]+(\d+)/i.exec(msg) ?? /in (\d+) seconds/i.exec(msg);
  return m ? Number(m[1]) : undefined;
}

/** Thrown when the free pool cannot serve a request; carries a 429 status. */
export class FreePoolError extends Error {
  readonly status = 429;
  constructor(
    message: string,
    readonly retryAfterSec: number,
    readonly reason: FreeSlotDenial["reason"],
  ) {
    super(message);
    this.name = "FreePoolError";
  }
}

/** Snapshot for the admin console / health checks. */
export function freePoolStatus() {
  const now = Date.now();
  rollDay();
  trimMinute(now);
  return {
    perMinuteUsed: state.minuteWindow.length,
    perMinuteLimit: FREE_POOL_LIMITS.perMinute,
    dayUsed: state.dayCount,
    dayLimit: FREE_POOL_LIMITS.perDay,
    active: state.active,
    maxConcurrent: FREE_POOL_LIMITS.maxConcurrent,
    cooldownSec: now < state.cooldownUntil ? Math.ceil((state.cooldownUntil - now) / 1000) : 0,
  };
}
