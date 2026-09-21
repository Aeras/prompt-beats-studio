import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const migration = "supabase/migrations/20260921143000_moderation_cases_appeals_v1.sql";
const serverFns = "src/lib/moderation-cases.functions.ts";
const threadUi = "src/components/promptbeats/ModerationCaseThread.tsx";
const centerUi = "src/components/promptbeats/ModerationCaseCenter.tsx";
const reportsUi = "src/components/promptbeats/ReportsManagementPanel.tsx";
const shell = "src/components/promptbeats/AppShell.tsx";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Moderation Cases / Messages / Appeals V1", () => {
  test("extends the existing report system and creates a case only on Take Case", async () => {
    const sql = await source(migration);
    expect(sql).toContain("report_id uuid NOT NULL UNIQUE REFERENCES public.content_reports");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.take_moderation_case");
    expect(sql).toContain("INSERT INTO public.moderation_cases");
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS public.reports");
  });

  test("keeps creator messages, internal notes, system events, appeals and per-user reads separate", async () => {
    const sql = await source(migration);
    for (const table of [
      "moderation_case_messages",
      "moderation_case_notes",
      "moderation_case_events",
      "moderation_case_appeals",
      "moderation_case_reads",
    ]) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    expect(sql).toContain("PRIMARY KEY(case_id,user_id)");
  });

  test("case assignment is race-safe and handler-only writing is server enforced", async () => {
    const sql = await source(migration);
    expect(sql).toContain("SELECT * INTO v_report FROM public.content_reports WHERE id=_report_id FOR UPDATE");
    expect(sql).toContain("report_id uuid NOT NULL UNIQUE");
    expect(sql).toContain("v_case.assigned_to=v_actor OR v_actor_role='super_admin'");
    expect(sql).toContain("v_case.assigned_to<>v_actor AND v_actor_role<>'super_admin'");
  });

  test("reporter identity remains Admin-level only", async () => {
    const sql = await source(migration);
    expect(sql).toContain("v_admin_level:=public.current_user_is_admin_level()");
    expect(sql).toContain("'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END");
    expect(sql).toContain("'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END");
  });

  test("initial Admin handler cannot self-approve and appeal final approval is Super Admin only", async () => {
    const sql = await source(migration);
    expect(sql).toContain("RAISE EXCEPTION 'admin handlers cannot self-approve'");
    expect(sql).toContain("RAISE EXCEPTION 'admin proposers cannot self-approve'");
    expect(sql).toContain("NOT public.current_user_is_super_admin()");
    expect(sql).toContain("pending_super_admin_approval");
    expect(sql).toContain("FINALIZE_CASE_APPEAL");
  });

  test("creator conversation locks after initial decision and appeal is one-per-case", async () => {
    const sql = await source(migration);
    expect(sql).toContain("v_case.status NOT IN ('open','awaiting_creator_response','under_review','awaiting_admin_decision')");
    expect(sql).toContain("case_id uuid NOT NULL UNIQUE REFERENCES public.moderation_cases");
    expect(sql).toContain("appeal already submitted");
  });

  test("direct table access is denied and public mutations go through SECURITY DEFINER RPCs", async () => {
    const sql = await source(migration);
    for (const table of [
      "moderation_cases",
      "moderation_case_messages",
      "moderation_case_notes",
      "moderation_case_events",
      "moderation_case_reads",
      "moderation_case_appeals",
    ]) expect(sql).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC,anon,authenticated`);
    expect(sql.match(/SECURITY DEFINER/g)?.length ?? 0).toBeGreaterThanOrEqual(15);
  });

  test("case actions are included in the existing admin audit contract", async () => {
    const sql = await source(migration);
    for (const action of [
      "TAKE_MODERATION_CASE",
      "REASSIGN_MODERATION_CASE",
      "ADD_CASE_INTERNAL_NOTE",
      "PROPOSE_INITIAL_CASE_DECISION",
      "APPROVE_INITIAL_CASE_DECISION",
      "PROPOSE_CASE_APPEAL_DECISION",
      "FINALIZE_CASE_APPEAL",
      "REOPEN_MODERATION_CASE",
    ]) expect(sql).toContain(`'${action}'`);
  });

  test("creator and staff UI use the canonical case RPC wrapper", async () => {
    const [fns, thread, center, reports, appShell] = await Promise.all([
      source(serverFns), source(threadUi), source(centerUi), source(reportsUi), source(shell),
    ]);
    for (const rpc of [
      "take_moderation_case",
      "send_moderation_case_message",
      "submit_moderation_case_appeal",
      "approve_initial_case_decision",
      "propose_moderation_case_appeal_decision",
      "finalize_moderation_case_appeal",
    ]) expect(fns).toContain(`rpc("${rpc}"`);
    expect(thread).toContain("PromptBeats Moderation");
    expect(thread).toContain("can_approve_initial");
    expect(thread).toContain("can_finalize_appeal");
    expect(center).toContain("listMyModerationCases");
    expect(center).not.toContain("New Message");
    expect(reports).toContain("takeModerationCase");
    expect(reports).toContain("<ModerationCaseThread");
    expect(appShell).toContain("<ModerationCaseCenter");
  });
});
