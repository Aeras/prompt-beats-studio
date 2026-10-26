import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Power } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { getAdminGlobalAiUsage, setAdminGlobalAiUsage } from "@/lib/global-ai-usage.functions";

const key = ["admin-global-ai-usage"];
export function GlobalAiUsageSwitch() {
  const { language } = useI18n();
  const el = language === "el";
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => getAdminGlobalAiUsage(),
    staleTime: 0,
    refetchInterval: 15000,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!query.data) throw new Error("AI settings unavailable");
      return setAdminGlobalAiUsage({ data: { enabled, expectedRevision: query.data.revision } });
    },
    onSuccess: (data) => {
      client.setQueryData(key, data);
      toast.success(el ? "Η ρύθμιση χρήσης AI αποθηκεύτηκε." : "AI usage setting saved.");
    },
    onError: async () => {
      toast.error(
        el
          ? "Η ρύθμιση AI δεν αποθηκεύτηκε. Ελέγξτε την τρέχουσα κατάσταση και δοκιμάστε ξανά."
          : "AI setting not saved. Check the current state and retry.",
      );
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <section
      className="rounded-2xl border border-purple-300/25 bg-[#21152f] p-4"
      aria-labelledby="global-ai-title"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 id="global-ai-title" className="flex items-center gap-2 font-semibold">
          <Power size={18} />
          {el ? "Χρήση AI στην εφαρμογή" : "AI usage in the app"}
        </h3>
        {query.data && !query.isError && (
          <button
            type="button"
            role="switch"
            aria-checked={query.data.enabled}
            aria-labelledby="global-ai-title"
            disabled={save.isPending || query.isFetching}
            onClick={() => save.mutate(!query.data!.enabled)}
            className="flex min-h-11 min-w-16 items-center justify-center gap-2 rounded-full border border-purple-300/40 px-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200 disabled:opacity-50"
            style={{ background: query.data.enabled ? "#7e22ce" : "#581c35" }}
          >
            {save.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : query.data.enabled ? (
              "ON"
            ) : (
              "OFF"
            )}
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-purple-100">
        {el
          ? "Το OFF σταματά νέες εγκρίσεις κλήσεων AI για όλους. Ήδη εγκεκριμένες ή αποσταλμένες κλήσεις μπορούν να ολοκληρωθούν και να καταγράψουν τη χρήση τους."
          : "OFF stops new AI dispatch admissions for everyone. Already admitted or sent calls may finish and record their usage."}
      </p>
      <p role="status" aria-live="polite" className="mt-2 text-xs text-purple-200">
        {save.isPending
          ? el
            ? "Αποθήκευση…"
            : "Saving…"
          : query.isLoading
            ? el
              ? "Φόρτωση…"
              : "Loading…"
            : query.isError
              ? el
                ? "Η κατάσταση AI δεν είναι διαθέσιμη."
                : "AI status is unavailable."
              : query.data?.enabled
                ? el
                  ? "Το AI είναι ενεργό."
                  : "AI is enabled."
                : el
                  ? "Το AI είναι απενεργοποιημένο."
                  : "AI is disabled."}
      </p>
      {query.isError && (
        <button
          className="mt-2 rounded-xl border border-purple-300/25 px-3 py-2 text-sm"
          onClick={() => void query.refetch()}
        >
          {el ? "Επανάληψη" : "Retry"}
        </button>
      )}
    </section>
  );
}
