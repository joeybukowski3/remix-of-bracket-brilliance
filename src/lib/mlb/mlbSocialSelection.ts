/**
 * Shared, dependency-free row builders for MLB strikeout-prop rows and the
 * "TBD starter" exclusion set. Moved out of src/pages/MlbHrProps.tsx (which
 * pulls in heavy React/Radix component imports at module scope) so this
 * logic can also run in a plain Node/tsx script -- see
 * scripts/generate-social-card-live.ts, which builds the exact same rows
 * the website's useMlbPropsData() hook builds, from the same
 * hr-props-raw.json payload, before handing them to the same
 * selectTopSocialKRows() selector the website uses.
 *
 * Re-exported from MlbHrProps.tsx for backward compatibility with existing
 * imports/tests. Only `import type` is used for the MlbHrProps.tsx types
 * below -- type-only imports are erased at compile time, so this module has
 * zero runtime dependency on that file (or on React).
 */
import { resolveKPropStatus } from './kPropStatus';
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from '@/pages/MlbHrProps';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRange(value: number | null | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) return null;
  if (max <= min) return null;
  return clamp(((Number(value) - min) / (max - min)) * 100, 0, 100);
}

function weightedAverageAvailable(entries: Array<{ value: number | null; weight: number }>) {
  let weightedTotal = 0;
  let totalWeight = 0;
  entries.forEach(({ value, weight }) => {
    if (value == null || !Number.isFinite(value) || weight <= 0) return;
    weightedTotal += value * weight;
    totalWeight += weight;
  });
  if (!totalWeight) return null;
  return weightedTotal / totalWeight;
}

function averageNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value) => Number.isFinite(value)).map((value) => Number(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function pickDeterministicVariant(options: string[], seed: number) {
  if (!options.length) return '';
  return options[Math.abs(seed) % options.length];
}

/** Local copy of MlbHrProps.tsx's isStarterPlaceholder -- kept in sync manually; both are 2-line pure checks. */
function isStarterPlaceholder(value: unknown) {
  const normalized = (typeof value === 'string' ? value.trim() : '').toUpperCase();
  return !normalized || normalized === 'TBD' || normalized === 'TBA' || normalized === 'TO BE ANNOUNCED' || normalized === 'TO BE DETERMINED';
}

/**
 * Games where at least one side's probable pitcher is still a TBD/TBA
 * placeholder. Both the website (useMlbPropsData) and the live card CLI
 * exclude these games before any HR/K selection runs.
 */
export function buildTbdGameKeySet(pitchers: HrDashboardPitcher[], batters: HrDashboardBatter[]) {
  const gameKeys = new Set<string>();
  pitchers.forEach((pitcher) => {
    if (pitcher.gameKey && isStarterPlaceholder(pitcher.pitcher)) {
      gameKeys.add(pitcher.gameKey);
    }
  });
  batters.forEach((batter) => {
    if (batter.gameKey && isStarterPlaceholder(batter.opposingPitcher)) {
      gameKeys.add(batter.gameKey);
    }
  });
  return gameKeys;
}

function buildStrikeoutWhyText(row: {
  rank: number;
  strikeoutMatchupScore: number;
  pitcherKSkillScore: number;
  pitcherKRate: number | null;
  pitcherWhiffRate: number | null;
  pitcherKVs: number;
  opponentTeamKRate: number | null;
  opponentTeamWhiffRate: number | null;
  opponentTeamXba: number | null;
}) {
  const drivers: Array<{ strength: number; text: string; family: 'pitcher' | 'team' | 'contact' }> = [];

  if (row.pitcherKVs >= 72) drivers.push({ strength: 98, text: 'elite pitcher K VS', family: 'pitcher' });
  else if (row.pitcherKVs >= 62) drivers.push({ strength: 88, text: 'strong pitcher K VS', family: 'pitcher' });
  else if (row.pitcherKVs >= 52) drivers.push({ strength: 75, text: 'solid pitcher K VS', family: 'pitcher' });

  if (row.pitcherKRate != null) {
    if (row.pitcherKRate >= 30) drivers.push({ strength: 94, text: 'a true bat-missing K%', family: 'pitcher' });
    else if (row.pitcherKRate >= 26) drivers.push({ strength: 80, text: 'above-average strikeout rate', family: 'pitcher' });
  }

  if (row.pitcherWhiffRate != null) {
    if (row.pitcherWhiffRate >= 30) drivers.push({ strength: 90, text: 'elite whiff ability', family: 'pitcher' });
    else if (row.pitcherWhiffRate >= 27) drivers.push({ strength: 76, text: 'strong whiff profile', family: 'pitcher' });
  }

  if (row.opponentTeamKRate != null) {
    if (row.opponentTeamKRate >= 27) drivers.push({ strength: 92, text: 'a high-strikeout lineup', family: 'team' });
    else if (row.opponentTeamKRate >= 24) drivers.push({ strength: 78, text: 'meaningful team K tendency', family: 'team' });
    else if (row.opponentTeamKRate <= 20.5) drivers.push({ strength: 58, text: 'limited team K tendency', family: 'team' });
  }

  if (row.opponentTeamWhiffRate != null) {
    if (row.opponentTeamWhiffRate >= 29) drivers.push({ strength: 86, text: 'a swing-and-miss lineup', family: 'team' });
    else if (row.opponentTeamWhiffRate >= 26) drivers.push({ strength: 72, text: 'above-average team whiff', family: 'team' });
  }

  if (row.opponentTeamXba != null) {
    if (row.opponentTeamXba <= 0.232) drivers.push({ strength: 84, text: 'below-average team xBA', family: 'contact' });
    else if (row.opponentTeamXba <= 0.242) drivers.push({ strength: 70, text: 'suppressed contact quality', family: 'contact' });
    else if (row.opponentTeamXba >= 0.265) drivers.push({ strength: 60, text: 'firmer contact quality', family: 'contact' });
  }

  const top = [...drivers].sort((left, right) => right.strength - left.strength);
  const uniqueTop = top.filter((driver, index) => top.findIndex((candidate) => candidate.text === driver.text) === index);
  const primary = uniqueTop[0];
  const secondary = uniqueTop.find((driver) => driver.family !== primary?.family) ?? uniqueTop[1];
  const tertiary = uniqueTop.find((driver) => driver !== primary && driver !== secondary && driver.family === 'contact');
  const seed = Math.max(0, row.rank - 1);

  if (!primary) {
    return 'Balanced strikeout setup from current pitcher and opponent-team inputs.';
  }

  if (row.strikeoutMatchupScore >= 60) {
    if (primary.family === 'pitcher' && secondary) {
      return pickDeterministicVariant([
        `Strong K indicators meet ${secondary.text}.`,
        `Pitcher K skill carries the grade here, with ${secondary.text} helping.`,
        `Bat-missing ability leads this spot, and ${secondary.text} keeps it elevated.`,
        `This matchup is driven by pitcher K skill, with ${secondary.text} adding support.`,
      ], seed);
    }
    if (primary.family === 'team' && secondary) {
      return pickDeterministicVariant([
        `Opponent strikeout tendency boosts the matchup, and ${secondary.text} helps.`,
        `Lineup swing-and-miss risk sets the tone here, with ${secondary.text} in support.`,
        `This spot leans on ${primary.text}, while ${secondary.text} keeps it favorable.`,
        `Team-level K risk leads the case, and ${secondary.text} adds lift.`,
      ], seed);
    }
  }

  if (row.strikeoutMatchupScore >= 52) {
    if (primary.family === 'pitcher' && secondary && tertiary) {
      return pickDeterministicVariant([
        `Above-average K indicators pair with ${secondary.text} and ${tertiary.text}.`,
        `This spot is driven by pitcher skill, with ${secondary.text} and ${tertiary.text} supporting it.`,
        `Pitcher-side strikeout ability stands out here, while ${secondary.text} and ${tertiary.text} help.`,
        `K skill is the main reason this lands well, with ${secondary.text} and ${tertiary.text} adding support.`,
      ], seed);
    }

    if (primary.family === 'team' && secondary) {
      return pickDeterministicVariant([
        `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} boosts this matchup, with ${secondary.text} supporting it.`,
        `This matchup gets a lift from ${primary.text}, and ${secondary.text} helps.`,
        `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is the clearest edge, while ${secondary.text} adds support.`,
        `Team-level swing-and-miss risk drives this spot, with ${secondary.text} helping.`,
      ], seed);
    }
  }

  if (secondary && secondary.text === 'firmer contact quality') {
    return pickDeterministicVariant([
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} helps here, but firmer contact quality keeps it out of the top tier.`,
      `There is some strikeout appeal here, but firmer contact quality limits the ceiling.`,
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is useful, though firmer contact quality tempers the spot.`,
    ], seed);
  }

  if (secondary) {
    return pickDeterministicVariant([
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is the main driver, with ${secondary.text} adding support.`,
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} carries the matchup, and ${secondary.text} helps.`,
      `The clearest edge is ${primary.text}, with ${secondary.text} keeping the spot viable.`,
    ], seed);
  }

  return pickDeterministicVariant([
    `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is doing most of the work in this strikeout spot.`,
    `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is the clearest reason this matchup holds up.`,
    `Most of the strikeout case here comes from ${primary.text}.`,
  ], seed);
}

function buildStrikeoutReasonTags(row: {
  parkFactor: number;
  pitcherKRate: number | null;
  pitcherKSkillScore: number;
  pitcherWhiffRate: number | null;
  opponentTeamKRate: number | null;
  opponentTeamWhiffRate: number | null;
  opponentTeamXba: number | null;
}, opponentKSampleSize: number) {
  const tags: string[] = [];

  if ((row.opponentTeamKRate ?? 0) >= 26) tags.push('High-K opponent');
  else if ((row.opponentTeamKRate ?? 0) >= 23) tags.push('Above-average opponent K%');

  if (row.pitcherKSkillScore >= 72 || (row.pitcherKRate ?? 0) >= 28 || (row.pitcherWhiffRate ?? 0) >= 31) {
    tags.push('Strong K pitcher');
  } else if (row.pitcherKSkillScore >= 58) {
    tags.push('Solid K pitcher');
  }

  if ((row.opponentTeamWhiffRate ?? 0) >= 29) tags.push('Swing-and-miss lineup');
  if ((row.opponentTeamXba ?? 1) <= 0.235) tags.push('Weak contact lineup');
  if (row.parkFactor <= 0.97) tags.push('Pitcher-friendly park');
  if (opponentKSampleSize <= 4) tags.push('Small-sample lineup');

  return tags.slice(0, 3);
}

export function buildPitcherStrikeoutRows(
  batters: HrDashboardBatter[],
  games: HrDashboardGame[],
  pitchers: HrDashboardPitcher[] = [],
) {
  const gameByKey = new Map(games.map((game) => [game.gameKey, game]));
  const battersByGameAndTeam = new Map<string, HrDashboardBatter[]>();

  batters.forEach((batter) => {
    const key = `${batter.gameKey}|${batter.team}`;
    const existing = battersByGameAndTeam.get(key);
    if (existing) existing.push(batter);
    else battersByGameAndTeam.set(key, [batter]);
  });

  const rows = [...pitchers]
    .map((pitcher) => {
      const opponentBatters = battersByGameAndTeam.get(`${pitcher.gameKey}|${pitcher.opponent}`) ?? [];
      const game = gameByKey.get(pitcher.gameKey);
      const opponentTeamKRate = averageNullable(opponentBatters.map((batter) => batter.kRate));
      const opponentTeamWhiffRate = averageNullable(opponentBatters.map((batter) => batter.whiffRate));
      const opponentTeamXba = averageNullable(opponentBatters.map((batter) => batter.xba));

      const pitcherKSkillScore = weightedAverageAvailable([
        { value: normalizeRange(pitcher.kVs, 15, 85), weight: 0.5 },
        { value: normalizeRange(pitcher.kRate, 15, 35), weight: 0.3 },
        { value: normalizeRange(pitcher.whiffRate, 15, 35), weight: 0.2 },
      ]) ?? normalizeRange(pitcher.kVs, 15, 85) ?? 0;

      const opponentTeamStrikeoutScore = weightedAverageAvailable([
        { value: normalizeRange(opponentTeamKRate, 14, 28), weight: 0.5 },
        { value: normalizeRange(opponentTeamWhiffRate, 18, 36), weight: 0.3 },
        { value: 100 - (normalizeRange(opponentTeamXba, 0.21, 0.29) ?? 50), weight: 0.2 },
      ]) ?? weightedAverageAvailable([
        { value: normalizeRange(opponentTeamKRate, 14, 28), weight: 0.6 },
        { value: normalizeRange(opponentTeamWhiffRate, 18, 36), weight: 0.4 },
      ]) ?? 0;

      const strikeoutMatchupScore = Number((weightedAverageAvailable([
        { value: pitcherKSkillScore, weight: 0.4 },
        { value: normalizeRange(opponentTeamKRate, 14, 28), weight: 0.3 },
        { value: normalizeRange(opponentTeamWhiffRate, 18, 36), weight: 0.2 },
        { value: 100 - (normalizeRange(opponentTeamXba, 0.21, 0.29) ?? 50), weight: 0.1 },
      ]) ?? 0).toFixed(1));

      return {
        rank: 0,
        gameKey: pitcher.gameKey,
        gameId: pitcher.gameId ?? null,
        pitcherId: pitcher.pitcherId ?? null,
        pitcher: pitcher.pitcher,
        team: pitcher.team,
        opponent: pitcher.opponent,
        park: game?.stadium ?? pitcher.ballpark,
        parkFactor: game?.parkFactor ?? pitcher.parkFactor,
        pitcherKRate: pitcher.kRate,
        pitcherWhiffRate: pitcher.whiffRate,
        pitcherKVs: pitcher.kVs,
        opponentTeamKRate,
        opponentTeamWhiffRate,
        opponentTeamXba,
        pitcherKSkillScore: Number(pitcherKSkillScore.toFixed(1)),
        opponentTeamStrikeoutScore: Number(opponentTeamStrikeoutScore.toFixed(1)),
        strikeoutMatchupScore,
        whyItRanksWell: '',
        kLine: pitcher.kLine ?? null,
        kOddsOver: pitcher.kOddsOver ?? null,
        kOddsUnder: pitcher.kOddsUnder ?? null,
        kOddsBook: pitcher.kOddsBook ?? null,
        projectedIP: pitcher.projectedIP ?? null,
        projectedK9: pitcher.projectedK9 ?? null,
        projectedKs: pitcher.projectedKs ?? null,
        workloadRole: pitcher.workloadRole ?? null,
        projectionSource: pitcher.projectionSource ?? null,
        projectionFallbackReason: pitcher.projectionFallbackReason ?? null,
        publicRecommendationEligible: pitcher.publicRecommendationEligible ?? true,
        legacyProjectedIP: pitcher.legacyProjectedIP ?? null,
        legacyProjectedKs: pitcher.legacyProjectedKs ?? null,
        candidateProjectedIP: pitcher.candidateProjectedIP ?? null,
        candidateProjectedKs: pitcher.candidateProjectedKs ?? null,
        effectiveProjectedIP: pitcher.effectiveProjectedIP ?? null,
        effectiveProjectedKs: pitcher.effectiveProjectedKs ?? null,
        v2ProjectedKs: pitcher.v2ProjectedKs ?? null,
        v2Confidence: pitcher.v2Confidence ?? null,
        v2ModelVersion: pitcher.v2ModelVersion ?? null,
        workloadConfidenceGrade: pitcher.workloadConfidenceGrade ?? null,
        workloadConfidenceScore: pitcher.workloadConfidenceScore ?? null,
        workloadFlags: pitcher.workloadFlags ?? [],
      };
    })
    .sort((left, right) =>
      right.strikeoutMatchupScore - left.strikeoutMatchupScore
      || right.pitcherKSkillScore - left.pitcherKSkillScore
      || right.opponentTeamStrikeoutScore - left.opponentTeamStrikeoutScore
      || left.pitcher.localeCompare(right.pitcher));

  return rows.map((row, index) => {
    const rank = index + 1;
    const { status, reasons } = resolveKPropStatus(row);
    return {
      ...row,
      rank,
      whyItRanksWell: buildStrikeoutWhyText({
        rank,
        strikeoutMatchupScore: row.strikeoutMatchupScore,
        pitcherKSkillScore: row.pitcherKSkillScore,
        pitcherKRate: row.pitcherKRate,
        pitcherWhiffRate: row.pitcherWhiffRate,
        pitcherKVs: row.pitcherKVs,
        opponentTeamKRate: row.opponentTeamKRate,
        opponentTeamWhiffRate: row.opponentTeamWhiffRate,
        opponentTeamXba: row.opponentTeamXba,
      }),
      kProjectionStatus: status,
      kProjectionStatusReasons: reasons,
    };
  });
}

export function buildPitcherStrikeoutMatchupRows(
  pitchers: HrDashboardPitcher[],
  batters: HrDashboardBatter[],
  games: HrDashboardGame[],
) {
  const detailedRows = buildPitcherStrikeoutRows(batters, games, pitchers);
  const opponentSampleByGameAndTeam = new Map<string, number>();

  batters.forEach((batter) => {
    const key = `${batter.gameKey}|${batter.team}`;
    opponentSampleByGameAndTeam.set(key, (opponentSampleByGameAndTeam.get(key) ?? 0) + 1);
  });

  return detailedRows.map((row) => {
    const opponentKSampleSize = opponentSampleByGameAndTeam.get(`${row.gameKey}|${row.opponent}`) ?? 0;

    return {
      rank: row.rank,
      gameKey: row.gameKey,
      gameId: row.gameId,
      pitcherId: row.pitcherId,
      pitcher: row.pitcher,
      team: row.team,
      opponent: row.opponent,
      park: row.park,
      parkFactor: row.parkFactor,
      opponentTeamKRate: row.opponentTeamKRate,
      opponentKSampleSize,
      pitcherKAbilityScore: row.pitcherKSkillScore,
      kRate: row.pitcherKRate,
      whiffRate: row.pitcherWhiffRate,
      kMatchupScore: row.strikeoutMatchupScore,
      reasonTags: buildStrikeoutReasonTags(row, opponentKSampleSize),
      kLine: row.kLine,
      kOddsOver: row.kOddsOver,
      kOddsUnder: row.kOddsUnder,
      kOddsBook: row.kOddsBook,
    };
  });
}
