import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const raw = search["redirect"];
    // Only same-origin app paths are accepted, never an absolute URL.
    return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
      ? { redirect: raw }
      : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Nexura AI" },
      {
        name: "description",
        content:
          "Sign in or create your Nexura AI account to build, preview and auto-fix projects with smart model routing.",
      },
      { property: "og:title", content: "Sign in to Nexura AI" },
      {
        property: "og:description",
        content: "Create your Nexura AI account and start building.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be under 72 characters"),
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    // One-shot guard: without it a token refresh (or a second auth event) fires
    // another navigate and bounces the user back out of the page they landed on.
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      void navigate({ href: redirectTo ?? "/dashboard", replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) go();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, redirectTo]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setConfirmSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main
      className="grid min-h-dvh place-items-center px-4 py-10 text-ink-800"
      style={{
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #FAFBFC 40%, #EEF3FA 72%, #FFFFFF 100%)",
      }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink-900">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Nexura AI — build, preview and auto-fix in one workspace.
          </p>
        </div>

        <div className="rounded-2xl border border-ink-200 bg-white/80 p-6 shadow-[0_30px_80px_-45px_rgba(37,74,140,0.4)] backdrop-blur">
          {confirmSent ? (
            <div className="text-center">
              <h2 className="font-display text-base font-semibold text-ink-900">
                Check your email
              </h2>
              <p className="mt-2 text-sm text-ink-500">
                We sent a confirmation link to <strong>{email}</strong>. Click it to
                activate your Nexura AI account.
              </p>
              <Button
                variant="ghost"
                className="mt-5 w-full"
                onClick={() => {
                  setConfirmSent(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={onGoogle}
              >
                <GoogleGlyph />
                Continue with Google
              </Button>

              <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ink-400">
                <span className="h-px flex-1 bg-ink-200" />
                or
                <span className="h-px flex-1 bg-ink-200" />
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500"
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={255}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500"
                  >
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    required
                    minLength={8}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : mode === "signin"
                      ? "Sign in"
                      : "Create account"}
                </Button>
              </form>

              <p className="mt-5 text-center text-[13px] text-ink-500">
                {mode === "signin" ? "New to Nexura AI?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="font-medium text-[color:var(--color-iris)] underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.29 9.14 4.75 12 4.75Z"
      />
    </svg>
  );
}
