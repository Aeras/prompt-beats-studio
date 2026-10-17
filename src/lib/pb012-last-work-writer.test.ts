import { describe, expect, test, mock } from "bun:test";
import { createPb012LastWorkWriter } from "./pb012-last-work-writer";
import type { LastWorkDestination, LastWorkEnvelope } from "./pb012-starting-screen.shared";

function fixture() {
  let user: { id: string; user_metadata: Record<string, unknown> } | null = {
    id: "A",
    user_metadata: {},
  };
  let fail = false;
  const getUser = mock(async () => ({ data: { user }, error: fail ? new Error("offline") : null }));
  const updateUser = mock(
    async ({ data }: { data: { last_resumable_destination: LastWorkEnvelope } }) => {
      if (user) user.user_metadata = { ...user.user_metadata, ...data };
      return { error: null };
    },
  );
  const writer = createPb012LastWorkWriter({ getUser, updateUser });
  return {
    writer,
    getUser,
    updateUser,
    setUser: (next: typeof user) => {
      user = next;
    },
    fail: () => {
      fail = true;
    },
  };
}

describe("PB-012 account Last Work writer", () => {
  test("coalesces rapid navigation and persists only semantic destination metadata", async () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) f.writer.capture("A", { type: "projects" });
    f.writer.capture("A", { type: "my_songs" });
    await f.writer.flush();
    expect(f.updateUser).toHaveBeenCalledTimes(1);
    expect(f.updateUser.mock.calls[0]?.[0].data.last_resumable_destination.destination).toEqual({
      type: "my_songs",
    });
    f.writer.reset(null);
  });

  test("deduplicates against fresh metadata and honours another device's newer value", async () => {
    const f = fixture();
    f.writer.capture("A", { type: "generator" });
    await f.writer.flush();
    f.writer.capture("A", { type: "generator" });
    await f.writer.flush();
    expect(f.updateUser).toHaveBeenCalledTimes(1);
    f.setUser({
      id: "A",
      user_metadata: {
        last_resumable_destination: { version: 1, destination: { type: "projects" } },
      },
    });
    f.writer.capture("A", { type: "generator" });
    await f.writer.flush();
    expect(f.updateUser).toHaveBeenCalledTimes(2);
    f.writer.reset(null);
  });

  test("sign-out/account change cancels pending writes and fresh auth identity must match", async () => {
    const f = fixture();
    f.writer.capture("A", { type: "projects" });
    f.writer.reset(null);
    await f.writer.flush();
    expect(f.updateUser).not.toHaveBeenCalled();
    f.writer.capture("A", { type: "projects" });
    f.setUser({ id: "B", user_metadata: {} });
    await f.writer.flush();
    expect(f.updateUser).not.toHaveBeenCalled();
    f.writer.reset(null);
  });

  test("account switch during an in-flight fresh user read invalidates the old write", async () => {
    let finish!: (value: { data: { user: { id: string } }; error: null }) => void;
    const updateUser = mock(async () => ({ error: null }));
    const writer = createPb012LastWorkWriter({
      getUser: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      updateUser,
    });
    writer.capture("A", { type: "projects" });
    const flushing = writer.flush();
    await Promise.resolve();
    writer.reset("B");
    finish({ data: { user: { id: "A" } }, error: null });
    await flushing;
    expect(updateUser).not.toHaveBeenCalled();
    writer.reset(null);
  });

  test("invalid/arbitrary destinations and failed reads never replace account Last Work", async () => {
    const f = fixture();
    f.writer.capture("A", { type: "https://evil.example" } as unknown as LastWorkDestination);
    await f.writer.flush();
    f.fail();
    f.writer.capture("A", { type: "generator" });
    await f.writer.flush();
    expect(f.updateUser).not.toHaveBeenCalled();
    f.writer.reset(null);
  });

  test("pagehide flush can settle before debounce without a second write", async () => {
    const f = fixture();
    f.writer.capture("A", { type: "playlists" });
    await Promise.all([f.writer.flush(), f.writer.flush()]);
    expect(f.updateUser).toHaveBeenCalledTimes(1);
    f.writer.reset(null);
  });
});
