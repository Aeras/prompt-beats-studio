import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import {
  createSubscriptionManualGrant,
  getSubscriptionEntitlementDetail,
  revokeSubscriptionManualGrant,
} from "@/lib/subscription-entitlements.functions";
import {
  MANUAL_GRANT_DURATION_PRESETS,
  localDateTimeInTimeZoneToDate,
  manualGrantExpiryFromPreset,
  type ManualGrantDurationPreset,
  type ManualSubscriptionPlan,
} from "@/lib/subscription-entitlements.shared";

export function SubscriptionEntitlementsPanel({ userId }: { userId: string }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const locale = language === "el" ? "el-GR" : "en-US";
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [plan, setPlan] = useState<ManualSubscriptionPlan>("plus");
  const [duration, setDuration] = useState<ManualGrantDurationPreset>("7_days");
  const [customLocal, setCustomLocal] = useState("");
  const [reason, setReason] = useState("");
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({});

  const detail = useQuery({
    queryKey: ["subscription-entitlement-detail", userId],
    queryFn: () => getSubscriptionEntitlementDetail({ data: { userId } }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscription-entitlement-detail", userId] });
    await queryClient.invalidateQueries({ queryKey: ["my-entitlement-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["feature-access"] });
  };

  const grant = useMutation({
    mutationFn: async () => {
      const trimmed = reason.trim();
      if (trimmed.length < 3) throw new Error(t("management.entitlementReasonRequired"));
      const now = new Date();
      let expiresAt: string | null;
      if (duration === "custom") {
        if (!customLocal) throw new Error(t("management.entitlementCustomRequired"));
        expiresAt = localDateTimeInTimeZoneToDate(customLocal, timeZone).toISOString();
      } else {
        expiresAt = manualGrantExpiryFromPreset(now, duration, timeZone)?.toISOString() ?? null;
      }
      if (duration === "never") {
        const confirmed = window.confirm(t("management.entitlementNeverConfirm"));
        if (!confirmed) throw new Error(t("management.entitlementCancelled"));
      }
      return createSubscriptionManualGrant({
        data: { userId, plan, expiresAt, reason: trimmed },
      });
    },
    onSuccess: async () => {
      setReason("");
      setCustomLocal("");
      await refresh();
      toast.success(t("management.entitlementGrantSaved"));
    },
    onError: (error) => {
      if (error instanceof Error && error.message === t("management.entitlementCancelled")) return;
      toast.error(error instanceof Error ? error.message : t("management.entitlementGrantError"));
    },
  });

  const revoke = useMutation({
    mutationFn: async ({ grantId, revokeReason }: { grantId: string; revokeReason: string }) => {
      const trimmed = revokeReason.trim();
      if (trimmed.length < 3) throw new Error(t("management.entitlementRevokeReasonRequired"));
      if (!window.confirm(t("management.entitlementRevokeConfirm"))) {
        throw new Error(t("management.entitlementCancelled"));
      }
      return revokeSubscriptionManualGrant({ data: { grantId, reason: trimmed } });
    },
    onSuccess: async (_, input) => {
      setRevokeReasons((current) => ({ ...current, [input.grantId]: "" }));
      await refresh();
      toast.success(t("management.entitlementRevoked"));
    },
    onError: (error) => {
      if (error instanceof Error && error.message === t("management.entitlementCancelled")) return;
      toast.error(error instanceof Error ? error.message : t("management.entitlementRevokeError"));
    },
  });

  if (detail.isLoading) {
    return (
      <section className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
        <p className="text-sm text-muted-foreground">{t("management.entitlementLoading")}</p>
      </section>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <section className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/5 p-4">
        <p className="text-sm text-red-300">{t("management.entitlementLoadError")}</p>
      </section>
    );
  }

  const data = detail.data;
  const isSelf = user?.id === userId;
  const durationLabel = (preset: ManualGrantDurationPreset) =>
    ({
      "7_days": t("management.entitlementDuration7Days"),
      "1_month": t("management.entitlementDuration1Month"),
      "2_months": t("management.entitlementDuration2Months"),
      "3_months": t("management.entitlementDuration3Months"),
      "6_months": t("management.entitlementDuration6Months"),
      "12_months": t("management.entitlementDuration12Months"),
      never: t("management.entitlementDurationNever"),
      custom: t("management.entitlementDurationCustom"),
    })[preset];

  return (
    <section
      data-testid="subscription-entitlements-panel"
      className="mt-5 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4"
    >
      <div>
        <h3 className="font-display text-sm font-bold">{t("management.entitlementTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("management.entitlementEffectivePlan")}:{" "}
          <span className="font-semibold uppercase text-foreground">{data.effectivePlan}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("management.entitlementStripeSource")}: {data.stripe.plan} · {data.stripe.status}
          {data.stripe.currentPeriodEnd
            ? ` · ${new Date(data.stripe.currentPeriodEnd).toLocaleString(locale)}`
            : ""}
        </p>
        {isSelf && (
          <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">
            {t("management.entitlementSelfGrantWarning")}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          {t("management.entitlementPlan")}
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value as ManualSubscriptionPlan)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground"
          >
            <option value="plus">Plus</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          {t("management.entitlementDuration")}
          <select
            value={duration}
            onChange={(event) => setDuration(event.target.value as ManualGrantDurationPreset)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground"
          >
            {MANUAL_GRANT_DURATION_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {durationLabel(preset)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {duration === "custom" && (
        <label className="block text-xs text-muted-foreground">
          {t("management.entitlementCustomExpiry")} ({timeZone})
          <input
            type="datetime-local"
            value={customLocal}
            onChange={(event) => setCustomLocal(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground"
          />
        </label>
      )}

      <label className="block text-xs text-muted-foreground">
        {t("management.entitlementReason")}
        <textarea
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground"
        />
      </label>
      <button
        type="button"
        disabled={grant.isPending}
        onClick={() => grant.mutate()}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {grant.isPending ? t("management.updating") : t("management.entitlementGrant")}
      </button>

      <div className="border-t border-white/10 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("management.entitlementHistory")}
        </h4>
        <div className="mt-3 space-y-3">
          {data.manualGrants.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("management.entitlementNoManual")}</p>
          )}
          {data.manualGrants.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold uppercase">{item.plan}</span>
                <span className="text-xs text-muted-foreground">
                  {item.active
                    ? t("management.entitlementActive")
                    : item.revokedAt
                      ? t("management.entitlementRevokedStatus")
                      : t("management.entitlementInactive")}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(item.startsAt).toLocaleString(locale)} →{" "}
                {item.expiresAt
                  ? new Date(item.expiresAt).toLocaleString(locale)
                  : t("management.entitlementDurationNever")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("management.entitlementReason")}: {item.reason}
              </p>
              {item.revokeReason && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("management.entitlementRevokeReason")}: {item.revokeReason}
                </p>
              )}
              {!item.revokedAt && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={revokeReasons[item.id] ?? ""}
                    maxLength={500}
                    onChange={(event) =>
                      setRevokeReasons((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder={t("management.entitlementRevokeReason")}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate({
                        grantId: item.id,
                        revokeReason: revokeReasons[item.id] ?? "",
                      })
                    }
                    className="rounded-lg border border-red-300/30 px-3 py-2 text-xs text-red-200 disabled:opacity-50"
                  >
                    {t("management.entitlementRevoke")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("management.entitlementAudit")}
        </h4>
        <div className="mt-3 space-y-2">
          {data.audit.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("management.entitlementAuditEmpty")}</p>
          )}
          {data.audit.map((event) => (
            <div key={event.id} className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  {event.action === "CREATE_SUBSCRIPTION_MANUAL_GRANT"
                    ? t("management.entitlementAuditGrant")
                    : t("management.entitlementAuditRevoke")}
                  {event.plan ? ` · ${event.plan.toUpperCase()}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString(locale)}
                </span>
              </div>
              {event.grantId && (
                <p className="mt-1 break-all text-[11px] text-muted-foreground">
                  {t("management.entitlementGrantId")}: {event.grantId}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
