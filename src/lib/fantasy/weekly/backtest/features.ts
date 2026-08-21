import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { deriveImpliedTeamTotals } from "@/lib/fantasy/weekly/impliedTeamTotals";

export const WEEKLY_BACKTEST_FEATURE_SCHEMA_VERSION = "weekly-backtest-features-v1" as const;

export type RollingWindow = "last1" | "last3" | "last5" | "seasonToDate";
export type RollingMetric = Record<RollingWindow, number | null> & { priorGames: number; availableGames: number };
export type RollingUsageKey =
  | "snapShare"
  | "passAttempts"
  | "rushAttempts"
  | "targets"
  | "receptions"
  | "targetShare"
  | "airYardsShare";

export type HistoricalTeamWeek = {
  season: number;
  week: number;
  team: string;
  opponent: string;
  offensiveEpa: number;
  offensivePlays: number;
  passingEpa: number;
  passingPlays: number;
  rushingEpa: number;
  rushingPlays: number;
};

export type VerifiedHistoricalMarket = {
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeSpread: number | null;
  total: number | null;
  neutralSite: boolean;
  capturedAt: string;
  kickoffAt: string;
  source: string;
  timestampVerifiedPregame: boolean;
};

export type PregameFeatureSnapshot = {
  schemaVersion: typeof WEEKLY_BACKTEST_FEATURE_SCHEMA_VERSION;
  season: number;
  week: number;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  team: string;
  opponent: string;
  actualFantasyPoints: number;
  baseline: {
    priorSeasonPpg: number | null;
    rollingPpg: RollingMetric;
  };
  usage: Record<RollingUsageKey, RollingMetric>;
  matchup: {
    priorSeasonFpaPerGame: number | null;
    priorSeasonFpaRank: number | null;
    currentSeasonFpaPerGame: number | null;
    currentSeasonFpaRank: number | null;
  };
  teamEnvironment: {
    offensiveEpaPerPlay: number | null;
    passingEpaPerPlay: number | null;
    rushingEpaPerPlay: number | null;
    playsPerGame: number | null;
    opponentEpaAllowedPerPlay: number | null;
  };
  market: {
    gameTotal: number | null;
    teamImpliedTotal: number | null;
    opponentImpliedTotal: number | null;
    homeSpread: number | null;
    source: string | null;
    capturedAt: string | null;
    excludedReason: "missing" | "unverified-pregame" | "captured-after-kickoff" | null;
  };
  cutoffs: {
    playerHistoryLatest: { season: number; week: number } | null;
    matchupHistoryLatest: { season: number; week: number } | null;
    teamHistoryLatest: { season: number; week: number } | null;
  };
  missingFeatures: string[];
};

const USAGE_KEYS: readonly RollingUsageKey[] = [
  "snapShare", "passAttempts", "rushAttempts", "targets", "receptions", "targetShare", "airYardsShare",
];

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rolling(values: readonly number[], priorGames: number): RollingMetric {
  const trailing = (count: number) => mean(values.slice(-count));
  return {
    last1: trailing(1),
    last3: trailing(3),
    last5: trailing(5),
    seasonToDate: mean(values),
    priorGames,
    availableGames: values.length,
  };
}

function chronology(row: { season: number; week: number }): number {
  return row.season * 100 + row.week;
}

function latest(rows: readonly { season: number; week: number }[]) {
  if (!rows.length) return null;
  const row = [...rows].sort((a, b) => chronology(b) - chronology(a))[0];
  return { season: row.season, week: row.week };
}

