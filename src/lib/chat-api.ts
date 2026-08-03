import { readApiError, type ApiError } from "./api-error";
import { apiFetch } from "./api-fetch";
import type { ChatAttachment } from "./chat-attachments";
// Real AI backend. Server route: /api/chat keeps provider calls server-side.

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  model?: string;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  /** Credits charged for the prompt that produced this reply. */
  credits?: number;
  traceId?: string;
  task?: string;
  upstream?: string;
  attempts?: Array<{ model: string; ok: boolean; ms: number; error?: string }>;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  model?: string;
}

export interface AIModel {
  id: string;
  name: string;
  tier: "Signature" | "Reserve" | "Atelier";
  tagline: string;
  context: string;
  price: string;
  badge?: string;
}

export const AI_MODELS: AIModel[] = [
  {
    id: "nx-auto",
    name: "Nexura Auto",
    tier: "Signature",
    tagline: "Smart routing · cheapest capable model per task",
    context: "Adaptive",
    price: "Auto",
    badge: "Default",
  },
  {
    id: "nx-builder",
    name: "Nexura Builder",
    tier: "Signature",
    tagline: "Claude 3.7 Sonnet · app building, refactors & bug fixes",
    context: "200K tokens",
    price: "Premium",
    badge: "Code",
  },
  {
    id: "nx-reasoner",
    name: "Nexura Reasoner",
    tier: "Signature",
    tagline: "DeepSeek / Gemini Flash · focused low-cost planning",
    context: "Adaptive",
    price: "Low cost",
    badge: "Thinks",
  },
  {
    id: "nx-flash",
    name: "Nexura Flash",
    tier: "Reserve",
    tagline: "DeepSeek / Gemini Flash · fast everyday chat",
    context: "Adaptive",
    price: "Low cost",
  },
  {
    id: "nx-vision",
    name: "Nexura Vision",
    tier: "Reserve",
    tagline: "Claude 3.5 Sonnet · balanced quality fallback",
    context: "200K tokens",
    price: "Balanced",
  },
];

export async function sendChatMessage(
  messages: ChatMessage[],
  modelId?: string,
  options?: { plan?: string; mode?: string; threadId?: string; attachments?: ChatAttachment[]; signal?: AbortSignal },
): Promise<{
  content: string;
  model: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  credits?: {
    charged: number;
    remaining: number;
    total: number;
    used: number;
    plan: string;
    unlimited?: boolean;
  };
  traceId?: string;
  task?: string;
  upstream?: string;
  attempts?: Array<{ model: string; ok: boolean; ms: number; error?: string }>;
}> {
  const payload = {
    modelId,
    plan: options?.plan,
    mode: options?.mode,
    threadId: options?.threadId,
    attachments: options?.attachments,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const res = await apiFetch("/api/chat", payload, options?.signal);

  if (!res.ok) {
    const apiErr = await readApiError(res, "chat");
    const error = new Error(apiErr.message) as Error & { apiError?: ApiError };
    error.apiError = apiErr;
    throw error;
  }

  const data = (await res.json()) as {
    content: string;
    model: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    credits?: {
      charged: number;
      remaining: number;
      total: number;
      used: number;
      plan: string;
      unlimited?: boolean;
    };
    traceId?: string;
    task?: string;
    upstream?: string;
    attempts?: Array<{ model: string; ok: boolean; ms: number; error?: string }>;
  };
  return data;
}
