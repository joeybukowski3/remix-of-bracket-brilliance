import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";

export const WEEKLY_RESEARCH_CONTEXT_VERSION = "weekly-fantasy-research-context-v1" as const;
export const WEEKLY_RESEARCH_LAST_GAMES = 5;
export const EXCLUDED_PRIOR_SEASON_WEEK = 18;

export type WeeklyResearchSampleGame = {
  season: number;
  week: number;
};

export type WeeklyResearchMetric = {
  value: number | null;
  rank: number | null;
  poolSize: number;
  sampleSize: number;
  sampleSeason: number | null;
  games: readonly WeeklyResearchSampleGame[];
};

export type WeeklyPositionEvidence = {
  touches: WeeklyResearchMetric;
  redZoneTouches: WeeklyResearchMetric;
  yardsPerCarry: WeeklyResearchMetric;
  receivingTargets: WeeklyResearchMetric;
  targetShare: WeeklyResearchMetric;
  airYardsPerGame: WeeklyResearchMetric;
  targetsPerGame: WeeklyResearchMetric;
};

export type WeeklyFantasyResearchContext = {
  version: typeof WEEKLY_RESEARCH_CONTEXT_VERSION;
  seasonPpg: WeeklyResearchMetric;
  last5Ppg: WeeklyResearchMetric;
  opponentFpaSeason: WeeklyResearchMetric;
  opponentFpaLast5: WeeklyResearchMetric;
  evidence: WeeklyPositionEvidence;
};

export type WeeklyResearchCandidate = {
  playerId: string;
  position: FantasyPosition;
  opponent: string;
};

const PLAYED_SOURCE: HistoricalPlayerWeek["provenance"]["source"] = "nflverse stats_player weekly";

function chronology(row: { season: number; week: number }): number {
  return row.season * 100 + row.week;
}

