import { describe, expect, it } from "vitest";
import { START_SCREEN_VALUES, parseStartScreenPreference, parseLastWorkEnvelope, sameLastWorkDestination, pb012RouteFor } from "./pb012-starting-screen.shared";
describe("PB-012 shared contracts", () => {
  it("parses exactly eleven options", () => {
    expect(START_SCREEN_VALUES).toHaveLength(11);
    for (const value of START_SCREEN_VALUES) expect(parseStartScreenPreference(value)).toBe(value);
    for (const value of [null, undefined, "/evil", "https://example.com", "unknown"]) expect(parseStartScreenPreference(value)).toBe("home");
  });
  it("validates semantic Last Work", () => {
    const id = "8c34c798-2d83-47e5-95c9-f3fbc8e29f1b";
    const value = parseLastWorkEnvelope({version: 1, destination: {type: "project", id}, recordedAt: "future"});
    expect(value?.destination).toEqual({type: "project", id});
    expect(sameLastWorkDestination(value!.destination, {type: "project", id})).toBe(true);
    expect(parseLastWorkEnvelope({version: 2, destination: {type: "projects"}})).toBeNull();
    expect(parseLastWorkEnvelope({version: 1, destination: {type: "project", id: "bad"}})).toBeNull();
  });
  it("maps fixed routes", () => {
    expect(pb012RouteFor({type: "generator"})).toEqual({to: "/generate"});
    expect(pb012RouteFor({type: "projects"})).toEqual({to: "/library", search: {tab: "prompts", view: "projects"}});
  });
});
