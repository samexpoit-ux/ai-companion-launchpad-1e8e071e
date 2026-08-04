/**
 * Server-side credit enforcement.
 *
 * Every billable endpoint charges *before* it calls a model, through the
 * `spend_credits` database routine. The routine locks the caller's settings
 * row, recomputes the period spend from the ledger and refuses the write when
 * the balance does not cover the cost — so two parallel tabs (or a scripted
 * client) can never overspend, and the browser can never grant itself credits.
 *
 * Server-only: this file reads `SUPABASE_*` env vars and must never be
 * imported from a component.
 */
import { createClient } from "@supabase/supabase-js";
import {
  ACTION_RULES,
  actualUsageCost,
  usageReservationCost,
  type CreditAction,
} from "@/lib/credits";

export interface ChargeResult {
  id: string;
  charged: number;
  plan: string;
  total: number;
  used: number;
  remaining: number;
  unlimited?: boolean;
}

export class CreditError extends Error {
  constructor(
    readonly kind: "unauthenticated" | "insufficient_credits" | "unavailable",
    message: string,
    readonly remaining?: number,
  ) {
    super(message);
    this.name = "CreditError";
  }
}

/**
 * Headers a legitimate Nexura client never sends. Their presence means someone
 * is trying to talk the billing layer into a free (or cheaper) request — an
 * extension, a patched bundle or a scripted client. This is a hard signal.
 */
const FORGED_BILLING_HEADERS = [
  "x-nexura-credits",
  "x-nexura-credit-override",
  "x-nexura-unlimited",
  "x-nexura-plan",
  "x-nexura-admin",
  "x-credits",
  "x-credit-override",
  "x-unlimited",
  "x-bypass-credits",
  "x-skip-billing",
];

function forgedBillingHeader(request: Request): string | null {
  for (const name of FORGED_BILLING_HEADERS) {
    if (request.headers.get(name) != null) return name;
  }
  return null;
}

type Client = ReturnType<typeof createClient>;

/**
 * Records an abuse attempt for the caller and returns true when the account was
 * suspended. Suspension is immediate and silent — no warning e-mail, no grace
 * period — exactly as the anti-bypass policy requires.
 */
async function recordAbuse(
  supabase: Client,
  kind: string,
  severity: "hard" | "soft",
  details: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc("record_abuse_attempt", {
      _kind: kind,
      _severity: severity,
      _details: details,
    });
    return (data as { suspended?: boolean } | null)?.suspended === true;
  } catch {
    return false;
  }
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

/**
 * Charges the signed-in caller for `action` and returns the new balance.
 * Throws `CreditError` — callers map that onto the unified API error envelope.
 */
