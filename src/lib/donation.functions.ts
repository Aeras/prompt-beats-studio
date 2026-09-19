import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSafeExternalUrl } from "@/lib/safe-external-url";

export const DONATION_PROVIDERS = [
  "paypal",
  "revolut",
  "buy_me_a_coffee",
  "ko_fi",
  "wise",
  "custom",
] as const;

export type DonationProvider = (typeof DONATION_PROVIDERS)[number];
export type DonationAccessOverride = "inherit" | "enabled" | "disabled";

export type DonationMethod = {
  id: string;
  provider: DonationProvider;
  customLabel: string | null;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
  privacyAcknowledged: boolean;
};

const providerSchema = z.enum(DONATION_PROVIDERS);
const overrideSchema = z.enum(["inherit", "enabled", "disabled"]);

const methodInputSchema = z.object({
  id: z.string().uuid().optional(),
  provider: providerSchema,
  customLabel: z.string().trim().max(60).nullish(),
  value: z.string().trim().min(1).max(500),
  isEnabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(2),
  privacyAcknowledged: z.boolean().default(false),
});

const saveDonationSettingsSchema = z.object({
  userEnabled: z.boolean(),
  methods: z.array(methodInputSchema).max(3),
});

const providerHosts: Record<Exclude<DonationProvider, "custom">, string[]> = {
  paypal: ["paypal.me", "paypal.com"],
  revolut: ["revolut.me", "revolut.com"],
  buy_me_a_coffee: ["buymeacoffee.com"],
  ko_fi: ["ko-fi.com"],
  wise: ["wise.com"],
};

function hostMatches(hostname: string, allowed: string[]) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return allowed.some((domain) => host === domain || host.endsWith("." + domain));
}

function luhnValid(digits: string) {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function containsLikelyCardNumber(value: string) {
  const candidates = value.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

function looksLikeIban(value: string) {
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact);
}

function validateMethod(input: z.infer<typeof methodInputSchema>) {
  const value = input.value.trim();

  if (containsLikelyCardNumber(value)) {
    throw new Error("Card numbers cannot be stored or published as a donation method.");
  }

  if (input.provider === "custom") {
    if (!input.customLabel?.trim()) {
      throw new Error("Custom donation methods require a provider/name.");
    }
    if (looksLikeIban(value) && !input.privacyAcknowledged) {
      throw new Error("Confirm that you understand an IBAN entered here may be displayed publicly.");
    }
    return;
  }

  if (input.customLabel) {
    throw new Error("A custom provider name is only allowed for Custom donation methods.");
  }

  const safe = getSafeExternalUrl(value);
  if (!safe) throw new Error("Enter a valid HTTPS donation URL.");

  let parsed: URL;
  try {
    parsed = new URL(safe);
  } catch {
    throw new Error("Enter a valid HTTPS donation URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("Donation links must use HTTPS.");
  if (!hostMatches(parsed.hostname, providerHosts[input.provider])) {
    throw new Error("The donation link does not match the selected provider.");
  }
}

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Not allowed");
}

async function readGlobalEnabled(supabaseAdmin: any): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "creator_donations_enabled")
    .maybeSingle();
  if (error) throw new Error("Could not read creator donation settings.");
  const value = data?.value as { enabled?: unknown } | null | undefined;
  return value?.enabled === true;
}

