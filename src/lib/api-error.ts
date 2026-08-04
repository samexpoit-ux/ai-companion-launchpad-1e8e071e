/**
 * Unified API error contract shared by /api/chat, /api/autofix and the
 * in-app ErrorOverlay.
 *
 * Every failing endpoint responds with the exact same JSON shape so the
 * client never has to guess how to read an error:
 *
 *   { error: { code, message, hint, steps: string[], source, status } }
 *
 * `error` is also mirrored as a plain string on the response body for
 * backwards compatibility with older callers.
 */

export type ApiErrorCode =
  | "bad_request"
  | "invalid_json"
  | "missing_input"
  | "no_provider"
  | "unauthenticated"
  | "insufficient_credits"
  | "rate_limited"
  | "quota_exhausted"
  | "upstream_failed"
  | "bad_model_output"
  | "network"
  | "unknown";

export type ApiErrorSource = "chat" | "autofix" | "preview" | "client";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  /** One-line plain-language explanation. */
  hint: string;
  /** Ordered, concrete next steps rendered by the overlay. */
  steps: string[];
  source: ApiErrorSource;
  status: number;
  /** Optional extra context (model id, provider, attempt…). */
  meta?: Record<string, string | number>;
};

const CATALOG: Record<ApiErrorCode, { status: number; hint: string; steps: string[] }> = {
  bad_request: {
    status: 400,
    hint: "The request the app sent was rejected.",
    steps: ["Reload the page and try the action again.", "If it repeats, start a new workspace."],
  },
  invalid_json: {
    status: 400,
    hint: "The request body could not be read.",
    steps: ["Reload the page.", "Send a shorter message if the last one was very large."],
  },
  missing_input: {
    status: 400,
    hint: "Required input was missing from the request.",
    steps: ["Type a prompt before sending.", "For auto-fix, make sure the preview captured an error first."],
  },
  no_provider: {
    status: 500,
    hint: "No AI provider is configured on the server.",
    steps: [
      "Set the OPENROUTER_API_KEY environment variable on the server.",
      "Restart the app after adding the key.",
    ],
  },
  unauthenticated: {
    status: 401,
    hint: "You need to be signed in for this action.",
    steps: ["Sign in again from the account menu.", "Reload the page if the session looks stale."],
  },
  insufficient_credits: {
    status: 402,
    hint: "Your credit balance does not cover this request.",
    steps: [
      "Open your account panel to see the remaining balance.",
      "Upgrade your plan to get more monthly credits.",
    ],
  },
  rate_limited: {
    status: 429,
    hint: "The free engines are busy or have hit their shared limit.",
    steps: [
      "Wait for the time shown above, then send the prompt again — your credits were not charged.",
      "Paid plans run on a dedicated lane and skip this queue entirely.",
    ],
  },

  quota_exhausted: {
    status: 402,
    hint: "The provider rejected the key (quota, billing or permission).",
    steps: [
      "Check the OpenRouter key is valid and has free credit.",
      "Pick another free model and retry.",
    ],
  },
  upstream_failed: {
    status: 502,
    hint: "The model provider failed to answer.",
    steps: [
      "Retry — free endpoints fail intermittently.",
      "Switch models if the failure keeps repeating.",
    ],
  },
  bad_model_output: {
    status: 502,
    hint: "The model replied, but not with a usable patch.",
    steps: [
      "Press Fix with AI again — output varies between runs.",
      "Or fix the reported line manually in the Code tab.",
    ],
  },
  network: {
    status: 503,
    hint: "The app could not reach the server.",
    steps: ["Check your connection.", "Reload the page and retry."],
  },
  unknown: {
    status: 500,
    hint: "Something went wrong on the server.",
    steps: ["Retry the action.", "Reload the page if the problem persists."],
  },
};

export function buildApiError(
  code: ApiErrorCode,
  source: ApiErrorSource,
  message: string,
  meta?: Record<string, string | number>,
): ApiError {
  const base = CATALOG[code];
  return { code, message, hint: base.hint, steps: base.steps, source, status: base.status, meta };
}

/** Server helper: returns a Response with the unified error envelope. */
export function apiErrorResponse(
  code: ApiErrorCode,
  source: ApiErrorSource,
  message: string,
  meta?: Record<string, string | number>,
): Response {
  const err = buildApiError(code, source, message, meta);
  return Response.json({ error: err, message: err.message }, { status: err.status });
}

/** Maps a thrown upstream error to the right unified code. */
export function codeFromUpstream(status?: number): ApiErrorCode {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 402 || status === 403) return "quota_exhausted";
  if (status && status >= 500) return "upstream_failed";
  return "unknown";
}

/** Client helper: normalizes anything a fetch call produced into an ApiError. */
export function parseApiError(input: unknown, source: ApiErrorSource): ApiError {
  if (input && typeof input === "object") {
    const raw = (input as { error?: unknown }).error;
    if (raw && typeof raw === "object" && typeof (raw as ApiError).code === "string") {
      return raw as ApiError;
    }
    if (typeof raw === "string" && raw.trim()) {
      return buildApiError("unknown", source, raw);
    }
  }
  if (typeof input === "string" && input.trim()) return buildApiError("unknown", source, input);
  if (input instanceof Error) return buildApiError("network", source, input.message);
  return buildApiError("unknown", source, "Unexpected error");
}

/** Reads an error out of a failed fetch Response (JSON or text). */
export async function readApiError(res: Response, source: ApiErrorSource): Promise<ApiError> {
  try {
    const data = await res.clone().json();
    return parseApiError(data, source);
  } catch {
    const text = await res.text().catch(() => "");
    return buildApiError(
      res.status === 429 ? "rate_limited" : codeFromUpstream(res.status),
      source,
      text || `Request failed (${res.status})`,
    );
  }
}

/** Local (non-API) build/runtime failures mapped into the same shape. */
export function previewErrorSteps(message: string): string[] {
  const m = message.toLowerCase();
  if (m.includes("is not available in the live preview")) {
    return [
      "The project imports a package the sandbox cannot load.",
      "Only react, react-dom and lucide-react are bundled — remove or replace that import.",
      "Or ask the AI: “replace this dependency with plain React”.",
    ];
  }
  if (m.includes("unexpected token") || m.includes("syntaxerror") || m.includes("unterminated")) {
    return [
      "There is a syntax error in the edited file.",
      "Check the line/column shown above — usually a missing bracket, quote or comma.",
      "Fix it in the Code tab; the preview reloads as you type.",
    ];
  }
  if (m.includes("no react component was exported")) {
    return [
      "The entry file does not export a component.",
      "Add `export default function App() { … }` to the entry file.",
    ];
  }
  if (m.includes("is not defined") || m.includes("is not a function")) {
    return [
      "A variable or function is used before it is defined or imported.",
      "Add the missing import/declaration, or run “Fix with AI”.",
    ];
  }
  if (m.includes("cannot read prop") || m.includes("undefined")) {
    return [
      "Something is reading a property of an undefined value.",
      "Add a default value or an optional-chain (`obj?.prop`) at the reported line.",
    ];
  }
  return [
    "Read the message above — it points at the failing file.",
    "Fix it in the Code tab, or press “Fix with AI” to let the model patch it.",
    "Press Reload if the sandbox looks stale.",
  ];
}

export function previewError(message: string): ApiError {
  return {
    code: "unknown",
    message,
    hint: "The live preview could not run this code.",
    steps: previewErrorSteps(message),
    source: "preview",
    status: 0,
  };
}
