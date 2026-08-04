import nexuraLogo from "@/assets/nexura-mark.png";
import { cn } from "@/lib/utils";

type BrandSize = "sm" | "md" | "lg";

/**
 * Nexura AI logo mark. The "AI" chip is part of the official mark artwork,
 * so every surface (header, auth, sidebar, avatars, favicon) shows it.
 */
const MARK: Record<BrandSize, string> = {
  sm: "h-9 w-9 sm:h-10 sm:w-10",
  md: "h-10 w-10 sm:h-12 sm:w-12",
  lg: "h-16 w-16 sm:h-20 sm:w-20",
};

const PIXELS: Record<BrandSize, number> = { sm: 40, md: 48, lg: 80 };

export function BrandMark({
  size = "md",
  className,
}: {
  size?: BrandSize;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <img
        src={nexuraLogo}
        alt="Nexura AI logo"
        width={PIXELS[size]}
        height={PIXELS[size]}
        className={cn("object-contain", MARK[size])}
      />
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-tight text-ink-900", className)}>
      Nexura <span className="text-[color:var(--color-iris)]">AI</span>
    </span>
  );
}

/** Logo mark for avatars and tight spots — same official artwork with the AI chip. */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <img
      src={nexuraLogo}
      alt="Nexura AI"
      width={32}
      height={32}
      className={cn("h-full w-full object-contain", className)}
    />
  );
}
