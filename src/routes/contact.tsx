import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eraser, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { sendContactForm } from "@/lib/contact.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact PromptBeats" },
      {
        name: "description",
        content: "Contact the PromptBeats team for support, questions, and general inquiries.",
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { language } = useI18n();
  const el = language === "el";
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const initializedEmail = useRef(false);
  const initializedAlias = useRef(false);

  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!initializedEmail.current && user?.email) {
      initializedEmail.current = true;
      setEmail((current) => current || user.email || "");
    }

    if (!initializedAlias.current) {
      const preferredAlias = profile?.handle
        ? "@" + profile.handle
        : profile?.artist_alias
          ? profile.artist_alias
          : profile?.display_name ?? "";

      if (preferredAlias) {
        initializedAlias.current = true;
        setAlias((current) => current || preferredAlias);
      }
    }
  }, [loading, user?.email, profile?.handle, profile?.artist_alias, profile?.display_name]);

  const clearForm = () => {
    setEmail("");
    setAlias("");
    setSubject("");
    setMessage("");
    setWebsite("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await sendContactForm({
        data: {
          email,
          alias,
          subject,
          message,
          website,
        },
      });
      toast.success(el ? "Το μήνυμά σας στάλθηκε στο PromptBeats." : "Your message was sent to PromptBeats.");
      setSubject("");
      setMessage("");
      setWebsite("");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const rateLimited = raw.toLowerCase().includes("too many");
      toast.error(
        rateLimited
          ? (el ? "Έχουν σταλεί πολλά αιτήματα. Δοκιμάστε ξανά αργότερα." : "Too many requests. Please try again later.")
          : (el ? "Δεν ήταν δυνατή η αποστολή. Δοκιμάστε ξανά." : "Could not send your message. Please try again."),
      );
    } finally {
      setSending(false);
    }
  };

  const header = (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.2em] text-primary">PromptBeats</p>
      <h1 className="mt-0.5 truncate font-display text-lg font-bold md:text-xl">
        {el ? "Επικοινωνία" : "Contact Us"}
      </h1>
    </div>
  );

  return (
    <AppShell header={header}>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 pb-32 md:px-8 md:py-10">
        <section className="glass-strong overflow-hidden rounded-3xl border border-white/10">
          <div className="border-b border-white/10 px-5 py-5 sm:px-7">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-bold">
                  {el ? "Επικοινωνήστε με την ομάδα του PromptBeats" : "Contact the PromptBeats team"}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {el
                    ? "Χρησιμοποιήστε τη φόρμα για ερωτήσεις, υποστήριξη ή γενική επικοινωνία. Το μήνυμα αποστέλλεται στο support@promptbeats.app."
                    : "Use this form for questions, support, or general inquiries. Your message is sent to support@promptbeats.app."}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-5 p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Email
                <input
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-foreground outline-none transition-shadow focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
                />
              </label>

              <label className="block text-xs font-medium text-muted-foreground">
                {el ? "Ψευδώνυμο" : "Alias"}
                <input
                  type="text"
                  required
                  maxLength={80}
                  autoComplete="nickname"
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  placeholder={el ? "@ψευδώνυμο" : "@alias"}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-foreground outline-none transition-shadow focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-muted-foreground">
              {el ? "Θέμα" : "Subject"}
              <input
                type="text"
                required
                minLength={2}
                maxLength={160}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-foreground outline-none transition-shadow focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
              />
            </label>

            <label className="block text-xs font-medium text-muted-foreground">
              {el ? "Κείμενο" : "Message"}
              <textarea
                required
                minLength={5}
                maxLength={5000}
                rows={9}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="mt-1.5 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-relaxed text-foreground outline-none transition-shadow focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
              />
              <span className="mt-1 block text-right text-[10px] text-muted-foreground">{message.length}/5000</span>
            </label>

            <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={clearForm}
                className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
              >
                <Eraser className="h-4 w-4" />
                {el ? "Εκκαθάριση φόρμας" : "Clear form"}
              </button>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void navigate({ to: "/" })}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
                >
                  {el ? "Ακύρωση" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-neon disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {el ? "Αποστολή" : "Send"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
