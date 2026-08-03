/**
 * Brand marks for the AI engines shown on the marketing pages.
 *
 * These are hand-drawn, simplified SVG glyphs (no external requests) used only
 * as provider badges on the landing page — the product itself never exposes
 * which engine served a request.
 */
import type { ReactElement } from "react";

export type EngineId =
  | "openai"
  | "claude"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "nvidia"
  | "gemma"
  | "kat";

interface MarkProps {
  className?: string;
}

const OpenAIMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.5-2.9A6.06 6.06 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .75 7.09 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9 6.05 6.05 0 0 0 10.28-2.17 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.09Zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.79-2.76a.79.79 0 0 0 .39-.68v-6.75l2.02 1.17c.02.01.04.03.04.06v5.59a4.5 4.5 0 0 1-4.5 4.49ZM3.54 18.3a4.47 4.47 0 0 1-.54-3l.14.09 4.8 2.77a.78.78 0 0 0 .78 0l5.85-3.38v2.34a.08.08 0 0 1-.03.06L9.73 19.9a4.5 4.5 0 0 1-6.14-1.65Zm-1.26-10.4a4.48 4.48 0 0 1 2.34-1.97v5.69c0 .28.15.54.39.68l5.83 3.36-2.02 1.17a.08.08 0 0 1-.07 0L3.9 14.03a4.5 4.5 0 0 1-1.65-6.14Zm16.61 3.86-5.85-3.4L15.06 7.2a.07.07 0 0 1 .07 0l4.85 2.8a4.49 4.49 0 0 1-.68 8.1v-5.69a.79.79 0 0 0-.4-.68Zm2.01-3.03-.14-.09-4.79-2.79a.78.78 0 0 0-.79 0L9.34 9.24V6.9a.07.07 0 0 1 .03-.06l4.85-2.8a4.49 4.49 0 0 1 6.68 4.65ZM8.24 13.13 6.22 11.96a.08.08 0 0 1-.04-.06V6.31a4.49 4.49 0 0 1 7.37-3.45l-.14.08-4.79 2.76a.79.79 0 0 0-.39.68l-.01 6.75Zm1.1-2.36L11.94 9.27l2.61 1.5v3.01l-2.6 1.5-2.61-1.5v-3.01Z" />
  </svg>
);

const ClaudeMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M6.9 15.9 11.16 4.2h2.53l4.26 11.7h-2.4l-.9-2.6H10.2l-.9 2.6H6.9Zm3.98-4.6h3.03l-1.5-4.36-1.53 4.36Z" />
    <path d="M3.2 18.6h17.6v1.9H3.2z" opacity=".55" />
  </svg>
);

const GeminiMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 1.8c.5 4.4 3.8 7.9 8.2 8.6v3.2c-4.4.7-7.7 4.2-8.2 8.6-.5-4.4-3.8-7.9-8.2-8.6v-3.2c4.4-.7 7.7-4.2 8.2-8.6Z" />
  </svg>
);

const DeepSeekMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M20.6 5.6c-1.7 1-2.6 2.4-3.7 2.6-1 .2-2-.5-3.6-.5-3.7 0-6.7 2.9-6.7 6.4 0 .7.1 1.3.3 1.9-1.4-.2-2.7-.9-3.6-2 .1 1.9 1.2 3.6 2.8 4.6-.9.1-1.7 0-2.4-.3.7 2 2.6 3.4 4.8 3.4 4.9 0 8.9-3.9 8.9-8.7v-.5c1-.7 1.8-1.5 2.4-2.5-.8.3-1.6.5-2.4.6.8-.5 1.4-1.2 1.7-2.1-.6.3-1.2.5-1.9.7.2-1.2.3-2.5 3.4-3.6-1.3.4-.5-.2 0-.5Z" />
  </svg>
);

const QwenMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M8.4 3.6h7.2l3.6 6.3-3.6 6.3h1.9l-2.4 4.2-2.4-4.2h-4.3L4.8 9.9 8.4 3.6Zm1.2 2.1L7.2 9.9l2.4 4.2h4.8l2.4-4.2-2.4-4.2H9.6Z" />
  </svg>
);

const NvidiaMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M9.3 9.2V7.6c4.7-.3 7.9 3.9 7.9 3.9s-3.5 4.6-7.1 4.6c-.3 0-.6 0-.8-.1v-1.5c1.9.3 3.4-1.4 3.4-1.4s-1.5-1.2-3.4-.9v4.8c-3-.3-5.4-2.9-5.4-2.9s2-3.4 5.4-4.9Zm0-3.2v1.6C3.5 8.1 1 12.3 1 12.3s2.9 5.6 8.3 6v1.7C4 19.6 0 14.9 0 14.9S3.1 7.2 9.3 6Zm0 4.7v3.2c-1.4-.3-1.8-1.7-1.8-1.7s.7-.9 1.8-1.5Zm4.2-4.5C18.6 6.7 22 11 22 11s-3.9 5.5-8.7 5.5c-.5 0-1 0-1.5-.1v-1.3c.4.1.8.1 1.2.1 3.8 0 6.9-4.2 6.9-4.2s-2.5-3.3-6.2-3.3c-.4 0-.8 0-1.1.1V6.4c.3 0 .6-.1.9-.1Z" />
  </svg>
);

const GemmaMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 2.6 21.6 20H2.4L12 2.6Zm0 4.4L6.1 17.9h11.8L12 7Z" />
  </svg>
);

const KatMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M6 3.6h2.6v6.5l5.4-6.5h3.2l-5.6 6.7 5.9 9.7h-3.1l-4.4-7.4-1.4 1.7v5.7H6V3.6Z" />
  </svg>
);

const MARKS: Record<EngineId, (p: MarkProps) => ReactElement> = {
  openai: OpenAIMark,
  claude: ClaudeMark,
  gemini: GeminiMark,
  deepseek: DeepSeekMark,
  qwen: QwenMark,
  nvidia: NvidiaMark,
  gemma: GemmaMark,
  kat: KatMark,
};

export function EngineLogo({ id, className }: { id: EngineId; className?: string }) {
  const Mark = MARKS[id];
  return <Mark className={className} />;
}
