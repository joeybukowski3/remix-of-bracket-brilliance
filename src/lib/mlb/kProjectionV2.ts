export type PitcherHandedness = "L" | "R";

export type KProjectionRecentStart = {
  strikeouts?: number | null;
  inningsPitched?: number | null;
  battersFaced?: number | null;
  pitchCount?: number | null;
};

export type KProjectionOpponentStarterGame = {
  opposingStarterStrikeouts?: number | null;
  opposingStarterInningsPitched?: number | null;
  teamPlateAppearances?: number | null;
  teamTotalStrikeouts?: number | null;
};

export type KProjectionInput = {
  pitcher: {
    /**
     * Rate fields accept decimal form (0 < value <= 1) or percent form
     * (1.5 < value <= 100). Ambiguous values between 1 and 1.5 are rejected.
     */
    seasonKRate?: number | null;
    seasonKPer9?: number | null;
    seasonWhiffRate?: number | null;
    recentKRate?: number | null;
    recentKPer9?: number | null;
    recentWhiffRate?: number | null;
    homeKRate?: number | null;
    awayKRate?: number | null;
    homeWhiffRate?: number | null;
    awayWhiffRate?: number | null;
    handedness?: PitcherHandedness | null;
    projectedInnings?: number | null;
    projectedBattersFaced?: number | null;
    averageBattersFacedPerInning?: number | null;
    pitchCountTrend?: number | null;
    pitcherKScore?: number | null;
    recentStarts?: KProjectionRecentStart[] | null;
  };
  opponent: {
    seasonKRate?: number | null;
    recentKRate?: number | null;
    homeKRate?: number | null;
    awayKRate?: number | null;
    vsLhpKRate?: number | null;
    vsRhpKRate?: number | null;
    seasonWhiffRate?: number | null;
    recentWhiffRate?: number | null;
    homeWhiffRate?: number | null;
    awayWhiffRate?: number | null;
    projectedLineupKRate?: number | null;
    opponentKScore?: number | null;
    matchupRating?: number | null;
    recentVsStarters?: KProjectionOpponentStarterGame[] | null;
  };
  context: {
    pitcherIsHome: boolean;
    leagueAverageKRate?: number | null;
    leagueAverageWhiffRate?: number | null;
  };
};

export type KProjectionComponent = {
  key: string;
  label: string;
  group: "pitcher" | "opponent";
  value: number;
  weight: number;
  normalizedWeight: number;
  contribution: number;
  source: "provided" | "derived" | "fallback";
};

export type KProjectionFallback = {
  field: string;
  reason: string;
  used: number | null;
};

export type KProjectionResult = {
  modelVersion: "mlb-k-projection-v2-shadow";
  projectedStrikeouts: number | null;
  projectedKRate: number | null;
  projectedBattersFaced: number | null;
  projectedInnings: number | null;
  pitcherSkillRate: number | null;
  opponentEnvironmentRate: number | null;
  matchupAdjustment: number | null;
  confidence: "high" | "medium" | "low" | "insufficient";
  components: KProjectionComponent[];
  fallbacks: KProjectionFallback[];
  warnings: string[];
};

type ComponentCandidate = {
  key: string;
  label: string;
  group: KProjectionComponent["group"];
  value: number | null;
  weight: number;
  source: KProjectionComponent["source"];
};

type SanitizeContext = {
  warnings: string[];
};

const MODEL_VERSION = "mlb-k-projection-v2-shadow" as const;
const DEFAULT_LEAGUE_K_RATE = 0.225;
const DEFAULT_LEAGUE_WHIFF_RATE = 0.25;
const DEFAULT_BF_PER_INNING = 4.25;
const MIN_K_RATE = 0.1;
const MAX_K_RATE = 0.4;
const MAX_MATCHUP_ADJUSTMENT = 0.035;

