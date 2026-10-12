export type RoleTier = "bench" | "rotation" | "core";

/** Pregame role from expected minutes (the source has no starter flag). */
export function roleTier(expectedMinutes: number): RoleTier {
  if (expectedMinutes < 15) return "bench";
  if (expectedMinutes < 28) return "rotation";
  return "core";
}
