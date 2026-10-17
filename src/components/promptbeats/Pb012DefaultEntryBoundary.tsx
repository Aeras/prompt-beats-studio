import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { resolveDefaultEntry } from "@/lib/pb012-starting-screen.functions";
import { pb012RouteFor } from "@/lib/pb012-starting-screen.shared";

// In-memory, document-scoped only: never sessionStorage or localStorage.
let claimed = false;
let documentEntryEligible: boolean | undefined;

export function isPb012DefaultDocumentEntry(path: string, search: string, navigationType: string | undefined) {
  return path === "/" && search === "" && navigationType === "navigate";
}

function claimDefaultDocumentEntry(): boolean {
  if (typeof window === "undefined" || claimed) return false;
  if (documentEntryEligible === undefined) {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    documentEntryEligible = isPb012DefaultDocumentEntry(
      window.location.pathname, window.location.search, navigation?.type,
    );
  }
  if (!documentEntryEligible) return false;
  claimed = true;
  return true;
}

export function Pb012DefaultEntryBoundary({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // Neutral first render on both server and client prevents hydration mismatch and Home flash.
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const claimedHere = claimDefaultDocumentEntry();
    setEligible(claimedHere);
    if (!claimedHere) setResolved(true);
  }, []);

  useEffect(() => {
    if (eligible !== true || loading) return;
    if (!user) {
      setResolved(true);
      return;
    }
    let active = true;
    void resolveDefaultEntry().then((result) => {
      if (!active) return;
      if (result.status !== "valid" || result.destination.type === "home") {
        setResolved(true);
        return;
      }
      const route = pb012RouteFor(result.destination);
      void navigate({ to: route.to, search: route.search, replace: true }).finally(() => {
        if (active) setResolved(true);
      });
    }).catch(() => {
      if (active) setResolved(true);
    });
    return () => { active = false; };
  }, [eligible, loading, navigate, user]);

  return resolved ? <>{children}</> : (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground" aria-live="polite">
      Loading…
    </div>
  );
}
