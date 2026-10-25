import { AsyncLocalStorage } from "node:async_hooks";
import type { UsageInsert } from "./ai-usage.server";

type ModelUse = { id: string; model: string; claimed: boolean; receiptId?: string };
type AuxiliaryContext = {
  userId: string;
  operation: string;
  requestKey: string;
  executionToken: string;
  uses: ModelUse[];
};
export const auxiliaryModelContext = new AsyncLocalStorage<AuxiliaryContext>();

/** Server-resolved identity, persisted before any provider dispatch. */
export async function startAuxiliaryModel(model: string) {
  const scope = auxiliaryModelContext.getStore();
  if (!scope) return;
  if (!model || model.length > 240) throw new Error("The AI model could not be identified safely.");
  const use = { id: crypto.randomUUID(), model, claimed: false };
  const { markAuxiliaryAiProviderStarted } = await import("./ai-finalization.server");
  await markAuxiliaryAiProviderStarted({ ...scope, model, useId: use.id });
  scope.uses.push(use);
  return use;
}

/** Also covers secondary/final-judge models selected inside a durable action. */
export async function claimAuxiliaryModel(model: string) {
  const scope = auxiliaryModelContext.getStore();
  if (!scope) return;
  const use =
    scope.uses.find((item) => item.model === model && !item.claimed && !item.receiptId) ??
    (await startAuxiliaryModel(model));
  if (use) use.claimed = true;
}

/** Does not calculate charges or change receipt identity. A failed association
 * leaves a conservative model-specific blocker; observed usage is saved first. */
export async function attachAuxiliaryReceipt(receipt: UsageInsert) {
  const scope = auxiliaryModelContext.getStore();
  if (!scope || scope.userId !== receipt.user_id) return;
  if (scope.uses.some((use) => use.receiptId === receipt.id)) return;
  const use = scope.uses.find((item) => item.model === receipt.model && !item.receiptId);
  if (!use) return;
  // Reserve synchronously before any await so concurrent receipts cannot pick
  // the same admission. Durable uniqueness remains enforced by PostgreSQL.
  use.receiptId = receipt.id;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as {
      rpc(
        name: "auxiliary_model_use_receipt_internal",
        args: { _use_id: string; _receipt_id: string },
      ): PromiseLike<{ error: unknown }>;
    };
    const { error } = await client.rpc("auxiliary_model_use_receipt_internal", {
      _use_id: use.id,
      _receipt_id: receipt.id,
    });
    if (error) throw new Error("Association failed");
  } catch {
    delete use.receiptId;
    throw new Error("Auxiliary usage association is pending.");
  }
}
