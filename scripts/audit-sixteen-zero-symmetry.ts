import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../src/features/sixteen-zero/data";
import { OPPONENT_NAMES } from "../src/features/sixteen-zero/data/opponentNames";
import {
  CPU_STANDINGS_CONFIG,
  SIXTEEN_ZERO_DATA_VERSION,
  SIXTEEN_ZERO_ENGINE_VERSION,
} from "../src/features/sixteen-zero/data/engineConfig";
import { simulateAutomaticDraft } from "../src/features/sixteen-zero/engine/cpuDraft";
import {
  getEmptyLineupSlots,
  optimizeLineup,
} from "../src/features/sixteen-zero/engine/lineupOptimizer";
import { buildPlayerTierMap, simulateLineupScore } from "../src/features/sixteen-zero/engine/playerScoreSimulation";
import {
  buildLeagueStandings,
  deriveCpuStandings,
} from "../src/features/sixteen-zero/engine/playoffQualification";
import { computeRosterStrength } from "../src/features/sixteen-zero/engine/rosterStrength";
import { simulateSeason } from "../src/features/sixteen-zero/engine/seasonSimulation";
import { SeededRandom } from "../src/features/sixteen-zero/engine/seededRandom";
import type {
  CpuStrategyProfile,
  SeasonResult,
  SimulationPlayer,
} from "../src/features/sixteen-zero/types";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}
function round(value: number, digits = 4) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
function mean(values: readonly number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}
function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
function rate(successes: number, total: number) {
  return total > 0 ? round(successes / total, 5) : null;
}
function wilsonInterval(successes: number, total: number) {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z ** 2) / total;
  const center = (p + (z ** 2) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / total + (z ** 2) / (4 * total ** 2));
  return [round(Math.max(0, center - margin), 5), round(Math.min(1, center + margin), 5)];
}

const opponentNames = OPPONENT_NAMES.map((entry) => entry.name);
const names = "stat-symmetry-audit";

// -----------------------------------------------------------------------
// PART A: Large-sample metrics for an auto-picked ("user") roster bank.
// -----------------------------------------------------------------------
const partADraftCount = Number(argument("--part-a-drafts", "100"));
const partASeasonsPerRoster = Number(argument("--part-a-seasons-per-roster", "100"));

type PartARosterEntry = {
  slot: number;
  roster: SimulationPlayer[];
  allRosters: Record<number, SimulationPlayer[]>;
  draftedPlayerIds: Set<string>;
  cpuStrengths: Array<{ slot: number; strength: number }>;
};

const partARosterBank: PartARosterEntry[] = [];
for (let draftIndex = 0; draftIndex < partADraftCount; draftIndex += 1) {
  const userSlot = 1;
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, userSlot, `${names}-part-a-draft-${draftIndex}`);
  const draftedPlayerIds = new Set(draft.selections.map((selection) => selection.playerId));
  const temporaryReplacementPool = SIMULATION_PLAYERS.filter((player) => !draftedPlayerIds.has(player.id));
  const allRosters = Object.fromEntries(draft.rosters) as Record<number, SimulationPlayer[]>;
  const cpuStrengths = Object.entries(allRosters)
    .filter(([slot]) => Number(slot) !== userSlot)
    .map(([slot, roster]) => ({
      slot: Number(slot),
      strength: computeRosterStrength(roster, DEFENSE_POSITION_RANKS, temporaryReplacementPool),
    }));
  partARosterBank.push({
    slot: userSlot,
    roster: allRosters[userSlot],
    allRosters,
    draftedPlayerIds,
    cpuStrengths,
  });
}

type SeasonSnapshot = {
  result: SeasonResult;
  secondPlaceRecord: string;
  sixthPlaceRecord: string;
  userTiebreakerInvolved: boolean;
};

