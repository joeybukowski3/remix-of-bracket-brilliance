import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";

export const PHASE_B_DATASET_VERSION = "weekly-fantasy-backtest-dataset-v1" as const;
const REQUIRED_SEASONS = [2023, 2024, 2025] as const;
const REQUIRED_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const REQUIRED_WEEKS = Array.from({ length: 18 }, (_, index) => index + 1);

export type HistoricalCoverageRow = {
  season: number;
  week: number;
  position: FantasyPosition;
  rows: number;
  players: number;
};

export type HistoricalCoverageValidation = {
  complete: boolean;
  coverage: HistoricalCoverageRow[];
  errors: string[];
};

export function validateHistoricalOutcomeCoverage(
  rows: readonly HistoricalPlayerWeek[],
): HistoricalCoverageValidation {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.playerId}`;
    if (keys.has(key)) errors.push(`duplicate outcome key ${key}`);
    keys.add(key);
  }
  const coverage = REQUIRED_SEASONS.flatMap((season) => REQUIRED_WEEKS.flatMap((week) =>
    REQUIRED_POSITIONS.map((position) => {
      const matching = rows.filter((row) => row.season === season && row.week === week && row.position === position);
      return { season, week, position, rows: matching.length, players: new Set(matching.map((row) => row.playerId)).size };
    })
  ));
  for (const row of coverage) {
    if (!row.rows) errors.push(`missing ${row.season} week ${row.week} ${row.position} outcomes`);
  }
  return { complete: errors.length === 0, coverage, errors };
}

export type BacktestSourceReadiness = {
  playerStatsSeasons: number[];
  weeklyRosterSeasons: number[];
  injurySeasons: number[];
  snapCountSeasons: number[];
  teamStatsSeasons: number[];
  teamEpaSeasons: number[];
  marketSeasons: number[];
  marketPregameTimestampVerified: boolean;
};

export function evaluateBacktestReadiness(sources: BacktestSourceReadiness) {
  const missing: string[] = [];
  const requireSeasons = (label: string, seasons: readonly number[]) => {
    for (const season of REQUIRED_SEASONS) if (!seasons.includes(season)) missing.push(`${label}:${season}`);
  };
  requireSeasons("player-stats", sources.playerStatsSeasons);
  requireSeasons("weekly-rosters", sources.weeklyRosterSeasons);
  requireSeasons("injuries", sources.injurySeasons);
  requireSeasons("team-stats", sources.teamStatsSeasons);
  requireSeasons("team-epa", sources.teamEpaSeasons);
  return {
    readyForPrimaryBacktest: missing.length === 0,
    missing,
    optional: {
      snapCounts: REQUIRED_SEASONS.filter((season) => !sources.snapCountSeasons.includes(season)),
      marketExcludedFromPrimary: !sources.marketPregameTimestampVerified,
      marketSeasons: sources.marketSeasons,
    },
    note: "Roster and injury coverage is mandatory because selecting only target-week stat producers leaks participation.",
  };
}

export function assertCutoffBeforeTarget(row: {
  season: number;
  week: number;
  cutoffs: Record<string, { season: number; week: number } | null>;
}): void {
  const target = row.season * 100 + row.week;
  for (const [source, cutoff] of Object.entries(row.cutoffs)) {
    if (cutoff && cutoff.season * 100 + cutoff.week >= target) {
      throw new Error(`${source} cutoff ${cutoff.season}/${cutoff.week} reaches target ${row.season}/${row.week}.`);
    }
  }
}
