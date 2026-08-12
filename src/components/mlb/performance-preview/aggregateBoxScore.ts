import type { BoxScoreAggregate } from "./BoxScoreStrip";

export interface AggregatableLine {
  atBats?: number | null;
  hits?: number | null;
  doubles?: number | null;
  homeRuns?: number | null;
  totalBases?: number | null;
  rbi?: number | null;
  runs?: number | null;
  baseOnBalls?: number | null;
  strikeOuts?: number | null;
}

function sum(lines: AggregatableLine[], key: keyof AggregatableLine): number | null {
  const values = lines.map((l) => l[key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

/** Sums a set of batting lines into a single box-score aggregate. Any field never present in the source data (e.g. doubles) stays null throughout, rendered as "—" by BoxScoreStrip. */
export function aggregateBoxScore(lines: Array<AggregatableLine | null | undefined>): BoxScoreAggregate {
  const present = lines.filter((l): l is AggregatableLine => l != null);
  const atBats = sum(present, "atBats");
  const hits = sum(present, "hits");
  return {
    atBats,
    hits,
    avg: atBats && atBats > 0 && hits !== null ? hits / atBats : null,
    homeRuns: sum(present, "homeRuns"),
    doubles: sum(present, "doubles"),
    totalBases: sum(present, "totalBases"),
    rbi: sum(present, "rbi"),
    runs: sum(present, "runs"),
    baseOnBalls: sum(present, "baseOnBalls"),
    strikeOuts: sum(present, "strikeOuts"),
    sampleSize: present.length,
  };
}
