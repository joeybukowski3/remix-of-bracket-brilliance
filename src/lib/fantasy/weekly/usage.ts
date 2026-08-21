export type WeeklyFantasyUsage = {
  offensiveSnaps: number | null;
  snapShare: number | null;
  passAttempts: number | null;
  completions: number | null;
  rushAttempts: number | null;
  targets: number | null;
  receptions: number | null;
  receivingAirYards: number | null;
  targetShare: number | null;
  airYardsShare: number | null;
  routes: null;
  routeParticipation: null;
  redZoneTouches: null;
  goalLineTouches: null;
  redZoneTargets: null;
};

export type WeeklyUsageSource = Partial<Record<
  "offensiveSnaps" | "snapShare" | "passAttempts" | "completions" | "rushAttempts" |
  "targets" | "receptions" | "receivingAirYards" | "targetShare" | "airYardsShare",
  number | null | undefined
>>;

function optionalCount(value: number | null | undefined, field: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be finite and non-negative.`);
  return value;
}

function optionalSignedValue(value: number | null | undefined, field: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite.`);
  return value;
}

function optionalShare(value: number | null | undefined, field: string): number | null {
  const normalized = optionalCount(value, field);
  if (normalized != null && normalized > 1) throw new Error(`${field} must be between 0 and 1.`);
  return normalized;
}

export function normalizeWeeklyUsage(source: WeeklyUsageSource): WeeklyFantasyUsage {
  return {
    offensiveSnaps: optionalCount(source.offensiveSnaps, "offensiveSnaps"),
    snapShare: optionalShare(source.snapShare, "snapShare"),
    passAttempts: optionalCount(source.passAttempts, "passAttempts"),
    completions: optionalCount(source.completions, "completions"),
    rushAttempts: optionalCount(source.rushAttempts, "rushAttempts"),
    targets: optionalCount(source.targets, "targets"),
    receptions: optionalCount(source.receptions, "receptions"),
    receivingAirYards: optionalSignedValue(source.receivingAirYards, "receivingAirYards"),
    targetShare: optionalShare(source.targetShare, "targetShare"),
    airYardsShare: optionalSignedValue(source.airYardsShare, "airYardsShare"),
    routes: null,
    routeParticipation: null,
    redZoneTouches: null,
    goalLineTouches: null,
    redZoneTargets: null,
  };
}
