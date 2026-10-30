import { describe, expect, test } from "bun:test";

import {
  consumeAiDispatchAdmission,
  withFeatureAiDispatchAdmission,
} from "@/lib/global-ai-usage.server";

describe("PB-015 feature-bound AI dispatch permits", () => {
  test("exact user/feature permit is one-use and second call re-admits", async () => {
    const admissions: Array<{ userId: string; keys: readonly string[] }> = [];
    const admit = async (userId: string, keys: readonly string[]) => {
      admissions.push({ userId, keys });
    };
    await withFeatureAiDispatchAdmission(
      "user-a",
      ["quality_check", "ai_generator"],
      async () => {
        await consumeAiDispatchAdmission(async () => {}, admit);
        await consumeAiDispatchAdmission(async () => {}, admit);
      },
      admit,
    );
    expect(admissions).toEqual([
      { userId: "user-a", keys: ["ai_generator", "quality_check"] },
      { userId: "user-a", keys: ["ai_generator", "quality_check"] },
    ]);
  });

  test("nested same identity reuses only the still-unused permit", async () => {
    let admissions = 0;
    const admit = async () => {
      admissions += 1;
    };
    await withFeatureAiDispatchAdmission(
      "user-a",
      ["ai_generator"],
      () =>
        withFeatureAiDispatchAdmission(
          "user-a",
          ["ai_generator"],
          () => consumeAiDispatchAdmission(async () => {}, admit),
          admit,
        ),
      admit,
    );
    expect(admissions).toBe(1);
  });

  test("feature-A permit cannot authorize feature-B and user-A cannot authorize user-B", async () => {
    const admitted: string[] = [];
    const admit = async (userId: string, keys: readonly string[]) => {
      admitted.push(`${userId}:${keys.join(",")}`);
    };
    await withFeatureAiDispatchAdmission(
      "user-a",
      ["ai_generator"],
      async () => {
        await withFeatureAiDispatchAdmission(
          "user-a",
          ["ai_generator", "story_map"],
          () => consumeAiDispatchAdmission(async () => {}, admit),
          admit,
        );
        await withFeatureAiDispatchAdmission(
          "user-b",
          ["ai_generator"],
          () => consumeAiDispatchAdmission(async () => {}, admit),
          admit,
        );
      },
      admit,
    );
    expect(admitted).toEqual([
      "user-a:ai_generator",
      "user-a:ai_generator,story_map",
      "user-b:ai_generator",
    ]);
  });

  test("feature identity is normalized and frozen before admission", async () => {
    let received: readonly string[] = [];
    await withFeatureAiDispatchAdmission(
      "user-a",
      ["story_map", "ai_generator", "story_map"],
      async () => {},
      async (_userId, keys) => {
        received = keys;
      },
    );
    expect(received).toEqual(["ai_generator", "story_map"]);
    expect(Object.isFrozen(received)).toBe(true);
  });
});
