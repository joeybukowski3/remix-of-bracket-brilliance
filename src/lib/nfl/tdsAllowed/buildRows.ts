/**
 * Combines the per-position aggregation core (aggregate.ts) into the full
 * TdsAllowedRow[] the artifact/page consume, one row per team.
 *
 * Wide WR / Slot WR are always null: there is no trustworthy per-game
 * historical alignment-split touchdown source in this repo (the Razzball
 * slot/wide snapshot only carries PPG-allowed, not touchdown counts -- see
 * the work-unit data audit). Fabricating a split from fantasy points would
 * misrepresent the data, so those two columns render "-" for every sample,
 * same as any other null cell.
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

function selectorForSample(sampleKey: TdsAllowedSampleKey, currentSeason: number, priorSeason: number) {
  if (sampleKey === "2026") return { kind: "season" as const, season: currentSeason };
  if (sampleKey === "2025") return { kind: "season" as const, season: priorSeason };
  return { kind: "last-n" as const, n: 5 };
}

export function buildTdsAllowedRows(input: BuildTdsAllowedRowsInput): TdsAllowedRow[] {
  // No "WR" column exists in this table -- the shared table only shows the
  // Wide WR / Slot WR split, which has no trustworthy per-game touchdown
  // source (see module doc comment), so a combined WR game log is never built.
  const gameLogs: Record<"QB" | "RB" | "TE", DefenseGameTouchdowns[]> = {
    QB: buildDefenseTouchdownGameLog(input.historicalRows, "QB"),
    RB: buildDefenseTouchdownGameLog(input.historicalRows, "RB"),
    TE: buildDefenseTouchdownGameLog(input.historicalRows, "TE"),
  };

  const samplesByKey = new Map<TdsAllowedSampleKey, Record<"qb" | "rb" | "te", ReturnType<typeof computeTouchdownPositionSample>>>();
  for (const sampleKey of TDS_ALLOWED_SAMPLE_KEYS) {
    const selector = selectorForSample(sampleKey, input.currentSeason, input.priorSeason);
    samplesByKey.set(sampleKey, {
      qb: computeTouchdownPositionSample(gameLogs.QB, input.teams, selector, SOURCE),
      rb: computeTouchdownPositionSample(gameLogs.RB, input.teams, selector, SOURCE),
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
        te: positionSamples.te.get(team) ?? null,
        // No trustworthy per-game slot/wide touchdown split exists -- see module doc comment.
        wideWr: null,
        slotWr: null,
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
