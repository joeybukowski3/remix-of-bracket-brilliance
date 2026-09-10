import { computePercentileRanks } from "@/lib/shared/jkbHeat";
import type {
  TouchdownCandidateInput,
  TouchdownMetric,
  TouchdownOpponentGame,
  TouchdownPosition,
  TouchdownPreviewPlayer,
  TouchdownSampleState,
  TouchdownScoreComponents,
  TouchdownWindowKey,
  TouchdownWindowMetrics,
} from "./types";

export const TD_SCORE_WEIGHTS: Record<keyof TouchdownScoreComponents, number> = {
  tdOpportunities: 0.25,
  playerUsage: 0.20,
  teamUsage: 0.15,
  tdSuccess: 0.15,
  opponentTdOpportunities: 0.10,
  opponentPositionTdsAllowed: 0.10,
  impliedTeamPoints: 0.05,
};
export const TD_OPPORTUNITY_WEIGHTS = { rz: 0.25, inside10: 0.35, goalLine: 0.40 } as const;
export const TD_SUCCESS_PRIOR_OPPORTUNITIES = 20;

const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const rate = (total: number, games: number) => games > 0 ? total / games : null;
const round = (value: number | null, digits = 6) => value == null ? null : Number(value.toFixed(digits));

export function isTouchdownOpportunity(yardline100: number | null | undefined, boundary: 20 | 10 | 5): boolean {
  return finite(yardline100) && yardline100 > 0 && yardline100 <= boundary;
}

export function aggregateScorerTouchdownsByPosition(rows: readonly { position: TouchdownPosition; rushingTds: number; receivingTds: number; passingTds?: number; specialTeamsTds?: number }[]): Record<TouchdownPosition, number> {
  const totals: Record<TouchdownPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const row of rows) totals[row.position] += row.rushingTds + row.receivingTds;
  return totals;
}

export function selectPlayerGames<T extends { season: number; week: number }>(games: readonly T[], window: TouchdownWindowKey): T[] {
  const ordered = [...games].sort((a, b) => b.season - a.season || b.week - a.week);
  if (window === "last8") return ordered.slice(0, 8);
  return ordered.filter((game) => game.season === Number(window));
}

/**
 * Opponent "TDs allowed to this position, per game" over two fixed, entirely
 * window-independent samples:
 *
 * - `season` -- current-season / YTD games only. Empty until the opponent has
 *   played a current-season game (e.g. Week 1 -> `null`).
 * - `last5`  -- the opponent's trailing five applicable games in strict
 *   `(season, week)` reverse-chronological order. It crosses the season boundary
 *   until five current-season games exist, so 2026 Week 1 is five 2025 games,
 *   Week 3 is the final three 2025 games plus Weeks 1-2 2026, and from Week 6 on
 *   it is normally five current-season games. Divides by the games actually
 *   present (<= 5), never by a fixed 5.
 *
 * Neither figure is derived from `selectPlayerGames`/the Last 8 UI window.
 */
export function opponentPositionTdAllowedRates(
  opponentGames: readonly TouchdownOpponentGame[] | null,
  position: TouchdownPosition,
  currentSeason: number,
): { season: number | null; last5: number | null } {
  if (opponentGames == null || opponentGames.length === 0) return { season: null, last5: null };
  const chronological = [...opponentGames].sort((a, b) => b.season - a.season || b.week - a.week);
  const perGame = (games: readonly TouchdownOpponentGame[]): number | null =>
    games.length > 0 ? sum(games.map((game) => game.touchdownsAllowedByPosition[position])) / games.length : null;
  return {
    season: round(perGame(chronological.filter((game) => game.season === currentSeason))),
    last5: round(perGame(chronological.slice(0, 5))),
  };
}

function resolveCurrentSeason(candidates: readonly TouchdownCandidateInput[], explicit?: number): number {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  let max = 0;
  for (const candidate of candidates) {
    for (const game of candidate.playerGames ?? []) if (game.season > max) max = game.season;
    for (const game of candidate.opponentGames ?? []) if (game.season > max) max = game.season;
  }
  return max;
}

function sampleState(source: readonly unknown[] | null, selected: readonly unknown[]): TouchdownSampleState {
  if (source == null) return "missing";
  return selected.length === 0 ? "zero" : "available";
}

