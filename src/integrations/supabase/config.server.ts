const PREVIEW_FALLBACK_SUPABASE_URL = "https://qwlksrcsovbncmretjdt.supabase.co";
const PREVIEW_FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bGtzcmNzb3ZibmNtcmV0amR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI0NzAsImV4cCI6MjEwNTU3ODQ3MH0.OO2NL--b-IpUS2h6fGiijD-wbdoE34GsEN4azOhSZg4";

export function getServerSupabasePublicConfig() {
  // Lovable's dev preview can occasionally fail to expose project Secrets to
  // TanStack server functions even though the same project has valid Secrets.
  // The URL and publishable/anon key are public client configuration and are
  // already shipped to browsers by src/integrations/supabase/client.ts, so it
  // is safe to use the same values as a last-resort preview/runtime fallback.
  // Production/server environments still prefer explicit environment values.
  const url =
    process.env["EXTERNAL_SUPABASE_URL"] ??
    process.env["SUPABASE_URL"] ??
    PREVIEW_FALLBACK_SUPABASE_URL;
  const publishableKey =
    process.env["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"] ??
    PREVIEW_FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  return { url, publishableKey };
}

export function getServerSupabaseAdminConfig() {
  const { url } = getServerSupabasePublicConfig();
  const secretKey =
    process.env["EXTERNAL_SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!secretKey) {
    throw new Error(
      "Missing Supabase environment variable: EXTERNAL_SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { url, secretKey };
}