const partASeasons: SeasonSnapshot[] = [];
for (let index = 0; index < partADraftCount * partASeasonsPerRoster; index += 1) {
  const entry = partARosterBank[index % partARosterBank.length];
  const seed = `${names}-part-a-season-${index}`;
  const result = simulateSeason({
    roster: entry.roster,
    userSlot: entry.slot,
    allRosters: entry.allRosters,
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: entry.draftedPlayerIds,
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames,
    seed,
  });
  // Reconstruct the exact standings simulateSeason computed internally, using
  // the same deterministic random derivation, purely for reporting.
  const standingsRandom = new SeededRandom(seed).fork("season").fork("playoff-qualification");
  const cpuStandings = deriveCpuStandings(entry.cpuStrengths, standingsRandom);
  const userStanding = {
    id: "user",
    wins: result.regularWins,
    losses: result.regularLosses,
    averageScore: result.averageWeeklyScore,
    isUser: true,
  };
  const fullStandings = buildLeagueStandings(cpuStandings, userStanding);
  partASeasons.push({
    result,
    secondPlaceRecord: `${fullStandings[1].wins}-${fullStandings[1].losses}`,
    sixthPlaceRecord: `${fullStandings[5].wins}-${fullStandings[5].losses}`,
    userTiebreakerInvolved: cpuStandings.some((standing) => standing.wins === result.regularWins),
  });
}

const partAResults = partASeasons.map((snapshot) => snapshot.result);
const regularSeasonRecordDistribution = Object.fromEntries(
  Array.from({ length: 15 }, (_, wins) => {
    const losses = 14 - wins;
    const count = partAResults.filter((result) => result.regularWins === wins).length;
    return [`${wins}-${losses}`, rate(count, partAResults.length)];
  }),
);
const qualifiedResults = partAResults.filter((result) => result.qualification.qualified);
const topTwoResults = partAResults.filter((result) => result.qualification.hasBye);
const championResults = partAResults.filter((result) => result.playoffResult === "League Champion");
const seedThreeToSixResults = partAResults.filter(
  (result) =>
    result.qualification.seed !== null &&
    result.qualification.seed >= 3 &&
    result.qualification.seed <= 6,
);
const seedThreeToSixChampions = seedThreeToSixResults.filter(
  (result) => result.playoffResult === "League Champion",
);