export function projectStrikeoutsV2(input: KProjectionInput): KProjectionResult {
  const fallbacks: KProjectionFallback[] = [];
  const warnings: string[] = [];
  const components: KProjectionComponent[] = [];
  const sanitizeContext = { warnings };

  const leagueKRate =
    readRate(input.context.leagueAverageKRate, "context.leagueAverageKRate", sanitizeContext) ??
    recordFallback(fallbacks, "context.leagueAverageKRate", "missing league average K rate", DEFAULT_LEAGUE_K_RATE);
  const leagueWhiffRate =
    readRate(input.context.leagueAverageWhiffRate, "context.leagueAverageWhiffRate", sanitizeContext) ??
    recordFallback(
      fallbacks,
      "context.leagueAverageWhiffRate",
      "missing league average whiff rate",
      DEFAULT_LEAGUE_WHIFF_RATE,
    );

  const bfPerInning =
    readPositiveNumber(input.pitcher.averageBattersFacedPerInning, "pitcher.averageBattersFacedPerInning", sanitizeContext) ??
    recordFallback(
      fallbacks,
      "pitcher.averageBattersFacedPerInning",
      "missing average batters faced per inning",
      DEFAULT_BF_PER_INNING,
    );

  const recentStartKRate = deriveRecentStartKRate(input.pitcher.recentStarts, sanitizeContext);
  const recentStartKPer9 = deriveRecentStartKPer9(input.pitcher.recentStarts, sanitizeContext);
  const recentStartAverageIp = deriveRecentStartAverageIp(input.pitcher.recentStarts, sanitizeContext);
  const recentStartAverageBf = deriveRecentStartAverageBf(input.pitcher.recentStarts, sanitizeContext);

  const projectedInnings =
    readPositiveNumber(input.pitcher.projectedInnings, "pitcher.projectedInnings", sanitizeContext) ??
    deriveInningsFromBattersFaced(input.pitcher.projectedBattersFaced, bfPerInning, sanitizeContext) ??
    recentStartAverageIp;

  if (projectedInnings == null) {
    pushUnique(warnings, "Projected innings unavailable; projection cannot be produced.");
  }

  const projectedBattersFaced =
    readPositiveNumber(input.pitcher.projectedBattersFaced, "pitcher.projectedBattersFaced", sanitizeContext) ??
    deriveBattersFacedFromInnings(projectedInnings, bfPerInning, fallbacks) ??
    recentStartAverageBf;

  if (projectedBattersFaced == null) {
    pushUnique(warnings, "Projected batters faced unavailable; projection cannot be produced.");
  }

  const seasonKRate = readRate(input.pitcher.seasonKRate, "pitcher.seasonKRate", sanitizeContext);
  const seasonKPer9Rate = kPer9ToKRate(input.pitcher.seasonKPer9, bfPerInning, "pitcher.seasonKPer9", sanitizeContext);
  const seasonSkillRate = blendRates(
    [
      { value: seasonKRate, weight: 0.68 },
      { value: seasonKPer9Rate, weight: 0.32 },
    ],
    null,
    1,
  );

  const directRecentKRate = readRate(input.pitcher.recentKRate, "pitcher.recentKRate", sanitizeContext);
  const directRecentKPer9Rate = kPer9ToKRate(
    input.pitcher.recentKPer9,
    bfPerInning,
    "pitcher.recentKPer9",
    sanitizeContext,
  );
  const recentSkillRaw = blendRates(
    [
      { value: directRecentKRate ?? recentStartKRate, weight: 0.68 },
      { value: directRecentKPer9Rate ?? kPer9ToKRate(recentStartKPer9, bfPerInning, "pitcher.recentStarts.kPer9", sanitizeContext), weight: 0.32 },
    ],
    null,
    1,
  );
  const recentSkillRate = blendRates(
    [
      { value: recentSkillRaw, weight: 0.35 },
      { value: seasonSkillRate ?? leagueKRate, weight: 0.65 },
    ],
    null,
    1,
  );

  const pitcherLocationKRate = input.context.pitcherIsHome
    ? readRate(input.pitcher.homeKRate, "pitcher.homeKRate", sanitizeContext)
    : readRate(input.pitcher.awayKRate, "pitcher.awayKRate", sanitizeContext);
  const pitcherLocationWhiffRate = input.context.pitcherIsHome
    ? readRate(input.pitcher.homeWhiffRate, "pitcher.homeWhiffRate", sanitizeContext)
    : readRate(input.pitcher.awayWhiffRate, "pitcher.awayWhiffRate", sanitizeContext);
  const pitcherWhiffRate =
    readRate(input.pitcher.recentWhiffRate, "pitcher.recentWhiffRate", sanitizeContext) ??
    readRate(input.pitcher.seasonWhiffRate, "pitcher.seasonWhiffRate", sanitizeContext) ??
    pitcherLocationWhiffRate;

  const pitcherSkillRate = weightedAverage(
    [
      candidate("pitcher.seasonSkillRate", "Pitcher season K skill", "pitcher", seasonSkillRate, 0.44, "derived"),
      candidate("pitcher.recentSkillRate", "Pitcher recent K skill regressed", "pitcher", recentSkillRate, 0.24, "derived"),
      candidate(
        "pitcher.whiffSupportedKRate",
        "Pitcher whiff-supported K%",
        "pitcher",
        whiffToKRate(pitcherWhiffRate, leagueKRate, leagueWhiffRate, 0.55),
        0.22,
        "derived",
      ),
      candidate(
        input.context.pitcherIsHome ? "pitcher.homeKRate" : "pitcher.awayKRate",
        input.context.pitcherIsHome ? "Pitcher home K%" : "Pitcher away K%",
        "pitcher",
        pitcherLocationKRate,
        0.1,
        "provided",
      ),
    ],
    components,
  );

  const opponentLocationKRate = input.context.pitcherIsHome
    ? readRate(input.opponent.awayKRate, "opponent.awayKRate", sanitizeContext)
    : readRate(input.opponent.homeKRate, "opponent.homeKRate", sanitizeContext);
  const opponentLocationWhiffRate = input.context.pitcherIsHome
    ? readRate(input.opponent.awayWhiffRate, "opponent.awayWhiffRate", sanitizeContext)
    : readRate(input.opponent.homeWhiffRate, "opponent.homeWhiffRate", sanitizeContext);
  const handednessKRate =
    input.pitcher.handedness === "L"
      ? readRate(input.opponent.vsLhpKRate, "opponent.vsLhpKRate", sanitizeContext)
      : input.pitcher.handedness === "R"
        ? readRate(input.opponent.vsRhpKRate, "opponent.vsRhpKRate", sanitizeContext)
        : null;
  const opponentSeasonKRate = readRate(input.opponent.seasonKRate, "opponent.seasonKRate", sanitizeContext);
  const opponentRecentRaw =
    readRate(input.opponent.recentKRate, "opponent.recentKRate", sanitizeContext) ??
    deriveOpponentRecentStarterKRate(input.opponent.recentVsStarters, sanitizeContext);
  const opponentRecentKRate = blendRates(
    [
      { value: opponentRecentRaw, weight: 0.35 },
      { value: opponentSeasonKRate ?? leagueKRate, weight: 0.65 },
    ],
    null,
    1,
  );
  const opponentWhiffRate =
    readRate(input.opponent.recentWhiffRate, "opponent.recentWhiffRate", sanitizeContext) ??
    readRate(input.opponent.seasonWhiffRate, "opponent.seasonWhiffRate", sanitizeContext) ??
    opponentLocationWhiffRate;

  if (input.pitcher.handedness == null && (input.opponent.vsLhpKRate != null || input.opponent.vsRhpKRate != null)) {
    pushUnique(warnings, "Opponent handedness split supplied but pitcher handedness is missing.");
  }

  const opponentEnvironmentRate = weightedAverage(
    [
      candidate("opponent.seasonKRate", "Opponent season K%", "opponent", opponentSeasonKRate, 0.32, "provided"),
      candidate("opponent.recentKRate", "Opponent recent K% regressed", "opponent", opponentRecentKRate, 0.18, "derived"),
      candidate(
        input.context.pitcherIsHome ? "opponent.awayKRate" : "opponent.homeKRate",
        input.context.pitcherIsHome ? "Opponent away K%" : "Opponent home K%",
        "opponent",
        opponentLocationKRate,
        0.16,
        "provided",
      ),
      candidate("opponent.handednessKRate", "Opponent K% vs pitcher hand", "opponent", handednessKRate, 0.16, "provided"),
      candidate(
        "opponent.projectedLineupKRate",
        "Projected lineup K%",
        "opponent",
        readRate(input.opponent.projectedLineupKRate, "opponent.projectedLineupKRate", sanitizeContext),
        0.14,
        "provided",
      ),
      candidate(
        "opponent.whiffSupportedKRate",
        "Opponent whiff-supported K%",
        "opponent",
        whiffToKRate(opponentWhiffRate, leagueKRate, leagueWhiffRate, 0.35),
        0.04,
        "derived",
      ),
    ],
    components,
  );

  const matchupAdjustment = calculateMatchupAdjustment(pitcherSkillRate, opponentEnvironmentRate, leagueKRate);
  const projectedKRate =
    pitcherSkillRate == null ? null : clamp(pitcherSkillRate + (matchupAdjustment ?? 0), MIN_K_RATE, MAX_K_RATE);

  if (pitcherSkillRate == null) {
    pushUnique(warnings, "Pitcher strikeout skill unavailable.");
  }

  const projectedStrikeouts =
    projectedKRate != null && projectedBattersFaced != null ? projectedKRate * projectedBattersFaced : null;

  return {
    modelVersion: MODEL_VERSION,
    projectedStrikeouts: finiteOrNull(projectedStrikeouts),
    projectedKRate: finiteOrNull(projectedKRate),
    projectedBattersFaced: finiteOrNull(projectedBattersFaced),
    projectedInnings: finiteOrNull(projectedInnings),
    pitcherSkillRate: finiteOrNull(pitcherSkillRate),
    opponentEnvironmentRate: finiteOrNull(opponentEnvironmentRate),
    matchupAdjustment: finiteOrNull(matchupAdjustment),
    confidence: resolveConfidence(projectedStrikeouts, components, fallbacks, warnings),
    components,
    fallbacks,
    warnings,
  };
}

