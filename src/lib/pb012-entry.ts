import { postAuthDestination, type AuthNextIntent } from "@/lib/auth-continuation";
import {
  resolveDefaultEntry,
  type DestinationValidation,
} from "@/lib/pb012-starting-screen.functions";
import { pb012RouteFor, type Pb012Route } from "@/lib/pb012-starting-screen.shared";

export function isPb012DefaultDocumentEntry(
  path: string,
  search: string,
  navigationType: string | undefined,
  hash = "",
) {
  return path === "/" && search === "" && hash === "" && navigationType === "navigate";
}

// Bounded failure is Home, never an unchecked URL or a cached cross-account destination.
export async function resolvePb012EntryRoute(
  next?: AuthNextIntent,
  resolve: () => Promise<DestinationValidation> = resolveDefaultEntry,
): Promise<Pb012Route> {
  if (next) return { to: postAuthDestination(next) };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      resolve(),
      new Promise<null>((done) => {
        timer = setTimeout(() => done(null), 5000);
      }),
    ]);
    return result?.status === "valid" ? pb012RouteFor(result.destination) : { to: "/" };
  } catch {
    return { to: "/" };
  } finally {
    clearTimeout(timer);
  }
}
