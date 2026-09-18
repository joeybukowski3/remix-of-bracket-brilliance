/**
 * Combines FOR (offensive production) and ALLOWED (opponent defense) ranked
 * samples into the full PositionMatchupRow[] the artifact/page consume, for
 * one team per row, across every rolling-window sample.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { buildDefenseGameLog, computePositionSample, type DefenseGamePoints } from "@/lib/nfl/fantasyAllowed/aggregate";
import { FANTASY_ALLOWED_SAMPLE_KEYS, type FantasyAllowedSampleKey } from "@/lib/nfl/fantasyAllowed/types";
import type { CurrentOpponentLookup } from "@/lib/nfl/fantasyAllowed/buildRows";
import { buildOffenseGameLog } from "./aggregate";
import { computeEdge } from "./edge";
import { computeRating } from "./rating";
import { POSITION_MATCHUP_POSITION_KEYS, type PositionMatchupCells, type PositionMatchupPositionKey, type PositionMatchupRow } from "./types";

export type BuildPositionMatchupRowsInput = {
  historicalRows: readonly HistoricalPlayerWeek[];
  /** Canonical set of teams to produce a row (and a rank slot) for, e.g. all 32 franchises. */
  teams: readonly string[];
  currentSeason: number;
  priorSeason: number;
  opponents: CurrentOpponentLookup;
};

const JKB_SOURCE = "jkb-full-ppr-player-week" as const;

const POSITION_TO_FANTASY_POSITION: Record<PositionMatchupPositionKey, FantasyPosition> = {
  qb: "QB",
  rb: "RB",
  wr: "WR",
  te: "TE",
};

/** Rolling-window sample keys mapped to their game count -- matches fantasyAllowed/buildRows.ts. */
const ROLLING_SAMPLE_GAME_COUNTS: Partial<Record<FantasyAllowedSampleKey, number>> = { last5: 5, last8: 8 };

function selectorForSample(sampleKey: FantasyAllowedSampleKey, currentSeason: number, priorSeason: number) {
  if (sampleKey === "2026") return { kind: "season" as const, season: currentSeason };
  if (sampleKey === "2025") return { kind: "season" as const, season: priorSeason };
  const n = ROLLING_SAMPLE_GAME_COUNTS[sampleKey];
  if (n == null) throw new Error(`Unknown rolling sample key: ${sampleKey}`);
  return { kind: "last-n" as const, n };
}

export function buildPositionMatchupRows(input: BuildPositionMatchupRowsInput): PositionMatchupRow[] {
  const offenseLogs = {} as Record<PositionMatchupPositionKey, DefenseGamePoints[]>;
  const defenseLogs = {} as Record<PositionMatchupPositionKey, DefenseGamePoints[]>;
  for (const position of POSITION_MATCHUP_POSITION_KEYS) {
    const fantasyPosition = POSITION_TO_FANTASY_POSITION[position];
    offenseLogs[position] = buildOffenseGameLog(input.historicalRows, fantasyPosition);
    defenseLogs[position] = buildDefenseGameLog(input.historicalRows, fantasyPosition);
  }

  const samplesByKey = new Map<
    FantasyAllowedSampleKey,
    Record<PositionMatchupPositionKey, { for: ReturnType<typeof computePositionSample>; allowed: ReturnType<typeof computePositionSample> }>
  >();
  for (const sampleKey of FANTASY_ALLOWED_SAMPLE_KEYS) {
    const selector = selectorForSample(sampleKey, input.currentSeason, input.priorSeason);
    const perPosition = {} as Record<PositionMatchupPositionKey, { for: ReturnType<typeof computePositionSample>; allowed: ReturnType<typeof computePositionSample> }>;
    for (const position of POSITION_MATCHUP_POSITION_KEYS) {
      perPosition[position] = {
        for: computePositionSample(offenseLogs[position], input.teams, selector, JKB_SOURCE),
        allowed: computePositionSample(defenseLogs[position], input.teams, selector, JKB_SOURCE),
      };
    }
    samplesByKey.set(sampleKey, perPosition);
  }

  return input.teams.map((team): PositionMatchupRow => {
    const opponent = input.opponents.get(team) ?? { opponent: null, location: null };
    const samples = {} as Record<FantasyAllowedSampleKey, PositionMatchupCells>;
    for (const sampleKey of FANTASY_ALLOWED_SAMPLE_KEYS) {
      const perPosition = samplesByKey.get(sampleKey)!;
      const cells = {} as PositionMatchupCells;
      for (const position of POSITION_MATCHUP_POSITION_KEYS) {
        const forSample = perPosition[position].for.get(team) ?? null;
        const allowedSample = perPosition[position].allowed.get(team) ?? null;
        const forRank = forSample?.rank ?? null;
        const allowedRank = allowedSample?.rank ?? null;
        const edge = computeEdge(forRank, allowedRank);
        cells[position] = {
          forRank,
          forPerGame: forSample?.fantasyPointsAllowedPerGame ?? null,
          forGamesSampled: forSample?.gamesSampled ?? 0,
          allowedRank,
          allowedPerGame: allowedSample?.fantasyPointsAllowedPerGame ?? null,
          allowedGamesSampled: allowedSample?.gamesSampled ?? 0,
          edge,
          rating: computeRating(edge),
        };
      }
      samples[sampleKey] = cells;
    }
    return {
      team,
      opponent: opponent.opponent,
      location: opponent.location,
      samples,
    };
  });
}
