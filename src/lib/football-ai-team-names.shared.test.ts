import { describe, expect, it } from "bun:test";
import { footballTeamDisplayName } from "./football-ai-team-names.shared";

describe("Football AI Greek team display labels", () => {
  it("localizes known clubs without changing English displays", () => {
    expect(footballTeamDisplayName("Newcastle United", "el")).toBe("Νιούκασλ");
    expect(footballTeamDisplayName("Manchester City", "el")).toBe("Μάντσεστερ Σίτι");
    expect(footballTeamDisplayName("Newcastle United", "en")).toBe("Newcastle United");
  });
  it("does not invent translations for unknown teams", () => {
    expect(footballTeamDisplayName("Unlisted FC", "el")).toBe("Unlisted FC");
  });
});
