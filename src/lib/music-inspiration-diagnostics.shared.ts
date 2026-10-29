import { z } from "zod";
export const inspirationStageSchema = z.enum([
  "admission",
  "claim",
  "authorization",
  "sources",
  "planner_request",
  "planner_parse",
  "planner_schema",
  "planner_persist",
  "search_request",
  "search_response",
  "search_parse",
  "search_schema",
  "search_persist",
  "ai_request",
  "ai_parse",
  "ai_schema",
  "ai_evidence",
  "usage_persist",
  "result_persist",
  "recovery",
  "job_persist",
]);
const codeSchema = z.enum([
  "http",
  "network",
  "timeout",
  "cancelled",
  "configuration",
  "empty_body",
  "too_large",
  "invalid_json",
  "invalid_schema",
  "incomplete",
  "request_mismatch",
  "evidence_mismatch",
  "database",
  "no_evidence",
  "unknown_outcome",
  "unexpected",
]);
const fieldSchema = z.enum([
  "root",
  "results",
  "usage",
  "request_id",
  "request.kind",
  "request.depth",
  "request.artist",
  "request.song",
  "request.description",
  "provider",
  "model",
  "request",
  "sources",
  "evidence",
  "proposal",
  "proposal.blueprint",
  "proposal.songStructure",
  "version",
  "researchPromptVersion",
  "unresolvedQuestions",
]);
export const inspirationDiagnosticSchema = z
  .object({
    stage: inspirationStageSchema,
    code: codeSchema,
    httpStatus: z.number().int().min(100).max(599).optional(),
    dbCode: z
      .string()
      .regex(/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/)
      .optional(),
    field: fieldSchema.optional(),
  })
  .strict();
export type InspirationDiagnostic = z.infer<typeof inspirationDiagnosticSchema>;
export type InspirationStage = InspirationDiagnostic["stage"];
export class InspirationFailure extends Error {
  readonly diagnostic: InspirationDiagnostic;
  constructor(diagnostic: InspirationDiagnostic, message: string = diagnostic.code) {
    super(message);
    this.name = "InspirationFailure";
    this.diagnostic = inspirationDiagnosticSchema.parse(diagnostic);
  }
}
/** Only controlled enums/numeric statuses enter persistent diagnostics. Never copy messages or bodies. */
export function inspirationDiagnostic(
  error: unknown,
  stage: InspirationStage,
): InspirationDiagnostic {
  if (error instanceof InspirationFailure) return error.diagnostic;
  const e = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  if (e["name"] === "TimeoutError") return { stage, code: "timeout" };
  if (e["name"] === "AbortError") return { stage, code: "cancelled" };
  const status = e["httpStatus"] ?? e["status"];
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599)
    return { stage, code: "http", httpStatus: status };
  if (typeof e["code"] === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(e["code"]))
    return { stage, code: "database", dbCode: e["code"] };
  if (error instanceof SyntaxError) return { stage, code: "invalid_json" };
  if (error instanceof z.ZodError) {
    const path = error.issues[0]?.path ?? [];
    const nested = fieldSchema.safeParse(path.slice(0, 2).join("."));
    const key = nested.success ? nested.data : path[0];
    const f = fieldSchema.safeParse(key);
    return { stage, code: "invalid_schema", field: f.success ? f.data : "root" };
  }
  if (
    error instanceof TypeError &&
    (stage === "search_request" || stage === "ai_request" || stage === "planner_request")
  )
    return { stage, code: "network" };
  return { stage, code: "unexpected" };
}
export function encodeInspirationDiagnostic(raw: InspirationDiagnostic): string {
  const d = inspirationDiagnosticSchema.parse(raw);
  return ["mi1", d.stage, d.code, d.httpStatus ?? "", d.dbCode ?? "", d.field ?? ""].join("|");
}
export function decodeInspirationDiagnostic(raw: unknown): InspirationDiagnostic | null {
  if (typeof raw !== "string" || raw.length > 160) return null;
  const [v, stage, code, http, dbCode, field, ...extra] = raw.split("|");
  if (
    v !== "mi1" ||
    extra.length ||
    http === undefined ||
    dbCode === undefined ||
    field === undefined
  )
    return null;
  const r = inspirationDiagnosticSchema.safeParse({
    stage,
    code,
    ...(http ? { httpStatus: Number(http) } : {}),
    ...(dbCode ? { dbCode } : {}),
    ...(field ? { field } : {}),
  });
  return r.success ? r.data : null;
}
export function logInspirationFailure(jobId: string, diagnostic: InspirationDiagnostic) {
  console.warn("[music-inspiration] failure", {
    jobId,
    ...inspirationDiagnosticSchema.parse(diagnostic),
  });
}
