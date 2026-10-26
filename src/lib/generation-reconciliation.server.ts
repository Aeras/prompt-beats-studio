import { classifyStoredSongFailure } from "./generation-result.shared";
type Client = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
/** No provider create, retry, result deletion, or fabricated usage. SQL verifies
 * final durable usage and the exact immutable response in one fenced transaction. */
export async function reconcileFailedGeneration(
  jobId: string,
  userId: string,
  client?: Client,
): Promise<boolean> {
  const db =
    client ??
    ((await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Client);
  const read = await db.rpc("read_ai_execution_internal", {
    _user_id: userId,
    _job_id: jobId,
    _quality_action_id: null,
  });
  if (read.error) throw new Error("Generation reconciliation evidence unavailable.");
  const row = read.data;
  if (
    !row ||
    typeof row !== "object" ||
    !("id" in row) ||
    typeof row.id !== "string" ||
    !("result" in row)
  )
    return false;
  const reason = classifyStoredSongFailure(row.result);
  if (!reason) return false;
  const reply = await db.rpc("resolve_failed_generation_internal", {
    _execution_id: row.id,
    _user_id: userId,
    _job_id: jobId,
    _expected_result: row.result,
    _reason: reason,
  });
  if (reply.error) throw new Error("Generation reconciliation remains pending.");
  return reply.data === true;
}
