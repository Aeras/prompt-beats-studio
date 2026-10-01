import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { filterEligiblePublicCreatorIds } from "@/lib/public-content.server";

export type EligiblePublicCreatorSearchResult = {
  id: string;
  handle: string;
  display_name: string | null;
  artist_alias: string | null;
  avatar_url: string | null;
  staff_badge: string | null;
};

export async function searchEligiblePublicCreators(
  rawQuery: string,
): Promise<EligiblePublicCreatorSearchResult[]> {
  const query = rawQuery.trim().replace(/^@/, "");
  if (!query) return [];

  const pattern = `%${query}%`;
  const columns = "id, handle, display_name, artist_alias, avatar_url, staff_badge";
  const [handles, displayNames, aliases] = await Promise.all([
    (supabaseAdmin.from("public_profiles") as any)
      .select(columns)
      .ilike("handle", pattern)
      .limit(24),
    (supabaseAdmin.from("public_profiles") as any)
      .select(columns)
      .ilike("display_name", pattern)
      .limit(24),
    (supabaseAdmin.from("public_profiles") as any)
      .select(columns)
      .ilike("artist_alias", pattern)
      .limit(24),
  ]);
  if (handles.error || displayNames.error || aliases.error) {
    throw new Error("Public creator search could not be completed.");
  }

  const unique = new Map<string, EligiblePublicCreatorSearchResult>();
  for (const row of [...(handles.data ?? []), ...(displayNames.data ?? []), ...(aliases.data ?? [])]) {
    if (row?.id && row?.handle && !unique.has(row.id)) {
      unique.set(row.id, row as EligiblePublicCreatorSearchResult);
    }
  }
  const rows = [...unique.values()].slice(0, 24);
  const eligibleIds = await filterEligiblePublicCreatorIds(rows.map((row) => row.id));
  return rows.filter((row) => eligibleIds.has(row.id));
}
