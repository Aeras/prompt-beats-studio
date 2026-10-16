import type { HomeResumeItem, HomeResumeResult, HomeResumeType } from "./home-resume.shared";

export type HomeCreatorState =
  | { kind: "auth-loading" }
  | { kind: "resume-loading" }
  | { kind: "available"; items: HomeResumeItem[] }
  | { kind: "degraded"; items: HomeResumeItem[]; failedSources: HomeResumeType[] }
  | { kind: "verified-empty" }
  | { kind: "unavailable"; failedSources?: HomeResumeType[]; queryError?: unknown };

export function resolveHomeCreatorState(input: {
  authLoading: boolean;
  resumeLoading: boolean;
  data?: HomeResumeResult | undefined;
  queryError?: unknown;
}): HomeCreatorState {
  if (input.authLoading) return { kind: "auth-loading" };
  if (input.resumeLoading) return { kind: "resume-loading" };
  if (input.queryError || !input.data) {
    return { kind: "unavailable", queryError: input.queryError };
  }

  const { items, failedSources } = input.data;
  if (items.length > 0 && failedSources.length > 0) {
    return { kind: "degraded", items, failedSources };
  }
  if (items.length > 0) return { kind: "available", items };
  if (failedSources.length > 0) return { kind: "unavailable", failedSources };
  return { kind: "verified-empty" };
}
