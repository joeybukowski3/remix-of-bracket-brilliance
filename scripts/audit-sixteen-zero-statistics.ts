import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFENSE_POSITION_RANKS,
  SIMULATION_PLAYERS,
} from "../src/features/sixteen-zero/data";
import { OPPONENT_NAMES } from "../src/features/sixteen-zero/data/opponentNames";
import { simulateAutomaticDraft } from "../src/features/sixteen-zero/engine/cpuDraft";
import {
  buildPlayerTierMap,
  simulatePlayerScoreDetailed,
} from "../src/features/sixteen-zero/engine/playerScoreSimulation";
import {
  getEmptyLineupSlots,
  getExpectedPlayerScore,
  optimizeLineup,
  optimizeProjectedStartingRoster,
} from "../src/features/sixteen-zero/engine/lineupOptimizer";
import { SeededRandom } from "../src/features/sixteen-zero/engine/seededRandom";
import { simulateSeason } from "../src/features/sixteen-zero/engine/seasonSimulation";
import { computeRosterStrength } from "../src/features/sixteen-zero/engine/rosterStrength";
import {
  CPU_STANDINGS_CONFIG,
  SIXTEEN_ZERO_DATA_VERSION,
  SIXTEEN_ZERO_ENGINE_VERSION,
} from "../src/features/sixteen-zero/data/engineConfig";
import type {
  FantasyPosition,
  LineupSlot,
  SeasonResult,
  SimulationPlayer,
  WeeklyLineup,
} from "../src/features/sixteen-zero/types";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function round(value: number, digits = 3) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function mean(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]) {
  const average = mean(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
      values.length,
  );
}

function meanConfidenceInterval(values: readonly number[]) {
  const average = mean(values);
  const margin = 1.96 * standardDeviation(values) / Math.sqrt(values.length);
  return [round(average - margin), round(average + margin)];
}