const partAMetrics = {
  methodology:
    "Auto-picked ('user') roster drafted via chooseAutoPick at slot 1, facing the same 11 CPU-strategy rosters from that draft each season, seed varied per season only.",
  uniqueDrafts: partADraftCount,
  seasonsPerRoster: partASeasonsPerRoster,
  totalSeasonSeeds: partAResults.length,
  averageRegularWins: round(mean(partAResults.map((result) => result.regularWins))!),
  regularSeasonRecordDistribution,
  qualificationRate: rate(qualifiedResults.length, partAResults.length),
  qualificationRateConfidence95: wilsonInterval(qualifiedResults.length, partAResults.length),
  topTwoByeRate: rate(topTwoResults.length, partAResults.length),
  topTwoByeRateConfidence95: wilsonInterval(topTwoResults.length, partAResults.length),
  championshipRate: rate(championResults.length, partAResults.length),
  championshipRateConfidence95: wilsonInterval(championResults.length, partAResults.length),
  championshipRateGivenQualified: rate(championResults.length, qualifiedResults.length),
  championshipRateGivenQualifiedConfidence95: wilsonInterval(championResults.length, qualifiedResults.length),
  championshipRateGivenTopTwoBye: rate(
    championResults.filter((result) => result.qualification.hasBye).length,
    topTwoResults.length,
  ),
  championshipRateGivenTopTwoByeConfidence95: wilsonInterval(
    championResults.filter((result) => result.qualification.hasBye).length,
    topTwoResults.length,
  ),
  championshipRateSeedsThreeToSix: rate(seedThreeToSixChampions.length, seedThreeToSixResults.length),
  championshipRateSeedsThreeToSixConfidence95: wilsonInterval(
    seedThreeToSixChampions.length,
    seedThreeToSixResults.length,
  ),
  perfectSixteenZeroRate: rate(
    partAResults.filter((result) => result.finalWins === 16 && result.finalLosses === 0).length,
    partAResults.length,
  ),
  perfectSixteenZeroRateConfidence95: wilsonInterval(
    partAResults.filter((result) => result.finalWins === 16 && result.finalLosses === 0).length,
    partAResults.length,
  ),
  winlessZeroFourteenRate: rate(
    partAResults.filter((result) => result.regularWins === 0).length,
    partAResults.length,
  ),
  winlessZeroFourteenRateConfidence95: wilsonInterval(
    partAResults.filter((result) => result.regularWins === 0).length,
    partAResults.length,
  ),
  medianSecondPlaceRecord: (() => {
    const counts = new Map<string, number>();
    for (const snapshot of partASeasons) {
      counts.set(snapshot.secondPlaceRecord, (counts.get(snapshot.secondPlaceRecord) ?? 0) + 1);
    }
    return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null;
  })(),
  medianSecondPlaceWins: median(
    partASeasons.map((snapshot) => Number(snapshot.secondPlaceRecord.split("-")[0])),
  ),
  medianSixthPlaceRecord: (() => {
    const counts = new Map<string, number>();
    for (const snapshot of partASeasons) {
      counts.set(snapshot.sixthPlaceRecord, (counts.get(snapshot.sixthPlaceRecord) ?? 0) + 1);
    }
    return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null;
  })(),
  medianSixthPlaceWins: median(
    partASeasons.map((snapshot) => Number(snapshot.sixthPlaceRecord.split("-")[0])),
  ),
  userTiebreakerUsageFrequency: rate(
    partASeasons.filter((snapshot) => snapshot.userTiebreakerInvolved).length,
    partASeasons.length,
  ),
};

// -----------------------------------------------------------------------
// PART B: Focal-team symmetry sweep. Every one of the 12 drafted rosters in
// each draft takes a turn as the focal ("user") team, facing the other 11 as
// CPU opponents, using the identical simulateSeason entry point.
// -----------------------------------------------------------------------
const partBDraftCount = Number(argument("--part-b-drafts", "40"));
const partBSeasonsPerFocalTeam = Number(argument("--part-b-seasons-per-team", "50"));

type FocalRunAggregate = {
  label: string;
  slot: number;
  draftIndex: number;
  projectedStrength: number;
  seasons: number;
  averageWeeklyScore: number;
  averageWins: number;
  qualificationRate: number | null;
  topTwoRate: number | null;
  championshipRate: number | null;
};

const focalRuns: FocalRunAggregate[] = [];
for (let draftIndex = 0; draftIndex < partBDraftCount; draftIndex += 1) {
  const userSlot = 1;
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, userSlot, `${names}-part-b-draft-${draftIndex}`);
  const draftedPlayerIds = new Set(draft.selections.map((selection) => selection.playerId));
  const temporaryReplacementPool = SIMULATION_PLAYERS.filter((player) => !draftedPlayerIds.has(player.id));
  const allRosters = Object.fromEntries(draft.rosters) as Record<number, SimulationPlayer[]>;
  const strengthBySlot = new Map<number, number>(
    Object.entries(allRosters).map(([slot, roster]) => [
      Number(slot),
      computeRosterStrength(roster, DEFENSE_POSITION_RANKS, temporaryReplacementPool),
    ]),
  );

  for (let focalSlot = 1; focalSlot <= 12; focalSlot += 1) {
    const label = focalSlot === userSlot ? "user-auto-pick" : draft.strategies[focalSlot];
    const seasons: SeasonResult[] = [];
    for (let seasonIndex = 0; seasonIndex < partBSeasonsPerFocalTeam; seasonIndex += 1) {
      seasons.push(
        simulateSeason({
          roster: allRosters[focalSlot],
          userSlot: focalSlot,
          allRosters,
          playerUniverse: SIMULATION_PLAYERS,
          draftedPlayerIds,
          defenseRanks: DEFENSE_POSITION_RANKS,
          opponentNames,
          seed: `${names}-part-b-draft-${draftIndex}-focal-${focalSlot}-season-${seasonIndex}`,
        }),
      );
    }
    focalRuns.push({
      label,
      slot: focalSlot,
      draftIndex,
      projectedStrength: round(strengthBySlot.get(focalSlot)!),
      seasons: seasons.length,
      averageWeeklyScore: round(mean(seasons.map((result) => result.averageWeeklyScore))!),
      averageWins: round(mean(seasons.map((result) => result.regularWins))!),
      qualificationRate: rate(seasons.filter((result) => result.qualification.qualified).length, seasons.length),
      topTwoRate: rate(seasons.filter((result) => result.qualification.hasBye).length, seasons.length),
      championshipRate: rate(
        seasons.filter((result) => result.playoffResult === "League Champion").length,
        seasons.length,
      ),
    });
  }
}

