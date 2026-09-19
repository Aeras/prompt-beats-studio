import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  getAdminDonationGlobalSetting,
  getAdminUserDonationAccess,
  setAdminDonationGlobalSetting,
  setAdminUserDonationAccess,
  type DonationAccessOverride,
} from "@/lib/donation.functions";
import { useI18n } from "@/i18n";

export function DonationGlobalAdminControl() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-donation-global"],
    queryFn: () => getAdminDonationGlobalSetting(),
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) => setAdminDonationGlobalSetting({ data: { enabled } }),
    onSuccess: () => {
      toast.success(t("management.donationsGlobalSaved"));
      void qc.invalidateQueries({ queryKey: ["admin-donation-global"] });
      void qc.invalidateQueries({ queryKey: ["admin-user-donation"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("management.donationsSaveError")),
  });

  if (isLoading) return <div className="glass rounded-2xl p-4 text-sm text-muted-foreground">{t("management.donationsLoading")}</div>;
  if (error || !data) return <div className="glass rounded-2xl p-4 text-sm text-red-300">{t("management.donationsLoadError")}</div>;

  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 font-display text-sm font-semibold"><Heart className="h-4 w-4 text-primary" />{t("management.creatorDonations")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("management.donationsGlobalHint")}</p>
      </div>
      <button
        disabled={update.isPending}
        onClick={() => update.mutate(!data.enabled)}
        className={data.enabled ? "rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 disabled:opacity-50" : "rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground disabled:opacity-50"}
      >
        {update.isPending ? t("management.updating") : data.enabled ? t("management.enabled") : t("management.disabled")}
      </button>
    </div>
  );
}

export function DonationUserAdminControl({ userId }: { userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-donation", userId],
    queryFn: () => getAdminUserDonationAccess({ data: { userId } }),
  });
  const [draft, setDraft] = useState<DonationAccessOverride>("inherit");

  useEffect(() => {
    if (data) setDraft(data.adminOverride);
  }, [data]);

  const update = useMutation({
    mutationFn: () => setAdminUserDonationAccess({ data: { userId, override: draft } }),
    onSuccess: () => {
      toast.success(t("management.donationsAccessSaved"));
      void qc.invalidateQueries({ queryKey: ["admin-user-donation", userId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("management.donationsSaveError")),
  });

  if (isLoading) return <section className="mt-6 border-t border-white/10 pt-5 text-sm text-muted-foreground">{t("management.donationsLoading")}</section>;
  if (error || !data) return <section className="mt-6 border-t border-white/10 pt-5 text-sm text-red-300">{t("management.donationsLoadError")}</section>;

  return (
    <section className="mt-6 border-t border-white/10 pt-5">
      <h3 className="font-display text-sm font-semibold">{t("management.creatorDonations")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("management.donationsEffective", {
          global: data.globalEnabled ? t("management.enabled") : t("management.disabled"),
          effective: data.effectiveAccess ? t("management.enabled") : t("management.disabled"),
        })}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={draft} onChange={(event) => setDraft(event.target.value as DonationAccessOverride)} className="rounded-lg border border-white/10 bg-[#17131f] px-3 py-2 text-sm">
          <option value="inherit">{t("management.donationsInherit")}</option>
          <option value="enabled">{t("management.enabled")}</option>
          <option value="disabled">{t("management.disabled")}</option>
        </select>
        <button disabled={update.isPending || draft === data.adminOverride} onClick={() => update.mutate()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {update.isPending ? t("management.updating") : t("management.saveAccess")}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("management.donationsUserOptIn", { state: data.userEnabled ? t("management.enabled") : t("management.disabled") })}</p>
    </section>
  );
}