function wilsonConfidenceInterval(successes: number, total: number) {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const rate = successes / total;
  const denominator = 1 + (z ** 2) / total;
  const center = (rate + (z ** 2) / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((rate * (1 - rate)) / total + (z ** 2) / (4 * total ** 2));
  return [
    round(Math.max(0, center - margin), 5),
    round(Math.min(1, center + margin), 5),
  ];
}

function percentile(values: readonly number[], quantile: number) {
  const sorted = [...values].sort((first, second) => first - second);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const seasonCount = Number(argument("--seasons", "10000"));
const draftCount = Number(argument("--drafts", "120"));
const output = resolve(
  argument(
    "--output",
    "docs/16-0-statistical-validation.json",
  ),
);
if (
  !Number.isInteger(seasonCount) ||
  seasonCount < 5_000 ||
  !Number.isInteger(draftCount) ||
  draftCount < 12
) {
  throw new Error("Statistical audit requires at least 5,000 seasons and 12 drafts.");
}

const rosterBank: Array<{
  slot: number;
  roster: SimulationPlayer[];
  allRosters: Record<number, SimulationPlayer[]>;
  draftedPlayerIds: Set<string>;
  temporaryReplacementPool: SimulationPlayer[];
  projectedLineupValue: number;
  rosterStrength: number;
}> = [];
for (let draftIndex = 0; draftIndex < draftCount; draftIndex += 1) {
  const userSlot = (draftIndex % 12) + 1;
  const draft = simulateAutomaticDraft(
    SIMULATION_PLAYERS,
    userSlot,
    `stat-audit-draft-${draftIndex}`,
  );
  const draftedPlayerIds = new Set(
    draft.selections.map((selection) => selection.playerId),
  );
  const temporaryReplacementPool = SIMULATION_PLAYERS.filter(
    (player) => !draftedPlayerIds.has(player.id),
  );
  const userRoster = draft.rosters.get(userSlot)!;
  rosterBank.push({
    slot: userSlot,
    roster: userRoster,
    allRosters: Object.fromEntries(draft.rosters),
    draftedPlayerIds,
    temporaryReplacementPool,
    projectedLineupValue: Object.values(
      optimizeProjectedStartingRoster(userRoster),
    ).reduce((total, player) => total + player.blendedPPG, 0),
    rosterStrength: computeRosterStrength(
      userRoster,
      DEFENSE_POSITION_RANKS,
      temporaryReplacementPool,
    ),
  });
}

type SeasonAuditEntry = {
  slot: number;
  roster: SimulationPlayer[];
  temporaryReplacementIds: Set<string>;
  projectedLineupValue: number;
  result: SeasonResult;
  regularLineups: WeeklyLineup[];
  regularExpectedValueLosses: number[];
};

const auditEntries: SeasonAuditEntry[] = [];
const results: SeasonResult[] = [];
const slotResults = new Map<number, SeasonResult[]>(
  Array.from({ length: 12 }, (_, index) => [index + 1, []]),
);
for (let index = 0; index < seasonCount; index += 1) {
  const entry = rosterBank[index % rosterBank.length];
  const result = simulateSeason({
    roster: entry.roster,
    userSlot: entry.slot,
    allRosters: entry.allRosters,
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: entry.draftedPlayerIds,
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: OPPONENT_NAMES.map((item) => item.name),
    seed: `stat-audit-season-${index}`,
  });
  const regularLineups = Array.from({ length: 14 }, (_, weekIndex) =>
    optimizeLineup(
      entry.roster,
      weekIndex + 1,
      DEFENSE_POSITION_RANKS,
      { temporaryReplacementPool: entry.temporaryReplacementPool },
    ),
  );
  const fullAvailabilityRoster = entry.roster.map((player) => ({
    ...player,
    byeWeek: null,
  }));
  const regularExpectedValueLosses = regularLineups.map((lineup, weekIndex) => {
    const week = weekIndex + 1;
    const fullAvailabilityLineup = optimizeLineup(
      fullAvailabilityRoster,
      week,
      DEFENSE_POSITION_RANKS,
    );
    const expectedTotal = Object.values(lineup).reduce(
      (total, player) =>
        total +
        (player
          ? getExpectedPlayerScore(player, week, DEFENSE_POSITION_RANKS)
          : 0),
      0,
    );
    const fullAvailabilityExpectedTotal = Object.values(
      fullAvailabilityLineup,
    ).reduce(
      (total, player) =>
        total +
        (player
          ? getExpectedPlayerScore(player, week, DEFENSE_POSITION_RANKS)
          : 0),
      0,
    );
    return fullAvailabilityExpectedTotal - expectedTotal;
  });
  auditEntries.push({
    slot: entry.slot,
    roster: entry.roster,
    temporaryReplacementIds: new Set(
      entry.temporaryReplacementPool.map((player) => player.id),
    ),
    projectedLineupValue: entry.projectedLineupValue,
    result,
    regularLineups,
    regularExpectedValueLosses,
  });
  results.push(result);
  slotResults.get(entry.slot)!.push(result);
}

const regularUserScores = results.flatMap((result) =>
  result.schedule
    .filter((game) => game.fantasyWeek <= 14)
    .map((game) => game.userScore ?? 0),
);
const regularOpponentScores = results.flatMap((result) =>
  result.schedule
    .filter((game) => game.fantasyWeek <= 14)
    .map((game) => game.opponentScore ?? 0),
);
const regularWins = results.map((result) => result.regularWins);
const OFFENSIVE_SLOTS: LineupSlot[] = [
  "QB",
  "RB1",
  "RB2",
  "WR1",
  "WR2",
  "TE",
  "FLEX",
];

const weekAvailability = auditEntries.flatMap((entry) =>
  entry.regularLineups.map((lineup, weekIndex) => {
    const emptySlots = getEmptyLineupSlots(lineup);
    const temporaryReplacementCount = Object.values(lineup).filter(
      (player) =>
        player !== null &&
        entry.temporaryReplacementIds.has(player.id),
    ).length;
    return {
      emptySlots,
      emptyK: lineup.K === null,
      emptyDST: lineup.DST === null,
      emptyOffense: OFFENSIVE_SLOTS.some((slot) => lineup[slot] === null),
      anyEmpty: emptySlots.length > 0,
      temporaryK:
        lineup.K !== null &&
        entry.temporaryReplacementIds.has(lineup.K.id),
      temporaryDST:
        lineup.DST !== null &&
        entry.temporaryReplacementIds.has(lineup.DST.id),
      temporaryOffense: OFFENSIVE_SLOTS.some(
        (slot) =>
          lineup[slot] !== null &&
          entry.temporaryReplacementIds.has(lineup[slot]!.id),
      ),
      anyTemporary: Object.values(lineup).some(
        (player) =>
          player !== null &&
          entry.temporaryReplacementIds.has(player.id),
      ),
      temporaryReplacementCount,
      multipleTemporaryReplacements: temporaryReplacementCount > 1,
      expectedValueLoss: entry.regularExpectedValueLosses[weekIndex],
      score: entry.result.schedule[weekIndex].userScore ?? 0,
    };
  }),
);
const emptyWeekScores = weekAvailability
  .filter((week) => week.anyEmpty)
  .map((week) => week.score);
const completeWeekScores = weekAvailability
  .filter((week) => !week.anyEmpty)
  .map((week) => week.score);

function scoreDistribution(values: readonly number[]) {
  return {
    samples: values.length,
    mean: values.length ? round(mean(values)) : null,
    standardDeviation: values.length
      ? round(standardDeviation(values))
      : null,
    p10: values.length ? round(percentile(values, 0.1)) : null,
    median: values.length ? round(percentile(values, 0.5)) : null,
    p90: values.length ? round(percentile(values, 0.9)) : null,
  };
}

function stageMetrics(week: 15 | 16 | 17) {
  const games = results.flatMap((result) =>
    result.schedule.filter(
      (game) => game.fantasyWeek === week && !game.isBye,
    ),
  );
  const userScores = games.map((game) => game.userScore ?? 0);
  const opponentScores = games.map((game) => game.opponentScore ?? 0);
  return {
    games: games.length,
    user: scoreDistribution(userScores),
    opponent: scoreDistribution(opponentScores),
    userMinusOpponentMean:
      games.length > 0 ? round(mean(userScores) - mean(opponentScores)) : null,
    userWinRate:
      games.length > 0
        ? round(games.filter((game) => game.result === "W").length / games.length, 5)
        : null,
  };
}

const strengthCutoffs = Array.from({ length: 9 }, (_, index) =>
  percentile(
    rosterBank.map((entry) => entry.projectedLineupValue),
    (index + 1) / 10,
  ),
);

function strengthDecile(value: number) {
  const index = strengthCutoffs.findIndex((cutoff) => value <= cutoff);
  return index < 0 ? 10 : index + 1;
}

function strengthTier(value: number) {
  const decile = strengthDecile(value);
  if (decile <= 2) return "low";
  if (decile <= 5) return "mid";
  if (decile <= 8) return "high";
  return "elite";
}

function rate(successes: number, total: number) {
  return total > 0 ? round(successes / total, 5) : null;
}

const projectedStrengthTierMetrics = Object.fromEntries(
  (["low", "mid", "high", "elite"] as const).map((tier) => {
    const entries = auditEntries.filter(
      (entry) => strengthTier(entry.projectedLineupValue) === tier,
    );
    const regularGameWins = entries.reduce(
      (total, entry) => total + entry.result.regularWins,
      0,
    );
    return [
      tier,
      {
        seasons: entries.length,
        projectedLineupMean: entries.length
          ? round(mean(entries.map((entry) => entry.projectedLineupValue)))
          : null,
        regularSeasonWinProbability: rate(
          regularGameWins,
          entries.length * 14,
        ),
      },
    ];
  }),
);

const strengthDecileMetrics = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => {
    const decile = index + 1;
    const entries = auditEntries.filter(
      (entry) => strengthDecile(entry.projectedLineupValue) === decile,
    );
    const qualified = entries.filter(
      (entry) => entry.result.qualification.qualified,
    ).length;
    const topTwo = entries.filter(
      (entry) => entry.result.qualification.hasBye,
    ).length;
    const regularGameWins = entries.reduce(
      (total, entry) => total + entry.result.regularWins,
      0,
    );
    const champions = entries.filter(
      (entry) => entry.result.playoffResult === "League Champion",
    ).length;
    const perfectSeasons = entries.filter(
      (entry) =>
        entry.result.finalWins === 16 && entry.result.finalLosses === 0,
    ).length;
    return [
      decile,
      {
        seasons: entries.length,
        projectedLineupMean: entries.length
          ? round(mean(entries.map((entry) => entry.projectedLineupValue)))
          : null,
        userWeeklyMean: entries.length
          ? round(mean(entries.map((entry) => entry.result.averageWeeklyScore)))
          : null,
        regularSeasonWinRate: rate(regularGameWins, entries.length * 14),
        qualificationRate: rate(qualified, entries.length),
        qualificationRateConfidence95: wilsonConfidenceInterval(
          qualified,
          entries.length,
        ),
        topTwoRate: rate(topTwo, entries.length),
        topTwoRateConfidence95: wilsonConfidenceInterval(
          topTwo,
          entries.length,
        ),
        championshipRate: rate(champions, entries.length),
        perfectSeasonRate:
          entries.length >= 1000 ? rate(perfectSeasons, entries.length) : null,
        perfectSeasonSamples: entries.length,
        perfectSeasonCount: perfectSeasons,
      },
    ];
  }),
);