function mean(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function createEmptyWeeklyResearchMetric(): WeeklyResearchMetric {
  return { value: null, rank: null, poolSize: 0, sampleSize: 0, sampleSeason: null, games: [] };
}

export function createEmptyWeeklyFantasyResearchContext(): WeeklyFantasyResearchContext {
  const blank = () => createEmptyWeeklyResearchMetric();
  return {
    version: WEEKLY_RESEARCH_CONTEXT_VERSION,
    seasonPpg: blank(),
    last5Ppg: blank(),
    opponentFpaSeason: blank(),
    opponentFpaLast5: blank(),
    evidence: {
      touches: blank(),
      redZoneTouches: blank(),
      yardsPerCarry: blank(),
      receivingTargets: blank(),
      targetShare: blank(),
      airYardsPerGame: blank(),
      targetsPerGame: blank(),
    },
  };
}

function metric(value: number | null, rows: readonly { season: number; week: number }[]): WeeklyResearchMetric {
  const seasons = new Set(rows.map((row) => row.season));
  return {
    value,
    rank: null,
    poolSize: 0,
    sampleSize: rows.length,
    sampleSeason: seasons.size === 1 ? rows[0]?.season ?? null : null,
    games: rows.map(({ season, week }) => ({ season, week })),
  };
}

function isBeforeTarget(row: HistoricalPlayerWeek, season: number, week: number): boolean {
  return row.season < season || (row.season === season && row.week < week);
}

function isEligibleSeasonWeek(row: HistoricalPlayerWeek, season: number, week: number): boolean {
  if (!isBeforeTarget(row, season, week)) return false;
  if (row.season !== season && row.season !== season - 1) return false;
  return !(row.season === season - 1 && row.week === EXCLUDED_PRIOR_SEASON_WEEK);
}

function playerGamesBefore(
  history: readonly HistoricalPlayerWeek[],
  playerId: string,
  season: number,
  week: number,
): HistoricalPlayerWeek[] {
  return history
    .filter((row) =>
      row.playerId === playerId &&
      row.provenance.source === PLAYED_SOURCE &&
      isEligibleSeasonWeek(row, season, week),
    )
    .sort((left, right) => chronology(left) - chronology(right));
}

function seasonSample(rows: readonly HistoricalPlayerWeek[], season: number): HistoricalPlayerWeek[] {
  const current = rows.filter((row) => row.season === season);
  return current.length > 0 ? current : rows.filter((row) => row.season === season - 1);
}

function lastFiveSample(rows: readonly HistoricalPlayerWeek[]): HistoricalPlayerWeek[] {
  return [...rows].sort((left, right) => chronology(right) - chronology(left)).slice(0, WEEKLY_RESEARCH_LAST_GAMES).reverse();
}

type DefenseGame = {
  season: number;
  week: number;
  opponent: string;
};

function defenseGamesBefore(
  history: readonly HistoricalPlayerWeek[],
  opponent: string,
  season: number,
  week: number,
): DefenseGame[] {
  const games = new Map<string, DefenseGame>();
  for (const row of history) {
    if (row.opponent !== opponent || !isEligibleSeasonWeek(row, season, week)) continue;
    const key = `${row.season}:${row.week}:${row.opponent}`;
    games.set(key, { season: row.season, week: row.week, opponent: row.opponent });
  }
  return [...games.values()].sort((left, right) => chronology(left) - chronology(right));
}

function fpaForGames(
  history: readonly HistoricalPlayerWeek[],
  position: FantasyPosition,
  opponent: string,
  games: readonly DefenseGame[],
): number | null {
  if (games.length === 0) return null;
  const gameKeys = new Set(games.map((game) => `${game.season}:${game.week}`));
  const points = history
    .filter((row) => row.position === position && row.opponent === opponent && gameKeys.has(`${row.season}:${row.week}`))
    .reduce((sum, row) => sum + row.actualFantasyPoints, 0);
  return points / games.length;
}

function evidenceFor(rows: readonly HistoricalPlayerWeek[], position: FantasyPosition): WeeklyPositionEvidence {
  const blank = () => createEmptyWeeklyResearchMetric();
  const games = rows.length;
  const total = (read: (row: HistoricalPlayerWeek) => number) => rows.reduce((sum, row) => sum + read(row), 0);
  const from = (value: number | null) => metric(value, rows);

  if (position === "RB") {
    const rushAttempts = total((row) => row.stats.rushAttempts);
    return {
      touches: from(games > 0 ? total((row) => row.stats.rushAttempts + row.stats.receptions) : null),
      redZoneTouches: blank(),
      yardsPerCarry: from(rushAttempts > 0 ? total((row) => row.stats.rushingYards) / rushAttempts : null),
      receivingTargets: from(games > 0 ? total((row) => row.stats.targets) : null),
      targetShare: blank(),
      airYardsPerGame: blank(),
      targetsPerGame: blank(),
    };
  }

  if (position === "WR" || position === "TE") {
    const targetShares = rows
      .map((row) => row.usage.targetShare)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const airYards = rows
      .map((row) => row.usage.receivingAirYards)
      .filter((value): value is number => value != null && Number.isFinite(value));
    return {
      touches: blank(),
      redZoneTouches: blank(),
      yardsPerCarry: blank(),
      receivingTargets: blank(),
      targetShare: from(mean(targetShares)),
      airYardsPerGame: from(games > 0 && airYards.length > 0 ? airYards.reduce((sum, value) => sum + value, 0) / games : null),
      targetsPerGame: from(games > 0 ? total((row) => row.stats.targets) / games : null),
    };
  }

  return {
    touches: blank(), redZoneTouches: blank(), yardsPerCarry: blank(), receivingTargets: blank(),
    targetShare: blank(), airYardsPerGame: blank(), targetsPerGame: blank(),
  };
}

function rankMetrics(metrics: WeeklyResearchMetric[]): void {
  const populated = metrics
    .filter((entry): entry is WeeklyResearchMetric & { value: number } => entry.value != null && Number.isFinite(entry.value))
    .sort((left, right) => right.value - left.value);
  let priorValue: number | null = null;
  let priorRank = 0;
  populated.forEach((entry, index) => {
    const rank = priorValue !== null && entry.value === priorValue ? priorRank : index + 1;
    entry.rank = rank;
    entry.poolSize = populated.length;
    priorValue = entry.value;
    priorRank = rank;
  });
}

function rankMetric(contexts: WeeklyFantasyResearchContext[], select: (context: WeeklyFantasyResearchContext) => WeeklyResearchMetric): void {
  rankMetrics(contexts.map((context) => select(context)));
}

function rankMetricByKey(
  entries: readonly { key: string; context: WeeklyFantasyResearchContext }[],
  select: (context: WeeklyFantasyResearchContext) => WeeklyResearchMetric,
): void {
  const representative = new Map<string, WeeklyResearchMetric>();
  for (const entry of entries) representative.set(entry.key, select(entry.context));
  rankMetrics([...representative.values()]);
  for (const entry of entries) {
    const ranked = representative.get(entry.key);
    const target = select(entry.context);
    target.rank = ranked?.rank ?? null;
    target.poolSize = ranked?.poolSize ?? 0;
  }
}

/**
 * Builds display-only, pregame research context without reordering candidates.
 * Player windows use recorded appearances; defense windows use completed team
 * games inferred from the all-position history universe.
 */
export function buildWeeklyFantasyResearchContexts(
  candidates: readonly WeeklyResearchCandidate[],
  history: readonly HistoricalPlayerWeek[],
  season: number,
  week: number,
): Map<string, WeeklyFantasyResearchContext> {
  const result = new Map<string, WeeklyFantasyResearchContext>();

  for (const candidate of candidates) {
    const playerRows = playerGamesBefore(history, candidate.playerId, season, week);
    const seasonRows = seasonSample(playerRows, season);
    const last5Rows = lastFiveSample(playerRows);

    const defenseRows = defenseGamesBefore(history, candidate.opponent, season, week);
    const currentDefenseRows = defenseRows.filter((row) => row.season === season);
    const seasonDefenseRows = currentDefenseRows.length > 0
      ? currentDefenseRows
      : defenseRows.filter((row) => row.season === season - 1);
    const last5DefenseRows = [...defenseRows]
      .sort((left, right) => chronology(right) - chronology(left))
      .slice(0, WEEKLY_RESEARCH_LAST_GAMES)
      .reverse();

    result.set(candidate.playerId, {
      version: WEEKLY_RESEARCH_CONTEXT_VERSION,
      seasonPpg: metric(mean(seasonRows.map((row) => row.actualFantasyPoints)), seasonRows),
      last5Ppg: metric(mean(last5Rows.map((row) => row.actualFantasyPoints)), last5Rows),
      opponentFpaSeason: metric(
        fpaForGames(history, candidate.position, candidate.opponent, seasonDefenseRows),
        seasonDefenseRows,
      ),
      opponentFpaLast5: metric(
        fpaForGames(history, candidate.position, candidate.opponent, last5DefenseRows),
        last5DefenseRows,
      ),
      evidence: evidenceFor(seasonRows, candidate.position),
    });
  }

  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const entries = candidates
      .filter((candidate) => candidate.position === position)
      .map((candidate) => ({ key: candidate.opponent, context: result.get(candidate.playerId) }))
      .filter((entry): entry is { key: string; context: WeeklyFantasyResearchContext } => Boolean(entry.context));
    const contexts = entries.map((entry) => entry.context);
    rankMetric(contexts, (context) => context.seasonPpg);
    rankMetric(contexts, (context) => context.last5Ppg);
    rankMetricByKey(entries, (context) => context.opponentFpaSeason);
    rankMetricByKey(entries, (context) => context.opponentFpaLast5);
    for (const key of ["touches", "redZoneTouches", "yardsPerCarry", "receivingTargets", "targetShare", "airYardsPerGame", "targetsPerGame"] as const) {
      rankMetric(contexts, (context) => context.evidence[key]);
    }
  }

  return result;
}
