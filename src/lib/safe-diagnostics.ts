/** Only fixed diagnostic categories may cross a logging boundary. Error names,
 * messages, causes and provider bodies are untrusted, even when short. */
export function safeErrorType(error: unknown): string {
  try {
    const name = error && typeof error === "object" && "name" in error ? error.name : null;
    return typeof name === "string" &&
      [
        "Error",
        "TypeError",
        "SyntaxError",
        "RangeError",
        "AbortError",
        "TimeoutError",
        "ZodError",
        "AggregateError",
      ].includes(name)
      ? name
      : "unknown";
  } catch {
    return "unknown";
  }
}

export function safeProviderCode(value: unknown): string | null {
  return typeof value === "string" &&
    [
      "invalid_request_error",
      "authentication_error",
      "permission_error",
      "not_found_error",
      "request_too_large",
      "rate_limit_error",
      "api_error",
      "overloaded_error",
      "billing_error",
      "INVALID_ARGUMENT",
      "UNAUTHENTICATED",
      "PERMISSION_DENIED",
      "NOT_FOUND",
      "RESOURCE_EXHAUSTED",
      "FAILED_PRECONDITION",
      "ABORTED",
      "OUT_OF_RANGE",
      "UNIMPLEMENTED",
      "INTERNAL",
      "UNAVAILABLE",
      "DATA_LOSS",
      "DEADLINE_EXCEEDED",
      "CANCELLED",
      "UNKNOWN",
    ].includes(value)
    ? value
    : null;
}

export function safeStopReason(value: unknown): string {
  return typeof value === "string" &&
    [
      "end_turn",
      "max_tokens",
      "stop_sequence",
      "tool_use",
      "pause_turn",
      "refusal",
      "stop",
      "length",
      "tool_calls",
      "content_filter",
      "completed",
      "incomplete",
      "failed",
      "cancelled",
      "STOP",
      "MAX_TOKENS",
      "SAFETY",
      "RECITATION",
      "OTHER",
    ].includes(value)
    ? value
    : "unknown";
}

const diagnosticFields = new Set([
  "title",
  "tags",
  "lyrics",
  "note",
  "passed",
  "score",
  "issues",
  "languageIssues",
  "grammarIssues",
  "singabilityIssues",
  "genreIssues",
  "consistencyIssues",
  "corrections",
  "creativeSuggestions",
  "vocalSuggestions",
  "productionSuggestions",
  "field",
  "sectionLabel",
  "originalText",
  "occurrenceIndex",
  "reason",
  "replacementText",
  "explanation",
  "actionType",
  "value",
  "arrangement",
  "sectionOccurrenceIndex",
  "tag",
  "result",
  "quality",
  "report",
  "qualityCheck",
  "quality_check",
  "data",
]);
export function safeDiagnosticKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => diagnosticFields.has(key));
}
export function safeIssuePath(path: readonly PropertyKey[]): string {
  return (
    path
      .map((part) =>
        typeof part === "number"
          ? "#"
          : typeof part === "string" && diagnosticFields.has(part)
            ? part
            : "?",
      )
      .join(".") || "<root>"
  );
}