function candidate(
  key: string,
  label: string,
  group: KProjectionComponent["group"],
  value: number | null,
  weight: number,
  source: KProjectionComponent["source"],
): ComponentCandidate {
  return { key, label, group, value, weight, source };
}

function weightedAverage(candidates: ComponentCandidate[], components: KProjectionComponent[]): number | null {
  const usable = candidates.filter((entry) => entry.value != null && Number.isFinite(entry.value) && entry.weight > 0);
  const denominator = usable.reduce((sum, entry) => sum + entry.weight, 0);

  if (denominator <= 0) {
    return null;
  }

  let total = 0;

  for (const entry of usable) {
    const normalizedWeight = entry.weight / denominator;
    const contribution = entry.value! * normalizedWeight;
    total += contribution;
    components.push({
      key: entry.key,
      label: entry.label,
      group: entry.group,
      value: entry.value!,
      weight: entry.weight,
      normalizedWeight,
      contribution,
      source: entry.source,
    });
  }

  return clamp(total, MIN_K_RATE, MAX_K_RATE);
}

function calculateMatchupAdjustment(
  pitcherSkillRate: number | null,
  opponentEnvironmentRate: number | null,
  leagueKRate: number,
): number | null {
  if (pitcherSkillRate == null || opponentEnvironmentRate == null) {
    return null;
  }

  return clamp((opponentEnvironmentRate - leagueKRate) * 0.45, -MAX_MATCHUP_ADJUSTMENT, MAX_MATCHUP_ADJUSTMENT);
}