async function readUserDonationState(supabaseAdmin: any, userId: string) {
  const [globalEnabled, settingsResult] = await Promise.all([
    readGlobalEnabled(supabaseAdmin),
    supabaseAdmin
      .from("user_donation_settings" as never)
      .select("admin_override,user_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (settingsResult.error) throw new Error("Could not read creator donation access.");
  const settings = settingsResult.data as unknown as {
    admin_override: DonationAccessOverride;
    user_enabled: boolean;
  } | null;

  const adminOverride = settings?.admin_override ?? "inherit";
  const userEnabled = settings?.user_enabled ?? false;
  const effectiveAccess =
    adminOverride === "enabled" ||
    (adminOverride === "inherit" && globalEnabled);

  return { globalEnabled, adminOverride, userEnabled, effectiveAccess };
}

async function readMethods(supabaseAdmin: any, userId: string): Promise<DonationMethod[]> {
  const { data, error } = await supabaseAdmin
    .from("user_donation_methods" as never)
    .select("id,provider,custom_label,value,is_enabled,sort_order,privacy_acknowledged")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("Could not read donation methods.");
  return ((data ?? []) as unknown as Array<{
    id: string;
    provider: DonationProvider;
    custom_label: string | null;
    value: string;
    is_enabled: boolean;
    sort_order: number;
    privacy_acknowledged: boolean;
  }>).map((row) => ({
    id: row.id,
    provider: row.provider,
    customLabel: row.custom_label,
    value: row.value,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
    privacyAcknowledged: row.privacy_acknowledged,
  }));
}

export const getMyDonationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [state, methods] = await Promise.all([
      readUserDonationState(supabaseAdmin, context.userId),
      readMethods(supabaseAdmin, context.userId),
    ]);
    return { ...state, methods };
  });

export const saveMyDonationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveDonationSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = await readUserDonationState(supabaseAdmin, context.userId);
    if (!state.effectiveAccess) throw new Error("Creator donations are not enabled for this account.");

    const sortOrders = new Set<number>();
    for (const method of data.methods) {
      if (sortOrders.has(method.sortOrder)) throw new Error("Donation method order must be unique.");
      sortOrders.add(method.sortOrder);
      validateMethod(method);
    }
    if (data.userEnabled && !data.methods.some((method) => method.isEnabled)) {
      throw new Error("Enable at least one donation method before turning donations on.");
    }

    const now = new Date().toISOString();
    const { error: settingsError } = await supabaseAdmin
      .from("user_donation_settings" as never)
      .upsert({
        user_id: context.userId,
        user_enabled: data.userEnabled,
        updated_at: now,
      } as never, { onConflict: "user_id" });
    if (settingsError) throw new Error("Could not save donation preferences.");

    if (data.methods.length > 0) {
      const rows = data.methods.map((method) => ({
        user_id: context.userId,
        provider: method.provider,
        custom_label: method.provider === "custom" ? method.customLabel?.trim() || null : null,
        value: method.value.trim(),
        is_enabled: method.isEnabled,
        sort_order: method.sortOrder,
        privacy_acknowledged: method.provider === "custom" ? method.privacyAcknowledged : false,
        updated_at: now,
      }));
      const { error: upsertError } = await supabaseAdmin
        .from("user_donation_methods" as never)
        .upsert(rows as never, { onConflict: "user_id,sort_order" });
      if (upsertError) throw new Error("Could not save donation methods.");

      const keep = data.methods.map((method) => method.sortOrder);
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("user_donation_methods" as never)
        .select("id,sort_order")
        .eq("user_id", context.userId);
      if (existingError) throw new Error("Could not finalize donation methods.");
      const removeIds = ((existing ?? []) as unknown as Array<{ id: string; sort_order: number }>)
        .filter((row) => !keep.includes(row.sort_order))
        .map((row) => row.id);
      if (removeIds.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from("user_donation_methods" as never)
          .delete()
          .in("id", removeIds);
        if (deleteError) throw new Error("Could not finalize donation methods.");
      }
    } else {
      const { error: deleteError } = await supabaseAdmin
        .from("user_donation_methods" as never)
        .delete()
        .eq("user_id", context.userId);
      if (deleteError) throw new Error("Could not remove donation methods.");
    }

    return { ok: true, ...(await readUserDonationState(supabaseAdmin, context.userId)), methods: await readMethods(supabaseAdmin, context.userId) };
  });

export const getPublicDonationMethods = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = await readUserDonationState(supabaseAdmin, data.userId);
    if (!state.effectiveAccess || !state.userEnabled) return { methods: [] as DonationMethod[] };

    const methods = (await readMethods(supabaseAdmin, data.userId)).filter((method) => method.isEnabled);
    return { methods };
  });

export const getAdminDonationGlobalSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { enabled: await readGlobalEnabled(supabaseAdmin) };
  });

export const setAdminDonationGlobalSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        key: "creator_donations_enabled",
        value: { enabled: data.enabled },
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      }, { onConflict: "key" });
    if (error) throw new Error("Could not update creator donation settings.");
    return { ok: true, enabled: data.enabled };
  });

export const getAdminUserDonationAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return readUserDonationState(supabaseAdmin, data.userId);
  });

export const setAdminUserDonationAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    userId: z.string().uuid(),
    override: overrideSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_donation_settings" as never)
      .upsert({
        user_id: data.userId,
        admin_override: data.override,
        admin_updated_by: context.userId,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: "user_id" });
    if (error) throw new Error("Could not update creator donation access.");
    return { ok: true, ...(await readUserDonationState(supabaseAdmin, data.userId)) };
  });
