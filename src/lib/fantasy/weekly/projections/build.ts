import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { normalizeNflTeamAbbr } from "@/lib/fantasy/weekly/identity";
import {
  WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
  type WeeklyFantasyProjectionTrainingRow,
} from "./contract";

export type HistoricalTeamGameRow = {
  season: number;
  week: number;
  team: string;
  opponent: string;
  offEpa: number;
  offPlays: number;
  passEpa: number;
  passPlays: number;
  rushEpa: number;
  rushPlays: number;
};

export type ScheduleTeamWeek = {
  season: number;
  week: number;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  kickoff: string | null;
  restDays: number | null;
};

export type UniverseCandidate = {
  season: number;
  week: number;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  team: string;
  opponent: string;
  eligible: boolean;
};

function chronology(row: { season: number; week: number }): number {
  return row.season * 100 + row.week;
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Rows for a player strictly before the target week (current season only, N-1 safe). */
function priorCurrentSeasonRows(
  history: readonly HistoricalPlayerWeek[],
  playerId: string,
  season: number,
  week: number,
): HistoricalPlayerWeek[] {
  return history
    .filter((row) => row.playerId === playerId && row.season === season && row.week < week)
    .sort((a, b) => a.week - b.week);
}

/** A player's full previous-NFL-season rows (season - 1), never touching the modeled season. */
function priorSeasonRows(
  history: readonly HistoricalPlayerWeek[],
  playerId: string,
  season: number,
): HistoricalPlayerWeek[] {
  return history.filter((row) => row.playerId === playerId && row.season === season - 1);
}

function priorSeasonAggregates(rows: readonly HistoricalPlayerWeek[]) {
  if (!rows.length) {
    return {
      games: null as number | null,
      ppg: null as number | null,
      attempts: null as number | null,
      carries: null as number | null,
      targets: null as number | null,
      receptions: null as number | null,
      lastTeam: null as string | null,
    };
  }
  const sorted = [...rows].sort((a, b) => a.week - b.week);
  return {
    games: rows.length,
    ppg: mean(rows.map((row) => row.actualFantasyPoints)),
    attempts: mean(rows.map((row) => row.stats.passAttempts)),
    carries: mean(rows.map((row) => row.stats.rushAttempts)),
    targets: mean(rows.map((row) => row.stats.targets)),
    receptions: mean(rows.map((row) => row.stats.receptions)),
    lastTeam: sorted[sorted.length - 1].team,
  };
}

/**
 * Leakage-safe position-specific fantasy points allowed, built from player-week
 * outcomes rather than a season-full source file. `beforeWeek == null` means
 * "entire season" (used only for the previous-season variant); otherwise every
 * outcome must satisfy `week < beforeWeek`.
 */
function fpaForOpponent(
  history: readonly HistoricalPlayerWeek[],
  season: number,
  position: FantasyPosition,
  opponent: string,
  beforeWeek: number | null,
): { value: number | null; games: number } {
  const eligible = history.filter((row) =>
    row.season === season &&
    row.position === position &&
    row.opponent === opponent &&
    (beforeWeek == null || row.week < beforeWeek)
  );
  const byWeek = new Map<number, number>();
  for (const row of eligible) {
    byWeek.set(row.week, (byWeek.get(row.week) ?? 0) + row.actualFantasyPoints);
  }
  const weeklyTotals = [...byWeek.values()];
  return { value: mean(weeklyTotals), games: weeklyTotals.length };
}

function teamOpponentFeatures(
  teamHistory: readonly HistoricalTeamGameRow[],
  season: number,
  week: number,
  team: string,
  opponent: string,
) {
  const priorTeamGames = teamHistory.filter(
    (row) => row.season === season && row.week < week && row.team === team,
  );
  // Opponent's defense allowed: games where opponent was the defense (i.e. the
  // opposing offense's row lists `opponent` as its opponent).
  const priorOpponentDefenseGames = teamHistory.filter(
    (row) => row.season === season && row.week < week && row.opponent === opponent,
  );
  const ratio = (rows: readonly HistoricalTeamGameRow[], num: (r: HistoricalTeamGameRow) => number, den: (r: HistoricalTeamGameRow) => number) => {
    const top = rows.reduce((sum, row) => sum + num(row), 0);
    const bottom = rows.reduce((sum, row) => sum + den(row), 0);
    return bottom > 0 ? top / bottom : null;
  };
  return {
    teamOffensiveEpaPrior: ratio(priorTeamGames, (r) => r.offEpa, (r) => r.offPlays),
    teamPassEpaPrior: ratio(priorTeamGames, (r) => r.passEpa, (r) => r.passPlays),
    teamRushEpaPrior: ratio(priorTeamGames, (r) => r.rushEpa, (r) => r.rushPlays),
    teamOffensivePlaysPrior: priorTeamGames.length ? mean(priorTeamGames.map((r) => r.offPlays)) : null,
    teamPassRatePrior: ratio(priorTeamGames, (r) => r.passPlays, (r) => r.offPlays),
    opponentDefensiveEpaPrior: ratio(priorOpponentDefenseGames, (r) => r.offEpa, (r) => r.offPlays),
    opponentPassDefenseEpaPrior: ratio(priorOpponentDefenseGames, (r) => r.passEpa, (r) => r.passPlays),
    opponentRushDefenseEpaPrior: ratio(priorOpponentDefenseGames, (r) => r.rushEpa, (r) => r.rushPlays),
  };
}

export type SnapShareLookup = (
  playerId: string,
  season: number,
  week: number,
) => number | null;

export function buildTrainingRow(
  target: UniverseCandidate,
  history: readonly HistoricalPlayerWeek[],
  teamHistory: readonly HistoricalTeamGameRow[],
  schedule: readonly ScheduleTeamWeek[],
  snapShareFor: SnapShareLookup,
  generatedAt: string,
): WeeklyFantasyProjectionTrainingRow {
  const outcome = history.find(
    (row) => row.playerId === target.playerId && row.season === target.season && row.week === target.week,
  );
  const actualFantasyPoints = outcome?.actualFantasyPoints ?? 0;

  const currentRows = priorCurrentSeasonRows(history, target.playerId, target.season, target.week);
  const last3Rows = currentRows.slice(-3);
  const last5Rows = currentRows.slice(-5);
  const priorRows = priorSeasonRows(history, target.playerId, target.season);
  const priorAgg = priorSeasonAggregates(priorRows);

  const weeksSinceLastAppearance = currentRows.length
    ? target.week - currentRows[currentRows.length - 1].week
    : null;

  const currentFpa = fpaForOpponent(history, target.season, target.position, target.opponent, target.week);
  const priorSeasonFpa = fpaForOpponent(history, target.season - 1, target.position, target.opponent, null);

  const teamOpponent = teamOpponentFeatures(teamHistory, target.season, target.week, target.team, target.opponent);

  const scheduleRow = schedule.find(
    (row) => row.season === target.season && row.week === target.week && row.team === target.team,
  );

  const snapShareSeasonPrior = currentRows.length
    ? mean(
        currentRows
          .map((row) => snapShareFor(row.playerId, row.season, row.week))
          .filter((value): value is number => value != null),
      )
    : null;
  const snapShareLast3 = last3Rows.length
    ? mean(
        last3Rows
          .map((row) => snapShareFor(row.playerId, row.season, row.week))
          .filter((value): value is number => value != null),
      )
    : null;
  const snapAvailableCount = currentRows.filter(
    (row) => snapShareFor(row.playerId, row.season, row.week) != null,
  ).length;

  return {
    schemaVersion: WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
    season: target.season,
    week: target.week,
    playerId: target.playerId,
    playerName: target.playerName,
    position: target.position,
    team: target.team,
    opponent: target.opponent,
    homeAway: scheduleRow?.homeAway ?? "home",
    kickoff: scheduleRow?.kickoff ?? null,
    historicalUniverseEligible: target.eligible,
    // Leakage-safe: only prior-season rows and strictly-prior current-season
    // rows are consulted; week N's own row is never inspected.
    projectionCandidate: priorRows.length > 0 || currentRows.length > 0,
    actualFantasyPoints,

    hasPriorSeason: priorRows.length > 0,
    rookieOrNoPriorHistory: priorRows.length === 0,
    priorSeasonPpg: priorAgg.ppg,
    priorSeasonGames: priorAgg.games,
    priorSeasonAttempts: priorAgg.attempts,
    priorSeasonCarries: priorAgg.carries,
    priorSeasonTargets: priorAgg.targets,
    priorSeasonReceptions: priorAgg.receptions,
    priorSeasonSnapRate: null,

    gamesPlayedPrior: currentRows.length,
    weeksSinceLastAppearance,
    seasonPpgPrior: mean(currentRows.map((row) => row.actualFantasyPoints)),
    last3PpgPrior: mean(last3Rows.map((row) => row.actualFantasyPoints)),
    last5PpgPrior: mean(last5Rows.map((row) => row.actualFantasyPoints)),
    teamChangedFromPriorSeason:
      priorAgg.lastTeam == null ? null : normalizeNflTeamAbbr(priorAgg.lastTeam) !== normalizeNflTeamAbbr(target.team),

    passAttemptsSeasonPrior: mean(currentRows.map((row) => row.stats.passAttempts)),
    passAttemptsLast3: mean(last3Rows.map((row) => row.stats.passAttempts)),
    passingYardsSeasonPrior: mean(currentRows.map((row) => row.stats.passingYards)),
    passingTdsSeasonPrior: mean(currentRows.map((row) => row.stats.passingTouchdowns)),
    interceptionsSeasonPrior: mean(currentRows.map((row) => row.stats.interceptions)),
    carriesSeasonPrior: mean(currentRows.map((row) => row.stats.rushAttempts)),
    rushingYardsSeasonPrior: mean(currentRows.map((row) => row.stats.rushingYards)),
    rushingTdsSeasonPrior: mean(currentRows.map((row) => row.stats.rushingTouchdowns)),

    carriesLast3: mean(last3Rows.map((row) => row.stats.rushAttempts)),
    targetsSeasonPrior: mean(currentRows.map((row) => row.stats.targets)),
    targetsLast3: mean(last3Rows.map((row) => row.stats.targets)),
    receptionsSeasonPrior: mean(currentRows.map((row) => row.stats.receptions)),
    rushYardsSeasonPrior: mean(currentRows.map((row) => row.stats.rushingYards)),
    receivingYardsSeasonPrior: mean(currentRows.map((row) => row.stats.receivingYards)),
    targetShareSeasonPrior: mean(
      currentRows.map((row) => row.usage.targetShare).filter((value): value is number => value != null),
    ),

    receivingAirYardsSeasonPrior: mean(
      currentRows.map((row) => row.usage.receivingAirYards).filter((value): value is number => value != null),
    ),
    airYardsShareSeasonPrior: mean(
      currentRows.map((row) => row.usage.airYardsShare).filter((value): value is number => value != null),
    ),

    snapShareSeasonPrior,
    snapShareLast3,
    snapCoverageAvailable: currentRows.length > 0 && snapAvailableCount === currentRows.length,

    teamOffensiveEpaPrior: teamOpponent.teamOffensiveEpaPrior,
    teamPassEpaPrior: teamOpponent.teamPassEpaPrior,
    teamRushEpaPrior: teamOpponent.teamRushEpaPrior,
    teamOffensivePlaysPrior: teamOpponent.teamOffensivePlaysPrior,
    teamPassRatePrior: teamOpponent.teamPassRatePrior,

    opponentDefensiveEpaPrior: teamOpponent.opponentDefensiveEpaPrior,
    opponentPassDefenseEpaPrior: teamOpponent.opponentPassDefenseEpaPrior,
    opponentRushDefenseEpaPrior: teamOpponent.opponentRushDefenseEpaPrior,

    opponentPositionFpaPrior: currentFpa.value,
    opponentPositionFpaGamesPrior: currentFpa.games,
    opponentPositionFpaPriorSeason: priorSeasonFpa.value,

    shortWeek: scheduleRow?.restDays == null ? null : scheduleRow.restDays <= 4,
    byeReturn: scheduleRow?.restDays == null ? null : scheduleRow.restDays >= 12,
    restDays: scheduleRow?.restDays ?? null,

    starterStatus: "unknown",

    provenance: {
      generatedAt,
      sourceManifests: [],
      scheduleSource: { url: "", retrievedAtUtc: "", sha256: "" },
    },
  };
}

export function buildTrainingDataset(
  candidates: readonly UniverseCandidate[],
  history: readonly HistoricalPlayerWeek[],
  teamHistory: readonly HistoricalTeamGameRow[],
  schedule: readonly ScheduleTeamWeek[],
  snapShareFor: SnapShareLookup,
  generatedAt: string,
  provenance: WeeklyFantasyProjectionTrainingRow["provenance"],
): WeeklyFantasyProjectionTrainingRow[] {
  return [...candidates]
    .sort((a, b) => chronology(a) - chronology(b) || a.position.localeCompare(b.position) || a.playerId.localeCompare(b.playerId))
    .map((candidate) => ({
      ...buildTrainingRow(candidate, history, teamHistory, schedule, snapShareFor, generatedAt),
      provenance,
    }));
}
