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

  const pattern = `%${query.replace(/[%,]/g, "")} %`.replace(" %", "%");
  const { data, error } = await (supabaseAdmin.from("public_profiles") as any)
    .select("id, handle, display_name, artist_alias, avatar_url, staff_badge")
    .or(`handle.ilike.${pattern},display_name.ilike.${pattern},artist_alias.ilike.${pattern}`)
    .limit(24);
  if (error) throw new Error("Public creator search could not be completed.");

  const rows = (data ?? []).filter((row: any) => row?.id && row?.handle);
  const eligibleIds = await filterEligiblePublicCreatorIds(rows.map((row: any) => row.id));
  return rows.filter((row: any) => eligibleIds.has(row.id)) as EligiblePublicCreatorSearchResult[];
}
