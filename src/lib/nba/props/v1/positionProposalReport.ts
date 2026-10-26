/**
 * The review artifacts for the position proposals: the CSV a reviewer fills and the coverage the proposals would give.
 * Nothing here applies a position. The CSV ends with the same `primary`, `secondary` and `reason` columns as the review
 * list, left blank: copying a proposal into `primary` with a reason is the review, and `--overrides-csv` then reads it.
 */
import { csvCell, type ReviewEntry } from "./positionReview";
import type { DvpPosition } from "../dvpPositions";
import type { Proposal } from "./positionProposals";

/**
 * The review list restricts a player to the positions ESPN's listing allows (per latest season). A proposal outside that
 * set, which can happen when the pooled listing differs from the latest season's, is withdrawn to unassigned.
 */
export function withinEspnListing(proposal: Proposal, allowed: readonly DvpPosition[]): Proposal {
  if (proposal.status !== "proposed" || proposal.best === null || allowed.includes(proposal.best)) return proposal;
  return { ...proposal, status: "unassigned", confidence: null, evidence: `best guess ${proposal.best} is outside what ESPN's latest listing allows for this player (${allowed.join("/")}); not proposed. ${proposal.evidence}` };
}

export interface ProposalRow {
  rank: number;
  entry: ReviewEntry;
  proposal: Proposal;
}

const COLUMNS = ["rank", "playerId", "name", "team", "onSlate", "minutes2025-26", "minutes2026-27", "espnListing", "proposedPrimary", "probability", "status", "confidence", "evidence", "primary", "secondary", "reason"] as const;

export function proposalsCsv(rows: readonly ProposalRow[]): string {
  const lines = rows.map(({ rank, entry, proposal }) =>
    [
      String(rank), entry.playerId, entry.name, entry.team, entry.onSlate ? "yes" : "no", String(entry.minutes["2025-26"] ?? 0), String(entry.minutes["2026-27"] ?? 0), entry.espnListing,
      proposal.status === "proposed" ? (proposal.best ?? "") : "", proposal.probability === null ? "" : proposal.probability.toFixed(2), proposal.status, proposal.confidence ?? "", proposal.evidence, "", "", "",
    ].map(csvCell).join(","),
  );
  return `${[COLUMNS.join(","), ...lines].join("\n")}\n`;
}

export interface MinutesRow {
  season: string;
  seasonType: string;
  playerId: string;
  minutes: number;
}

export interface CoverageScenario {
  /** Share of the season's minutes (0-1) that belong to a player with a position. */
  coverage: number;
}

export interface SeasonCoverage {
  totalMinutes: number;
  current: CoverageScenario;
  /** If only the high-confidence proposals were accepted. */
  withHighConfidence: CoverageScenario;
  /** If every proposed position (high and medium confidence) were accepted. */
  withProposed: CoverageScenario;
  /** An upper bound, not a plan: if the best guess for every listed player were accepted, confident or not. */
  withEveryBestGuess: CoverageScenario;
}

/**
 * Coverage by season from per-game minutes and the set of players who already have a position in that season.
 * `include` picks the rows (every non-preseason game for position coverage; regular season only for DvP).
 */
export function coverageIfAccepted(
  rows: readonly MinutesRow[],
  alreadyClassified: ReadonlyMap<string, ReadonlySet<string>>,
  high: ReadonlySet<string>,
  proposed: ReadonlySet<string>,
  everyBestGuess: ReadonlySet<string>,
  include: (row: MinutesRow) => boolean,
): Record<string, SeasonCoverage> {
  const totals = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!include(r)) continue;
    const season = totals.get(r.season) ?? new Map<string, number>();
    season.set(r.playerId, (season.get(r.playerId) ?? 0) + r.minutes);
    totals.set(r.season, season);
  }
  const share = (season: Map<string, number>, has: (id: string) => boolean): number => {
    const total = [...season.values()].reduce((a, b) => a + b, 0);
    return total > 0 ? [...season].filter(([id]) => has(id)).reduce((s, [, m]) => s + m, 0) / total : 0;
  };
  return Object.fromEntries(
    [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([season, minutes]) => {
      const known = alreadyClassified.get(season) ?? new Set<string>();
      return [season, {
        totalMinutes: Math.round([...minutes.values()].reduce((a, b) => a + b, 0)),
        current: { coverage: share(minutes, (id) => known.has(id)) },
        withHighConfidence: { coverage: share(minutes, (id) => known.has(id) || high.has(id)) },
        withProposed: { coverage: share(minutes, (id) => known.has(id) || proposed.has(id)) },
        withEveryBestGuess: { coverage: share(minutes, (id) => known.has(id) || everyBestGuess.has(id)) },
      }];
    }),
  );
}
