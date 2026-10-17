import { describe, expect, it, vi } from "vitest";
import { validateDefaultDestination } from "./pb012-starting-screen.functions";

const userId = "8c34c798-2d83-47e5-95c9-f3fbc8e29f1b";
const exact = "df71810a-a0c7-4b2e-8dc6-4df1f24755a9";
const envelope = { version: 1, destination: { type: "project", id: exact } };

function client({ allowed = true, row = { id: exact }, error = null }: { allowed?: boolean; row?: unknown; error?: unknown } = {}) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }));
  const eq = vi.fn(() => ({ eq, maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn(async () => ({ data: allowed, error }));
  return { auth: { getUser: vi.fn() }, rpc, from, maybeSingle, eq };
}
describe("PB-012 server destination validation", () => {
  it("resolves ungated fixed destinations", async () => {
    const c = client();
    expect(await validateDefaultDestination(c as any, userId, "projects", null)).toEqual({ status: "valid", destination: { type: "projects" } });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("requires current feature access", async () => {
    const c = client({ allowed: false });
    expect(await validateDefaultDestination(c as any, userId, "generator", null)).toEqual({ status: "feature_unavailable" });
  });
  it("validates exact objects through caller-owned lookup", async () => {
    const c = client();
    expect(await validateDefaultDestination(c as any, userId, "last_work", envelope)).toEqual({ status: "valid", destination: { type: "project", id: exact } });
    expect(c.from).toHaveBeenCalledWith("prompt_projects");
    expect(c.eq).toHaveBeenCalledWith("user_id", userId);
  });
  it("collapses missing objects to invalid", async () => {
    const c = client({ row: null });
    expect(await validateDefaultDestination(c as any, userId, "last_work", envelope)).toEqual({ status: "invalid" });
  });
  it("preserves uncertainty on database failure", async () => {
    const c = client({ error: { code: "PGRST500" } });
    expect(await validateDefaultDestination(c as any, userId, "last_work", envelope)).toEqual({ status: "temporary_failure" });
  });
});