const regularWeekTailStats = {
  sampleSize: regularUserScores.length,
  belowSeventy: rate(
    regularUserScores.filter((score) => score < 70).length,
    regularUserScores.length,
  ),
  belowEighty: rate(
    regularUserScores.filter((score) => score < 80).length,
    regularUserScores.length,
  ),
  belowNinety: rate(
    regularUserScores.filter((score) => score < 90).length,
    regularUserScores.length,
  ),
  betweenNinetyAndOneTen: rate(
    regularUserScores.filter((score) => score >= 90 && score <= 110).length,
    regularUserScores.length,
  ),
  aboveOneThirty: rate(
    regularUserScores.filter((score) => score > 130).length,
    regularUserScores.length,
  ),
  aboveOneForty: rate(
    regularUserScores.filter((score) => score > 140).length,
    regularUserScores.length,
  ),
  aboveOneSixty: rate(
    regularUserScores.filter((score) => score > 160).length,
    regularUserScores.length,
  ),
};

const regularSeasonRecordDistribution = Object.fromEntries(
  Array.from({ length: 15 }, (_, wins) => {
    const losses = 14 - wins;
    const entries = results.filter((result) => result.regularWins === wins);
    return [`${wins}-${losses}`, rate(entries.length, results.length)];
  }),
);

