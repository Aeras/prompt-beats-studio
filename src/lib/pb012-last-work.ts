import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createPb012LastWorkWriter } from "@/lib/pb012-last-work-writer";
import {
  parseLastWorkEnvelope,
  type LastWorkDestination,
} from "@/lib/pb012-starting-screen.shared";

const writer = createPb012LastWorkWriter(supabase.auth);
let initialized = false;

export function resetPb012LastWorkWriter(userId: string | null) {
  writer.reset(userId);
}

export function capturePb012LastWork(userId: string | null, destination: LastWorkDestination) {
  if (typeof window === "undefined") return;
  if (!initialized) {
    initialized = true;
    // One document-lifetime subscription, also cancelling writes on sign-out while on Home.
    supabase.auth.onAuthStateChange((_event, session) => writer.reset(session?.user.id ?? null));
    window.addEventListener("pagehide", () => void writer.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void writer.flush();
    });
  }
  writer.capture(userId, destination);
}

export function usePb012LastWork(userId: string | null, destination: LastWorkDestination | null) {
  const key = destination ? JSON.stringify(destination) : null;
  useEffect(() => {
    if (!userId || !key) return;
    const envelope = parseLastWorkEnvelope({ version: 1, destination: JSON.parse(key) });
    if (envelope) capturePb012LastWork(userId, envelope.destination);
  }, [key, userId]);
}