type RawRow = {
  candidate: TouchdownCandidateInput;
  state: TouchdownSampleState;
  playerGames: NonNullable<TouchdownCandidateInput["playerGames"]>;
  opponentGames: NonNullable<TouchdownCandidateInput["opponentGames"]>;
  tdPerGame: number | null;
  tdLast5PerGame: number | null;
  usagePerGame: number | null;
  usageIndex: number | null;
  teamUsageShare: number | null;
  rzPerGame: number | null;
  i10PerGame: number | null;
  glPerGame: number | null;
  rzShare: number | null;
  glShare: number | null;
  tdSuccessRate: number | null;
  oppRzPerGame: number | null;
  oppI10PerGame: number | null;
  oppGlPerGame: number | null;
  oppPositionTdPerGame: number | null;
  oppPositionIndex: number | null;
};

function allKnown<T>(rows: readonly T[], pick: (row: T) => number | null): number[] | null {
  const values = rows.map(pick);
  return values.every(finite) ? values as number[] : null;
}

function buildRaw(candidate: TouchdownCandidateInput, window: TouchdownWindowKey): RawRow {
  const playerGames = candidate.playerGames == null ? [] : selectPlayerGames(candidate.playerGames, window);
  const opponentGames = candidate.opponentGames == null ? [] : selectPlayerGames(candidate.opponentGames, window);
  const state = sampleState(candidate.playerGames, playerGames);
  const games = playerGames.length;
  const scorerOpportunityValues = allKnown(playerGames, (game) => game.scorerOpportunities);
  const scorerOpps = scorerOpportunityValues ? sum(scorerOpportunityValues) : null;
  const teamOpps = allKnown(playerGames, (game) => game.teamScorerOpportunities);
  const teamRz = allKnown(playerGames, (game) => game.teamRzOpportunities);
  const teamGl = allKnown(playerGames, (game) => game.teamGoalLineOpportunities);
  const rz = allKnown(playerGames, (game) => game.rzOpportunities);
  const i10 = allKnown(playerGames, (game) => game.inside10Opportunities);
  const gl = allKnown(playerGames, (game) => game.goalLineOpportunities);
  const touchdowns = sum(playerGames.map((game) => game.touchdowns));
  const latest5 = playerGames.slice(0, 5);
  const oppRz = allKnown(opponentGames, (game) => game.rzOpportunitiesAllowed);
  const oppI10 = allKnown(opponentGames, (game) => game.inside10OpportunitiesAllowed);
  const oppGl = allKnown(opponentGames, (game) => game.goalLineOpportunitiesAllowed);
  const oppPos = opponentGames.map((game) => game.touchdownsAllowedByPosition[candidate.position]);
  return {
    candidate, state, playerGames, opponentGames,
    tdPerGame: rate(touchdowns, games),
    tdLast5PerGame: rate(sum(latest5.map((game) => game.touchdowns)), latest5.length),
    usagePerGame: scorerOpps == null ? null : rate(scorerOpps, games), usageIndex: null,
    teamUsageShare: scorerOpps != null && teamOpps && sum(teamOpps) > 0 ? scorerOpps / sum(teamOpps) : null,
    rzPerGame: rz ? rate(sum(rz), games) : null,
    i10PerGame: i10 ? rate(sum(i10), games) : null,
    glPerGame: gl ? rate(sum(gl), games) : null,
    rzShare: rz && teamRz && sum(teamRz) > 0 ? sum(rz) / sum(teamRz) : null,
    glShare: gl && teamGl && sum(teamGl) > 0 ? sum(gl) / sum(teamGl) : null,
    tdSuccessRate: games > 0 ? 0 : null,
    oppRzPerGame: oppRz ? rate(sum(oppRz), opponentGames.length) : null,
    oppI10PerGame: oppI10 ? rate(sum(oppI10), opponentGames.length) : null,
    oppGlPerGame: oppGl ? rate(sum(oppGl), opponentGames.length) : null,
    oppPositionTdPerGame: opponentGames.length > 0 ? rate(sum(oppPos), opponentGames.length) : null,
    oppPositionIndex: null,
  };
}

function mean(values: readonly number[]): number | null { return values.length ? sum(values) / values.length : null; }

function metric(values: readonly (number | null)[], index: number): TouchdownMetric {
  const percentiles = computePercentileRanks(values);
  const value = values[index];
  const percentile = percentiles[index];
  const ordered = values.filter(finite).sort((a, b) => b - a);
  return {
    value: round(value), percentile: round(percentile),
    rank: finite(value) ? ordered.findIndex((candidate) => candidate === value) + 1 : null,
    poolSize: ordered.length,
  };
}

