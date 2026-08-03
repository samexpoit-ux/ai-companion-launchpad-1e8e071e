import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Braces,
  Check,
  Container,
  Database,
  Gauge,
  GitBranch,
  Globe2,
  Image as ImageIcon,
  Layers,
  Mic,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wand2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark, BrandWordmark } from "@/components/BrandMark";
import nexuraLogo from "@/assets/nexura-mark.png";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Nexura AI — All-in-One AI Website & App Builder" },
      {
        name: "description",
        content:
          "Nexura AI builds full-stack apps from a prompt: React, TypeScript, PHP, Laravel, Docker and databases, with live preview, smart multi-engine routing and reviewed auto-fix.",
      },
      { property: "og:title", content: "Nexura AI — All-in-One AI Website & App Builder" },
      {
        property: "og:description",
        content:
          "One prompt, one workspace: multi-stack code generation, live preview beside the build, smart engine routing and automatic error repair.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

/** Marketing-only engine badges — the product itself never exposes model picks. */
const ENGINES = [
  { name: "Claude", tag: "Anthropic", mono: "C", accent: "#D97757" },
  { name: "GPT", tag: "OpenAI", mono: "G", accent: "#10A37F" },
  { name: "Gemini", tag: "Google", mono: "◆", accent: "#4285F4" },
  { name: "DeepSeek", tag: "DeepSeek", mono: "D", accent: "#4D6BFE" },
  { name: "Qwen", tag: "Alibaba", mono: "Q", accent: "#7C3AED" },
  { name: "Nemotron", tag: "NVIDIA", mono: "N", accent: "#76B900" },
  { name: "Gemma", tag: "Google", mono: "▲", accent: "#1A73E8" },
  { name: "Kat Coder", tag: "Kwai", mono: "K", accent: "#F43F5E" },
] as const;

const STACKS = [
  { icon: Braces, label: "JavaScript & TypeScript" },
  { icon: Layers, label: "React · Next · Tailwind" },
  { icon: Terminal, label: "PHP & Laravel" },
  { icon: Database, label: "Supabase & SQL" },
  { icon: Container, label: "Docker & CI" },
  { icon: Globe2, label: "Static & landing sites" },
];

const FEATURES = [
  {
    icon: Wand2,
    title: "Smart engine routing",
    body: "No model picker to babysit. Every prompt is scored and routed to the strongest engine that can do the job at the lowest cost.",
    accent: "var(--color-iris)",
  },
  {
    icon: Boxes,
    title: "Multi-file, multi-stack builds",
    body: "Ask for an app and get the whole project — file tree, config, database schema and entry point — in any supported stack.",
    accent: "var(--color-orchid)",
  },
  {
    icon: Gauge,
    title: "Preview beside the build",
    body: "Your project compiles and runs in the browser while it is written, with hot reload, routing and a real console.",
    accent: "var(--color-mint)",
  },
  {
    icon: ShieldCheck,
    title: "Reviewed auto-fix",
    body: "Runtime errors trigger a background patch that you approve as a diff before it ever touches your files.",
    accent: "var(--color-sun)",
  },
  {
    icon: Paperclip,
    title: "Attachments & voice",
    body: "Drop screenshots, specs or code files into the composer, or dictate the prompt and edit the transcript before sending.",
    accent: "var(--color-iris-deep)",
  },
  {
    icon: GitBranch,
    title: "Ship anywhere",
    body: "Version history, one-click GitHub push, ZIP export and deploy — with credits and usage transparent the whole way.",
    accent: "var(--color-iris-cyan)",
  },
];

const PROOF = [
  { value: "8+", label: "AI engines in the router" },
  { value: "6", label: "Stacks buildable today" },
  { value: "<1s", label: "Preview hot reload" },
  { value: "100%", label: "Patches reviewed as diffs" },
];

function LandingPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  // Highlights one engine at a time in the hero rail, like a slider.
  useEffect(() => {
    const id = window.setInterval(() => setActive((i) => (i + 1) % ENGINES.length), 2200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="min-h-dvh overflow-x-hidden text-ink-800">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size="md" />
            <BrandWordmark className="text-[15px] sm:text-[17px]" />
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="#features"
              className="hidden rounded-xl px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 sm:block"
            >
              Features
            </a>
            <a
              href="#engines"
              className="hidden rounded-xl px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 sm:block"
            >
              Engines
            </a>
            <Button asChild size="sm">
              <Link to="/auth">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* -------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 aurora-canvas opacity-90" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 nx-beam"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 40%, color-mix(in oklab, var(--color-iris) 32%, transparent), transparent 70%)",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-24 lg:pt-20">
          <div className="nx-rise">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/80 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.18em] text-ink-500 backdrop-blur">
              <Sparkles className="h-3 w-3 text-[color:var(--color-iris)]" aria-hidden />
              All-in-one AI builder
            </span>

            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
              Describe it once.
              <br />
              <span className="nx-gradient-text">Nexura builds the whole thing.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-500">
              A complete AI engineering workspace: multi-file, multi-stack project generation, a live
              preview running beside the build, reviewed auto-fix patches, attachments, voice prompts
              and version history — powered by the world's best engines picked for you automatically.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Start building free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>

            <dl className="mt-9 grid max-w-lg grid-cols-2 gap-4 sm:grid-cols-4">
              {PROOF.map((p) => (
                <div key={p.label}>
                  <dt className="font-display text-2xl font-semibold tracking-tight text-ink-900">
                    {p.value}
                  </dt>
                  <dd className="mt-0.5 text-2xs leading-snug text-ink-500">{p.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* 3D brand stage */}
          <div className="relative mx-auto grid h-[300px] w-[300px] place-items-center sm:h-[360px] sm:w-[360px]">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full opacity-70 blur-2xl"
              style={{ background: "var(--iris-gradient-soft)" }}
            />
            <span
              aria-hidden
              className="nx-orbit absolute inset-4 rounded-full border border-dashed border-[color:var(--color-iris)]/35"
            />
            <span
              aria-hidden
              className="nx-orbit-reverse absolute inset-12 rounded-full border border-[color:var(--color-orchid)]/25"
            />

            {/* orbiting engine chips */}
            <span aria-hidden className="nx-orbit absolute inset-0">
              {ENGINES.slice(0, 6).map((engine, i) => {
                const angle = (i / 6) * Math.PI * 2;
                return (
                  <span
                    key={engine.name}
                    className="absolute grid h-8 w-8 place-items-center rounded-xl bg-white text-2xs font-bold shadow-ds-sm ring-1 ring-ink-200"
                    style={{
                      left: `calc(50% + ${Math.cos(angle) * 46}% - 1rem)`,
                      top: `calc(50% + ${Math.sin(angle) * 46}% - 1rem)`,
                      color: engine.accent,
                    }}
                  >
                    {engine.mono}
                  </span>
                );
              })}
            </span>

            <div className="nx-logo-3d relative grid place-items-center">
              <img
                src={nexuraLogo}
                alt="Nexura AI logo"
                width={168}
                height={168}
                className="h-32 w-32 object-contain sm:h-40 sm:w-40"
              />
            </div>

            <div className="absolute -bottom-2 rounded-2xl border border-ink-200 bg-white/90 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-600 shadow-ds-sm backdrop-blur">
              Smart routing · live
            </div>
          </div>
        </div>

        {/* engine marquee */}
        <div id="engines" className="relative border-y border-ink-200/70 bg-white/70 py-4 backdrop-blur">
          <div className="mx-auto mb-3 w-full max-w-6xl px-5">
            <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-500">
              One workspace · every leading engine
            </p>
          </div>
          <div className="relative overflow-hidden">
            <div className="nx-marquee flex w-max gap-3">
              {[...ENGINES, ...ENGINES].map((engine, i) => (
                <span
                  key={`${engine.name}-${i}`}
                  className={`flex shrink-0 items-center gap-2.5 rounded-2xl border bg-white px-4 py-2.5 shadow-ds-xs transition ${
                    i % ENGINES.length === active
                      ? "border-[color:var(--color-iris)]/60 shadow-ds-md"
                      : "border-ink-200"
                  }`}
                >
                  <span
                    className="grid h-8 w-8 place-items-center rounded-xl text-sm font-bold text-white"
                    style={{ background: engine.accent }}
                    aria-hidden
                  >
                    {engine.mono}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight text-ink-900">
                      {engine.name}
                    </span>
                    <span className="block text-2xs text-ink-500">{engine.tag}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- workspace */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            Chat, code and preview — side by side
          </h2>
          <p className="mt-2 text-base leading-relaxed text-ink-500">
            The build stream on the left, a real running app on the right. Errors get caught, patched
            and reviewed without ever leaving the screen.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-ds-lg">
          <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-100/70 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-flare)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-sun)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-mint)]/70" />
            <span className="ml-2 font-mono text-2xs text-ink-500">nexuraai.dev/workspace</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[color:var(--color-mint-soft)] px-2 py-0.5 text-2xs font-semibold text-[color:var(--color-mint)]">
              <Zap className="h-3 w-3" aria-hidden /> Preview live
            </span>
          </div>

          <div className="grid gap-0 lg:grid-cols-2">
            {/* build stream */}
            <div className="space-y-3 border-b border-ink-200 p-5 lg:border-b-0 lg:border-r">
              <div className="ml-auto max-w-[85%] rounded-2xl bg-[color:var(--color-iris)] px-3.5 py-2.5 text-sm text-[color:var(--color-iris-fg)]">
                Build me a SaaS dashboard with auth, Stripe billing and a Postgres schema.
              </div>
              <div className="space-y-2 text-sm text-ink-700">
                <p className="font-medium text-ink-900">Planning the build…</p>
                <ul className="space-y-1.5">
                  {[
                    "Routing to the best coding engine",
                    "Scaffolding 14 files across app, api and db",
                    "Writing SQL schema + row level security",
                    "Compiling preview · 0 errors",
                  ].map((step) => (
                    <li key={step} className="flex items-start gap-2 text-ink-600">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-mint)]"
                        aria-hidden
                      />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-ink-100/60 px-3 py-2.5 text-2xs text-ink-500">
                <Paperclip className="h-3.5 w-3.5" aria-hidden /> Attach
                <Mic className="ml-2 h-3.5 w-3.5" aria-hidden /> Voice
                <ImageIcon className="ml-2 h-3.5 w-3.5" aria-hidden /> Image
                <span className="ml-auto font-mono">0.35 credits</span>
              </div>
            </div>

            {/* preview */}
            <div className="p-5">
              <div className="rounded-2xl border border-ink-200 bg-ink-100/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold tracking-tight text-ink-900">
                    Revenue dashboard
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-2xs text-ink-500 ring-1 ring-ink-200">
                    Live
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["MRR", "Users", "Churn"].map((k) => (
                    <div key={k} className="rounded-xl bg-white p-2.5 shadow-ds-xs">
                      <p className="text-2xs uppercase tracking-wider text-ink-500">{k}</p>
                      <p className="mt-1 font-display text-base font-semibold text-ink-900">—</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex h-24 items-end gap-1.5 rounded-xl bg-white p-3 shadow-ds-xs">
                  {[35, 52, 44, 68, 59, 82, 74, 96].map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-t-md"
                      style={{ height: `${h}%`, background: "var(--iris-gradient)" }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {STACKS.slice(0, 4).map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-2xs text-ink-600"
                  >
                    <s.icon className="h-3 w-3 text-[color:var(--color-iris)]" aria-hidden />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-5 pb-16 lg:pb-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            Everything a real builder needs
          </h2>
          <p className="mt-2 text-base leading-relaxed text-ink-500">
            Not a snippet generator — a full delivery pipeline from prompt to production.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group relative overflow-hidden rounded-3xl border border-ink-200 bg-white p-5 shadow-ds-xs transition duration-200 hover:-translate-y-1 hover:shadow-ds-lg"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full opacity-[0.16] blur-2xl transition group-hover:opacity-30"
                style={{ background: feature.accent }}
              />
              <span
                className="grid h-10 w-10 place-items-center rounded-2xl text-[color:var(--color-iris-fg)] shadow-ds-xs"
                style={{
                  background: `linear-gradient(135deg, ${feature.accent}, var(--color-iris-deep))`,
                }}
              >
                <feature.icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <h3 className="mt-3.5 font-display text-base font-semibold tracking-tight text-ink-900">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ stacks */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-16 lg:pb-20">
        <div
          className="overflow-hidden rounded-3xl p-6 text-[color:var(--color-iris-fg)] shadow-ds-lg sm:p-8"
          style={{ background: "var(--admin-gradient)" }}
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Any stack. One prompt.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65">
            Nexura detects the right stack from your request and writes idiomatic code for it —
            frontend, backend, database and container config included.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STACKS.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/15"
              >
                <s.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="text-sm font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- cta */}
      <section className="mx-auto w-full max-w-3xl px-5 pb-20 text-center">
        <BrandMark size="lg" className="mx-auto nx-pop" />
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          Start with free credits today
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-base leading-relaxed text-ink-500">
          Free builds run on our open engine pool. Upgrade any time for premium routing, bigger
          projects and priority throughput.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              Create your workspace
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">I already have an account</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-ink-200 bg-white/70 px-5 py-7 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3">
          <BrandMark size="sm" />
          <BrandWordmark className="text-sm" />
          <p className="ml-auto text-2xs text-ink-400">
            Nexura AI · nexuraai.dev · Developed by{" "}
            <span className="font-medium text-ink-600">Sam</span>
          </p>
        </div>
      </footer>
    </main>
  );
}
