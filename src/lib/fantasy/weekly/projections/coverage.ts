import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { WeeklyFantasyProjectionTrainingRow } from "./contract";

export type ProjectionCoverageRow = {
  season: number;
  week: number;
  position: FantasyPosition;
  eligibleRows: number;
  projectionCandidateRows: number;
  rowsWithOutcome: number;
  zeroOutcomeEligibleRows: number;
  priorSeasonCoveragePct: number;
  currentUsageCoveragePct: number;
  snapCoveragePct: number;
  teamFeatureCoveragePct: number;
  opponentFeatureCoveragePct: number;
  fpaCoveragePct: number;
};

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function buildProjectionCoverageReport(
  rows: readonly WeeklyFantasyProjectionTrainingRow[],
): ProjectionCoverageRow[] {
  const groups = new Map<string, WeeklyFantasyProjectionTrainingRow[]>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.position}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [season, week, position] = key.split("|");
      const n = group.length;
      const rowsWithOutcome = group.filter((row) => row.actualFantasyPoints !== 0).length;
      return {
        season: Number(season),
        week: Number(week),
        position: position as FantasyPosition,
        eligibleRows: n,
        projectionCandidateRows: group.filter((row) => row.projectionCandidate).length,
        rowsWithOutcome,
        zeroOutcomeEligibleRows: n - rowsWithOutcome,
        priorSeasonCoveragePct: pct(group.filter((row) => row.hasPriorSeason).length, n),
        currentUsageCoveragePct: pct(group.filter((row) => row.gamesPlayedPrior > 0).length, n),
        snapCoveragePct: pct(group.filter((row) => row.snapCoverageAvailable).length, n),
        teamFeatureCoveragePct: pct(group.filter((row) => row.teamOffensiveEpaPrior != null).length, n),
        opponentFeatureCoveragePct: pct(group.filter((row) => row.opponentDefensiveEpaPrior != null).length, n),
        fpaCoveragePct: pct(group.filter((row) => row.opponentPositionFpaPrior != null).length, n),
      };
    })
    .sort((a, b) => a.season - b.season || a.week - b.week || a.position.localeCompare(b.position));
}
