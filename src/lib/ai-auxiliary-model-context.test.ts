import { describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type * as ContextModule from "./ai-auxiliary-model-context.server";
import { toUsageInsert } from "./ai-usage.server";

function fixture() {
  const exports: Partial<typeof ContextModule> = {};
  const starts: { userId: string; model: string; useId: string }[] = [];
  const receipts: { _use_id: string; _receipt_id: string }[] = [];
  let failStart = false;
  let failReceipt = false;
  runInNewContext(
    ts.transpileModule(readFileSync("src/lib/ai-auxiliary-model-context.server.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      crypto,
      require(name: string) {
        if (name === "node:async_hooks") return { AsyncLocalStorage };
        if (name === "./ai-finalization.server")
          return {
            markAuxiliaryAiProviderStarted: async (value: (typeof starts)[number]) => {
              if (failStart) throw new Error("Admission rejected");
              starts.push(value);
            },
          };
        if (name === "@/integrations/supabase/client.server")
          return {
            supabaseAdmin: {
              rpc: async (name: string, args: (typeof receipts)[number]) => {
                expect(name).toBe("auxiliary_model_use_receipt_internal");
                receipts.push(args);
                return { error: failReceipt ? {} : null };
              },
            },
          };
        throw new Error(name);
      },
    },
  );
  return {
    module: exports as typeof ContextModule,
    starts,
    receipts,
    rejectStart: () => {
      failStart = true;
    },
    rejectReceipt: () => {
      failReceipt = true;
    },
  };
}
const scope = (userId = "user-one") => ({
  userId,
  operation: "song_analyzer",
  requestKey: crypto.randomUUID(),
  executionToken: crypto.randomUUID(),
  uses: [],
});
const receipt = (userId = "user-one", model = "model-one") =>
  toUsageInsert({
    userId,
    model,
    provider: "openai",
    operation: "song_analysis",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    success: true,
  });

describe("model-specific auxiliary admission context", () => {
  test("non-auxiliary generation does not perform auxiliary RPCs", async () => {
    const f = fixture();
    await f.module.startAuxiliaryModel("model-one");
    await f.module.claimAuxiliaryModel("model-one");
    await f.module.attachAuxiliaryReceipt(receipt());
    expect(f.starts).toHaveLength(0);
    expect(f.receipts).toHaveLength(0);
  });
  test("resolved primary and secondary model admissions precede execution", async () => {
    const f = fixture();
    await f.module.auxiliaryModelContext.run(scope(), async () => {
      await f.module.startAuxiliaryModel("model-one");
      await f.module.claimAuxiliaryModel("model-one");
      expect(f.starts).toHaveLength(1);
      await f.module.claimAuxiliaryModel("model-two");
      expect(f.starts.map((v) => v.model)).toEqual(["model-one", "model-two"]);
      expect(f.starts[0]!.useId).not.toBe(f.starts[1]!.useId);
    });
  });
  test("parallel accounts remain isolated", async () => {
    const f = fixture();
    await Promise.all(
      ["one", "two"].map((userId) =>
        f.module.auxiliaryModelContext.run(scope(userId), async () => {
          await Promise.resolve();
          await f.module.startAuxiliaryModel(userId);
          await f.module.attachAuxiliaryReceipt(receipt(userId, userId));
        }),
      ),
    );
    expect(f.starts.every((v) => v.userId === v.model)).toBe(true);
    expect(f.receipts).toHaveLength(2);
  });
  test("one receipt cannot consume two same-model admissions", async () => {
    const f = fixture();
    await f.module.auxiliaryModelContext.run(scope(), async () => {
      await f.module.startAuxiliaryModel("model-one");
      await f.module.startAuxiliaryModel("model-one");
      const first = receipt();
      await f.module.attachAuxiliaryReceipt(first);
      await f.module.attachAuxiliaryReceipt(first);
      await f.module.attachAuxiliaryReceipt(receipt());
      expect(f.receipts).toHaveLength(2);
      expect(new Set(f.receipts.map((r) => r._use_id)).size).toBe(2);
    });
  });
  test("parallel same-model receipts reserve separate admissions", async () => {
    const f = fixture();
    await f.module.auxiliaryModelContext.run(scope(), async () => {
      await f.module.startAuxiliaryModel("model-one");
      await f.module.startAuxiliaryModel("model-one");
      await Promise.all([
        f.module.attachAuxiliaryReceipt(receipt()),
        f.module.attachAuxiliaryReceipt(receipt()),
      ]);
      expect(new Set(f.receipts.map((r) => r._use_id)).size).toBe(2);
    });
  });
  test("failed admission cannot reach provider work", async () => {
    const f = fixture();
    f.rejectStart();
    let providerCalled = false;
    await expect(
      f.module.auxiliaryModelContext.run(scope(), async () => {
        await f.module.startAuxiliaryModel("model-one");
        providerCalled = true;
      }),
    ).rejects.toThrow("Admission rejected");
    expect(providerCalled).toBe(false);
  });
  test("wrong-user receipt is never associated", async () => {
    const f = fixture();
    await f.module.auxiliaryModelContext.run(scope(), async () => {
      await f.module.startAuxiliaryModel("model-one");
      await f.module.attachAuxiliaryReceipt(receipt("other-user"));
    });
    expect(f.receipts).toHaveLength(0);
  });
  test("association failure retains its conservative admission and permits retry", async () => {
    const f = fixture();
    await f.module.auxiliaryModelContext.run(scope(), async () => {
      await f.module.startAuxiliaryModel("model-one");
      f.rejectReceipt();
      await expect(f.module.attachAuxiliaryReceipt(receipt())).rejects.toThrow(
        "association is pending",
      );
      expect(f.module.auxiliaryModelContext.getStore()!.uses[0]!.receiptId).toBeUndefined();
    });
  });
});
