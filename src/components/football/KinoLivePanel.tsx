import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPrivateKinoLiveSnapshot } from "@/lib/kino-live.functions";
import {
  getKinoLiveState,
  getKinoPreviousBallPosition,
  getKinoVerifiedRevealFrame,
  isCompleteKinoDraw,
  KINO_VERIFIED_REVEAL_STEP_MS,
  type KinoDraw,
} from "@/lib/kino-live.shared";

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
function FinishedNumbers({ draw }: { draw: KinoDraw | null }) {
  if (!isCompleteKinoDraw(draw)) {
    return <p className="py-2 text-sm text-slate-400">Αναμονή για επιβεβαιωμένα αποτελέσματα…</p>;
  }

  const entries: Array<{ number: number | null; kind: "regular" | "bonus" | "green" }> = [
    ...draw.numbers.map((number) => ({
      number,
      kind: number === draw.bonus ? ("bonus" as const) : ("regular" as const),
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      number: draw.secondChance[index] ?? null,
      kind: "green" as const,
    })),
  ];

  return (
    <>
      <div
        className="grid gap-y-1"
        style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
        aria-label="Προηγούμενη κλήρωση: 20 αριθμοί και 3 θέσεις 2ης Ευκαιρίας"
      >
        {entries.map(({ number, kind }, index) => {
          const { row, column } = getKinoPreviousBallPosition(index);
          return (
            <span
              key={index}
              style={{ gridColumn: `${column} / span 2`, gridRow: row }}
              className={`flex aspect-square w-full items-center justify-center rounded-full border text-xs font-bold tabular-nums sm:text-sm ${
                kind === "bonus"
                  ? "border-red-200 bg-red-600 text-white"
                  : kind === "green" && number !== null
                    ? "border-green-200 bg-green-500 text-white"
                    : kind === "green"
                      ? "border-white/20 bg-white/10 text-slate-400"
                      : "border-yellow-200 bg-yellow-400 text-slate-950"
              }`}
              title={kind === "bonus" ? "KINO Bonus" : kind === "green" ? "2η Ευκαιρία" : undefined}
            >
              {number ?? "–"}
            </span>
          );
        })}
      </div>
      {draw.secondChance.length !== 3 && (
        <p className="mt-2 text-xs text-slate-400">Αναμονή επίσημων αριθμών 2ης Ευκαιρίας.</p>
      )}
    </>
  );
}

