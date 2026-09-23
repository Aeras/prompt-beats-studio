import { createClientOnlyFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { ContentReport, ReportScope } from "@/lib/content-reports.functions";

type RpcResult<T> = {
  data: T;
  error: { message: string } | null;
};

async function withTimeout<T>(promise: PromiseLike<T>, ms = 15000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Report request timed out.")), ms);
    }),
  ]);
}

export const listContentReportsClient = createClientOnlyFn(
  async (scope: ReportScope): Promise<ContentReport[]> => {
    const result: RpcResult<unknown> = await withTimeout<RpcResult<unknown>>(
      (supabase as any).rpc("list_content_reports", { _scope: scope }) as PromiseLike<RpcResult<unknown>>,
    );
    const { data, error } = result;
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []) as ContentReport[];
  },
);

export const getContentReportClient = createClientOnlyFn(
  async (reportId: string): Promise<ContentReport> => {
    const result: RpcResult<unknown> = await withTimeout<RpcResult<unknown>>(
      (supabase as any).rpc("get_content_report", { _report_id: reportId }) as PromiseLike<RpcResult<unknown>>,
    );
    const { data, error } = result;
    if (error) throw new Error(error.message);
    return data as ContentReport;
  },
);
