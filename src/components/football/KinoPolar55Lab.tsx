import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { queryPrivateKinoPolar55 } from "@/lib/kino-polar55.functions";
import { POLAR_WINDOWS, type PolarAnalysis } from "@/lib/kino-polar55.shared";

const number = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("el-GR", { maximumFractionDigits: 3 });
const date = (v: number | undefined) =>
  v ? new Date(v).toLocaleString("el-GR", { timeZone: "Europe/Athens" }) : "—";

export default function KinoPolar55Lab() {
  const [n, setN] = useState("1000"),
    [k, setK] = useState("8"),
    [method, setMethod] = useState("P01");
  const [result, setResult] = useState<PolarAnalysis | null>(null),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    pending = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const control = (
    label: string,
    value: string,
    setter: (v: string) => void,
    options: string[],
  ) => (
    <label className="min-w-0 space-y-1 text-xs">
      {label}
      <Select
        value={value}
        disabled={busy}
        onValueChange={(v) => {
          setter(v);
          setResult(null);
          setMessage("");
        }}
      >
        <SelectTrigger aria-label={label} className="h-10 w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((v) => (
            <SelectItem value={v} key={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
  const run = async () => {
    if (pending.current) return;
    pending.current = true;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setResult(null);
    setMessage("");
    try {
      const response = await queryPrivateKinoPolar55({
        signal: operation.signal,
        data: {
          op: "analysis",
          n: +n as (typeof POLAR_WINDOWS)[number],
          k: +k as 5 | 8 | 10,
          method: method as "P00" | "F00" | "P01",
          seed: "kino-lab-v1-retrospective",
        },
      });
      if (!mounted.current || operation.signal.aborted) return;
      if (response.status === "ok" && "analysis" in response) setResult(response.analysis);
      else
        setMessage(
          response.status === "not_configured"
            ? "Η σύνδεση Polar55 δεν έχει ενεργοποιηθεί. Η ιστορική συμπλήρωση παραμένει απενεργοποιημένη."
            : "Η ανάγνωση δεν ολοκληρώθηκε. Μπορείτε να επαναλάβετε με ασφάλεια· δεν γίνεται συλλογή νέων κληρώσεων.",
        );
    } catch {
      if (mounted.current) {
        setResult(null);
        setMessage(
          operation.signal.aborted
            ? "Η αναμονή ακυρώθηκε. Η περιορισμένη ανάγνωση στον server ενδέχεται να ολοκληρωθεί."
            : "Δεν επιβεβαιώθηκε η πρόσβαση ή η ανάγνωση Polar55.",
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const exportResult = async () => {
    if (!result || pending.current) return;
    // Revalidate current access; export only this immutable analysis, never rerun it.
    pending.current = true;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    try {
      await queryPrivateKinoPolar55({ data: { op: "status" }, signal: operation.signal });
      if (!mounted.current || operation.signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "kino-polar55-analysis.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (mounted.current) {
        setResult(null);
        setMessage("Δεν επιβεβαιώθηκε η πρόσβαση.");
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-3"
      aria-label="Εργαστήριο Polar55"
    >
      <h2 className="text-lg font-semibold">KINO LAB · Polar55</h2>
      <div className="grid grid-cols-3 gap-2">
        {control("Αποθηκευμένες κληρώσεις", n, setN, POLAR_WINDOWS.map(String))}
        {control("Αριθμοί", k, setK, ["5", "8", "10"])}
        {control("Μέθοδος", method, setMethod, ["P00", "F00", "P01"])}
      </div>
      <Button variant="outline" disabled={busy} onClick={() => void run()} className="min-h-11">
        Ανάλυση
      </Button>
      {busy && (
        <Button variant="outline" onClick={() => controller.current?.abort()}>
          Ακύρωση αναμονής
        </Button>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {busy
          ? "Ανάγνωση και ανάλυση αποθηκευμένων κληρώσεων…"
          : message || "Χωρίς συλλογή από ΟΠΑΠ · Πληρότητα ανεπιβεβαίωτη"}
      </p>
      {result && (
        <>
          <p className="text-sm">
            Υπάρχουν {number(result.stored)} αποθηκευμένες · Ζητήθηκαν {number(result.requested)} ·
            Αναλύθηκαν {number(result.loaded)} έγκυρες{result.partial ? " · Μερικό δείγμα" : ""}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt>Πρώτη / τελευταία (Ελλάδα)</dt>
              <dd>
                {date(result.result.first?.time)} / {date(result.result.last?.time)}
              </dd>
            </div>
            <div>
              <dt>Τελευταίος έλεγχος πηγής (UTC)</dt>
              <dd>{result.lastObserved ?? "—"}</dd>
            </div>
            <div>
              <dt>Απορρίψεις στο διάβασμα</dt>
              <dd>{result.rejected}</dd>
            </div>
            <div>
              <dt>Ιστορικός έλεγχος στόχων</dt>
              <dd>{result.result.backtest.n} / έως 500</dd>
            </div>
            <div>
              <dt>U · έναντι k/4</dt>
              <dd>{number(result.result.backtest.uniformLift)}</dd>
            </div>
            <div>
              <dt>T · έναντι F00</dt>
              <dd>{number(result.result.backtest.pairedDiff)}</dd>
            </div>
          </dl>
          <p className="text-xs">
            Στατιστικά για {number(result.loaded)}, backtest για έως 500. Κάλυψη προγράμματος μη
            επαληθευμένη. Η επιλογή είναι πειραματική, όχι πρόβλεψη.
          </p>
          <p className="text-sm">Επιλογή: {result.result.proposal.join(" · ") || "—"}</p>
          <div className="grid grid-cols-8 gap-1 sm:grid-cols-10" aria-label="Συχνότητες Polar55">
            {result.result.stats.counts.map((v, i) => (
              <div key={i} className="rounded border border-border p-1 text-center text-xs">
                <strong>{i + 1}</strong>
                <span className="block text-muted-foreground">{number(v)}</span>
              </div>
            ))}
          </div>
          <p className="break-all text-xs text-muted-foreground">
            Snapshot: {result.snapshotAt} · SHA-256: {result.sha256}
          </p>
          <Button variant="outline" disabled={busy} onClick={() => void exportResult()}>
            Εξαγωγή ανάλυσης
          </Button>
        </>
      )}
    </section>
  );
}
