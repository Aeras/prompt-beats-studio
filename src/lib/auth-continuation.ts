export type AuthNextIntent = "create";

export type NextIntentSearch = {
  next?: AuthNextIntent;
};

export type AuthRouteSearch = NextIntentSearch & {
  reset?: "1";
};

export function parseAuthNextIntent(value: unknown): AuthNextIntent | undefined {
  return value === "create" ? "create" : undefined;
}

export function validateNextIntentSearch(search: Record<string, unknown>): NextIntentSearch {
  const next = parseAuthNextIntent(search["next"]);
  return next ? { next } : {};
}

export function validateAuthRouteSearch(search: Record<string, unknown>): AuthRouteSearch {
  const nextSearch = validateNextIntentSearch(search);
  const reset = search["reset"] === "1" ? "1" : undefined;
  return {
    ...nextSearch,
    ...(reset ? { reset } : {}),
  };
}

export function postAuthDestination(next: AuthNextIntent | undefined): "/create" | "/" {
  return next === "create" ? "/create" : "/";
}

export function authCallbackUrl(origin: string, next: AuthNextIntent | undefined) {
  return next === "create" ? `${origin}/auth?next=create` : origin;
}
