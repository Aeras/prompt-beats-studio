import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPrivateKinoLiveSnapshot } from "@/lib/kino-live.functions";
import { getKinoFrame, type KinoDraw } from "@/lib/kino-live.shared";

const NUMBERS = Array.from({ length: 80 }, (_, index) => index + 1);
const athensTime = new Intl.DateTimeFormat("el-GR", {
  timeZone: "Europe/Athens",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const athensDate = new Intl.DateTimeFormat("el-GR", {
  timeZone: "Europe/Athens",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
function time(value: number | null | undefined): string {
  return typeof value === "number" ? athensTime.format(value) : "—";
}
function hasResults(draw: KinoDraw | null | undefined): draw is KinoDraw {
  return Boolean(draw && draw.numbers.length === 20);
}
function FinishedNumbers({ draw }: { draw: KinoDraw | null }) {
  if (!hasResults(draw)) {
    return <p className="py-2 text-sm text-slate-400">Αναμονή για επιβεβαιωμένα αποτελέσματα…</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Οι 20 αριθμοί της προηγούμενης κλήρωσης">
      {draw.numbers.map((number) => (
        <span
          key={number}
          className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold tabular-nums ${number === draw.bonus ? "border-amber-200/80 bg-amber-400 text-slate-950" : "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"}`}
          title={number === draw.bonus ? "ΚΙΝΟ Bonus" : undefined}
        >
          {number}
        </span>
      ))}
    </div>
  );
}

/** Independent, unmounted when the user leaves the KINO tab. */
export function KinoLivePanel() {
  const [tick, setTick] = useState(() => Date.now());
  const [previous, setPrevious] = useState<KinoDraw | null>(null);
  const query = useQuery({
    queryKey: ["private-kino-live"],
    queryFn: () => getPrivateKinoLiveSnapshot(),
    retry: false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    staleTime: 2000,
    refetchInterval: (state) => {
      const active = state.state.data?.active;
      if (!active) return 8000;
      const delta = active.drawTime - Date.now();
      return delta <= 50000 && delta >= -120000 ? 4000 : 16000;
    },
  });
  const snapshot = query.data;
  // The client derives the frame from provider timestamps, not local timer order.
  const clockCorrection = snapshot ? snapshot.fetchedAt - query.dataUpdatedAt : 0;
  const providerNow = tick + clockCorrection;
  const animated = [snapshot?.last, snapshot?.active].find(
    (draw) =>
      draw?.animation &&
      providerNow >= draw.animation.startTimestamp &&
      providerNow < draw.animation.endTimestamp,
  );
  const liveAnimation = animated?.animation ?? null;
  const frame = liveAnimation ? getKinoFrame(liveAnimation, providerNow) : null;
  const liveDrawId = animated?.drawId ?? snapshot?.active?.drawId ?? null;
  const activeNumber = frame?.activeNumber ?? null;
  const confirmed = frame?.confirmed ?? [];
  const confirmedSet = new Set(confirmed);
  const waitingTime = snapshot?.active?.drawTime;
  const countdown =
    typeof waitingTime === "number"
      ? Math.max(0, Math.ceil((waitingTime - providerNow) / 1000))
      : null;
  const min = countdown === null ? null : Math.floor(countdown / 60);
  const sec = countdown === null ? null : countdown % 60;

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const draw = snapshot?.last;
    if (!hasResults(draw)) return;
    // Never promote a draw while its authoritative animation is on screen.
    if (draw.animation && providerNow < draw.animation.endTimestamp) return;
    setPrevious((before) => (!before || draw.drawId > before.drawId ? draw : before));
  }, [snapshot, providerNow]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-3 pb-12 pt-4 sm:px-6">
      <section
        aria-label="Προηγούμενη κλήρωση ΚΙΝΟ"
        className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#15243b] via-[#172e45] to-[#15243b] px-4 py-3 shadow-lg shadow-black/10 sm:px-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">
            Προηγούμενη κλήρωση
          </h2>
          <p className="text-xs font-semibold text-slate-300 sm:text-sm">
            {previous
              ? `#${previous.drawId} · ${athensDate.format(previous.drawTime)} · ${time(previous.drawTime)}`
              : "Αναμονή δεδομένων"}
          </p>
        </div>
        <FinishedNumbers draw={previous} />
      </section>

      <section
        aria-label="Ζωντανός πίνακας ΚΙΝΟ"
        className="overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-b from-[#152c45] via-[#0e1d31] to-[#10192a] shadow-2xl shadow-cyan-950/20"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.23em] text-cyan-300">
              KINO · ΟΠΑΠ
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              Live κλήρωση{" "}
              <span className="text-cyan-200">{liveDrawId ? `#${liveDrawId}` : "—"}</span>
            </h2>
          </div>
          <div className="text-right">
            <p aria-live="polite" className="text-sm font-semibold text-slate-200">
              {frame?.phase === "running"
                ? `Παρουσίαση κλήρωσης · ${confirmed.length}/20`
                : snapshot?.active
                  ? `Επόμενη · ${time(snapshot.active.drawTime)}`
                  : "Αναμονή επόμενης κλήρωσης"}
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-cyan-200">
              {frame?.phase === "running"
                ? "Συγχρονισμός με βήματα ΟΠΑΠ"
                : min === null
                  ? "—"
                  : `Σε ${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`}
            </p>
          </div>
        </div>
        <div className="px-2 py-4 sm:px-6 sm:py-6">
          <div
            className="grid grid-cols-8 gap-1 sm:grid-cols-10 sm:gap-2"
            aria-label="Πίνακας αριθμών 1 έως 80"
          >
            {NUMBERS.map((number) => {
              const won = confirmedSet.has(number);
              const hopping = activeNumber === number;
              return (
                <div
                  key={number}
                  className={`flex aspect-square items-center justify-center rounded-lg border text-sm font-extrabold tabular-nums transition-[background-color,border-color,box-shadow,transform] duration-150 motion-reduce:transition-none sm:rounded-xl sm:text-lg ${
                    won
                      ? "border-cyan-200 bg-cyan-400 text-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                      : hopping
                        ? "scale-105 border-amber-200 bg-amber-300 text-slate-950 shadow-[0_0_18px_rgba(252,211,77,0.45)]"
                        : "border-white/10 bg-[#1e3550] text-slate-300"
                  }`}
                >
                  {number}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <p>
              {frame?.phase === "running"
                ? "Κυανό: επιβεβαιωμένος αριθμός · Χρυσό: τρέχον βήμα"
                : "Ο πίνακας καθαρίζει μεταξύ των κληρώσεων."}
            </p>
            <p>Πηγή: OPAP API · Ώρα Ελλάδας</p>
          </div>
        </div>
      </section>

      {query.isPending && (
        <p role="status" className="text-sm text-cyan-200">
          Σύνδεση με αποτελέσματα ΟΠΑΠ…
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100"
        >
          Η σύνδεση με τον ΟΠΑΠ δεν είναι διαθέσιμη αυτή τη στιγμή. Δεν εμφανίζονται μη επιβεβαιωμένοι
          αριθμοί.
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => void query.refetch()}
          >
            Επανάληψη
          </button>
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">
        Η κινούμενη παρουσίαση ενεργοποιείται μόνο όταν ο ΟΠΑΠ παρέχει έγκυρα χρονισμένα βήματα.
        Διαφορετικά προβάλλονται μόνο επίσημα ολοκληρωμένα αποτελέσματα. Η ενημέρωση μπορεί να
        καθυστερεί.
      </p>
    </div>
  );
}
