import { supabase } from "@/integrations/supabase/client";
import { parseLastWorkEnvelope, sameLastWorkDestination, type LastWorkDestination, type LastWorkEnvelope } from "@/lib/pb012-starting-screen.shared";

const DELAY_MS = 750;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: LastWorkDestination | null = null;
let lastPersisted: LastWorkDestination | null = null;
let writerUserId: string | null = null;
let serial = Promise.resolve();

export function resetPb012LastWorkWriter(userId: string | null) {
  if (writerUserId === userId) return;
  if (timer) clearTimeout(timer);
  timer = undefined;
  pending = null;
  lastPersisted = null;
  writerUserId = userId;
}

export function capturePb012LastWork(userId: string | null, destination: LastWorkDestination) {
  resetPb012LastWorkWriter(userId);
  if (!userId) return;
  if (lastPersisted && sameLastWorkDestination(lastPersisted, destination)) return;
  if (pending && sameLastWorkDestination(pending, destination)) return;
  pending = destination;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    const snapshot = pending;
    const owner = writerUserId;
    pending = null;
    if (!snapshot || !owner) return;
    serial = serial.then(async () => {
      if (owner !== writerUserId || (lastPersisted && sameLastWorkDestination(lastPersisted, snapshot))) return;
      const envelope: LastWorkEnvelope = { version: 1, destination: snapshot, recordedAt: new Date().toISOString() };
      const { data: current, error: readError } = await supabase.auth.getUser();
      if (readError || current.user?.id !== owner) return;
      const previous = parseLastWorkEnvelope(current.user.user_metadata?.last_resumable_destination);
      if (previous && sameLastWorkDestination(previous.destination, snapshot)) {
        lastPersisted = snapshot;
        return;
      }
      const { error } = await supabase.auth.updateUser({ data: { last_resumable_destination: envelope } });
      if (!error && owner === writerUserId) lastPersisted = snapshot;
    }).catch(() => { /* Retain last persisted destination on transient errors. */ });
  }, DELAY_MS);
}
