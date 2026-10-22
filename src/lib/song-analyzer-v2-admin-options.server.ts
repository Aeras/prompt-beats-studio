import { supabaseAdmin } from "@/integrations/supabase/client.server";

const KEY = "song_analyzer_v2_admin_options";
type Entry = { provider: string; id: string; enabled: boolean; verified: boolean };
function valid(row: unknown): row is Entry {
  if (!row || typeof row !== "object") return false;
  const v = row as Record<string, unknown>;
  return (
    ["gemini", "openai", "openrouter"].includes(String(v.provider)) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    v.id.length <= 240 &&
    typeof v.enabled === "boolean" &&
    typeof v.verified === "boolean"
  );
}

export async function readAnalyzerV2AdminOptions(): Promise<Entry[]> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw new Error("Could not read Analyzer V2 opt-in settings.");
  const rows = (data as { value?: { models?: unknown } } | null)?.value?.models;
  return Array.isArray(rows) ? rows.filter(valid) : [];
}

export async function writeAnalyzerV2AdminOptions(entries: Entry[]) {
  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: KEY,
    value: { models: entries },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Could not update Analyzer V2 opt-in settings.");
}

export async function analyzerV2AdminEnabled(provider: string, id: string) {
  const rows = await readAnalyzerV2AdminOptions();
  return rows.some((entry) => entry.provider === provider && entry.id === id && entry.enabled);
}

export async function updateAnalyzerV2AdminOption(provider: string, id: string, enabled: boolean, verified?: boolean) {
  const rows = await readAnalyzerV2AdminOptions();
  const previous = rows.find((entry) => entry.provider === provider && entry.id === id);
  const next: Entry = {
    provider,
    id,
    enabled,
    verified: verified ?? previous?.verified ?? false,
  };
  await writeAnalyzerV2AdminOptions([
    ...rows.filter((entry) => entry.provider !== provider || entry.id !== id),
    next,
  ]);
  return next;
}
