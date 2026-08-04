/**
 * Shared premium building blocks for the admin console.
 *
 * Every admin tab used to hand-roll `rounded-2xl border bg-white/80` boxes,
 * which read as flat white forms rather than a dashboard. These primitives give
 * one elevated surface language: gradient icon tiles, tinted metric cards,
 * section headers and consistent empty/loading states.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ surface */

export function Panel({
  title,
  description,
  icon: Icon,
  accent = "var(--color-iris)",
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  accent?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border border-ink-200/80 bg-white/85 shadow-ds-sm backdrop-blur",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-3 border-b border-ink-200/70 bg-ink-100/60 px-4 py-3">
          {Icon && (
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[color:var(--color-iris-fg)]"
              style={{ background: `linear-gradient(135deg, ${accent}, var(--color-iris-deep))` }}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            {title && (
              <h3 className="truncate font-display text-sm font-semibold tracking-tight text-ink-900">
                {title}
              </h3>
            )}
            {description && <p className="truncate text-xs text-ink-500">{description}</p>}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------- stats */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "var(--color-iris)",
  delta,
  progress,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  accent?: string;
  /** Signed change, e.g. "+12%" — coloured green/red automatically. */
  delta?: string;
  /** 0–1 share, rendered as a subtle meter under the value. */
  progress?: number;
  className?: string;
}) {
  const positive = delta ? !delta.trim().startsWith("-") : true;
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-ink-200/80 bg-white p-4 shadow-ds-xs transition duration-200 hover:-translate-y-0.5 hover:shadow-ds-md",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full opacity-[0.18] blur-2xl transition group-hover:opacity-30"
        style={{ background: accent }}
      />
      <div className="flex items-start gap-3">
        {Icon && (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-[color:var(--color-iris-fg)] shadow-ds-xs"
            style={{ background: `linear-gradient(135deg, ${accent}, var(--color-iris-deep))` }}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
          <p className="mt-1 font-display text-2xl font-semibold leading-none tracking-tight text-ink-900">
            {value}
          </p>
        </div>
        {delta && (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold",
              positive
                ? "bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]"
                : "bg-[color:var(--color-flare-soft)] text-[color:var(--color-flare)]",
            )}
          >
            {delta}
          </span>
        )}
      </div>

      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200/80">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.min(100, progress * 100))}%`,
              background: `linear-gradient(90deg, ${accent}, var(--color-iris-cyan))`,
            }}
          />
        </div>
      )}

      {hint && <p className="mt-2 text-xs leading-relaxed text-ink-500">{hint}</p>}
    </div>
  );
}

export function SectionHeading({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-sm font-semibold tracking-tight text-ink-900">{title}</h2>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------- states & chrome */

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[104px] animate-pulse rounded-3xl border border-ink-200/70 bg-ink-100/70"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-ink-300/80 bg-ink-100/50 px-6 py-10 text-center">
      {Icon && (
        <span
          className="grid h-11 w-11 place-items-center rounded-2xl text-[color:var(--color-iris-fg)]"
          style={{ background: "var(--premium-gradient)" }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <p className="mt-3 font-display text-sm font-semibold tracking-tight text-ink-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-ink-200/70 text-ink-700",
    good: "bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]",
    warn: "bg-[color:var(--color-sun-soft)] text-[color:var(--color-sun)]",
    bad: "bg-[color:var(--color-flare-soft)] text-[color:var(--color-flare)]",
    accent: "bg-[color:var(--color-iris-soft)] text-[color:var(--color-iris-ink)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- hero strip */

/**
 * Gradient headline strip.
 *
 * The Profit & margin tab's colour language (deep iris gradient, soft orchid
 * glow, white-on-gradient numbers) is the house style for the console, so every
 * tab opens with this same strip instead of a flat white box.
 */
export function HeroStrip({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  stats,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Small figures rendered on the right of the strip. */
  stats?: { label: string; value: string }[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl p-5 text-[color:var(--color-iris-fg)] shadow-ds-lg sm:p-6",
        className,
      )}
      style={{ background: "var(--admin-gradient)" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--premium-gradient)" }}
      />
      <div className="relative flex flex-wrap items-center gap-4">
        {Icon && (
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ring-white/20"
            style={{ background: "var(--premium-gradient)" }}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-2xs font-semibold uppercase tracking-wider text-white/55">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-0.5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          {subtitle && <p className="mt-1 max-w-xl text-xs text-white/65">{subtitle}</p>}
        </div>
        {stats && stats.length > 0 && (
          <dl className="ml-auto flex flex-wrap gap-2">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-inset ring-white/15"
              >
                <dt className="text-2xs uppercase tracking-wider text-white/55">{stat.label}</dt>
                <dd className="font-display text-base font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