const championshipByRegularWins = Object.fromEntries(
  Array.from({ length: 15 }, (_, regularWinsTotal) => {
    const entries = auditEntries.filter(
      (entry) => entry.result.regularWins === regularWinsTotal,
    );
    const championships = entries.filter(
      (entry) => entry.result.playoffResult === "League Champion",
    ).length;
    return [
      regularWinsTotal,
      {
        seasons: entries.length,
        championshipRate: rate(championships, entries.length),
        championshipRateConfidence95: wilsonConfidenceInterval(
          championships,
          entries.length,
        ),
      },
    ];
  }),
);

const fourteenZeroEntries = auditEntries.filter(
  (entry) => entry.result.regularWins === 14,
);
const fourteenZeroWeekSixteenGames = fourteenZeroEntries
  .map((entry) =>
    entry.result.schedule.find((game) => game.fantasyWeek === 16),
  )
  .filter((game) => game !== undefined && !game.isBye);
const survivingFifteenZeroEntries = fourteenZeroEntries.filter((entry) =>
  entry.result.schedule.some(
    (game) => game.fantasyWeek === 16 && game.result === "W",
  ),
);
const survivingFifteenZeroWeekSeventeenGames =
  survivingFifteenZeroEntries
    .map((entry) =>
      entry.result.schedule.find((game) => game.fantasyWeek === 17),
    )
    .filter((game) => game !== undefined && !game.isBye);

const replacementWeekScores = weekAvailability
  .filter((week) => week.anyTemporary)
  .map((week) => week.score);
const noReplacementWeekScores = weekAvailability
  .filter((week) => !week.anyTemporary)
  .map((week) => week.score);
const replacementExpectedValueLosses = weekAvailability
  .filter((week) => week.anyTemporary)
  .map((week) => week.expectedValueLoss);
