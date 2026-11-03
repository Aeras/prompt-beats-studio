import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPrivateKinoLiveSnapshot } from "@/lib/kino-live.functions";
import {
  getKinoLiveState,
  getKinoPreviousBallPosition,
  getKinoTransitionDigit,
  getKinoVerifiedRevealFrame,
  shouldTransferKinoHeldResult,
  KINO_TRANSITION_MS,
  isCompleteKinoDraw,
  KINO_VERIFIED_BONUS_MS,
  KINO_VERIFIED_REVEAL_STEP_MS,
  KINO_VERIFIED_REVEAL_TOTAL_MS,
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
  const [ready, setReady] = useState(false);
  const [reveal, setReveal] = useState<{ draw: KinoDraw; startedAt: number } | null>(null);
  const [held, setHeld] = useState<{
    draw: KinoDraw;
    nextDrawTime: number | null;
    nextDrawId: number | null;
  } | null>(null);
  const [transition, setTransition] = useState<{
    startedAt: number;
    drawId: number | null;
  } | null>(null);
  const [handoff, setHandoff] = useState<{ draw: KinoDraw; startedAt: number } | null>(null);
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
  // Source timestamps, never an assumed five-minute cycle, govern all boundaries.
  const clockCorrection = snapshot ? snapshot.fetchedAt - query.dataUpdatedAt : 0;
  const providerNow = tick + clockCorrection;
  const live = snapshot ? getKinoLiveState(snapshot, providerNow) : null;
  const verifiedFrame = reveal
    ? getKinoVerifiedRevealFrame(reveal.draw, providerNow - reveal.startedAt)
    : null;
  const transitionDigit = getKinoTransitionDigit(transition?.startedAt ?? null, providerNow);
  const inTransition =
    transition !== null && providerNow < transition.startedAt + KINO_TRANSITION_MS;
  const liveDrawId =
    reveal?.draw.drawId ?? held?.draw.drawId ?? transition?.drawId ?? live?.drawId ?? null;
  const activeNumber = reveal ? verifiedFrame?.activeNumber ?? null : null;
  const confirmed = reveal
    ? verifiedFrame?.confirmed ?? []
    : held
      ? held.draw.numbers
      : [];
  const confirmedSet = new Set(confirmed);
  const highlightedBonus = reveal
    ? verifiedFrame?.bonusShown
      ? reveal.draw.bonus
      : null
    : held?.draw.bonus ?? null;
  const highlightedGreen = reveal
    ? verifiedFrame?.secondChance ?? []
    : held?.draw.secondChance ?? [];
  const greenSet = new Set(highlightedGreen);
  const waitingTime = snapshot?.active?.drawTime;
  const countdown =
    typeof waitingTime === "number"
      ? Math.max(0, Math.ceil((waitingTime - providerNow) / 1000))
      : null;
  const min = countdown === null ? null : Math.floor(countdown / 60);
  const sec = countdown === null ? null : countdown % 60;
  const handoffClass = handoff ? "scale-[0.98] opacity-0" : "scale-100 opacity-100";
  const previousCardClass = `rounded-2xl border border-white/10 bg-gradient-to-r from-[#15243b] via-[#172e45] to-[#15243b] px-4 py-3 shadow-lg shadow-black/10 transition-all duration-500 motion-reduce:transition-none sm:px-5 ${handoffClass}`;

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!snapshot || !ready) {
      if (snapshot && !ready) {
        // On first entry, keep the last official result on the live board
        // until the next provider time, without replaying it as a new draw.
        const latest = snapshot.last;
        if (isCompleteKinoDraw(latest)) {
          // Both views may use this already-confirmed draw on first load.
          // Never guess an unavailable older draw.
          setPrevious(latest);
          const next =
            snapshot.active && snapshot.active.drawId > latest.drawId
              ? snapshot.active
              : null;
          if (next && providerNow < next.drawTime) {
            setHeld({
              draw: latest,
              nextDrawTime: next.drawTime,
              nextDrawId: next.drawId,
            });
          } else {
            setPrevious(latest);
          }
        }
        setReady(true);
      }
      return;
    }

    if (handoff && providerNow >= handoff.startedAt + 450) {
      setPrevious(handoff.draw);
      setHandoff(null);
      return;
    }

    const draw = snapshot.last;
    if (reveal) {
      if (
        draw &&
        draw.drawId === reveal.draw.drawId &&
        draw.secondChance.length === 3 &&
        reveal.draw.secondChance.length !== 3
      ) {
        setReveal({ ...reveal, draw });
        return;
      }
      if (getKinoVerifiedRevealFrame(reveal.draw, providerNow - reveal.startedAt).finished) {
        const next = snapshot.active;
        setHeld({
          draw: reveal.draw,
          nextDrawTime: next && next.drawId > reveal.draw.drawId ? next.drawTime : null,
          nextDrawId: next && next.drawId > reveal.draw.drawId ? next.drawId : null,
        });
        setReveal(null);
      }
      return;
    }

    if (held) {
      const upcoming =
        snapshot.active && snapshot.active.drawId > held.draw.drawId
          ? snapshot.active
          : null;
      const nextTime = held.nextDrawTime ?? upcoming?.drawTime ?? null;
      const nextId = held.nextDrawId ?? upcoming?.drawId ?? null;
      if (
        draw?.drawId === held.draw.drawId &&
        draw.secondChance.length === 3 &&
        held.draw.secondChance.length !== 3 &&
        (nextTime === null || providerNow < nextTime)
      ) {
        // When green numbers arrive later, retain the 20+Bonus and present
        // the three greens sequentially rather than lighting them all at once.
        const greenStageOffset =
          20 * KINO_VERIFIED_REVEAL_STEP_MS + KINO_VERIFIED_BONUS_MS;
        const greenStageDuration = KINO_VERIFIED_REVEAL_TOTAL_MS - greenStageOffset;
        if (nextTime !== null && providerNow + greenStageDuration >= nextTime) {
          // The official draw boundary takes priority over a late replay.
          setHeld({ ...held, draw });
          return;
        }
        setReveal({ draw, startedAt: providerNow - greenStageOffset });
        setHeld(null);
        return;
      }
      if (nextTime === null) return;
      if (shouldTransferKinoHeldResult(nextTime, providerNow)) {
        // Keep the twenty-three results lit until this exact OPAP boundary.
        // Fade the previous-result card out then in during the 10-second interlude.
        setHandoff({ draw: held.draw, startedAt: providerNow });
        setTransition({ startedAt: nextTime, drawId: nextId });
        setHeld(null);
      } else if (held.nextDrawTime === null && upcoming) {
        setHeld({ ...held, nextDrawTime: upcoming.drawTime, nextDrawId: upcoming.drawId });
      }
      return;
    }

    if (transition) {
      if (inTransition) return;
      setTransition(null);
      // Continue to the actual published draw, if it has arrived.
    }

    // Support a first opening before any new completed result arrives:
    // the current official active draw also gets the ten-second countdown.
    if (
      !transition &&
      previous &&
      snapshot.active &&
      snapshot.active.drawId > previous.drawId &&
      getKinoTransitionDigit(snapshot.active.drawTime, providerNow) !== null
    ) {
      setTransition({ startedAt: snapshot.active.drawTime, drawId: snapshot.active.drawId });
      return;
    }
    if (!isCompleteKinoDraw(draw) || handoff) return;
    if (previous?.drawId === draw.drawId) {
      if (draw.secondChance.length === 3 && previous.secondChance.length !== 3) {
        setPrevious(draw);
      }
      return;
    }
    if (previous && draw.drawId < previous.drawId) return;
    // The 10-second interlude never displays invented results. A complete
    // official response is required before any new reveal can start.
    setReveal({ draw, startedAt: providerNow });
  }, [snapshot, ready, handoff, reveal, held, transition, inTransition, previous, providerNow]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-3 pb-12 pt-4 sm:px-6">
      <section
        aria-label="Προηγούμενη κλήρωση ΚΙΝΟ"
        className={previousCardClass}
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
            {inTransition && transitionDigit !== null && (
              <div
                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
                role="status"
                aria-label={`Έναρξη κλήρωσης σε ${transitionDigit} δευτερόλεπτα`}
              >
                <span
                  key={transitionDigit}
                  className="animate-in zoom-in-75 fade-in rounded-3xl border border-cyan-200/60 bg-slate-950/85 px-8 py-4 text-6xl font-black tabular-nums text-cyan-100 shadow-[0_0_50px_rgba(34,211,238,0.5)] duration-300 motion-reduce:animate-none sm:text-8xl"
                >
                  {transitionDigit}
                </span>
              </div>
            )}
            {reveal && verifiedFrame?.banner && (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
                aria-live="polite"
              >
                <span
                  className={`rounded-2xl border px-5 py-3 text-2xl font-black tracking-wide text-white shadow-2xl transition-[opacity,transform] duration-100 motion-reduce:transition-none sm:text-4xl ${
                    verifiedFrame.banner.kind === "bonus"
                      ? "border-red-300 bg-red-700/95 shadow-red-500/40"
                      : "border-green-300 bg-green-700/95 shadow-green-500/40"
                  }`}
                  style={{
                    opacity: verifiedFrame.banner.opacity,
                    transform: `scale(${verifiedFrame.banner.scale})`,
                  }}
                >
                  {verifiedFrame.banner.kind === "bonus" ? "KINO BONUS" : "2η ΕΥΚΑΙΡΙΑ"}
                </span>
              </div>
            )}
            <div className="grid grid-cols-10 gap-1 sm:gap-2" aria-label="Πίνακας αριθμών 1 έως 80">
              {NUMBERS.map((number) => {
                const won = confirmedSet.has(number);
                const hopping = activeNumber === number;
                const bonus = won && highlightedBonus === number;
                const green = greenSet.has(number);
                const cursorClass = hopping
                  ? "relative z-[1] scale-110 ring-4 ring-cyan-300 shadow-[0_0_24px_rgba(103,232,249,0.8)]"
                  : "";
                return (
                  <div
                    key={number}
                    className={`flex aspect-square min-w-0 items-center justify-center rounded-md border text-xs font-extrabold tabular-nums transition-[background-color,border-color,box-shadow,transform] duration-300 motion-reduce:transition-none sm:rounded-xl sm:text-lg ${
                      green
                        ? "border-green-200 bg-green-500 text-white"
                        : bonus
                          ? "border-red-200 bg-red-600 text-white"
                          : won
                            ? "border-yellow-200 bg-yellow-400 text-slate-950"
                            : hopping
                              ? "scale-105 border-amber-200 bg-amber-300 text-slate-950 shadow-[0_0_18px_rgba(252,211,77,0.45)]"
                              : "border-white/10 bg-[#1e3550] text-slate-300"
                    } ${cursorClass}`}
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
                : held
                  ? "Ολοκληρωμένη κλήρωση · οι 23 αριθμοί παραμένουν μέχρι την επόμενη"
                  : inTransition
                    ? "Προετοιμασία νέας κλήρωσης · αναμονή επίσημων αποτελεσμάτων"
                    : "Αναμονή επίσημων αποτελεσμάτων · Πηγή: OPAP API"}
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
