/** Comparison policy only. Never changes Current Rating's independently owned curve. */
export type ProjectionBlendWeights = Readonly<{ projectionWeight: number; observedWeight: number }>;
export type ProjectionBlendPolicy = Readonly<{
  version: string;
  projectionWeights: readonly number[];
  families?: Readonly<Record<string, readonly number[]>>;
}>;

export const PROJECTION_BLEND_POLICY: ProjectionBlendPolicy = Object.freeze({
  version: "nfl-comparison-blend-v1",
  projectionWeights: Object.freeze([1, .8, .6, .4, .2, 0]),
});

export function getProjectionBlendWeights(
  completedGames: number,
  family?: string,
  policy: ProjectionBlendPolicy = PROJECTION_BLEND_POLICY,
): ProjectionBlendWeights {
  if (!Number.isInteger(completedGames) || completedGames < 0) throw new Error("Invalid completed-game count");
  const curve = (family && policy.families?.[family]) || policy.projectionWeights;
  if (!curve.length || curve[0] !== 1 || curve.at(-1) !== 0 ||
      curve.some((weight, i) => !Number.isFinite(weight) || weight < 0 || weight > 1 || (i > 0 && weight > curve[i - 1]))) {
    throw new Error("Invalid projection fade curve");
  }
  const projectionWeight = curve[Math.min(completedGames, curve.length - 1)];
  return { projectionWeight, observedWeight: Number((1 - projectionWeight).toFixed(12)) };
}

export function projectionBlendMode(key: string): "generic" | "modelManaged" | "unsupported" {
  if (key === "team.overallRating") return "modelManaged";
  return key.startsWith("team.") ? "unsupported" : "generic";
}

export function projectionBlendFamily(key: string): string {
  if (/epa/i.test(key)) return "epa";
  if (/success/i.test(key)) return "successRate";
  if (/turnover|takeaway/i.test(key)) return "turnovers";
  if (/WinRate/.test(key)) return "trenches";
  return "conventional";
}
