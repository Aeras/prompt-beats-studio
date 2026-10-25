export type BetaFeatureDefinition = {
  key: string;
  name: string;
  description: string;
  registrationMigration: string;
  entrypoints: { path: string; kind: "client" | "server" | "sql" }[];
};

/** Explicit new product features only; never backfill the 19 legacy keys.
 * The Super Admin control plane is infrastructure, not a seed product feature.
 * Keep empty until a real feature is implemented. See the development guide.
 */
export const BETA_FEATURES = [] as const satisfies readonly BetaFeatureDefinition[];
export type BetaFeatureKey = (typeof BETA_FEATURES)[number]["key"];
export function isBetaFeatureKey(key: string): key is BetaFeatureKey {
  return (BETA_FEATURES as readonly BetaFeatureDefinition[]).some((feature) => feature.key === key);
}
