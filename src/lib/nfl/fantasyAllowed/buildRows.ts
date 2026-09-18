/**
 * Combines the per-position aggregation core (aggregate.ts) into the full
 * FantasyAllowedRow[] the artifact/page consume, for one team per row.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import {
  buildDefenseGameLog,
  computePositionSample,
  rankSnapshotSample,
  type DefenseGamePoints,
} from "./aggregate";
import {
  FANTASY_ALLOWED_SAMPLE_KEYS,
  type FantasyAllowedPositionRanks,
  type FantasyAllowedRow,
  type FantasyAllowedSampleKey,
} from "./types";

export type CurrentOpponentLookup = ReadonlyMap<string, { opponent: string | null; location: "@" | "vs" | null }>;

/**
 * Defense-level slot/wide PPG-allowed snapshot (Razzball scrape). Season-
 * to-date only -- see rankSnapshotSample doc comment for why this can only
 * populate the "2026" sample, never "2025" or "last5".
 */
export type SlotWideSnapshotLookup = ReadonlyMap<string, { slotPpgAllowed: number; widePpgAllowed: number }>;

export type BuildFantasyAllowedRowsInput = {
  historicalRows: readonly HistoricalPlayerWeek[];
  /** Canonical set of teams to produce a row (and a rank slot) for, e.g. all 32 franchises. */
  teams: readonly string[];
  currentSeason: number;
  priorSeason: number;
  opponents: CurrentOpponentLookup;
  slotWideSnapshot?: SlotWideSnapshotLookup | null;
};

const JKB_SOURCE = "jkb-full-ppr-player-week" as const;

/** Rolling-window sample keys mapped to their game count, so adding a new window (e.g. last10) is a one-line change. */
const ROLLING_SAMPLE_GAME_COUNTS: Partial<Record<FantasyAllowedSampleKey, number>> = { last5: 5, last8: 8 };

function selectorForSample(sampleKey: FantasyAllowedSampleKey, currentSeason: number, priorSeason: number) {
  if (sampleKey === "2026") return { kind: "season" as const, season: currentSeason };
  if (sampleKey === "2025") return { kind: "season" as const, season: priorSeason };
  const n = ROLLING_SAMPLE_GAME_COUNTS[sampleKey];
  if (n == null) throw new Error(`Unknown rolling sample key: ${sampleKey}`);
  return { kind: "last-n" as const, n };
}

export function buildFantasyAllowedRows(input: BuildFantasyAllowedRowsInput): FantasyAllowedRow[] {
  const gameLogs: Record<"QB" | "RB" | "TE", DefenseGamePoints[]> = {
    QB: buildDefenseGameLog(input.historicalRows, "QB"),
    RB: buildDefenseGameLog(input.historicalRows, "RB"),
    TE: buildDefenseGameLog(input.historicalRows, "TE"),
  };

  const samplesByKey = new Map<FantasyAllowedSampleKey, Record<"qb" | "rb" | "te", ReturnType<typeof computePositionSample>>>();
  for (const sampleKey of FANTASY_ALLOWED_SAMPLE_KEYS) {
    const selector = selectorForSample(sampleKey, input.currentSeason, input.priorSeason);
    samplesByKey.set(sampleKey, {
      qb: computePositionSample(gameLogs.QB, input.teams, selector, JKB_SOURCE),
      rb: computePositionSample(gameLogs.RB, input.teams, selector, JKB_SOURCE),
      te: computePositionSample(gameLogs.TE, input.teams, selector, JKB_SOURCE),
    });
  }

  const wideWrRanks = input.slotWideSnapshot
    ? rankSnapshotSample(
        new Map([...input.slotWideSnapshot].map(([team, value]) => [team, value.widePpgAllowed])),
        input.teams,
        "razzball-slot-wide-snapshot",
      )
    : null;
  const slotWrRanks = input.slotWideSnapshot
    ? rankSnapshotSample(
        new Map([...input.slotWideSnapshot].map(([team, value]) => [team, value.slotPpgAllowed])),
        input.teams,
        "razzball-slot-wide-snapshot",
      )
    : null;

  return input.teams.map((team): FantasyAllowedRow => {
    const opponent = input.opponents.get(team) ?? { opponent: null, location: null };
    const samples = {} as Record<FantasyAllowedSampleKey, FantasyAllowedPositionRanks>;
    for (const sampleKey of FANTASY_ALLOWED_SAMPLE_KEYS) {
      const positionSamples = samplesByKey.get(sampleKey)!;
      samples[sampleKey] = {
        qb: positionSamples.qb.get(team) ?? null,
        rb: positionSamples.rb.get(team) ?? null,
        te: positionSamples.te.get(team) ?? null,
        // Slot/wide only has a current-season snapshot, so only the "2026"
        // sample is ever populated -- 2025/last5 are intentionally null.
        wideWr: sampleKey === "2026" ? wideWrRanks?.get(team) ?? null : null,
        slotWr: sampleKey === "2026" ? slotWrRanks?.get(team) ?? null : null,
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