export async function chargeRequest(
  request: Request,
  action: CreditAction,
  opts: {
    inputChars?: number;
    model?: string | null;
    threadId?: string | null;
    reason?: string;
  } = {},
): Promise<ChargeResult> {
  const token = bearer(request);
  if (!token) {
    throw new CreditError("unauthenticated", "Sign in to use Nexura AI.");
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) {
    throw new CreditError("unavailable", "Credit service is not configured on the server.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // A suspended account can never spend credits, even with a valid session.
  const account = await supabase.from("profiles").select("status").maybeSingle();
  if ((account.data as { status?: string } | null)?.status === "suspended") {
    throw new CreditError(
      "unauthenticated",
      "This account is suspended. Contact support to restore access.",
    );
  }

  // Hard bypass signal: forged billing headers suspend the account on the spot.
  const forged = forgedBillingHeader(request);
  if (forged) {
    await recordAbuse(supabase, "forged_billing_header", "hard", { header: forged, action });
    throw new CreditError(
      "unauthenticated",
      "This account has been suspended for attempting to bypass the credit system.",
    );
  }

  const cost = usageReservationCost(action, opts.inputChars ?? 0);

  // Admins are never blocked by a balance, but still get a normal ledger row
  // so real token and provider usage remains visible to the admin console.
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin === true) {
    const { data, error } = await supabase.rpc("reserve_unlimited_usage", {
      _action: action,
      _tier: ACTION_RULES[action].tier,
      _credits: cost,
      _model: opts.model ?? null,
      _thread_id: opts.threadId ?? null,
      _reason: opts.reason ?? "unlimited admin usage",
    });
    // Admin usage tracking is monitoring, never a gate: if the ledger function is
    // missing on this database, the build still proceeds without a ledger row.
    if (error && !/could not find the function|schema cache|does not exist/i.test(error.message ?? "")) {
      throw new CreditError("unavailable", error.message ?? "Usage ledger is unavailable.");
    }
    const row = (data ?? {}) as Partial<ChargeResult>;
    return {
      id: String(row.id ?? ""),
      charged: Number(row.charged ?? cost),
      plan: "max",
      total: Number(row.total ?? 0),
      used: Number(row.used ?? 0),
      remaining: Number(row.remaining ?? 0),
      unlimited: true,
    };
  }

  const { data, error } = await supabase.rpc("spend_credits", {
    _action: action,
    _tier: ACTION_RULES[action].tier,
    _credits: cost,
    _model: opts.model ?? null,
    _thread_id: opts.threadId ?? null,
    _reason: opts.reason ?? null,
  });

  if (error) {
    const msg = error.message ?? "Credit check failed";
    if (/insufficient credits/i.test(msg)) {
      const remaining = Number(/([\d.]+) remaining/.exec(msg)?.[1] ?? 0);
      // Out of credits is normal once. Repeated blocked billable calls inside a
      // short window are a script hammering the limit, so the routine suspends.
      const suspended = await recordAbuse(supabase, "credit_limit_retry", "soft", {
        action,
        cost,
        remaining,
      });
      if (suspended) {
        throw new CreditError(
          "unauthenticated",
          "This account has been suspended for repeatedly trying to run past its credit limit.",
        );
      }
      throw new CreditError(
        "insufficient_credits",
        `This ${ACTION_RULES[action].label.toLowerCase()} costs ${cost} credits but only ${remaining} remain.`,
        remaining,
      );
    }
    if (/account_suspended/i.test(msg)) {
      throw new CreditError(
        "unauthenticated",
        "This account is suspended. Contact support to restore access.",
      );
    }
    if (/not authenticated|not allowed|jwt|token/i.test(msg)) {
      throw new CreditError("unauthenticated", "Your session expired — sign in again.");
    }
    throw new CreditError("unavailable", msg);
  }

  const row = (data ?? {}) as Partial<ChargeResult>;
  return {
    id: String(row.id ?? ""),
    charged: Number(row.charged ?? cost),
    plan: String(row.plan ?? "free"),
    total: Number(row.total ?? 0),
    used: Number(row.used ?? 0),
    remaining: Number(row.remaining ?? 0),
  };
}

/** Maps a CreditError onto the shared API error envelope codes. */
export function creditErrorCode(err: CreditError) {
  if (err.kind === "unauthenticated") return "unauthenticated" as const;
  if (err.kind === "insufficient_credits") return "insufficient_credits" as const;
  return "unknown" as const;
}

/**
 * Stamps the real provider cost (USD), token count and the upstream model that
 * actually answered onto the ledger row created by `chargeRequest`.
 * Best-effort: a failure here must never fail an otherwise-successful request,
 * and the database routine only lets the owner stamp their own row, once.
 */
export async function finalizeRequestCost(
  request: Request,
  ledgerId: string,
  action: CreditAction,
  info: {
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    upstream?: string | null;
    failed?: boolean;
  },
): Promise<ChargeResult | null> {
  if (!ledgerId) return null;
  const token = bearer(request);
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!token || !url || !key) return null;

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const finalCredits = info.failed ? 0 : actualUsageCost(action, info);
    const { data, error } = await supabase.rpc("finalize_request_usage", {
      _ledger_id: ledgerId,
      _final_credits: finalCredits,
      _cost_usd: Number(info.costUsd ?? 0),
      _input_tokens: Math.round(Number(info.inputTokens ?? 0)),
      _output_tokens: Math.round(Number(info.outputTokens ?? 0)),
      _upstream: info.upstream ?? null,
    });
    if (error) {
      console.error("[credits] usage finalization failed", error.message);
      return null;
    }
    const row = (data ?? {}) as Partial<ChargeResult>;
    return {
      id: String(row.id ?? ledgerId),
      charged: Number(row.charged ?? finalCredits),
      plan: String(row.plan ?? "free"),
      total: Number(row.total ?? 0),
      used: Number(row.used ?? 0),
      remaining: Number(row.remaining ?? 0),
      unlimited: row.unlimited === true,
    };
  } catch (err) {
    console.error("[credits] usage finalization failed", err);
    return null;
  }
}