function blendRates(
  values: Array<{ value: number | null; weight: number }>,
  fallback: number | null,
  fallbackWeight: number,
): number | null {
  const usable = values.filter((entry) => entry.value != null && Number.isFinite(entry.value) && entry.weight > 0);
  let numerator = usable.reduce((sum, entry) => sum + entry.value! * entry.weight, 0);
  let denominator = usable.reduce((sum, entry) => sum + entry.weight, 0);

  if (fallback != null && Number.isFinite(fallback) && fallbackWeight > 0) {
    numerator += fallback * fallbackWeight;
    denominator += fallbackWeight;
  }

  return denominator > 0 ? clamp(numerator / denominator, MIN_K_RATE, MAX_K_RATE) : null;
}

function readRate(value: number | null | undefined, field: string, context: SanitizeContext): number | null {
  const finite = finiteNumber(value);

  if (finite == null) {
    return null;
  }

  if (finite <= 0) {
    pushUnique(context.warnings, `${field} was non-positive and ignored.`);
    return null;
  }

  if (finite > 1.5 && finite <= 100) {
    return finite / 100;
  }

  if (finite <= 1) {
    return finite;
  }

  pushUnique(context.warnings, `${field} used unsupported rate units and was ignored.`);
  return null;
}

function readPositiveNumber(value: number | null | undefined, field: string, context: SanitizeContext): number | null {
  const finite = finiteNumber(value);

  if (finite == null) {
    return null;
  }

  if (finite <= 0) {
    pushUnique(context.warnings, `${field} was non-positive and ignored.`);
    return null;
  }

  return finite;
}

