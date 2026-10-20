/**
 * Source acceptance gate. buildDataset already validates rows (duplicates,
 * point and minute reconciliation); this adds what is specific to adopting a
 * PROVIDER: does its data match what the registry declares, is every row
 * traceable to a preserved snapshot, and is each season complete.
 */
import type { NbaDataset } from "../dataset";
import type { NbaSeasonType } from "../seasonType";
import type { SourceOffering } from "./registry";

export interface SeasonTypeExpectation {
  /** Games with player rows that a complete season of this type contains (e.g. 1230 for a full regular season). */
  games: number;
}

/**
 * Expected completeness keyed by season, because season length varies
 * (shortened seasons, playoff length). An expected season missing from the
 * dataset is a failure, not a pass.
 */
export type QualityExpectations = Readonly<Record<string, Partial<Record<NbaSeasonType, SeasonTypeExpectation>>>>;

export interface QualityFinding {
  code: "dataset_errors" | "provenance_unknown_snapshot" | "minutes_precision_mismatch" | "dnp_representation_mismatch" | "incomplete_coverage";
  severity: "error" | "warning";
  message: string;
}

export interface QualityReport {
  passed: boolean;
  findings: QualityFinding[];
}

/** Share of the expected games that must be present. */
const MIN_COVERAGE_RATIO = 0.99;

export function assessSourceQuality(dataset: NbaDataset, offering: Pick<SourceOffering, "playerStats">, expectations: QualityExpectations): QualityReport {
  const findings: QualityFinding[] = [];

  const errors = dataset.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) findings.push({ code: "dataset_errors", severity: "error", message: `${errors.length} dataset validation error(s), first: ${errors[0].code}` });

  const known = new Set(dataset.coverage.flatMap((row) => row.snapshotIds));
  const orphans = new Set([...dataset.playerGames, ...dataset.teamGames].map((row) => row.sourceSnapshotId).filter((id) => !known.has(id)));
  if (orphans.size > 0) findings.push({ code: "provenance_unknown_snapshot", severity: "error", message: `rows cite ${orphans.size} snapshot id(s) with no preserved snapshot` });

  const declared = offering.playerStats?.minutes ?? null;
  const fractional = dataset.playerGames.some((row) => !Number.isInteger(row.minutes));
  if (declared === "whole-minutes" && fractional) {
    findings.push({ code: "minutes_precision_mismatch", severity: "warning", message: "declared whole-minute precision but fractional minutes were delivered" });
  } else if (declared === "decimal" && dataset.playerGames.length > 0 && !fractional) {
    findings.push({ code: "minutes_precision_mismatch", severity: "warning", message: "declared decimal minutes but every value is a whole number" });
  }

  const zeroMinuteRows = dataset.coverage.reduce((sum, row) => sum + row.zeroMinuteRows, 0);
  const dnp = offering.playerStats?.dnp ?? "unknown";
  if (dnp === "absent" && zeroMinuteRows > 0) findings.push({ code: "dnp_representation_mismatch", severity: "warning", message: `declared no DNP rows but ${zeroMinuteRows} zero-minute row(s) exist` });

  for (const [season, byType] of Object.entries(expectations)) {
    for (const [seasonType, expected] of Object.entries(byType) as [NbaSeasonType, SeasonTypeExpectation][]) {
      const row = dataset.coverage.find((c) => c.season === season && c.seasonType === seasonType);
      const have = row?.gamesWithPlayerRows ?? 0;
      if (have < expected.games * MIN_COVERAGE_RATIO) {
        findings.push({ code: "incomplete_coverage", severity: "error", message: `${season} ${seasonType}: ${have} of ${expected.games} expected games have player rows` });
      }
    }
  }

  return { passed: !findings.some((f) => f.severity === "error"), findings };
}
