import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { sendWelcomeEmail } from "@/lib/email.functions";
import { checkSignupAvailability, checkSignupRegistration } from "@/lib/profile.functions";
import { useI18n } from "@/i18n";

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
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [handleTaken, setHandleTaken] = useState(false);
  const [aliasTaken, setAliasTaken] = useState(false);
  const [checking, setChecking] = useState(false);

  const blockedRegistrationMessage = t("auth.registrationBlocked");
  const cleanHandleValue = handle.replace(/^@/, "").trim().toLowerCase();
  const handleFormatError =
    cleanHandleValue.length > 0 && !/^[a-z0-9]{3,30}$/.test(cleanHandleValue)
      ? t("auth.usernameFormat")
      : null;

  useEffect(() => {
    if (mode !== "signup") return;
    if (!cleanHandleValue && !alias.trim()) {
      setHandleTaken(false);
      setAliasTaken(false);
      return;
    }
    let active = true;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await checkSignupAvailability({
          data: { handle: cleanHandleValue, displayName: alias.trim() },
        });
        if (!active) return;
        setHandleTaken(res.handleTaken);
        setAliasTaken(res.displayNameTaken);
      } catch {
        /* availability check is best-effort */
      } finally {
        if (active) setChecking(false);
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
      setChecking(false);
    };
  }, [mode, cleanHandleValue, alias]);

  const signupBlocked =
    mode === "signup" &&
    (handleTaken || aliasTaken || checking || Boolean(handleFormatError) || !alias.trim() || !cleanHandleValue);

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
        const registration = await checkSignupRegistration({ data: { email } });
        if (registration.blocked) throw new Error(blockedRegistrationMessage);
        if (!alias.trim()) throw new Error(t("auth.displayRequired"));
        if (!/^[a-z0-9]{3,30}$/.test(cleanHandle)) throw new Error(t("auth.usernameFormat"));
        const { data: taken } = await supabase
          .from("profiles")
          .select("handle")
          .eq("handle", cleanHandle)
          .maybeSingle();
        if (taken) throw new Error(t("auth.usernameAlreadyTaken"));
        if (aliasTaken) throw new Error(t("auth.displayAlreadyTaken"));

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
          setSignupSuccess(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const normalizedMessage = error.message.toLowerCase();
          if (error.status === 400 || normalizedMessage.includes("invalid login credentials")) {
            throw new Error(t("auth.invalidCredentials"));
          }
          throw new Error(t("auth.signinUnavailable"));
        }
        navigate({ to: "/" });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("auth.somethingWrong"));
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
      setMessage(t("auth.googleFailed"));
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

  if (signupSuccess) {
    return (
      <div className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4 py-10">
        <div className="glass-strong w-full max-w-md rounded-3xl p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-neon glow-neon">
            <MailCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">{t("auth.registrationComplete")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("auth.verifyEmail")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("auth.sentLink", { email })}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => {
                setSignupSuccess(false);
                setMode("signin");
                setMessage(null);
              }}
              className="w-full rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95"
            >
              {t("auth.backSignIn")}
            </button>
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              {t("auth.backFeed")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4 py-10">
      <div className="glass-strong w-full max-w-md rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <img
            src={logoAsset.url}
            alt="PromptBeats logo"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-xl glow-neon"
          />
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">
              {mode === "signup" ? t("auth.join") : t("auth.welcomeBack")}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {mode === "signup" ? t("auth.signupSubtitle") : t("auth.signinSubtitle")}
            </p>
          </div>
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
        >
          {t("auth.continueGoogle")}
        </button>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-white/10" /> {t("auth.or")} <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={alias}
              required
              maxLength={60}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t("auth.displayName")}
              aria-label={t("auth.displayName")}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
            />
          )}
          {mode === "signup" && aliasTaken && (
            <p className="px-1 text-[11px] text-destructive">{t("auth.displayTaken")}</p>
          )}
          {mode === "signup" && (
            <>
              <input
                value={handle}
                required
                maxLength={31}
                onChange={(e) => setHandle(e.target.value.replace(/\s/g, "").toLowerCase())}
                placeholder="@username"
                aria-label={t("auth.username")}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
              />
              {handleFormatError && <p className="px-1 text-[11px] text-destructive">{handleFormatError}</p>}
              {handleTaken && !handleFormatError && (
                <p className="px-1 text-[11px] text-destructive">{t("auth.usernameTaken")}</p>
              )}
              <p className="px-1 text-[11px] text-muted-foreground">
                {t("auth.usernameHelp", { username: handle.replace(/^@/, "") || "username" })}
              </p>
            </>
          )}

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            aria-label={t("auth.email")}
            className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            aria-label={t("auth.password")}
            className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
          />
          <button
            type="submit"
            disabled={busy || signupBlocked}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signup" ? t("auth.createAccount") : t("auth.signIn")}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-center text-xs text-accent">
            {message === blockedRegistrationMessage ? (
              <>
                {blockedRegistrationMessage.replace("support@promptbeats.app.", "")}
                <a href="mailto:support@promptbeats.app" className="text-primary hover:underline">support@promptbeats.app</a>.
              </>
            ) : message}
          </p>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {mode === "signup" ? t("auth.alreadyAccount") : t("auth.newHere")}{" "}
          <button
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="text-primary hover:underline"
          >
            {mode === "signup" ? t("auth.signIn") : t("auth.createOne")}
          </button>
        </p>
        <p className="mt-3 text-center text-xs">
          <Link to="/" className="text-muted-foreground hover:text-foreground">{t("auth.backFeed")}</Link>
        </p>
      </div>
    </div>
  );
}