function blendedMetric(parts: readonly TouchdownMetric[], weights: readonly number[]): TouchdownMetric {
  if (parts.some((part) => part.percentile == null)) return { value: null, percentile: null, rank: null, poolSize: 0 };
  const value = parts.reduce((total, part, index) => total + (part.percentile as number) * weights[index], 0);
  return { value: round(value), percentile: round(value), rank: null, poolSize: Math.min(...parts.map((part) => part.poolSize)) };
}

export function buildTouchdownScores(candidates: readonly TouchdownCandidateInput[], window: TouchdownWindowKey, currentSeason?: number): TouchdownPreviewPlayer[] {
  const raw = candidates.map((candidate) => buildRaw(candidate, window));
  const resolvedSeason = resolveCurrentSeason(candidates, currentSeason);
  const populationGames = raw.flatMap((row) => row.playerGames).filter((game) => finite(game.scorerOpportunities));
  const populationTd = sum(populationGames.map((game) => game.touchdowns));
  const populationOpp = sum(populationGames.map((game) => game.scorerOpportunities).filter(finite));
  const leagueConversion = populationOpp > 0 ? populationTd / populationOpp : null;

  for (const row of raw) {
    const positionRows = raw.filter((candidate) => candidate.candidate.position === row.candidate.position);
    const usageMean = mean(positionRows.map((candidate) => candidate.usagePerGame).filter(finite));
    row.usageIndex = finite(row.usagePerGame) && finite(usageMean) && usageMean > 0 ? row.usagePerGame / usageMean : null;
    const allowedMean = mean(positionRows.map((candidate) => candidate.oppPositionTdPerGame).filter(finite));
    row.oppPositionIndex = finite(row.oppPositionTdPerGame) && finite(allowedMean) && allowedMean > 0 ? row.oppPositionTdPerGame / allowedMean : null;
    if (row.playerGames.length > 0 && finite(leagueConversion)) {
      const playerTds = sum(row.playerGames.map((game) => game.touchdowns));
      const playerOpportunityValues = allKnown(row.playerGames, (game) => game.scorerOpportunities);
      row.tdSuccessRate = playerOpportunityValues
        ? (playerTds + leagueConversion * TD_SUCCESS_PRIOR_OPPORTUNITIES) / (sum(playerOpportunityValues) + TD_SUCCESS_PRIOR_OPPORTUNITIES)
        : null;
    } else row.tdSuccessRate = null;
  }

  const rz = raw.map((row) => row.rzPerGame); const i10 = raw.map((row) => row.i10PerGame); const gl = raw.map((row) => row.glPerGame);
  const oppRz = raw.map((row) => row.oppRzPerGame); const oppI10 = raw.map((row) => row.oppI10PerGame); const oppGl = raw.map((row) => row.oppGlPerGame);
  const usage = raw.map((row) => row.usageIndex); const teamUsage = raw.map((row) => row.teamUsageShare);
  const success = raw.map((row) => row.tdSuccessRate); const oppPos = raw.map((row) => row.oppPositionIndex);
  const implied = raw.map((row) => row.candidate.impliedTeamPoints);

  // Opponent position TD allowed -- SZN + trailing-5 raw rates for every
  // candidate, then their favorable percentiles over the full fixed population
  // (same `computePercentileRanks` the board heat lookups use; higher = better).
  const oppPositionRates = raw.map((row) => opponentPositionTdAllowedRates(row.candidate.opponentGames ?? null, row.candidate.position, resolvedSeason));
  const oppSeasonPercentiles = computePercentileRanks(oppPositionRates.map((rates) => rates.season));
  const oppLast5Percentiles = computePercentileRanks(oppPositionRates.map((rates) => rates.last5));

  const built = raw.map((row, index) => {
    const tdOpportunities = blendedMetric([metric(rz, index), metric(i10, index), metric(gl, index)], [0.25, 0.35, 0.40]);
    const opponentTdOpportunities = blendedMetric([metric(oppRz, index), metric(oppI10, index), metric(oppGl, index)], [0.25, 0.35, 0.40]);
    const components: TouchdownScoreComponents = {
      playerUsage: metric(usage, index), tdOpportunities, teamUsage: metric(teamUsage, index), tdSuccess: metric(success, index),
      opponentTdOpportunities, opponentPositionTdsAllowed: metric(oppPos, index), impliedTeamPoints: metric(implied, index),
    };
    const componentEntries = Object.entries(TD_SCORE_WEIGHTS) as [keyof TouchdownScoreComponents, number][];
    const jkbTdScore = componentEntries.every(([key]) => components[key].percentile != null)
      ? round(componentEntries.reduce((total, [key, weight]) => total + (components[key].percentile as number) * weight, 0), 2)
      : null;
    const sampleLabel = window === "last8" ? `Latest ${row.playerGames.length} applicable game${row.playerGames.length === 1 ? "" : "s"} across seasons` : `${window} regular season · ${row.playerGames.length} game${row.playerGames.length === 1 ? "" : "s"}`;
    const windowMetrics: TouchdownWindowMetrics = {
      sampleState: row.state, sampleGames: row.playerGames.length, sampleLabel,
      tdPerGame: round(row.tdPerGame), tdLast5PerGame: round(row.tdLast5PerGame), usagePerGame: round(row.usagePerGame), teamUsageShare: round(row.teamUsageShare),
      rzOpportunitiesPerGame: round(row.rzPerGame), inside10OpportunitiesPerGame: round(row.i10PerGame), goalLineOpportunitiesPerGame: round(row.glPerGame),
      rzOpportunityShare: round(row.rzShare), goalLineOpportunityShare: round(row.glShare), impliedTeamPoints: row.candidate.impliedTeamPoints,
      opponentTdOpportunitiesPerGame: row.oppRzPerGame != null && row.oppI10PerGame != null && row.oppGlPerGame != null
        ? round(row.oppRzPerGame * 0.25 + row.oppI10PerGame * 0.35 + row.oppGlPerGame * 0.40)
        : null,
      opponentPositionTdsAllowedPerGame: round(row.oppPositionTdPerGame),
      opponentPositionTdsAllowedPerGameSeason: oppPositionRates[index].season,
      opponentPositionTdsAllowedPerGameLast5: oppPositionRates[index].last5,
      opponentPositionTdsAllowedPerGameSeasonPercentile: round(oppSeasonPercentiles[index]),
      opponentPositionTdsAllowedPerGameLast5Percentile: round(oppLast5Percentiles[index]),
      tdSuccessRate: round(row.tdSuccessRate),
      components, jkbTdScore, scoreRank: null, scorePoolSize: 0,
    };
    return { row, windowMetrics };
  });

  const scores = built.map((entry) => entry.windowMetrics.jkbTdScore);
  const orderedScores = scores.filter(finite).sort((a, b) => b - a);
  return built.map(({ row, windowMetrics }, index) => ({
    ...row.candidate,
    playerHistory: [...(row.candidate.playerGames ?? [])].sort((a, b) => b.season - a.season || b.week - a.week).slice(0, 10),
    opponentHistory: [...(row.candidate.opponentGames ?? [])].sort((a, b) => b.season - a.season || b.week - a.week).slice(0, 10),
    windows: { 2025: windowMetrics, 2026: windowMetrics, last8: windowMetrics },
    _scoreRank: finite(scores[index]) ? orderedScores.findIndex((score) => score === scores[index]) + 1 : null,
  })).map(({ _scoreRank, ...player }) => ({
    ...player,
    windows: { ...player.windows, [window]: { ...player.windows[window], scoreRank: _scoreRank, scorePoolSize: orderedScores.length } },
  }));
}

export function buildAllTouchdownWindows(candidates: readonly TouchdownCandidateInput[], currentSeason?: number): TouchdownPreviewPlayer[] {
  const season = resolveCurrentSeason(candidates, currentSeason);
  const byWindow = { 2025: buildTouchdownScores(candidates, "2025", season), 2026: buildTouchdownScores(candidates, "2026", season), last8: buildTouchdownScores(candidates, "last8", season) };
  return candidates.map((candidate, index) => ({
    ...byWindow["2025"][index],
    windows: { 2025: byWindow["2025"][index].windows["2025"], 2026: byWindow["2026"][index].windows["2026"], last8: byWindow.last8[index].windows.last8 },
  }));
}

export function defaultTouchdownSort<T extends { windows: Record<TouchdownWindowKey, TouchdownWindowMetrics>; playerName: string }>(rows: readonly T[], window: TouchdownWindowKey): T[] {
  return [...rows].sort((a, b) => (b.windows[window].jkbTdScore ?? -1) - (a.windows[window].jkbTdScore ?? -1) || a.playerName.localeCompare(b.playerName));
}
