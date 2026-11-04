import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { KinoLivePanel } from "./KinoLivePanel";

const KinoAnalysisLab = lazy(() => import("./KinoAnalysisLab"));

/** Local subview: the existing live panel unmounts and stops polling in Lab mode. */
export function KinoWorkspace({ ownerId }: { ownerId: string }) {
  const [view, setView] = useState<"live" | "lab">("live");
  return (
    <div className="min-w-0">
      <div
        className="mx-auto flex max-w-6xl gap-2 px-3 pt-3"
        role="group"
        aria-label="Λειτουργία ΚΙΝΟ"
      >
        <Button
          variant={view === "live" ? "default" : "outline"}
          aria-pressed={view === "live"}
          onClick={() => setView("live")}
        >
          Ζωντανά
        </Button>
        <Button
          variant={view === "lab" ? "default" : "outline"}
          aria-pressed={view === "lab"}
          onClick={() => setView("lab")}
        >
          Εργαστήριο
        </Button>
      </div>
      {view === "live" ? (
        <KinoLivePanel />
      ) : (
        <Suspense
          fallback={
            <p role="status" className="p-4 text-sm">
              Φόρτωση εργαστηρίου…
            </p>
          }
        >
          <KinoAnalysisLab key={ownerId} />
        </Suspense>
      )}
    </div>
  );
}