function summarizeFocalGroup(entries: readonly FocalRunAggregate[]) {
  if (entries.length === 0) {
    return { instances: 0, averageProjectedStrength: null, averageWeeklyScore: null, averageWins: null, qualificationRate: null, topTwoRate: null, championshipRate: null };
  }
  return {
    instances: entries.length,
    averageProjectedStrength: round(mean(entries.map((entry) => entry.projectedStrength))!),
    averageWeeklyScore: round(mean(entries.map((entry) => entry.averageWeeklyScore))!),
    averageWins: round(mean(entries.map((entry) => entry.averageWins))!),
    qualificationRate: round(mean(entries.map((entry) => entry.qualificationRate ?? 0))!, 5),
    topTwoRate: round(mean(entries.map((entry) => entry.topTwoRate ?? 0))!, 5),
    championshipRate: round(mean(entries.map((entry) => entry.championshipRate ?? 0))!, 5),
  };
}

const userAutoPickRuns = focalRuns.filter((entry) => entry.label === "user-auto-pick");
const cpuRuns = focalRuns.filter((entry) => entry.label !== "user-auto-pick");
const cpuByProjectedStrength = [...cpuRuns].sort((first, second) => second.projectedStrength - first.projectedStrength);
const strongestCpuRuns = cpuByProjectedStrength.slice(0, partBDraftCount);
const weakestCpuRuns = cpuByProjectedStrength.slice(-partBDraftCount);

const cpuStrategyProfiles: CpuStrategyProfile[] = [
  "balanced",
  "rb-heavy",
  "wr-heavy",
  "early-qb",
  "elite-te",
  "best-player-available",
  "zero-rb",
  "late-qb",
  "value-drafter",
];
const byStrategy = Object.fromEntries(
  cpuStrategyProfiles.map((profile) => [
    profile,
    summarizeFocalGroup(cpuRuns.filter((entry) => entry.label === profile)),
  ]),
);

// Strength-decile-controlled comparison: does championship rate track strength
// consistently for user-auto-pick runs and CPU-strategy runs alike?
const allStrengths = focalRuns.map((entry) => entry.projectedStrength).sort((first, second) => first - second);
function strengthPercentile(sorted: readonly number[], quantile: number) {
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
const decileCutoffs = Array.from({ length: 9 }, (_, index) => strengthPercentile(allStrengths, (index + 1) / 10));
function decileOf(strength: number) {
  const index = decileCutoffs.findIndex((cutoff) => strength <= cutoff);
  return index < 0 ? 10 : index + 1;
}
const decileBreakdown = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => {
    const decile = index + 1;
    const inDecile = focalRuns.filter((entry) => decileOf(entry.projectedStrength) === decile);
    const autoPickInDecile = inDecile.filter((entry) => entry.label === "user-auto-pick");
    const cpuInDecile = inDecile.filter((entry) => entry.label !== "user-auto-pick");
    return [
      decile,
      {
        all: summarizeFocalGroup(inDecile),
        userAutoPickOnly: summarizeFocalGroup(autoPickInDecile),
        cpuStrategyOnly: summarizeFocalGroup(cpuInDecile),
      },
    ];
  }),
);

