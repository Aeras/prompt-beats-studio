import type { CorroboratedAiFixture } from "./football-ai-fixture-corroboration.server";
import type { AiFixtureCandidate } from "./football-ai-fixture-validation.shared";

type RpcClient = {
  rpc: (name: never, args: never) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Server-only persistence through the SECURITY DEFINER upsert RPC. Verified
 * status is asserted only from server corroboration; the RPC never downgrades
 * or edits an already verified fixture.
 */
export async function saveAiFixtureCandidates(
  client: RpcClient,
  userId: string,
  fixtures: AiFixtureCandidate[],
  verified: CorroboratedAiFixture[],
): Promise<{ stored: number; verified: number }> {
  if (fixtures.length > 80) throw new Error("Invalid AI fixture batch");
  const evidence = new Map(verified.map((item) => [item.normalizedKey, item]));
  let verifiedCount = 0;
  for (const fixture of fixtures) {
    const proof = evidence.get(fixture.normalizedKey);
    const sourceEvidence = proof
      ? proof.verifiedSources
      : fixture.sources.slice(0, 8).map((s) => ({ url: s.url, title: s.title, untrusted: true }));
    const { data, error } = await client.rpc(
      "upsert_private_football_ai_fixture" as never,
      {
        _user_id: userId,
        _league_id: fixture.leagueId,
        _normalized_key: fixture.normalizedKey,
        _home_team: fixture.homeTeam,
        _away_team: fixture.awayTeam,
        _kickoff_utc: proof?.kickoffUtc ?? fixture.kickoffUtc,
        _verified: Boolean(proof),
        _source_evidence: sourceEvidence,
      } as never,
    );
    if (error) throw new Error("AI fixture candidate persistence failed");
    const status = (data as { status?: string } | null)?.status;
    if (status === "verified" || status === "unchanged_verified") verifiedCount++;
  }
  return { stored: fixtures.length, verified: verifiedCount };
}