const seasonReplacementCounts = auditEntries.map((entry) =>
  entry.regularLineups.reduce(
    (total, lineup) =>
      total +
      Object.values(lineup).filter(
        (player) =>
          player !== null &&
          entry.temporaryReplacementIds.has(player.id),
      ).length,
    0,
  ),
);
const replacementIntegrity = auditEntries.reduce(
  (totals, entry) => {
    entry.regularLineups.forEach((lineup, weekIndex) => {
      const week = weekIndex + 1;
      const selected = Object.values(lineup).filter(
        (player): player is SimulationPlayer => player !== null,
      );
      const replacements = selected.filter((player) =>
        entry.temporaryReplacementIds.has(player.id),
      );
      if (new Set(selected.map((player) => player.id)).size !== selected.length) {
        totals.duplicateLineupWeeks += 1;
      }
      totals.replacementSelections += replacements.length;
      totals.byeViolations += replacements.filter(
        (player) => player.byeWeek === week,
      ).length;
      totals.rosterPersistenceViolations += replacements.filter((player) =>
        entry.roster.some((drafted) => drafted.id === player.id),
      ).length;
    });
    return totals;
  },
  {
    replacementSelections: 0,
    byeViolations: 0,
    duplicateLineupWeeks: 0,
    rosterPersistenceViolations: 0,
  },
);

function sameByeAtPosition(
  roster: readonly SimulationPlayer[],
  position: "K" | "DST",
) {
  const players = roster.filter((player) => player.position === position);
  return (
    players.length === 2 &&
    players[0].byeWeek !== null &&
    players[0].byeWeek === players[1].byeWeek
  );
}

