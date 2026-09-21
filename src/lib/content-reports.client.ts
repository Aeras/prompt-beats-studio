import { supabase } from "@/integrations/supabase/client";
import type { ContentReport, ReportScope } from "@/lib/content-reports.functions";

async function withTimeout<T>(promise: PromiseLike<T>, ms = 15000): Promise<T> {
  return await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Report request timed out.")), ms);
      if (typeof (timer as any)?.unref === "function") (timer as any).unref();
    }),
  ]);
}

export async function listContentReportsClient(scope: ReportScope) {
  const { data, error } = await withTimeout(
    (supabase as any).rpc("list_content_reports", { _scope: scope }),
  );
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as ContentReport[];
}

export async function getContentReportClient(reportId: string) {
  const { data, error } = await withTimeout(
    (supabase as any).rpc("get_content_report", { _report_id: reportId }),
  );
  if (error) throw new Error(error.message);
  return data as ContentReport;
}
