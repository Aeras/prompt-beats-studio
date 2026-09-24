export type AiHealthDiagnosticSeverity = "warning" | "failure";

export type AiHealthDiagnostic = {
  severity: AiHealthDiagnosticSeverity;
  code: string;
  messageEl: string;
  messageEn: string;
  technical: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

export function getAiHealthDiagnostic(
  lastErrorCode: string | null | undefined,
): AiHealthDiagnostic | null {
  const raw = (lastErrorCode ?? "").trim();
  if (!raw) return null;
  const value = normalize(raw);

  if (
    hasAny(value, [
      '"code":503',
      "code 503",
      "status 503",
      "http 503",
      "high demand",
      "service unavailable",
      '"status":"unavailable"',
      "temporarily overloaded",
      "overloaded",
    ])
  ) {
    return {
      severity: "warning",
      code: "high_demand",
      messageEl: "Προσωρινά αυξημένη ζήτηση στο μοντέλο. Δοκιμάστε ξανά αργότερα.",
      messageEn: "The model is temporarily under high demand. Try again later.",
      technical: "503 · high_demand",
    };
  }

  if (
    hasAny(value, [
      '"code":429',
      "code 429",
      "status 429",
      "http 429",
      "rate limit",
      "rate_limit",
      "too many requests",
      "resource exhausted",
      "resource_exhausted",
      "quota exceeded",
    ])
  ) {
    return {
      severity: "warning",
      code: "rate_limit",
      messageEl: "Έχει επιτευχθεί προσωρινό όριο αιτημάτων ή quota του παρόχου.",
      messageEn: "The provider has temporarily reached a request or quota limit.",
      technical: "429 · rate_limit",
    };
  }

  if (
    value === "runtime_probe_timeout" ||
    hasAny(value, ["timeout", "timed out", "aborterror", "deadline exceeded"])
  ) {
    return {
      severity: "warning",
      code: "timeout",
      messageEl: "Ο πάροχος δεν απάντησε μέσα στο χρονικό όριο του ελέγχου.",
      messageEn: "The provider did not respond within the health-check timeout.",
      technical: "timeout",
    };
  }

  if (
    hasAny(value, [
      "fetch failed",
      "network error",
      "networkerror",
      "econnreset",
      "econnrefused",
      "socket hang up",
      "connection reset",
      "connection refused",
    ])
  ) {
    return {
      severity: "warning",
      code: "network",
      messageEl: "Προσωρινό πρόβλημα δικτύου κατά την επικοινωνία με τον πάροχο.",
      messageEn: "A temporary network problem occurred while contacting the provider.",
      technical: "network_error",
    };
  }

  if (value === "provider_discovery_unavailable") {
    return {
      severity: "warning",
      code: "provider_discovery_unavailable",
      messageEl: "Δεν ήταν διαθέσιμη η λίστα μοντέλων του παρόχου κατά τον έλεγχο.",
      messageEn: "The provider model list was unavailable during the check.",
      technical: "provider_discovery_unavailable",
    };
  }

  if (value === "not_listed_by_provider") {
    return {
      severity: "warning",
      code: "not_listed_by_provider",
      messageEl: "Το runtime test πέρασε, αλλά το μοντέλο δεν εμφανίστηκε στη λίστα του παρόχου.",
      messageEn: "The runtime test passed, but the model was not listed by the provider.",
      technical: "not_listed_by_provider",
    };
  }

  if (value === "incomplete_runtime_response") {
    return {
      severity: "failure",
      code: "incomplete_runtime_response",
      messageEl: "Η απάντηση του μοντέλου ήταν ελλιπής και δεν ολοκλήρωσε σωστά το runtime probe.",
      messageEn: "The model response was incomplete and did not complete the runtime probe correctly.",
      technical: "incomplete_runtime_response",
    };
  }

  if (value === "empty_runtime_response") {
    return {
      severity: "failure",
      code: "empty_runtime_response",
      messageEl: "Το μοντέλο απάντησε χωρίς περιεχόμενο στο runtime probe.",
      messageEn: "The model returned an empty response to the runtime probe.",
      technical: "empty_runtime_response",
    };
  }

  if (value === "invalid_runtime_probe_json" || value === "invalid_runtime_probe_payload") {
    return {
      severity: "failure",
      code: value,
      messageEl: "Το μοντέλο απάντησε, αλλά η απάντηση δεν είχε την έγκυρη μορφή που απαιτεί ο έλεγχος.",
      messageEn: "The model responded, but the response did not match the valid health-check format.",
      technical: value,
    };
  }

  if (value === "unsupported_provider") {
    return {
      severity: "failure",
      code: "unsupported_provider",
      messageEl: "Ο πάροχος δεν υποστηρίζεται από το τρέχον health-check pipeline.",
      messageEn: "The provider is not supported by the current health-check pipeline.",
      technical: "unsupported_provider",
    };
  }

  if (
    hasAny(value, [
      '"code":401',
      '"code":403',
      "unauthorized",
      "forbidden",
      "authentication",
      "invalid api key",
      "invalid_api_key",
      "api key not valid",
      "permission denied",
    ])
  ) {
    return {
      severity: "failure",
      code: "authentication",
      messageEl: "Αποτυχία αυθεντικοποίησης ή δικαιωμάτων προς τον πάροχο AI.",
      messageEn: "Authentication or provider permission failed.",
      technical: "401/403 · authentication",
    };
  }

  if (
    hasAny(value, [
      '"code":404',
      "model not found",
      "model_not_found",
      "unknown model",
      "unsupported model",
      "does not exist",
    ])
  ) {
    return {
      severity: "failure",
      code: "model_unavailable",
      messageEl: "Το μοντέλο δεν βρέθηκε ή δεν είναι διαθέσιμο στον συγκεκριμένο πάροχο/API λογαριασμό.",
      messageEn: "The model was not found or is unavailable to the connected provider/API account.",
      technical: "404 · model_unavailable",
    };
  }

  if (
    hasAny(value, [
      '"code":400',
      "invalid argument",
      "invalid_argument",
      "bad request",
      "invalid request",
      "invalid_request",
      "schema",
    ])
  ) {
    return {
      severity: "failure",
      code: "invalid_request",
      messageEl: "Ο πάροχος απέρριψε το αίτημα του health check ως μη έγκυρο.",
      messageEn: "The provider rejected the health-check request as invalid.",
      technical: "400 · invalid_request",
    };
  }

  return {
    severity: "failure",
    code: "provider_error",
    messageEl: "Ο πάροχος επέστρεψε σφάλμα που δεν έχει ακόμη ειδική κατηγοριοποίηση.",
    messageEn: "The provider returned an error that does not yet have a dedicated category.",
    technical: "provider_error",
  };
}

export function displayAiHealthStatus<T extends "healthy" | "degraded" | "failing" | "unknown">(
  storedStatus: T,
  lastErrorCode: string | null | undefined,
): T | "degraded" {
  const diagnostic = getAiHealthDiagnostic(lastErrorCode);
  if (diagnostic?.severity === "warning" && storedStatus === "failing") return "degraded";
  return storedStatus;
}