/** Independent, unmounted when the user leaves the KINO tab. */
export function KinoLivePanel() {
  const [tick, setTick] = useState(() => Date.now());
  const [previous, setPrevious] = useState<KinoDraw | null>(null);
  const [reveal, setReveal] = useState<{ draw: KinoDraw; startedAt: number } | null>(null);
  const query = useQuery({
    queryKey: ["private-kino-live"],
    queryFn: () => getPrivateKinoLiveSnapshot(),
    retry: false,
    refetchOnWindowFocus: "always",
    refetchIntervalInBackground: false,
    staleTime: 2000,
    refetchInterval: (state) => {
      const active = state.state.data?.active;
      if (!active) return 5000;
      const delta = active.drawTime - Date.now();
      return delta <= 60000 && delta >= -180000 ? 2000 : 10000;
    },
  });
  const snapshot = query.data;
  // The client derives the frame from provider timestamps, not local timer order.
  const clockCorrection = snapshot ? snapshot.fetchedAt - query.dataUpdatedAt : 0;
  const providerNow = tick + clockCorrection;
  const live = snapshot ? getKinoLiveState(snapshot, providerNow) : null;
  const verifiedFrame = reveal
    ? getKinoVerifiedRevealFrame(reveal.draw, providerNow - reveal.startedAt)
    : null;
  const liveDrawId = reveal?.draw.drawId ?? live?.drawId ?? null;
  const activeNumber = reveal
    ? (verifiedFrame?.activeNumber ?? null)
    : (live?.activeNumber ?? null);
  const confirmed = verifiedFrame?.confirmed ?? live?.confirmed ?? [];
  const confirmedSet = new Set(confirmed);
  const highlightedBonus = verifiedFrame?.bonusShown ? reveal?.draw.bonus : null;
  const highlightedGreen = verifiedFrame?.secondChance ?? [];
  const greenSet = new Set(highlightedGreen);
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
    if (reveal) {
      // If the same draw receives its 2nd-Chance data later, upgrade the ongoing
      // presentation without restarting or losing its already displayed numbers.
      if (
        draw &&
        draw.drawId === reveal.draw.drawId &&
        draw.secondChance.length === 3 &&
        reveal.draw.secondChance.length !== 3
      ) {
        setReveal({ ...reveal, draw });
        return;
      }
      const frame = getKinoVerifiedRevealFrame(reveal.draw, providerNow - reveal.startedAt);
      if (frame.finished) {
        setPrevious((before) =>
          !before || reveal.draw.drawId >= before.drawId ? reveal.draw : before,
        );
        setReveal(null);
      }
      return;
    }

    if (!isCompleteKinoDraw(draw)) return;
    if (!previous) {
      setPrevious(draw);
      return;
    }
    if (draw.drawId === previous.drawId) {
      if (draw.secondChance.length === 3 && previous.secondChance.length !== 3) setPrevious(draw);
      return;
    }
    if (draw.drawId < previous.drawId) return;

    // Respect provider-owned animation for the first twenty.
    // Afterwards display the verified Bonus and three green values.
    if (draw.animation) {
      if (providerNow >= draw.animation.endTimestamp) {
        setReveal({
          draw,
          startedAt: providerNow - 20 * KINO_VERIFIED_REVEAL_STEP_MS,
        });
      }
      return;
    }

    // New complete result: animate only verified numbers; never invent wins.
    setReveal({ draw, startedAt: providerNow });
  }, [snapshot?.last, previous, providerNow, reveal]);

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
        <div className="border-b border-white/10 px-3 py-2.5 sm:px-5 sm:py-3">
          <h2 className="text-base font-bold text-white sm:text-lg">
            Live κλήρωση{" "}
            <span className="text-cyan-200">{liveDrawId ? `#${liveDrawId}` : "—"}</span>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-200 sm:text-sm">
            <span>Επόμενη κλήρωση · {time(waitingTime)}</span>
            <span className="font-mono tabular-nums text-cyan-200">
              {min === null
                ? "—"
                : `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`}
            </span>
          </div>
        </div>
        <div className="px-2 py-4 sm:px-6 sm:py-6">
          <div className="relative">
            {reveal && verifiedFrame?.phase === "bonus" && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <span className="rounded-xl border border-red-300 bg-red-700/90 px-4 py-2 text-xl font-extrabold text-white shadow-lg">
                  KINO BONUS
                </span>
              </div>
            )}
            {reveal && verifiedFrame?.phase === "second-chance" && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <span className="rounded-xl border border-green-300 bg-green-700/90 px-4 py-2 text-xl font-extrabold text-white shadow-lg">
                  2η ΕΥΚΑΙΡΙΑ
                </span>
              </div>
            )}
            <div className="grid grid-cols-10 gap-1 sm:gap-2" aria-label="Πίνακας αριθμών 1 έως 80">
              {NUMBERS.map((number) => {
                const won = confirmedSet.has(number);
                const hopping = activeNumber === number;
                const bonus = won && highlightedBonus === number;
                const green = greenSet.has(number);
                return (
                  <div
                    key={number}
                    className={`flex aspect-square min-w-0 items-center justify-center rounded-md border text-xs font-extrabold tabular-nums transition-[background-color,border-color,box-shadow,transform] duration-150 motion-reduce:transition-none sm:rounded-xl sm:text-lg ${
                      green
                        ? "border-green-200 bg-green-500 text-white"
                        : bonus
                          ? "border-red-200 bg-red-600 text-white"
                          : won
                            ? "border-yellow-200 bg-yellow-400 text-slate-950"
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
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span aria-live="polite">
              {reveal
                ? `Επιβεβαιωμένη παρουσίαση · ${confirmed.length}/20 · 2η Ευκαιρία ${highlightedGreen.length}/3`
                : live?.running
                  ? `Επίσημα δεδομένα · ${confirmed.length}/20`
                  : "Πηγή: OPAP API"}
            </span>
            <span>Ώρα Ελλάδας</span>
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
          Η σύνδεση με τον ΟΠΑΠ δεν είναι διαθέσιμη αυτή τη στιγμή. Δεν εμφανίζονται μη
          επιβεβαιωμένοι αριθμοί.
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
        Η ζωντανή παρουσίαση χρησιμοποιεί αποκλειστικά επίσημα χρονισμένα δεδομένα, όταν υπάρχουν.
        Διαφορετικά οι ήδη επιβεβαιωμένοι αριθμοί εμφανίζονται διαδοχικά με σαφή ένδειξη
        καθυστέρησης. Δεν πρόκειται για συγχρονισμένη μετάδοση του ΟΠΑΠ.
      </p>
    </div>
  );
}