function fpaFor(
  history: readonly HistoricalPlayerWeek[],
  target: HistoricalPlayerWeek,
  season: number,
  beforeWeek: number | null,
) {
  const eligible = history.filter((row) =>
    row.season === season &&
    row.position === target.position &&
    (beforeWeek == null || row.week < beforeWeek)
  );
  const teams = [...new Set(eligible.flatMap((row) => [row.team, row.opponent]))].sort();
  const values = teams.map((opponent) => {
    const byWeek = new Map<number, number>();
    for (const row of eligible) {
      if (row.opponent !== opponent) continue;
      byWeek.set(row.week, (byWeek.get(row.week) ?? 0) + row.actualFantasyPoints);
    }
    return { opponent, value: mean([...byWeek.values()]) };
  }).filter((row): row is { opponent: string; value: number } => row.value != null);
  values.sort((a, b) => b.value - a.value || a.opponent.localeCompare(b.opponent));
  const opponent = values.find((row) => row.opponent === target.opponent);
  return {
    value: opponent?.value ?? null,
    rank: opponent ? values.findIndex((row) => row.opponent === target.opponent) + 1 : null,
    sourceRows: eligible,
  };
}

function aggregateTeamEnvironment(
  teamHistory: readonly HistoricalTeamWeek[],
  target: HistoricalPlayerWeek,
) {
  const priorTeam = teamHistory.filter((row) =>
    row.season === target.season && row.week < target.week && row.team === target.team
  );
  const priorOpponentDefense = teamHistory.filter((row) =>
    row.season === target.season && row.week < target.week && row.opponent === target.opponent
  );
  const ratio = (rows: readonly HistoricalTeamWeek[], numerator: keyof HistoricalTeamWeek, denominator: keyof HistoricalTeamWeek) => {
    const top = rows.reduce((sum, row) => sum + Number(row[numerator]), 0);
    const bottom = rows.reduce((sum, row) => sum + Number(row[denominator]), 0);
    return bottom > 0 ? top / bottom : null;
  };
  return {
    values: {
      offensiveEpaPerPlay: ratio(priorTeam, "offensiveEpa", "offensivePlays"),
      passingEpaPerPlay: ratio(priorTeam, "passingEpa", "passingPlays"),
      rushingEpaPerPlay: ratio(priorTeam, "rushingEpa", "rushingPlays"),
      playsPerGame: priorTeam.length ? mean(priorTeam.map((row) => row.offensivePlays)) : null,
      opponentEpaAllowedPerPlay: ratio(priorOpponentDefense, "offensiveEpa", "offensivePlays"),
    },
    sourceRows: [...priorTeam, ...priorOpponentDefense],
  };
}

function marketFor(
  markets: readonly VerifiedHistoricalMarket[],
  target: HistoricalPlayerWeek,
): PregameFeatureSnapshot["market"] {
  const market = markets.find((row) =>
    row.season === target.season && row.week === target.week &&
    ((row.homeTeam === target.team && row.awayTeam === target.opponent) ||
      (row.awayTeam === target.team && row.homeTeam === target.opponent))
  );
  const empty = (excludedReason: PregameFeatureSnapshot["market"]["excludedReason"]) => ({
    gameTotal: null, teamImpliedTotal: null, opponentImpliedTotal: null, homeSpread: null,
    source: market?.source ?? null, capturedAt: market?.capturedAt ?? null, excludedReason,
  });
  if (!market) return empty("missing");
  if (!market.timestampVerifiedPregame) return empty("unverified-pregame");
  if (Date.parse(market.capturedAt) >= Date.parse(market.kickoffAt)) return empty("captured-after-kickoff");
  const totals = deriveImpliedTeamTotals(
    { spread: { home: market.homeSpread, away: market.homeSpread == null ? null : -market.homeSpread }, total: market.total, neutralSite: market.neutralSite },
    { source: market.source, generatedAt: market.capturedAt, perRowTimestampAvailable: true },
  );
  if (!totals) return empty("missing");
  const isHome = market.homeTeam === target.team;
  return {
    gameTotal: market.total,
    teamImpliedTotal: isHome ? totals.home : totals.away,
    opponentImpliedTotal: isHome ? totals.away : totals.home,
    homeSpread: market.homeSpread,
    source: market.source,
    capturedAt: market.capturedAt,
    excludedReason: null,
  };
}

