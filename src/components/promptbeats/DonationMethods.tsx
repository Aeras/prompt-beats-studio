import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";

import { getPublicDonationMethods, type DonationProvider } from "@/lib/donation.functions";
import { getSafeExternalUrl } from "@/lib/safe-external-url";
import { useI18n } from "@/i18n";

const providerLabel = (provider: DonationProvider) => {
  if (provider === "buy_me_a_coffee") return "Buy Me a Coffee";
  if (provider === "ko_fi") return "Ko-fi";
  if (provider === "wise") return "Wise";
  if (provider === "revolut") return "Revolut";
  if (provider === "paypal") return "PayPal";
  return "Custom";
};

export function DonationMethods({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-donation-methods", userId],
    queryFn: () => getPublicDonationMethods({ data: { userId } }),
    staleTime: 30_000,
  });

  if (isLoading || error || !data || data.methods.length === 0) return null;

  return (
    <section className="glass space-y-3 rounded-2xl p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
        <Heart className="h-3.5 w-3.5" /> {t("donations.supportCreator")}
      </p>
      <div className="flex flex-wrap gap-2">
        {data.methods.map((method) => {
          const label = method.provider === "custom"
            ? (method.customLabel || t("donate.support"))
            : providerLabel(method.provider);
          const safeUrl = getSafeExternalUrl(method.value);

          if (safeUrl) {
            return (
              <a
                key={method.id}
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <Heart className="h-4 w-4" />
                {label}
              </a>
            );
          }

          return (
            <div key={method.id} className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
              <p className="font-semibold">{label}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{method.value}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
