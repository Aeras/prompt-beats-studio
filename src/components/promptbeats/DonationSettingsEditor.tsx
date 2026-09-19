import { useEffect, useState } from "react";
import { AlertTriangle, Heart, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  DONATION_PROVIDERS,
  getMyDonationSettings,
  saveMyDonationSettings,
  type DonationMethod,
  type DonationProvider,
} from "@/lib/donation.functions";
import { useI18n } from "@/i18n";

type DraftMethod = Omit<DonationMethod, "id"> & { id?: string };

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60";

const providerLabel = (provider: DonationProvider) => {
  if (provider === "buy_me_a_coffee") return "Buy Me a Coffee";
  if (provider === "ko_fi") return "Ko-fi";
  if (provider === "wise") return "Wise";
  if (provider === "revolut") return "Revolut";
  if (provider === "paypal") return "PayPal";
  return "Custom";
};

export function DonationSettingsEditor({ showSectionHeader = false }: { showSectionHeader?: boolean }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [effectiveAccess, setEffectiveAccess] = useState(false);
  const [userEnabled, setUserEnabled] = useState(false);
  const [methods, setMethods] = useState<DraftMethod[]>([]);

  useEffect(() => {
    let active = true;
    void getMyDonationSettings()
      .then((result) => {
        if (!active) return;
        setEffectiveAccess(result.effectiveAccess);
        setUserEnabled(result.userEnabled);
        setMethods(result.methods);
      })
      .catch(() => {
        if (active) setEffectiveAccess(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="rounded-2xl border border-white/10 p-4 text-xs text-muted-foreground">{t("donations.loading")}</div>;
  }

  if (!effectiveAccess) return null;

  const patchMethod = (index: number, patch: Partial<DraftMethod>) => {
    setMethods((current) => current.map((method, i) => i === index ? { ...method, ...patch } : method));
  };

  const addMethod = () => {
    if (methods.length >= 3) return;
    setMethods((current) => [
      ...current,
      {
        provider: "paypal",
        customLabel: null,
        value: "",
        isEnabled: true,
        sortOrder: current.length,
        privacyAcknowledged: false,
      },
    ]);
  };

  const removeMethod = (index: number) => {
    setMethods((current) =>
      current
        .filter((_, i) => i !== index)
        .map((method, i) => ({ ...method, sortOrder: i })),
    );
  };

  const save = async () => {
    setBusy(true);
    try {
      const normalized = methods.map((method, index) => ({
        ...(method.id ? { id: method.id } : {}),
        provider: method.provider,
        customLabel: method.provider === "custom" ? method.customLabel?.trim() || null : null,
        value: method.value.trim(),
        isEnabled: method.isEnabled,
        sortOrder: index,
        privacyAcknowledged: method.provider === "custom" ? method.privacyAcknowledged : false,
      }));
      const result = await saveMyDonationSettings({ data: { userEnabled, methods: normalized } });
      setUserEnabled(result.userEnabled);
      setMethods(result.methods);
      toast.success(t("donations.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("donations.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {showSectionHeader && (
        <div className="px-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("editProfile.supportSection")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("editProfile.supportSectionHint")}</p>
        </div>
      )}
      <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
            <Heart className="h-3.5 w-3.5" /> {t("donations.title")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("donations.accessHint")}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs">
          <input type="checkbox" checked={userEnabled} onChange={(event) => setUserEnabled(event.target.checked)} />
          {t("donations.publicEnabled")}
        </label>
      </div>

      <div className="space-y-3">
        {methods.map((method, index) => (
          <div key={method.id ?? index} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <select
                value={method.provider}
                onChange={(event) => {
                  const provider = event.target.value as DonationProvider;
                  patchMethod(index, {
                    provider,
                    customLabel: provider === "custom" ? method.customLabel : null,
                    privacyAcknowledged: false,
                  });
                }}
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#17131f] px-3 text-sm"
              >
                {DONATION_PROVIDERS.map((provider) => <option key={provider} value={provider}>{providerLabel(provider)}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={method.isEnabled} onChange={(event) => patchMethod(index, { isEnabled: event.target.checked })} />
                {t("donations.methodEnabled")}
              </label>
              <button type="button" onClick={() => removeMethod(index)} aria-label={t("donations.removeMethod")} className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/20 text-red-300 hover:bg-red-400/10">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {method.provider === "custom" && (
              <>
                <input
                  value={method.customLabel ?? ""}
                  onChange={(event) => patchMethod(index, { customLabel: event.target.value.slice(0, 60) })}
                  placeholder={t("donations.customProvider")}
                  className={inputClass}
                />
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-relaxed text-amber-100">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{t("donations.customWarning")}</span>
                  </div>
                </div>
              </>
            )}

            <input
              value={method.value}
              onChange={(event) => patchMethod(index, { value: event.target.value.slice(0, 500), privacyAcknowledged: false })}
              placeholder={method.provider === "custom" ? t("donations.customValue") : t("donations.providerUrl")}
              className={inputClass}
            />

            {method.provider === "custom" && (
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <input
                  type="checkbox"
                  checked={method.privacyAcknowledged}
                  onChange={(event) => patchMethod(index, { privacyAcknowledged: event.target.checked })}
                  className="mt-0.5"
                />
                {t("donations.customAcknowledge")}
              </label>
            )}
          </div>
        ))}
      </div>

      {methods.length < 3 && (
        <button type="button" onClick={addMethod} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-accent hover:border-accent/40">
          <Plus className="h-3.5 w-3.5" /> {t("donations.addMethod")}
        </button>
      )}

      <div className="flex justify-end">
        <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? t("profile.saving") : t("donations.save")}
        </button>
      </div>
      </section>
    </div>
  );
}