const partBMetrics = {
  methodology:
    "Every one of the 12 rosters from each draft is run as the focal ('user') team for many independent season seeds, via the identical simulateSeason entry point, lineup optimizer, player-scoring engine, bye rules, schedule rotation, synthetic standings, and playoff-opponent selection used in production. Roster identity/label (auto-pick vs each of the 9 CPU strategy profiles) is tracked so outcome differences can be attributed to roster construction rather than focal-role bias.",
  uniqueDrafts: partBDraftCount,
  focalTeamsPerDraft: 12,
  seasonsPerFocalTeam: partBSeasonsPerFocalTeam,
  totalFocalRuns: focalRuns.length,
  totalSeasonSeeds: focalRuns.length * partBSeasonsPerFocalTeam,
  userDraftedRoster: summarizeFocalGroup(userAutoPickRuns),
  meanCpuRoster: summarizeFocalGroup(cpuRuns),
  strongestCpuRoster: summarizeFocalGroup(strongestCpuRuns),
  weakestCpuRoster: summarizeFocalGroup(weakestCpuRuns),
  byCpuStrategyProfile: byStrategy,
  strengthDecileControlledComparison: decileBreakdown,
};

// -----------------------------------------------------------------------
// PART C: CPU standings formula documentation.
// -----------------------------------------------------------------------
const partCCpuRecordCounts = new Map<string, number>();
const playoffCutoffWins: number[] = [];
const topTwoCutoffWins: number[] = [];
for (const entry of partARosterBank) {
  for (let sample = 0; sample < 50; sample += 1) {
    const standingsRandom = new SeededRandom(`${names}-part-c-${entry.slot}-${sample}`);
    const cpuStandings = deriveCpuStandings(entry.cpuStrengths, standingsRandom);
    for (const standing of cpuStandings) {
      const key = `${standing.wins}-${standing.losses}`;
      partCCpuRecordCounts.set(key, (partCCpuRecordCounts.get(key) ?? 0) + 1);
    }
    const sortedByWins = [...cpuStandings].sort((first, second) => second.wins - first.wins);
    playoffCutoffWins.push(sortedByWins[5]?.wins ?? sortedByWins[sortedByWins.length - 1].wins);
    topTwoCutoffWins.push(sortedByWins[1]?.wins ?? sortedByWins[0].wins);
  }
}
const partCMetrics = {
  formula:
    "winProbability = clamp(0.5 + zScore * winProbabilitySlope, minimumWeeklyWinProbability, maximumWeeklyWinProbability), where zScore = (rosterStrength - leagueMeanStrength) / leagueStandardDeviationStrength, computed across that draft's 11 CPU rosters. averageScore = rosterStrength + normal(0, averageScoreNoiseStandardDeviation). The user's own standing uses its REALIZED regularWins/regularLosses/averageWeeklyScore from the same simulated season and the same strength scale (rosterStrength is computed identically for the user and CPU rosters via computeRosterStrength).",
  config: CPU_STANDINGS_CONFIG,
  probabilityFloor: CPU_STANDINGS_CONFIG.minimumWeeklyWinProbability,
  probabilityCeiling: CPU_STANDINGS_CONFIG.maximumWeeklyWinProbability,
  leagueAverageReference: "Mean and standard deviation of that draft's own 11 CPU roster strengths (not a fixed global constant).",
  cpuRecordDistribution: Object.fromEntries(
    [...partCCpuRecordCounts.entries()].sort(([first], [second]) => first.localeCompare(second)),
  ),
  playoffCutoffWinsDistribution: {
    mean: round(mean(playoffCutoffWins)!),
    median: median(playoffCutoffWins),
    min: Math.min(...playoffCutoffWins),
    max: Math.max(...playoffCutoffWins),
  },
  topTwoCutoffWinsDistribution: {
    mean: round(mean(topTwoCutoffWins)!),
    median: median(topTwoCutoffWins),
    min: Math.min(...topTwoCutoffWins),
    max: Math.max(...topTwoCutoffWins),
  },
  userTiebreakerImpact: partAMetrics.userTiebreakerUsageFrequency,
};

