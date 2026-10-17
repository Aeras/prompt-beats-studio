import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { isPb012DefaultDocumentEntry, resolvePb012EntryRoute } from "@/lib/pb012-entry";

// In-memory, document-scoped only: never sessionStorage or localStorage.
let claimed = false;
let documentEntryEligible: boolean | undefined;

function claimDefaultDocumentEntry(): boolean {
  if (typeof window === "undefined" || claimed) return false;
  if (documentEntryEligible === undefined) {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    // Original document URL, not the URL of a later SPA visit to Home.
    const entry = new URL(navigation?.name ?? window.location.href);
    documentEntryEligible = isPb012DefaultDocumentEntry(
      entry.pathname,
      entry.search,
      navigation?.type,
      entry.hash,
    );
  }
  if (!documentEntryEligible) return false;
  claimed = true;
  return true;
}

export function Pb012DefaultEntryBoundary({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  // Neutral first render on both server and client prevents hydration mismatch and Home flash.
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [resolved, setResolved] = useState(false);
  const claimRef = useRef<boolean | null>(null);

  useEffect(() => {
    claimRef.current ??= claimDefaultDocumentEntry();
    const claimedHere = claimRef.current;
    setEligible(claimedHere);
    if (!claimedHere) setResolved(true);
  }, []);

  useEffect(() => {
    if (eligible !== true || loading) return;
    if (!userId) {
      setResolved(true);
      return;
    }
    let active = true;
    const entryHref = window.location.href;
    void resolvePb012EntryRoute()
      .then((route) => {
        if (!active) return;
        if (window.location.href !== entryHref) {
          setResolved(true);
          return;
        }
        if (route.to === "/") {
          setResolved(true);
          return;
        }
        void navigate({ ...route, replace: true })
          .catch(() => {})
          .finally(() => {
            if (active) setResolved(true);
          });
      })
      .catch(() => {
        if (active) setResolved(true);
      });
    return () => {
      active = false;
    };
  }, [eligible, loading, navigate, userId]);

  return resolved ? (
    <>{children}</>
  ) : (
    <div
      className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}