function kPer9ToKRate(
  kPer9: number | null | undefined,
  battersFacedPerInning: number,
  field: string,
  context: SanitizeContext,
): number | null {
  const finite = finiteNumber(kPer9);

  if (finite == null) {
    return null;
  }

  if (finite <= 0) {
    pushUnique(context.warnings, `${field} was non-positive and ignored.`);
    return null;
  }

  return clamp(finite / (9 * battersFacedPerInning), MIN_K_RATE, MAX_K_RATE);
}

function whiffToKRate(
  whiffRate: number | null,
  leagueKRate: number,
  leagueWhiffRate: number,
  slope: number,
): number | null {
  if (whiffRate == null) {
    return null;
  }

  return clamp(leagueKRate + (whiffRate - leagueWhiffRate) * slope, MIN_K_RATE, MAX_K_RATE);
}

function deriveRecentStartKRate(
  starts: KProjectionRecentStart[] | null | undefined,
  context: SanitizeContext,
): number | null {
  const totals = (starts ?? []).slice(0, 5).reduce(
    (acc, start) => {
      const strikeouts = finiteNumber(start.strikeouts);
      const battersFaced = readPositiveNumber(start.battersFaced, "pitcher.recentStarts.battersFaced", context);

      if (strikeouts == null || battersFaced == null) {
        return acc;
      }

      if (strikeouts < 0) {
        pushUnique(context.warnings, "pitcher.recentStarts.strikeouts was negative and ignored.");
        return acc;
      }

      return {
        strikeouts: acc.strikeouts + strikeouts,
        battersFaced: acc.battersFaced + battersFaced,
      };
    },
    { strikeouts: 0, battersFaced: 0 },
  );

  return totals.battersFaced > 0 ? clamp(totals.strikeouts / totals.battersFaced, MIN_K_RATE, MAX_K_RATE) : null;
}

function deriveRecentStartKPer9(
  starts: KProjectionRecentStart[] | null | undefined,
  context: SanitizeContext,
): number | null {
  const totals = (starts ?? []).slice(0, 5).reduce(
    (acc, start) => {
      const strikeouts = finiteNumber(start.strikeouts);
      const innings = readPositiveNumber(start.inningsPitched, "pitcher.recentStarts.inningsPitched", context);

      if (strikeouts == null || innings == null) {
        return acc;
      }

      if (strikeouts < 0) {
        pushUnique(context.warnings, "pitcher.recentStarts.strikeouts was negative and ignored.");
        return acc;
      }

      return {
        strikeouts: acc.strikeouts + strikeouts,
        innings: acc.innings + innings,
      };
    },
    { strikeouts: 0, innings: 0 },
  );

  return totals.innings > 0 ? (totals.strikeouts / totals.innings) * 9 : null;
}

function deriveRecentStartAverageIp(
  starts: KProjectionRecentStart[] | null | undefined,
  context: SanitizeContext,
): number | null {
  const innings = (starts ?? [])
    .slice(0, 5)
    .map((start) => readPositiveNumber(start.inningsPitched, "pitcher.recentStarts.inningsPitched", context))
    .filter((value): value is number => value != null);

  return innings.length >= 3 ? average(innings) : null;
}