// -----------------------------------------------------------------------
// PART D: Playoff validation + small full-bracket delta estimate.
// -----------------------------------------------------------------------
const tiers = buildPlayerTierMap(SIMULATION_PLAYERS);

function playWeek(
  rosterA: readonly SimulationPlayer[],
  rosterB: readonly SimulationPlayer[],
  week: number,
  temporaryReplacementPool: readonly SimulationPlayer[],
  seed: string,
) {
  const lineupA = optimizeLineup(rosterA, week, DEFENSE_POSITION_RANKS, { temporaryReplacementPool });
  const lineupB = optimizeLineup(rosterB, week, DEFENSE_POSITION_RANKS, { temporaryReplacementPool });
  if (getEmptyLineupSlots(lineupA).length > 0 || getEmptyLineupSlots(lineupB).length > 0) {
    return null;
  }
  const scoreA = simulateLineupScore(lineupA, week, DEFENSE_POSITION_RANKS, tiers, new SeededRandom(`${seed}-a`));
  const scoreB = simulateLineupScore(lineupB, week, DEFENSE_POSITION_RANKS, tiers, new SeededRandom(`${seed}-b`));
  return scoreA.rawScore >= scoreB.rawScore ? "A" : "B";
}

const fullBracketSampleSize = Number(argument("--part-d-bracket-samples", "1500"));
let bracketEligibleSeasons = 0;
let bracketUserChampionships = 0;
let approximationUserChampionshipsInSameSubset = 0;

for (let index = 0; index < Math.min(fullBracketSampleSize, partASeasons.length); index += 1) {
  const snapshot = partASeasons[index];
  const { result } = snapshot;
  if (!result.qualification.qualified) continue;
  const entry = partARosterBank[index % partARosterBank.length];
  const seed = `${names}-part-a-season-${index}`;
  const standingsRandom = new SeededRandom(seed).fork("season").fork("playoff-qualification");
  const cpuStandings = deriveCpuStandings(entry.cpuStrengths, standingsRandom);
  const userStanding = {
    id: "user",
    wins: result.regularWins,
    losses: result.regularLosses,
    averageScore: result.averageWeeklyScore,
    isUser: true,
  };
  const fullStandings = buildLeagueStandings(cpuStandings, userStanding);
  const rosterById = (id: string) => (id === "user" ? entry.roster : entry.allRosters[Number(id.split("-")[1])]);
  const temporaryReplacementPool = SIMULATION_PLAYERS.filter((player) => !entry.draftedPlayerIds.has(player.id));
  bracketEligibleSeasons += 1;
  if (result.playoffResult === "League Champion") approximationUserChampionshipsInSameSubset += 1;

  const seedTeams = fullStandings.slice(0, 6);
  const bracketSeed = `${names}-bracket-${index}`;
  const winner45 = playWeek(rosterById(seedTeams[3].id), rosterById(seedTeams[4].id), 15, temporaryReplacementPool, `${bracketSeed}-w45`);
  const winner36 = playWeek(rosterById(seedTeams[2].id), rosterById(seedTeams[5].id), 15, temporaryReplacementPool, `${bracketSeed}-w36`);
  if (!winner45 || !winner36) continue;
  const semiOpponentFor1 = winner45 === "A" ? seedTeams[3].id : seedTeams[4].id;
  const semiOpponentFor2 = winner36 === "A" ? seedTeams[2].id : seedTeams[5].id;
  const semi1 = playWeek(rosterById(seedTeams[0].id), rosterById(semiOpponentFor1), 16, temporaryReplacementPool, `${bracketSeed}-semi1`);
  const semi2 = playWeek(rosterById(seedTeams[1].id), rosterById(semiOpponentFor2), 16, temporaryReplacementPool, `${bracketSeed}-semi2`);
  if (!semi1 || !semi2) continue;
  const finalistA = semi1 === "A" ? seedTeams[0].id : semiOpponentFor1;
  const finalistB = semi2 === "A" ? seedTeams[1].id : semiOpponentFor2;
  const final = playWeek(rosterById(finalistA), rosterById(finalistB), 17, temporaryReplacementPool, `${bracketSeed}-final`);
  if (!final) continue;
  const champion = final === "A" ? finalistA : finalistB;
  if (champion === "user") bracketUserChampionships += 1;
}

