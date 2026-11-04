import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPrivateKinoLabAccess } from "@/lib/kino-lab.functions";
import KinoPolar55Lab from "./KinoPolar55Lab";
import {
  filterLabDraws,
  KINO_LAB_MAX_BYTES,
  KINO_LAB_VERSION,
  labBacktest,
  labPick,
  labStats,
  parseLabDraws,
  type LabDataset,
  type LabMethod,
} from "@/lib/kino-lab.shared";

const fmt = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("el-GR", { maximumFractionDigits: 3 });
const card = "min-w-0 rounded-xl border border-border bg-card p-3";
type Proposal = { numbers: number[]; seed: string; method: LabMethod; k: number };
export default function KinoAnalysisLab() {
  const [source, setSource] = useState("json");
  return (
    <div className="mx-auto max-w-6xl min-w-0 space-y-3 px-3 pt-3">
      <label className="block text-xs">
        Πηγή δεδομένων
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger aria-label="Πηγή δεδομένων" className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="json">Εισαγωγή JSON</SelectItem>
            <SelectItem value="polar55">Polar55</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {source === "polar55" ? <KinoPolar55Lab /> : <OfflineKinoAnalysisLab />}
    </div>
  );
}
function OfflineKinoAnalysisLab() {
  const [dataset, setDataset] = useState<LabDataset | null>(null),
    [sourceHash, setSourceHash] = useState("");
  const [windowMode, setWindowMode] = useState("latest"),
    [n, setN] = useState("100");
  const [day, setDay] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [k, setK] = useState("8"),
    [method, setMethod] = useState<LabMethod>("P01");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [report, setReport] = useState<ReturnType<typeof labBacktest> | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const epoch = useRef(0),
    locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const invalidate = () => {
    epoch.current++;
    setProposal(null);
    setReport(null);
    setError("");
  };
  const selection = useMemo(() => {
    if (!dataset) return { draws: [], invalid: false };
    try {
      return {
        draws: filterLabDraws(
          dataset.draws,
          windowMode === "latest"
            ? { kind: "latest", n: +n }
            : windowMode === "day"
              ? { kind: "day", day }
              : { kind: "utc", start: start + "Z", end: end + "Z" },
        ),
        invalid: false,
      };
    } catch {
      return { draws: [], invalid: true };
    }
  }, [dataset, windowMode, n, day, start, end]);
  const stats = useMemo(() => labStats(selection.draws), [selection.draws]);
  const action = async (run: (valid: () => boolean) => void | Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const ticket = epoch.current;
    const valid = () => ticket === epoch.current;
    try {
      let auth;
      try {
        auth = await getPrivateKinoLabAccess();
      } catch (failure) {
        if (valid()) {
          setDataset(null);
          setSourceHash("");
          setProposal(null);
          setReport(null);
        }
        throw failure;
      }
      if (!valid()) return;
      if (auth.allowed !== true) throw Error("denied");
      await run(valid);
    } catch {
      if (valid()) setError("Η ενέργεια δεν ολοκληρώθηκε. Ελέγξτε πρόσβαση και αρχείο JSON.");
    } finally {
      locked.current = false;
      if (valid()) setBusy(false);
    }
  };
  const load = (file: File) => {
    if (locked.current) return;
    invalidate();
    setDataset(null);
    setSourceHash("");
    void action(async (valid) => {
      if (file.size > KINO_LAB_MAX_BYTES) throw Error("too_large");
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > KINO_LAB_MAX_BYTES) throw Error("too_large");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const parsed = parseLabDraws(text);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      if (!valid()) return;
      setDataset(parsed);
      setSourceHash(
        Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""),
      );
    });
  };
  const exportReport = () =>
    void action(() => {
      const data = {
        format: "promptbeats-kino-lab",
        schemaVersion: 1,
        softwareVersion: KINO_LAB_VERSION,
        exportedAt: new Date().toISOString(),
        mode: "OFFLINE_EXPLORATORY",
        liveEligible: false,
        evidence: "EXPLORATORY",
        sourceHash,
        filter: { windowMode, n, day, start, end },
        proposal,
        report,
        dataset,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "kino-lab-report.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const dropdown = (
    label: string,
    value: string,
    update: (value: string) => void,
    options: Array<[string, string]>,
  ) => (
    <label className="min-w-0 space-y-1 text-xs">
      {label}
      <Select
        disabled={busy}
        value={value}
        onValueChange={(v) => {
          invalidate();
          update(v);
        }}
      >
        <SelectTrigger className="h-10 w-full min-w-0" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map(([id, text]) => (
            <SelectItem key={id} value={id}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
  return (
    <section
      className="mx-auto max-w-6xl min-w-0 space-y-3 px-3 py-4 text-foreground"
      aria-label="KINO Analysis Lab"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">KINO LAB</h2>
        <span className="text-xs text-muted-foreground">
          Τοπικό · Πειραματικό · Χωρίς live στόχο
        </span>
      </div>
      <div className={card}>
        <label htmlFor="kino-lab-file" className="mb-2 block text-xs">
          Αρχείο κληρώσεων JSON · έως 4 MB
        </label>
        <input
          id="kino-lab-file"
          ref={fileInput}
          tabIndex={-1}
          type="file"
          accept=".json,application/json"
          disabled={busy}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) load(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          disabled={busy}
          className="min-h-11"
          onClick={() => fileInput.current?.click()}
        >
          Εισαγωγή JSON
        </Button>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {dropdown("Δείγμα", windowMode, setWindowMode, [
            ["latest", "Τελευταίες"],
            ["day", "Ημέρα Ελλάδας"],
            ["utc", "Διάστημα UTC"],
          ])}
          {windowMode === "latest" &&
            dropdown(
              "Κληρώσεις",
              n,
              setN,
              [10, 20, 50, 100, 500, 1000, 5000].map((v) => [String(v), String(v)]),
            )}
          {windowMode === "day" && (
            <label className="text-xs">
              Ημέρα Ελλάδας
              <Input
                aria-label="Ημέρα Ελλάδας"
                type="date"
                value={day}
                disabled={busy}
                onChange={(e) => {
                  invalidate();
                  setDay(e.target.value);
                }}
              />
            </label>
          )}
          {windowMode === "utc" && (
            <>
              <label className="text-xs">
                Από UTC
                <Input
                  aria-label="Από UTC"
                  type="datetime-local"
                  value={start}
                  disabled={busy}
                  onChange={(e) => {
                    invalidate();
                    setStart(e.target.value);
                  }}
                />
              </label>
              <label className="text-xs">
                Έως UTC (εξαιρείται)
                <Input
                  aria-label="Έως UTC"
                  type="datetime-local"
                  value={end}
                  disabled={busy}
                  onChange={(e) => {
                    invalidate();
                    setEnd(e.target.value);
                  }}
                />
              </label>
            </>
          )}
        </div>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {busy
          ? "Έλεγχος…"
          : selection.invalid
            ? "Μη έγκυρο διάστημα"
            : `${stats.n} κληρώσεις${dataset ? ` · ${dataset.errors.length} απορρίψεις · Πληρότητα ανεπιβεβαίωτη` : " · Εισαγωγή JSON"}`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Tabs defaultValue="patterns" className="min-w-0">
        <TabsList className="grid h-auto w-full grid-cols-4">
          <TabsTrigger value="patterns" className="min-h-11 px-1 text-xs">
            Μοτίβα
          </TabsTrigger>
          <TabsTrigger value="proposal" className="min-h-11 px-1 text-xs">
            Πρόταση
          </TabsTrigger>
          <TabsTrigger value="check" className="min-h-11 px-1 text-xs">
            Έλεγχος
          </TabsTrigger>
          <TabsTrigger value="data" className="min-h-11 px-1 text-xs">
            Δεδομένα
          </TabsTrigger>
        </TabsList>
        <TabsContent value="patterns" className={card}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt>Αναμενόμενο / αριθμό</dt>
              <dd>{fmt(stats.expected)}</dd>
            </div>
            <div>
              <dt>Κοινά γειτονικών παρατηρήσεων</dt>
              <dd>{fmt(stats.observedNeighborOverlap)}</dd>
            </div>
            <div>
              <dt>Μονά / Ζυγά</dt>
              <dd>
                {stats.odd} / {stats.even}
              </dd>
            </div>
            <div>
              <dt>1–40 / 41–80</dt>
              <dd>
                {stats.low} / {stats.high}
              </dd>
            </div>
            <div>
              <dt>Δείκτης αποκλίσεων P11</dt>
              <dd>{fmt(stats.dispersion)}</dd>
            </div>
            <div>
              <dt>Προγνωστικό σήμα</dt>
              <dd>Μη αξιολογημένο</dd>
            </div>
          </dl>
        </TabsContent>
        <TabsContent value="proposal" className={card}>
          <div className="grid grid-cols-2 gap-2">
            {dropdown("Αριθμοί", k, setK, [
              ["5", "5"],
              ["8", "8"],
              ["10", "10"],
            ])}
            {dropdown("Μέθοδος", method, (v) => setMethod(v as LabMethod), [
              ["P00", "P00 · Τυχαία"],
              ["F00", "F00 · Συχνότητες"],
              ["P01", "P01 · Πρόσφατες"],
            ])}
          </div>
          <Button
            className="my-3 min-h-11"
            disabled={busy || !stats.n || selection.invalid}
            onClick={() =>
              void action(() => {
                const seed = crypto.randomUUID();
                setProposal({
                  numbers: labPick(+k, method, selection.draws, seed),
                  seed,
                  method,
                  k: +k,
                });
              })
            }
          >
            Παραγωγή επιλογής
          </Button>
          <div className="flex flex-wrap gap-2" aria-label="Πειραματικοί αριθμοί">
            {proposal?.numbers.map((v) => (
              <span
                key={v}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-primary text-sm font-semibold"
              >
                {v}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Μη επικυρωμένη επιλογή · Όχι πρόβλεψη επόμενης κλήρωσης
          </p>
        </TabsContent>
        <TabsContent value="check" className={card}>
          <Button
            disabled={busy || stats.n <= 30 || selection.invalid}
            onClick={() =>
              void action(() =>
                setReport(
                  labBacktest(selection.draws, {
                    method,
                    k: +k,
                    warmup: 30,
                    maxTargets: 500,
                    seed: "kino-lab-v1-retrospective",
                  }),
                ),
              )
            }
          >
            Ιστορικός έλεγχος
          </Button>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt>Κοινοί στόχοι</dt>
              <dd>{report?.n ?? "—"}</dd>
            </div>
            <div>
              <dt>Μέσα hits</dt>
              <dd>{fmt(report?.meanHits ?? null)}</dd>
            </div>
            <div>
              <dt>U · έναντι k/4</dt>
              <dd>{fmt(report?.uniformLift ?? null)}</dd>
            </div>
            <div>
              <dt>T · έναντι F00</dt>
              <dd>{fmt(report?.pairedDiff ?? null)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Αναδρομικό / approximate · Χωρίς επιβεβαιωμένο πλεονέκτημα
          </p>
        </TabsContent>
        <TabsContent value="data" className={card}>
          <div className="grid grid-cols-10 gap-1" aria-label="Εμφανίσεις αριθμών 1–80">
            {stats.counts.map((count, i) => (
              <div key={i} className="rounded border border-border p-1 text-center text-xs">
                <strong>{i + 1}</strong>
                <span className="block text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !dataset} onClick={exportReport}>
              Εξαγωγή JSON
            </Button>
            <Button
              variant="outline"
              disabled={busy || !dataset}
              onClick={() => {
                invalidate();
                setDataset(null);
                setSourceHash("");
              }}
            >
              Εκκαθάριση τοπικών
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      <details className={`${card} text-xs text-muted-foreground`}>
        <summary className="min-h-11 cursor-pointer py-3">Μεθοδολογία &amp; προέλευση</summary>
        <p>
          Τοπικά δεδομένα στη μνήμη· δεν αποστέλλονται ούτε αποθηκεύονται στον server. Συχνότητες,
          κενά και γειτονικές παρατηρήσεις δεν αποδεικνύουν συνέχεια προγράμματος ή προγνωστικό
          σήμα. P00: αναπαραγώγιμος PRNG. F00: πλήρες παρελθόν με prior 8. P01: τελευταίες 100
          παρατηρήσεις. Ταυτόχρονα timestamps εξαιρούνται από το training του στόχου. Δεν
          υπολογίζεται επιβεβαιωτικό p-value. P03 και live δεσμεύσεις παραμένουν ανενεργά.
        </p>
        <p className="mt-2 break-all">
          {KINO_LAB_VERSION} · SHA-256: {sourceHash || "—"}
        </p>
      </details>
    </section>
  );
}
