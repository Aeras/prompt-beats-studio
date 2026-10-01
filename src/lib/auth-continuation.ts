export type AuthNextIntent = "create";

export type AuthRouteSearch = {
  next?: AuthNextIntent;
  reset?: "1";
};

export function parseAuthNextIntent(value: unknown): AuthNextIntent | undefined {
  return value === "create" ? "create" : undefined;
}

export function validateAuthRouteSearch(search: Record<string, unknown>): AuthRouteSearch {
  const next = parseAuthNextIntent(search["next"]);
  const reset = search["reset"] === "1" ? "1" : undefined;
  return {
    ...(next ? { next } : {}),
    ...(reset ? { reset } : {}),
  };
}

export function postAuthDestination(next: AuthNextIntent | undefined): "/create" | "/" {
  return next === "create" ? "/create" : "/";
}

export function authCallbackUrl(origin: string, next: AuthNextIntent | undefined) {
  return next === "create" ? `${origin}/auth?next=create` : origin;
}