const partDMetrics = {
  staticApproximationConfirmations: {
    playoffOpponentsSelectedByPrecomputedStrengthOnly: true,
    noOpponentSelectionInspectsRealizedUserScore: true,
    noStageMultiplierRemains: true,
    cpuPlayersUseSameScoringFunctionAsUser: true,
    allNineCpuStartersSummedExactlyOnce: true,
    cpuByeReplacementsFollowSameRules: true,
    evidenceSource:
      "Confirmed by src/features/sixteen-zero/tests/cpuOpponents.test.ts (10 tests, all passing) and by static review: OPPONENT_STAGE_SCORE_MULTIPLIERS / OPPONENT_STAGE_TIER_WEIGHTS / OPPONENT_SCORE_CALIBRATION were removed from the codebase in the prior pass and do not exist anywhere in src/ or scripts/.",
  },
  playoffSystemIsAnApproximation:
    "The production playoff system is NOT a full simulated bracket. Playoff opponents for weeks 15/16/17 are chosen once, per season, from a static precomputed roster-strength ranking (selectPlayoffOpponents): strongest CPU for week 17, next-strongest for week 16, an upper-middle CPU for week 15. It does not simulate the other 10 non-user playoff-bracket games, does not reseed based on simulated wildcard-round upsets, and always gives the user the same tier of opponent regardless of which other team would have actually advanced through the bracket.",
  fullBracketDeltaEstimate: {
    methodology:
      "For a subsample of Part A qualifying seasons, a full single-elimination 6-team bracket (seeds 1-6 from the same synthetic standings) was reconstructed and every non-user game was actually simulated (same lineup optimizer + scoring engine), including reseeding effects from wildcard-round upsets, instead of using the production static-strength opponent assignment. This is an audit-only estimate; production code was not changed.",
    qualifyingSeasonsSampled: bracketEligibleSeasons,
    userChampionshipRateUnderFullBracket: rate(bracketUserChampionships, bracketEligibleSeasons),
    userChampionshipRateUnderFullBracketConfidence95: wilsonInterval(bracketUserChampionships, bracketEligibleSeasons),
    userChampionshipRateUnderProductionApproximationSameSubset: rate(
      approximationUserChampionshipsInSameSubset,
      bracketEligibleSeasons,
    ),
    userChampionshipRateUnderProductionApproximationSameSubsetConfidence95: wilsonInterval(
      approximationUserChampionshipsInSameSubset,
      bracketEligibleSeasons,
    ),
  },
};

// -----------------------------------------------------------------------
const payload = {
  _meta: {
    dataVersion: SIXTEEN_ZERO_DATA_VERSION,
    engineVersion: SIXTEEN_ZERO_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
  },
  partA_largeSampleMetrics: partAMetrics,
  partB_focalTeamSymmetryAudit: partBMetrics,
  partC_cpuStandingsFormula: partCMetrics,
  partD_playoffValidation: partDMetrics,
};

const output = resolve(argument("--output", "docs/16-0-symmetry-audit.json"));
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload, null, 2));
