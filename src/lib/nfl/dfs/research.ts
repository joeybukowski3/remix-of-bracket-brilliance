// WU3 DFS-local adapter around the canonical weekly research join.
//
// This module never recomputes a research metric, a matchup edge, or a
// matchup grade -- it only decides WHICH canonical research row (if any) is
// safe to attach to a DFS analyzer row, using the existing exact
// playerId-based join (`joinWeeklyFantasyResearchRows`) and the existing
// matchup-grade derivation (`getMatchupGrade`). A season/week-incompatible
// research artifact is never joined -- it is treated as if research were
// simply unavailable, and the mismatch is reported separately.

import { getMatchupGrade, type MatchupGrade } from "@/lib/fantasy/matchupGrade";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import type { WeeklyFantasyResearchArtifact } from "@/lib/fantasy/weekly/researchArtifact";
import type { WeeklyFantasyResearchContext } from "@/lib/fantasy/weekly/researchContext";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";
import type { FantasyMatchupEdges } from "@/lib/nfl/matchupEdges";

export type DfsResearchArtifactCompatibility =
  | { status: "not-provided" }
  | { status: "compatible"; season: number; week: number }
  | { status: "wrong-week"; artifactSeason: number; artifactWeek: number; expectedSeason: number; expectedWeek: number };

export type DfsPlayerResearchStatus = "available" | "missing" | "position-mismatch";

export type DfsPlayerResearch = {
  status: DfsPlayerResearchStatus;
  context: WeeklyFantasyResearchContext | null;
  matchupEdges: FantasyMatchupEdges | null;
  /** Derived via the canonical `getMatchupGrade`, never recomputed independently. */
  matchupGrade: MatchupGrade | null;
};

export type DfsResearchAssessment = {
  compatibility: DfsResearchArtifactCompatibility;
  byPlayerId: ReadonlyMap<string, DfsPlayerResearch>;
  missingPlayerIds: readonly string[];
  mismatchedPositionPlayerIds: readonly string[];
};

/** Checks the research artifact's own season/week against the intended selected season/week. Never substitutes another week. */
export function assessDfsResearchArtifactCompatibility(
  researchArtifact: WeeklyFantasyResearchArtifact | null,
  expectedSeason: number,
  expectedWeek: number,
): DfsResearchArtifactCompatibility {
  if (!researchArtifact) return { status: "not-provided" };
  if (researchArtifact.season !== expectedSeason || researchArtifact.week !== expectedWeek) {
    return {
      status: "wrong-week",
      artifactSeason: researchArtifact.season,
      artifactWeek: researchArtifact.week,
      expectedSeason,
      expectedWeek,
    };
  }
  return { status: "compatible", season: researchArtifact.season, week: researchArtifact.week };
}

/**
 * Joins the weekly research companion onto the projection universe using the
 * existing exact playerId join, gated by season/week compatibility.
 * A wrong-week or missing artifact never contaminates the row: every player
 * simply reports `status: "missing"` and `context/matchupEdges: null`.
 */
export function assessDfsResearch(
  projectionRows: readonly WeeklyFantasyProjectionProductionRow[],
  researchArtifact: WeeklyFantasyResearchArtifact | null,
  expectedSeason: number,
  expectedWeek: number,
): DfsResearchAssessment {
  const compatibility = assessDfsResearchArtifactCompatibility(researchArtifact, expectedSeason, expectedWeek);
  const effectiveArtifact = compatibility.status === "compatible" ? researchArtifact : null;

  const { rows, missingPlayerIds, mismatchedPlayerIds } = joinWeeklyFantasyResearchRows(projectionRows, effectiveArtifact);
  const missingSet = new Set(missingPlayerIds);
  const mismatchedSet = new Set(mismatchedPlayerIds);

  const byPlayerId = new Map<string, DfsPlayerResearch>();
  rows.forEach((row) => {
    const unavailable = !effectiveArtifact || missingSet.has(row.playerId) || mismatchedSet.has(row.playerId);
    const status: DfsPlayerResearchStatus = !effectiveArtifact
      ? "missing"
      : mismatchedSet.has(row.playerId)
        ? "position-mismatch"
        : missingSet.has(row.playerId)
          ? "missing"
          : "available";

    byPlayerId.set(row.playerId, {
      status,
      context: unavailable ? null : row.research,
      matchupEdges: unavailable ? null : row.matchupEdges,
      matchupGrade: unavailable ? null : getMatchupGrade(row.research.opponentFpaSeason.rank),
    });
  });

  return {
    compatibility,
    byPlayerId,
    missingPlayerIds,
    mismatchedPositionPlayerIds: mismatchedPlayerIds,
  };
}