function deriveRecentStartAverageBf(
  starts: KProjectionRecentStart[] | null | undefined,
  context: SanitizeContext,
): number | null {
  const battersFaced = (starts ?? [])
    .slice(0, 5)
    .map((start) => readPositiveNumber(start.battersFaced, "pitcher.recentStarts.battersFaced", context))
    .filter((value): value is number => value != null);

  return battersFaced.length >= 3 ? average(battersFaced) : null;
}

function deriveOpponentRecentStarterKRate(
  games: KProjectionOpponentStarterGame[] | null | undefined,
  context: SanitizeContext,
): number | null {
  const totals = (games ?? []).slice(0, 5).reduce(
    (acc, game) => {
      const teamStrikeouts = finiteNumber(game.teamTotalStrikeouts);
      const plateAppearances = readPositiveNumber(
        game.teamPlateAppearances,
        "opponent.recentVsStarters.teamPlateAppearances",
        context,
      );

      if (teamStrikeouts == null || plateAppearances == null) {
        return acc;
      }

      if (teamStrikeouts < 0) {
        pushUnique(context.warnings, "opponent.recentVsStarters.teamTotalStrikeouts was negative and ignored.");
        return acc;
      }

      return {
        strikeouts: acc.strikeouts + teamStrikeouts,
        plateAppearances: acc.plateAppearances + plateAppearances,
      };
    },
    { strikeouts: 0, plateAppearances: 0 },
  );

  return totals.plateAppearances > 0 ? clamp(totals.strikeouts / totals.plateAppearances, MIN_K_RATE, MAX_K_RATE) : null;
}

function deriveInningsFromBattersFaced(
  projectedBattersFaced: number | null | undefined,
  battersFacedPerInning: number,
  context: SanitizeContext,
): number | null {
  const battersFaced = readPositiveNumber(projectedBattersFaced, "pitcher.projectedBattersFaced", context);
  return battersFaced == null ? null : battersFaced / battersFacedPerInning;
}

function deriveBattersFacedFromInnings(
  projectedInnings: number | null,
  battersFacedPerInning: number,
  fallbacks: KProjectionFallback[],
): number | null {
  if (projectedInnings == null) {
    return null;
  }

  return recordFallback(
    fallbacks,
    "pitcher.projectedBattersFaced",
    "missing projected batters faced; derived from projected innings and BF/IP",
    projectedInnings * battersFacedPerInning,
  );
}

function resolveConfidence(
  projectedStrikeouts: number | null,
  components: KProjectionComponent[],
  fallbacks: KProjectionFallback[],
  warnings: string[],
): KProjectionResult["confidence"] {
  if (projectedStrikeouts == null || !Number.isFinite(projectedStrikeouts)) {
    return "insufficient";
  }

  const hasCorePitcherInput = components.some((entry) =>
    ["pitcher.seasonSkillRate", "pitcher.recentSkillRate"].includes(entry.key),
  );
  const hasOpponentInput = components.some((entry) => entry.group === "opponent");
  const workloadFallbacks = fallbacks.filter((entry) => entry.field.startsWith("pitcher."));
  const defaultContextFallbacks = fallbacks.filter((entry) => entry.field.startsWith("context."));

  if (!hasCorePitcherInput) {
    return "low";
  }

  if (warnings.length > 0 || workloadFallbacks.length > 0) {
    return "low";
  }

  if (hasOpponentInput && defaultContextFallbacks.length === 0 && components.length >= 5) {
    return "high";
  }

  return hasOpponentInput ? "medium" : "low";
}

function recordFallback<T extends number | null>(
  fallbacks: KProjectionFallback[],
  field: string,
  reason: string,
  used: T,
): T {
  const fallback = { field, reason, used: used == null ? null : used };

  if (!fallbacks.some((entry) => entry.field === fallback.field && entry.reason === fallback.reason)) {
    fallbacks.push(fallback);
  }

  return used;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteOrNull(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushUnique(messages: string[], message: string): void {
  if (!messages.includes(message)) {
    messages.push(message);
  }
}
