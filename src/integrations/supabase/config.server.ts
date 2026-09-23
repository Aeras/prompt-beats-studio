export function getServerSupabasePublicConfig() {
  const url = process.env["EXTERNAL_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const publishableKey =
    process.env["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"];

  if (!url || !publishableKey) {
    const missing = [
      ...(!url ? ["EXTERNAL_SUPABASE_URL or SUPABASE_URL"] : []),
      ...(!publishableKey ? ["EXTERNAL_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}.`);
  }

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
