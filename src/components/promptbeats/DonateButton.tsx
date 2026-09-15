import { Heart } from "lucide-react";
import { getSafeExternalUrl } from "@/lib/safe-external-url";
import { useI18n } from "@/i18n";

function PayPalLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="currentColor">
      <path d="M7.1 21.3H3.9c-.3 0-.5-.3-.4-.6L6.3 3.3c.1-.4.4-.6.8-.6h6.2c3.4 0 5.6 1.7 5.1 5-.5 3.5-3.1 5.3-6.6 5.3H9.5c-.4 0-.7.3-.8.7l-.8 6.9c-.1.4-.4.7-.8.7Zm3.3-11.1h1.5c1.6 0 2.8-.7 3-2.3.2-1.3-.6-2-2-2h-1.5c-.3 0-.5.2-.6.5l-.5 3.3c0 .3.1.5.4.5h-.3Z" />
      <path d="M19.9 8.6c.4 2.9-1.6 5.9-5.6 5.9h-1.7c-.4 0-.7.3-.8.7l-.9 6.1c0 .3.2.6.5.6h2.6c.4 0 .7-.3.8-.6l.6-3.9c.1-.4.4-.6.8-.6h.9c3 0 5.2-1.5 5.6-4.5.3-1.9-.4-3.1-1.8-3.7Z" opacity=".55" />
    </svg>
  );
}

function RevolutLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="currentColor">
      <path d="M4 2h7.1c3.4 0 6 2.4 6 5.6 0 2.7-1.8 4.9-4.4 5.5l4.9 8.9h-4.4l-4.7-8.7H8V22H4V2Zm4 3.4v4.6h3.1c1.5 0 2.5-.9 2.5-2.3s-1-2.3-2.5-2.3H8Z" />
    </svg>
  );
}

export function DonateButton({ provider, url, customName }: { provider: string | null; url: string | null; customName: string | null }) {
  const { t } = useI18n();
  if (!provider || !url) return null;
  const safeUrl = getSafeExternalUrl(url);
  const isLink = Boolean(safeUrl);

  if (provider === "custom") {
    return (
      <div className="glass flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm">
        <Heart className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-semibold">{customName || t("donate.support")}</span>
        {isLink ? <a href={safeUrl!} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">{url}</a> : <span className="break-all text-muted-foreground">{url}</span>}
      </div>
    );
  }

  const label = provider === "paypal" ? t("donate.paypal") : t("donate.revolut");
  return isLink ? (
    <a href={safeUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.02] active:scale-95">
      {provider === "paypal" ? <PayPalLogo /> : <RevolutLogo />}
      {label}
    </a>
  ) : (
    <div className="glass inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
      {provider === "paypal" ? <PayPalLogo /> : <RevolutLogo />}
      <span className="break-all text-muted-foreground">{url}</span>
    </div>
  );
}