export function buildPregameFeatureSnapshot(
  target: HistoricalPlayerWeek,
  history: readonly HistoricalPlayerWeek[],
  options: {
    teamHistory?: readonly HistoricalTeamWeek[];
    markets?: readonly VerifiedHistoricalMarket[];
  } = {},
): PregameFeatureSnapshot {
  const priorPlayerRows = history
    .filter((row) => row.playerId === target.playerId && chronology(row) < chronology(target))
    .sort((a, b) => chronology(a) - chronology(b));
  const currentPlayerRows = priorPlayerRows.filter((row) => row.season === target.season && row.week < target.week);
  const priorSeasonRows = priorPlayerRows.filter((row) => row.season === target.season - 1);
  const rollingPpg = rolling(currentPlayerRows.map((row) => row.actualFantasyPoints), currentPlayerRows.length);
  const usage = Object.fromEntries(USAGE_KEYS.map((key) => {
    const values = currentPlayerRows.map((row) => row.usage[key]).filter((value): value is number => value != null);
    return [key, rolling(values, currentPlayerRows.length)];
  })) as Record<RollingUsageKey, RollingMetric>;
  const priorFpa = fpaFor(history, target, target.season - 1, null);
  const currentFpa = fpaFor(history, target, target.season, target.week);
  const team = aggregateTeamEnvironment(options.teamHistory ?? [], target);
  const market = marketFor(options.markets ?? [], target);

  const missingFeatures: string[] = [];
  const registerMissing = (name: string, value: number | null) => { if (value == null) missingFeatures.push(name); };
  registerMissing("baseline.priorSeasonPpg", mean(priorSeasonRows.map((row) => row.actualFantasyPoints)));
  registerMissing("baseline.rollingPpg.seasonToDate", rollingPpg.seasonToDate);
  for (const key of USAGE_KEYS) registerMissing(`usage.${key}.last3`, usage[key].last3);
  registerMissing("matchup.priorSeasonFpaPerGame", priorFpa.value);
  registerMissing("matchup.currentSeasonFpaPerGame", currentFpa.value);
  registerMissing("teamEnvironment.offensiveEpaPerPlay", team.values.offensiveEpaPerPlay);
  registerMissing("market.teamImpliedTotal", market.teamImpliedTotal);

  return {
    schemaVersion: WEEKLY_BACKTEST_FEATURE_SCHEMA_VERSION,
    season: target.season,
    week: target.week,
    playerId: target.playerId,
    playerName: target.playerName,
    position: target.position,
    team: target.team,
    opponent: target.opponent,
    actualFantasyPoints: target.actualFantasyPoints,
    baseline: {
      priorSeasonPpg: mean(priorSeasonRows.map((row) => row.actualFantasyPoints)),
      rollingPpg,
    },
    usage,
    matchup: {
      priorSeasonFpaPerGame: priorFpa.value,
      priorSeasonFpaRank: priorFpa.rank,
      currentSeasonFpaPerGame: currentFpa.value,
      currentSeasonFpaRank: currentFpa.rank,
    },
    teamEnvironment: team.values,
    market,
    cutoffs: {
      playerHistoryLatest: latest(priorPlayerRows),
      matchupHistoryLatest: latest([...priorFpa.sourceRows, ...currentFpa.sourceRows]),
      teamHistoryLatest: latest(team.sourceRows),
    },
    missingFeatures,
  };
}

export function buildPregameFeatureDataset(
  history: readonly HistoricalPlayerWeek[],
  options: { teamHistory?: readonly HistoricalTeamWeek[]; markets?: readonly VerifiedHistoricalMarket[] } = {},
): PregameFeatureSnapshot[] {
  return [...history]
    .sort((a, b) => chronology(a) - chronology(b) || a.position.localeCompare(b.position) || a.playerId.localeCompare(b.playerId))
    .map((target) => buildPregameFeatureSnapshot(target, history, options));
}