function maximumByeOverlap(roster: readonly SimulationPlayer[]) {
  const counts = new Map<number, number>();
  for (const player of roster) {
    if (player.byeWeek === null) continue;
    counts.set(player.byeWeek, (counts.get(player.byeWeek) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function performanceGroup(entries: readonly SeasonAuditEntry[]) {
  const scores = entries.flatMap((entry) =>
    entry.result.schedule
      .filter((game) => game.fantasyWeek <= 14)
      .map((game) => game.userScore ?? 0),
  );
  const lineups = entries.flatMap((entry) => entry.regularLineups);
  const championships = entries.filter(
    (entry) => entry.result.playoffResult === "League Champion",
  ).length;
  return {
    seasons: entries.length,
    averageRegularWins: entries.length
      ? round(mean(entries.map((entry) => entry.result.regularWins)))
      : 0,
    averageWeeklyScore: scores.length ? round(mean(scores)) : 0,
    qualificationRate: entries.length
      ? round(
          entries.filter((entry) => entry.result.qualification.qualified).length /
            entries.length,
        )
      : 0,
    championshipRate: entries.length
      ? round(championships / entries.length)
      : 0,
    championshipRateConfidence95: wilsonConfidenceInterval(
      championships,
      entries.length,
    ),
    emptySlotWeekRate: lineups.length
      ? round(
          lineups.filter((lineup) => getEmptyLineupSlots(lineup).length > 0)
            .length / lineups.length,
        )
      : 0,
    emptyKSlotRate: lineups.length
      ? round(lineups.filter((lineup) => lineup.K === null).length / lineups.length)
      : 0,
    emptyDSTSlotRate: lineups.length
      ? round(lineups.filter((lineup) => lineup.DST === null).length / lineups.length)
      : 0,
    temporaryReplacementWeekRate: entries.length
      ? round(
          entries.reduce((total, entry) => {
            return total + entry.regularLineups.filter((lineup) =>
              Object.values(lineup).some(
                (player) =>
                  player !== null &&
                  entry.temporaryReplacementIds.has(player.id),
              ),
            ).length;
          }, 0) / lineups.length,
        )
      : 0,
  };
}
const finalRecordCounts = Object.fromEntries(
  Array.from(
    results.reduce((counts, result) => {
      const key = `${result.finalWins}-${result.finalLosses}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  ).sort(([first], [second]) => first.localeCompare(second)),
);

const tierMap = buildPlayerTierMap(SIMULATION_PLAYERS);

function checkPlayer(label: string, player: SimulationPlayer, expected: number) {
  const detailed = Array.from({ length: 10_000 }, (_, index) =>
    simulatePlayerScoreDetailed(
      expected,
      player,
      tierMap.get(player.id) ?? "mid-tier",
      new SeededRandom(`position-${label}-${index}`),
    ),
  );
  const samples = detailed.map((entry) => entry.score);
  return [
    label,
    {
      player: player.name,
      expectedPPG: round(expected),
      simulatedMean: round(mean(samples)),
      meanRatio: round(mean(samples) / expected),
      standardDeviation: round(standardDeviation(samples)),
      p5: round(percentile(samples, 0.05)),
      p10: round(percentile(samples, 0.1)),
      p50: round(percentile(samples, 0.5)),
      p90: round(percentile(samples, 0.9)),
      p95: round(percentile(samples, 0.95)),
      minimum: round(Math.min(...samples)),
      maximum: round(Math.max(...samples)),
      bustRate: round(detailed.filter((entry) => entry.outcomeMultiplier < 0.5).length / detailed.length),
      ceilingRate: round(detailed.filter((entry) => entry.outcomeMultiplier > 1.65).length / detailed.length),
      negativeRate: round(samples.filter((score) => score < 0).length / samples.length),
    },
  ] as const;
}

const playerPositionChecks = Object.fromEntries(
  (["QB", "RB", "WR", "TE", "K", "DST"] as FantasyPosition[]).map((position) => {
    const positionPlayers = SIMULATION_PLAYERS.filter((player) => player.position === position)
      .sort((first, second) => second.blendedPPG - first.blendedPPG);
    const player = positionPlayers[Math.floor(positionPlayers.length / 2)];
    return checkPlayer(position, player, player.blendedPPG);
  }),
);

const temporaryReplacementSample = (() => {
  const bank = rosterBank[0];
  const week = 1;
  const candidate = bank.temporaryReplacementPool
    .filter((player) => player.position === "RB" && player.byeWeek !== week)
    .sort((first, second) => second.blendedPPG - first.blendedPPG)[0];
  const expected = getExpectedPlayerScore(candidate, week, DEFENSE_POSITION_RANKS);
  return checkPlayer("Temporary Replacement (RB)", candidate, expected)[1];
})();

const payload = {
  _meta: {
    dataVersion: SIXTEEN_ZERO_DATA_VERSION,
    engineVersion: SIXTEEN_ZERO_ENGINE_VERSION,
    generatedAt: "2026-07-27",
    seasonCount,
    draftCount,
    rosterCount: rosterBank.length,
    deterministicSeedPrefix: "stat-audit",
  },
  playerPositionChecks,
  temporaryReplacementSample,
  teamScores: {
    userMean: round(mean(regularUserScores)),
    userP10: round(percentile(regularUserScores, 0.1)),
    userMedian: round(percentile(regularUserScores, 0.5)),
    userP90: round(percentile(regularUserScores, 0.9)),
    opponentMean: round(mean(regularOpponentScores)),
    opponentP10: round(percentile(regularOpponentScores, 0.1)),
    opponentMedian: round(percentile(regularOpponentScores, 0.5)),
    opponentP90: round(percentile(regularOpponentScores, 0.9)),
  },
  regularWeekTailStats,
  regularSeasonRecordDistribution,
  stageDifficulty: {
    methodology:
      "Opponents (regular season and playoffs) are simulated CPU rosters drafted in the same 12-team draft, not a synthetic score distribution. Playoff opponents are chosen from precomputed, projection-based roster strength only; no stage multiplier is applied to any player or team score.",
    cpuStandingsConfig: CPU_STANDINGS_CONFIG,
    regularSeason: {
      games: regularOpponentScores.length,
      user: scoreDistribution(regularUserScores),
      opponent: scoreDistribution(regularOpponentScores),
      userMinusOpponentMean: round(
        mean(regularUserScores) - mean(regularOpponentScores),
      ),
      userWinRate: round(mean(regularWins) / 14, 5),
    },
    week15: stageMetrics(15),
    week16: stageMetrics(16),
    week17: stageMetrics(17),
  },
  strengthOutcomes: {
    projectedLineupTiers: projectedStrengthTierMetrics,
    byProjectedLineupDecile: strengthDecileMetrics,
    championshipByRegularSeasonWins: championshipByRegularWins,
  },
  outcomes: {
    averageRegularWins: round(mean(regularWins)),
    qualificationRate: round(results.filter((result) => result.qualification.qualified).length / results.length),
    qualificationRateConfidence95: wilsonConfidenceInterval(
      results.filter((result) => result.qualification.qualified).length,
      results.length,
    ),
    topTwoSeedRate: round(results.filter((result) => result.qualification.hasBye).length / results.length),
    topTwoSeedRateConfidence95: wilsonConfidenceInterval(
      results.filter((result) => result.qualification.hasBye).length,
      results.length,
    ),
    championshipRate: round(results.filter((result) => result.playoffResult === "League Champion").length / results.length),
    championshipRateConfidence95: wilsonConfidenceInterval(
      results.filter((result) => result.playoffResult === "League Champion").length,
      results.length,
    ),
    undefeatedRegularSeasonRate: round(results.filter((result) => result.regularWins === 14).length / results.length, 5),
    undefeatedRegularSeasonRateConfidence95: wilsonConfidenceInterval(
      results.filter((result) => result.regularWins === 14).length,
      results.length,
    ),
    perfectSeasonRate: round(results.filter((result) => result.finalWins === 16 && result.finalLosses === 0).length / results.length, 5),
    perfectSeasonRateConfidence95: wilsonConfidenceInterval(
      results.filter(
        (result) => result.finalWins === 16 && result.finalLosses === 0,
      ).length,
      results.length,
    ),
    perfectSeasonCount: results.filter((result) => result.finalWins === 16 && result.finalLosses === 0).length,
    fourteenZeroCount: fourteenZeroEntries.length,
    week16WinRateAmongFourteenZero: rate(
      fourteenZeroWeekSixteenGames.filter((game) => game.result === "W")
        .length,
      fourteenZeroWeekSixteenGames.length,
    ),
    week16WinRateAmongFourteenZeroConfidence95: wilsonConfidenceInterval(
      fourteenZeroWeekSixteenGames.filter((game) => game.result === "W")
        .length,
      fourteenZeroWeekSixteenGames.length,
    ),
    survivingFifteenZeroCount: survivingFifteenZeroEntries.length,
    week17WinRateAmongSurvivingFifteenZero: rate(
      survivingFifteenZeroWeekSeventeenGames.filter(
        (game) => game.result === "W",
      ).length,
      survivingFifteenZeroWeekSeventeenGames.length,
    ),
    week17WinRateAmongSurvivingFifteenZeroConfidence95:
      wilsonConfidenceInterval(
        survivingFifteenZeroWeekSeventeenGames.filter(
          (game) => game.result === "W",
        ).length,
        survivingFifteenZeroWeekSeventeenGames.length,
      ),
    finalRecordCounts,
  },
  lineupAvailability: {
    regularSeasonWeekSamples: weekAvailability.length,
    emptyKSlotRate: round(
      weekAvailability.filter((week) => week.emptyK).length /
        weekAvailability.length,
      5,
    ),
    emptyDSTSlotRate: round(
      weekAvailability.filter((week) => week.emptyDST).length /
        weekAvailability.length,
      5,
    ),
    anyEmptyOffensiveSlotRate: round(
      weekAvailability.filter((week) => week.emptyOffense).length /
        weekAvailability.length,
      5,
    ),
    anyEmptyLineupSlotRate: round(
      weekAvailability.filter((week) => week.anyEmpty).length /
        weekAvailability.length,
      5,
    ),
    temporaryKReplacementRate: round(
      weekAvailability.filter((week) => week.temporaryK).length /
        weekAvailability.length,
      5,
    ),
    temporaryDSTReplacementRate: round(
      weekAvailability.filter((week) => week.temporaryDST).length /
        weekAvailability.length,
      5,
    ),
    temporaryOffensiveReplacementRate: round(
      weekAvailability.filter((week) => week.temporaryOffense).length /
        weekAvailability.length,
      5,
    ),
    anyTemporaryReplacementRate: round(
      weekAvailability.filter((week) => week.anyTemporary).length /
        weekAvailability.length,
      5,
    ),
    multipleTemporaryReplacementsInOneWeekRate: round(
      weekAvailability.filter((week) => week.multipleTemporaryReplacements)
        .length / weekAvailability.length,
      5,
    ),
    averageExpectedValueLossWhenReplacementUsed:
      replacementExpectedValueLosses.length > 0
        ? round(mean(replacementExpectedValueLosses))
        : null,
    averageRealizedScoreWithReplacement:
      replacementWeekScores.length > 0
        ? round(mean(replacementWeekScores))
        : null,
    averageRealizedScoreWithoutReplacement:
      noReplacementWeekScores.length > 0
        ? round(mean(noReplacementWeekScores))
        : null,
    averageRealizedScoreDifference:
      replacementWeekScores.length > 0 && noReplacementWeekScores.length > 0
        ? round(
            mean(replacementWeekScores) - mean(noReplacementWeekScores),
          )
        : null,
    seasonReplacementUsage: {
      zero: {
        count: seasonReplacementCounts.filter((count) => count === 0).length,
        rate: rate(
          seasonReplacementCounts.filter((count) => count === 0).length,
          seasonReplacementCounts.length,
        ),
      },
      one: {
        count: seasonReplacementCounts.filter((count) => count === 1).length,
        rate: rate(
          seasonReplacementCounts.filter((count) => count === 1).length,
          seasonReplacementCounts.length,
        ),
      },
      multiple: {
        count: seasonReplacementCounts.filter((count) => count >= 2).length,
        rate: rate(
          seasonReplacementCounts.filter((count) => count >= 2).length,
          seasonReplacementCounts.length,
        ),
      },
    },
    replacementIntegrity: {
      ...replacementIntegrity,
      selectedFromActualUndraftedPool:
        replacementIntegrity.rosterPersistenceViolations === 0,
      selectedBeforeRealizedScoring:
        "Lineup optimization completes before player score generation in seasonSimulation.ts.",
      temporaryOnly:
        replacementIntegrity.rosterPersistenceViolations === 0,
    },
    emptyWeekAverageScore: emptyWeekScores.length
      ? round(mean(emptyWeekScores))
      : null,
    completeWeekAverageScore: completeWeekScores.length
      ? round(mean(completeWeekScores))
      : null,
    observedAverageScoringPenalty: emptyWeekScores.length
      ? round(mean(completeWeekScores) - mean(emptyWeekScores))
      : null,
    scoringPenaltyDefinition:
      "Complete-lineup weekly mean minus weekly mean when at least one required slot is empty; no score compensation is applied.",
  },
  byeOverlapPerformance: {
    heavyOverlapDefinition:
      "At least five drafted players share one NFL bye week.",
    heavy: performanceGroup(
      auditEntries.filter((entry) => maximumByeOverlap(entry.roster) >= 5),
    ),
    notHeavy: performanceGroup(
      auditEntries.filter((entry) => maximumByeOverlap(entry.roster) < 5),
    ),
  },
  specialTeamsByeComparison: {
    kickers: {
      sameBye: performanceGroup(
        auditEntries.filter((entry) => sameByeAtPosition(entry.roster, "K")),
      ),
      diversified: performanceGroup(
        auditEntries.filter((entry) => !sameByeAtPosition(entry.roster, "K")),
      ),
    },
    defenses: {
      sameBye: performanceGroup(
        auditEntries.filter((entry) => sameByeAtPosition(entry.roster, "DST")),
      ),
      diversified: performanceGroup(
        auditEntries.filter((entry) => !sameByeAtPosition(entry.roster, "DST")),
      ),
    },
  },
  draftSlots: Object.fromEntries(
    Array.from(slotResults.entries()).map(([slot, slotSeasons]) => [
      slot,
      {
        samples: slotSeasons.length,
        averageRegularWins: round(mean(slotSeasons.map((result) => result.regularWins))),
        averageRegularWinsConfidence95: meanConfidenceInterval(
          slotSeasons.map((result) => result.regularWins),
        ),
        averageWeeklyScore: round(mean(slotSeasons.map((result) => result.averageWeeklyScore))),
        averageWeeklyScoreConfidence95: meanConfidenceInterval(
          slotSeasons.map((result) => result.averageWeeklyScore),
        ),
        championshipRate: round(
          slotSeasons.filter((result) => result.playoffResult === "League Champion").length /
            slotSeasons.length,
        ),
        championshipRateConfidence95: wilsonConfidenceInterval(
          slotSeasons.filter(
            (result) => result.playoffResult === "League Champion",
          ).length,
          slotSeasons.length,
        ),
      },
    ]),
  ),
};

await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload, null, 2));
