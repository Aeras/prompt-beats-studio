import {
  parseLastWorkEnvelope,
  sameLastWorkDestination,
  type LastWorkDestination,
  type LastWorkEnvelope,
} from "./pb012-starting-screen.shared";

type WriterAuth = {
  getUser: () => Promise<{
    data: { user: { id: string; user_metadata?: Record<string, unknown> } | null };
    error: unknown;
  }>;
  updateUser: (attributes: {
    data: { last_resumable_destination: LastWorkEnvelope };
  }) => Promise<{ error: unknown }>;
};

export function createPb012LastWorkWriter(auth: WriterAuth) {
  let owner: string | null = null;
  let epoch = 0;
  let pending: LastWorkDestination | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let serial = Promise.resolve();

  function reset(userId: string | null) {
    if (owner === userId) return;
    owner = userId;
    epoch++;
    pending = null;
    clearTimeout(timer);
  }

  function flush() {
    clearTimeout(timer);
    const destination = pending;
    const userId = owner;
    const generation = epoch;
    pending = null;
    if (!destination || !userId) return serial;
    serial = serial
      .then(async () => {
        if (generation !== epoch) return;
        const { data, error } = await auth.getUser();
        if (error || generation !== epoch || data.user?.id !== userId) return;
        const previous = parseLastWorkEnvelope(
          data.user.user_metadata?.["last_resumable_destination"],
        );
        // Fresh account metadata: another device may have changed the last destination.
        if (previous && sameLastWorkDestination(previous.destination, destination)) return;
        await auth.updateUser({
          data: {
            last_resumable_destination: {
              version: 1,
              destination,
              recordedAt: new Date().toISOString(),
            },
          },
        });
      })
      .catch(() => {
        /* Preserve the last successful account value on transient failure. */
      });
    return serial;
  }

  function capture(userId: string | null, value: LastWorkDestination) {
    reset(userId);
    const validated = parseLastWorkEnvelope({ version: 1, destination: value });
    if (!userId || !validated) return;
    if (pending && sameLastWorkDestination(pending, validated.destination)) return;
    pending = validated.destination;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 750);
  }

  return { capture, flush, reset };
}
