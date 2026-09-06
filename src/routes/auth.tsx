import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { sendWelcomeEmail } from "@/lib/email.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to PromptBeats — Share AI Music & Prompts" },
      {
        name: "description",
        content:
          "Create a PromptBeats account to upload AI-generated tracks, publish the prompts behind them, and build your library.",
      },
      { property: "og:title", content: "Sign in to PromptBeats" },
      {
        property: "og:description",
        content: "Join PromptBeats to upload AI tracks and share the prompts behind them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
        if (!alias.trim()) throw new Error("Please enter a display name.");
        if (!/^[a-z0-9]{3,30}$/.test(cleanHandle)) {
          throw new Error("Username must be 3-30 letters or numbers, with no spaces or symbols.");
        }
        const { data: taken } = await supabase
          .from("profiles")
          .select("handle")
          .eq("handle", cleanHandle)
          .maybeSingle();
        if (taken) throw new Error("That username is already taken. Try another one.");

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { handle: cleanHandle, display_name: alias.trim() },
          },
        });
        if (error) throw error;
        if (data.session) {
          try {
            await sendWelcomeEmail();
          } catch {
            /* email failure must not block signup */
          }
          navigate({ to: "/onboarding" });
        } else {
          setMessage("Check your inbox to confirm your email address.");
        }

      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setMessage(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setMessage("Google sign-in failed. Try again.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    try {
      await sendWelcomeEmail();
    } catch {
      /* ignore */
    }
    navigate({ to: "/" });
  };

  return (
    <div className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4 py-10">
      <div className="glass-strong w-full max-w-md rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-neon glow-neon">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">
              {mode === "signup" ? "Join PromptBeats" : "Welcome back"}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {mode === "signup" ? "Upload tracks and share your prompts" : "Sign in to your library"}
            </p>
          </div>
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Artist alias"
              aria-label="Artist alias"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
            />
          )}
          {mode === "signup" && (
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourhandle"
              aria-label="Handle"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            aria-label="Email"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {message && <p className="mt-4 text-center text-xs text-accent">{message}</p>}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="text-primary hover:underline"
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
        <p className="mt-3 text-center text-xs">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Back to the feed
          </Link>
        </p>
      </div>
    </div>
  );
}
