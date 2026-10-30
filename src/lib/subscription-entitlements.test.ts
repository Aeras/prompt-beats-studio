import { describe, expect, test } from "bun:test";

import {
  addCalendarMonthsInTimeZone,
  manualGrantExpiryFromPreset,
} from "@/lib/subscription-entitlements.shared";

describe("PB-015 subscription entitlements", () => {
  test("calendar-month presets preserve Athens wall-clock and clamp month end", () => {
    const start = new Date("2026-01-31T12:00:00.000Z"); // 14:00 Europe/Athens.
    expect(addCalendarMonthsInTimeZone(start, 1, "Europe/Athens").toISOString()).toBe(
      "2026-02-28T12:00:00.000Z",
    );
    expect(addCalendarMonthsInTimeZone(start, 2, "Europe/Athens").toISOString()).toBe(
      "2026-03-31T11:00:00.000Z",
    );
  });

  test("month presets follow DST instead of treating a month as 30 days", () => {
    const start = new Date("2026-02-28T12:00:00.000Z"); // 14:00 Europe/Athens.
    expect(addCalendarMonthsInTimeZone(start, 2, "Europe/Athens").toISOString()).toBe(
      "2026-04-28T11:00:00.000Z",
    );
  });

  test("seven days is exact duration and Never has no expiry", () => {
    const start = new Date("2026-03-27T12:00:00.000Z");
    expect(manualGrantExpiryFromPreset(start, "7_days", "Europe/Athens")?.getTime()).toBe(
      start.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(manualGrantExpiryFromPreset(start, "never", "Europe/Athens")).toBeNull();
  });

  test("custom duration requires explicit exact date/time", () => {
    expect(() => manualGrantExpiryFromPreset(new Date(), "custom", "Europe/Athens")).toThrow(
      "explicit date/time",
    );
  });

  test("migration keeps Stripe/manual sources separate and paid modes opt-in", async () => {
    const sql = await Bun.file(
      "supabase/migrations/20261030081500_pb_015_subscription_entitlements.sql",
    ).text();
    expect(sql).toContain("CREATE TABLE public.subscription_manual_grants");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain("effective_subscription_plan(_user_id uuid)");
    expect(sql).toContain("'plus_or_pro','pro_only'");
    expect(sql).not.toContain("UPDATE public.feature_access_policies\n  SET access_mode='");
    expect(sql).not.toContain("UPDATE public.subscriptions\n");
    expect(sql).toContain("admit_feature_ai_dispatch_internal");
  });

  test("plan-aware Feature Access is independent from old role/selection branches", async () => {
    const sql = await Bun.file(
      "supabase/migrations/20261030081500_pb_015_subscription_entitlements.sql",
    ).text();
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.can_use_feature");
    const block = sql.slice(start, sql.indexOf("CREATE OR REPLACE FUNCTION public.feature_access_set_policy", start));
    expect(block.indexOf("v_mode = 'admins_only'")).toBeLessThan(block.indexOf("v_mode IN ('plus_or_pro','pro_only')"));
    expect(block.indexOf("v_mode = 'selected_users'")).toBeLessThan(block.indexOf("v_mode IN ('plus_or_pro','pro_only')"));
    expect(block).toContain("v_plan_rank := public.effective_subscription_plan_rank(_user_id)");
  });

  test("server contracts delegate effective plan to canonical DB RPC", async () => {
    const code = await Bun.file("src/lib/subscription-entitlements.functions.ts").text();
    expect(code).toContain('supabase.rpc("current_user_effective_plan")');
    expect(code).toContain('"subscription_entitlement_detail"');
    expect(code).toContain('"subscription_manual_grant_create"');
    expect(code).toContain('"subscription_manual_grant_revoke"');
  });
});
