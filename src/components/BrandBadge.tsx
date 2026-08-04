import { cn } from "@/lib/utils";
import { BrandMark, BrandWordmark } from "@/components/BrandMark";

type BadgeSize = "sm" | "md" | "lg";

const WORDMARK: Record<BadgeSize, string> = {
  sm: "text-sm",
  md: "text-[15px] sm:text-[17px]",
  lg: "text-xl sm:text-2xl",
};

const GAP: Record<BadgeSize, string> = {
  sm: "gap-2",
  md: "gap-2.5",
  lg: "gap-3",
};

/**
 * The single, reusable Nexura AI lockup.
 *
 * Renders the official mark (which carries the "AI" chip) next to the wordmark
 * so every surface — header, sidebar, auth, footer, workspace — shows the logo
 * and the AI icon together. Use this instead of composing BrandMark manually.
 */
export function BrandBadge({
  size = "md",
  withWordmark = true,
  className,
  markClassName,
  wordmarkClassName,
}: {
  size?: BadgeSize;
  withWordmark?: boolean;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center", GAP[size], className)}>
      <BrandMark size={size} className={markClassName} />
      {withWordmark && (
        <BrandWordmark className={cn(WORDMARK[size], "leading-tight", wordmarkClassName)} />
      )}
    </span>
  );
}

export default BrandBadge;
