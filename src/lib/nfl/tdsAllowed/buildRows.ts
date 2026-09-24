/**
 * Combines the per-category aggregation core (aggregate.ts) into the full
 * TdsAllowedRow[] the artifact/page consume, one row per team. Categories are
 * scoring-method splits (QB PASS / QB RUSH / RB RUSH / RB REC / WR REC /
 * TE REC) -- see types.ts for the exact definitions and the alignment-split
 * (wide/slot) limitation.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { TDS_ALLOWED_CATEGORIES, buildDefenseTouchdownGameLog, computeTouchdownPositionSample } from "./aggregate";
import {
  TDS_ALLOWED_SAMPLE_KEYS,
  type TdsAllowedCategoryKey,
  type TdsAllowedCategoryRanks,
  type TdsAllowedPositionSample,
  type TdsAllowedRow,
  type TdsAllowedSampleKey,
} from "./types";

export type CurrentOpponentLookup = ReadonlyMap<string, { opponent: string | null; location: "@" | "vs" | null }>;

export type BuildTdsAllowedRowsInput = {
  historicalRows: readonly HistoricalPlayerWeek[];
  /** Canonical set of teams to produce a row (and a rank slot) for, e.g. all 32 franchises. */
  teams: readonly string[];
  currentSeason: number;
  priorSeason: number;
  opponents: CurrentOpponentLookup;
};

const SOURCE = "nflverse-player-week" as const;

/** Rolling-window sample keys mapped to their game count, so adding a new window (e.g. last10) is a one-line change. */
const ROLLING_SAMPLE_GAME_COUNTS: Partial<Record<TdsAllowedSampleKey, number>> = { last5: 5, last8: 8 };

function selectorForSample(sampleKey: TdsAllowedSampleKey, currentSeason: number, priorSeason: number) {
  if (sampleKey === "2026") return { kind: "season" as const, season: currentSeason };
  if (sampleKey === "2025") return { kind: "season" as const, season: priorSeason };
  const n = ROLLING_SAMPLE_GAME_COUNTS[sampleKey];
  if (n == null) throw new Error(`Unknown rolling sample key: ${sampleKey}`);
  return { kind: "last-n" as const, n };
}

export function buildTdsAllowedRows(input: BuildTdsAllowedRowsInput): TdsAllowedRow[] {
  const gameLogs = TDS_ALLOWED_CATEGORIES.map((category) => ({
    key: category.key,
    log: buildDefenseTouchdownGameLog(input.historicalRows, category),
  }));

  const samplesByKey = new Map<TdsAllowedSampleKey, Map<TdsAllowedCategoryKey, Map<string, TdsAllowedPositionSample>>>();
  for (const sampleKey of TDS_ALLOWED_SAMPLE_KEYS) {
    const selector = selectorForSample(sampleKey, input.currentSeason, input.priorSeason);
    samplesByKey.set(
      sampleKey,
      new Map(gameLogs.map(({ key, log }) => [key, computeTouchdownPositionSample(log, input.teams, selector, SOURCE)])),
    );
  }

  return input.teams.map((team): TdsAllowedRow => {
    const opponent = input.opponents.get(team) ?? { opponent: null, location: null };
    const samples = {} as Record<TdsAllowedSampleKey, TdsAllowedCategoryRanks>;
    for (const sampleKey of TDS_ALLOWED_SAMPLE_KEYS) {
      const categorySamples = samplesByKey.get(sampleKey)!;
      samples[sampleKey] = Object.fromEntries(
        TDS_ALLOWED_CATEGORIES.map(({ key }) => [key, categorySamples.get(key)!.get(team) ?? null]),
      ) as TdsAllowedCategoryRanks;
    }
    return { team, opponent: opponent.opponent, location: opponent.location, samples };
  });
}
