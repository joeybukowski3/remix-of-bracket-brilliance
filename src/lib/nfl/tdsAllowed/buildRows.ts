/**
 * Combines the per-position aggregation core (aggregate.ts) into the full
 * TdsAllowedRow[] the artifact/page consume, one row per team.
 *
 * WR is a single combined column (nflverse position "WR", rushing + receiving
 * touchdowns) -- there is no trustworthy per-game alignment-split (wide vs.
 * slot) touchdown source in this repo, so this table never attempts that
 * split (see the work-unit data audit and types.ts doc comment).
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildDefenseTouchdownGameLog, computeTouchdownPositionSample, type DefenseGameTouchdowns } from "./aggregate";
import { TDS_ALLOWED_SAMPLE_KEYS, type TdsAllowedPositionRanks, type TdsAllowedRow, type TdsAllowedSampleKey } from "./types";

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
  const gameLogs: Record<"QB" | "RB" | "WR" | "TE", DefenseGameTouchdowns[]> = {
    QB: buildDefenseTouchdownGameLog(input.historicalRows, "QB"),
    RB: buildDefenseTouchdownGameLog(input.historicalRows, "RB"),
    WR: buildDefenseTouchdownGameLog(input.historicalRows, "WR"),
    TE: buildDefenseTouchdownGameLog(input.historicalRows, "TE"),
  };

  const samplesByKey = new Map<TdsAllowedSampleKey, Record<"qb" | "rb" | "wr" | "te", ReturnType<typeof computeTouchdownPositionSample>>>();
  for (const sampleKey of TDS_ALLOWED_SAMPLE_KEYS) {
    const selector = selectorForSample(sampleKey, input.currentSeason, input.priorSeason);
    samplesByKey.set(sampleKey, {
      qb: computeTouchdownPositionSample(gameLogs.QB, input.teams, selector, SOURCE),
      rb: computeTouchdownPositionSample(gameLogs.RB, input.teams, selector, SOURCE),
      wr: computeTouchdownPositionSample(gameLogs.WR, input.teams, selector, SOURCE),
      te: computeTouchdownPositionSample(gameLogs.TE, input.teams, selector, SOURCE),
    });
  }

  return input.teams.map((team): TdsAllowedRow => {
    const opponent = input.opponents.get(team) ?? { opponent: null, location: null };
    const samples = {} as Record<TdsAllowedSampleKey, TdsAllowedPositionRanks>;
    for (const sampleKey of TDS_ALLOWED_SAMPLE_KEYS) {
      const positionSamples = samplesByKey.get(sampleKey)!;
      samples[sampleKey] = {
        qb: positionSamples.qb.get(team) ?? null,
        rb: positionSamples.rb.get(team) ?? null,
        wr: positionSamples.wr.get(team) ?? null,
        te: positionSamples.te.get(team) ?? null,
      };
    }
    return {
      team,
      opponent: opponent.opponent,
      location: opponent.location,
      samples,
    };
  });
}
