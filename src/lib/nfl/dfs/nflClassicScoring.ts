/**
 * DraftKings NFL Classic point calculation.
 *
 * The only source of truth for the point values themselves is
 * `NFL_CLASSIC_OFFENSIVE_SCORING` in nflClassicRules.ts (already canonical
 * and versioned). This module adds the one computation that was missing --
 * turning a stat line into a point total -- so no other consumer needs to
 * (re)implement DraftKings Classic scoring math. Never change a point value
 * here; change it in nflClassicRules.ts.
 *
 * Scoring-context decision: two canonical fantasy-scoring systems exist in
 * this codebase -- JKB Full PPR (calculateFullPprFantasyPoints,
 * src/lib/fantasy/weekly/scoring.ts) and DraftKings Classic (this module).
 * The DFS Calculator explicitly requires DraftKings Classic; if/when a
 * shared Last-10 "Fantasy Pts" column is wired to a real full-game score, it
 * should use DraftKings Classic so the column means the same thing wherever
 * the shared history table is used.
 *
 * Full-game reconstruction status (see docs/nfl-history-fantasy-points.md
 * caveat in NflHistoryCells.tsx): neither the DFS history artifact
 * (`yardage-history` index/detail JSON -- actualYards only, no TD/INT/
 * reception counts) nor the Yardage Props history artifact
 * (`yardage-history.json` -- single-market stat block per game, missing any
 * other market's production from that same game) carries enough data to
 * compute a genuine full-game DraftKings score. A full per-game box score
 * *does* exist in this repo (`HistoricalPlayerWeek`,
 * data/fantasy/weekly/player-week-history-2023-2025.json, see
 * src/lib/fantasy/weekly/history.ts) but it is a server-side research
 * artifact, keyed by (season, week, playerId) with no verified gameId join
 * to either client-facing history artifact -- wiring it in requires a new,
 * separately-reviewed data-pipeline extension, not a presentation change.
 * Until that join exists, do not compute or display a "Fantasy Pts" figure
 * from these history rows -- a single-market total is not a full-game score
 * and must not be labeled as one.
 */
import { NFL_CLASSIC_OFFENSIVE_SCORING, NFL_CLASSIC_RULES_VERSION } from "./nflClassicRules";

export const DRAFTKINGS_CLASSIC_SCORING_CONTEXT = "draftkings-classic" as const;

export type NflFantasyScoringContext = typeof DRAFTKINGS_CLASSIC_SCORING_CONTEXT | "jkb-full-ppr";

export type DraftKingsPassingStatLine = { passingYards: number; passingTds: number; interceptions: number };
export type DraftKingsRushingStatLine = { rushingYards: number; rushingTds: number };
export type DraftKingsReceivingStatLine = { receivingYards: number; receivingTds: number; receptions: number };

/** Points from the passing portion of a stat line only (a QB's rushing line, if any, is scored separately and summed). */
export function calculateDraftKingsClassicPassingPoints(stat: DraftKingsPassingStatLine): number {
  const scoring = NFL_CLASSIC_OFFENSIVE_SCORING.passing;
  const yardageBonus = stat.passingYards >= scoring.bonus.yardThreshold ? scoring.bonus.points : 0;
  return stat.passingYards * scoring.pointsPerYard + stat.passingTds * scoring.touchdown + stat.interceptions * scoring.interception + yardageBonus;
}

export function calculateDraftKingsClassicRushingPoints(stat: DraftKingsRushingStatLine): number {
  const scoring = NFL_CLASSIC_OFFENSIVE_SCORING.rushing;
  const yardageBonus = stat.rushingYards >= scoring.bonus.yardThreshold ? scoring.bonus.points : 0;
  return stat.rushingYards * scoring.pointsPerYard + stat.rushingTds * scoring.touchdown + yardageBonus;
}

export function calculateDraftKingsClassicReceivingPoints(stat: DraftKingsReceivingStatLine): number {
  const scoring = NFL_CLASSIC_OFFENSIVE_SCORING.receiving;
  const yardageBonus = stat.receivingYards >= scoring.bonus.yardThreshold ? scoring.bonus.points : 0;
  return stat.receivingYards * scoring.pointsPerYard + stat.receivingTds * scoring.touchdown + stat.receptions * scoring.reception + yardageBonus;
}

export const DRAFTKINGS_CLASSIC_SCORING_SOURCE = NFL_CLASSIC_RULES_VERSION;

// Intentionally no `calculateYardageMarketDraftKingsClassicPoints`-style helper here.
// A single market's stat line (e.g. a WR's receiving-only line) can only ever produce a
// partial DK total, never a full-game score -- see the module docstring above. The shared
// history table's Fantasy Pts column stays hidden until a real gameId-joined full box score
// is wired in; do not reintroduce a per-market "fantasy points" calculation as a substitute.
