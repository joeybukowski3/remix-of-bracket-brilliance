import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_PHASE7_EXPERIMENTS_DIR, PHASE7_TEST_SEASONS } from "../src/lib/cfb/research/phase7/config";
import { buildPhase7Context } from "../src/lib/cfb/research/phase7/contextSnapshot";
import { buildMissDataset } from "../src/lib/cfb/research/phase7/missDataset";
import { buildExtremeDisagreementAudit } from "../src/lib/cfb/research/phase7/extremeDisagreementAudit";
import { buildSparsityAnalysis } from "../src/lib/cfb/research/phase7/sparsityAnalysis";
import { buildTalentRosterAnalysis } from "../src/lib/cfb/research/phase7/talentRosterAnalysis";
import { buildPriorStalenessAnalysis } from "../src/lib/cfb/research/phase7/priorStalenessAnalysis";
import { buildRatingVolatilityAnalysis } from "../src/lib/cfb/research/phase7/ratingVolatilityAnalysis";
import { buildOffenseDefenseDecomposition } from "../src/lib/cfb/research/phase7/offenseDefenseErrorDecomposition";
import { buildConferenceAnalysis } from "../src/lib/cfb/research/phase7/conferenceAnalysis";
import { buildScheduleConnectivityAnalysis } from "../src/lib/cfb/research/phase7/scheduleConnectivity";
import { buildTeamProfileSegmentation } from "../src/lib/cfb/research/phase7/teamProfileSegmentation";
import { buildErrorPersistenceAnalysis } from "../src/lib/cfb/research/phase7/errorPersistence";
import { buildMarketDisagreementPersistenceAnalysis } from "../src/lib/cfb/research/phase7/marketDisagreementPersistence";
import { buildContextVariableAnalysis } from "../src/lib/cfb/research/phase7/contextVariables";
import { PUBLIC_INFORMATION_INVENTORY } from "../src/lib/cfb/research/phase7/publicInformationInventory";
import { buildQbCandidateRows, buildTransferCandidateRows, buildCoachingCandidateRows } from "../src/lib/cfb/research/phase7/candidateFeatureBuilders";
import { testCandidateFeatureIncremental } from "../src/lib/cfb/research/phase7/candidateFeatureIncremental";
import { TRANSFER_PORTAL_COVERAGE_START_SEASON } from "../src/lib/cfb/research/phase7/config";
import { PHASE7_RECOMMENDATION } from "../src/lib/cfb/research/phase7/recommendation";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE7_EXPERIMENTS_DIR);
mkdirSync(OUT_DIR, { recursive: true });

function writeArtifact(name: string, data: unknown): void {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(resolve(OUT_DIR, name), text, "utf8");
  console.log(`[cfb:research:phase7:run] wrote ${name}`);
}

function assertNoNaNOrInfinity(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoNaNOrInfinity(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoNaNOrInfinity(v, `${path}.${k}`);
  }
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const testSeasons = [...PHASE7_TEST_SEASONS];
  const context = buildPhase7Context(testSeasons);
  const missDataset = buildMissDataset(context);
  console.log(`[cfb:research:phase7:run] miss dataset: ${missDataset.length} rows (${Date.now() - t0}ms)`);

  const missCategoryCounts = missDataset.reduce<Record<string, number>>((acc, r) => {
    acc[r.missCategory] = (acc[r.missCategory] ?? 0) + 1;
    return acc;
  }, {});
  writeArtifact("miss-dataset-summary.json", {
    totalGames: missDataset.length,
    seasons: testSeasons,
    missCategoryCounts,
    seasonCounts: [...new Set(missDataset.map((r) => r.season))].sort().map((season) => ({
      season,
      n: missDataset.filter((r) => r.season === season).length,
    })),
  });

  writeArtifact("extreme-disagreement-audit.json", buildExtremeDisagreementAudit(missDataset));
  writeArtifact("sparsity-analysis.json", buildSparsityAnalysis(missDataset));
  writeArtifact("talent-roster-analysis.json", buildTalentRosterAnalysis(missDataset));
  writeArtifact("prior-conflict-analysis.json", buildPriorStalenessAnalysis(missDataset));
  writeArtifact("rating-volatility-analysis.json", buildRatingVolatilityAnalysis(missDataset));
  writeArtifact("offense-defense-error-analysis.json", buildOffenseDefenseDecomposition(missDataset));
  writeArtifact("conference-analysis.json", buildConferenceAnalysis(missDataset));
  writeArtifact("schedule-connectivity-analysis.json", buildScheduleConnectivityAnalysis(missDataset));
  writeArtifact("team-profile-segmentation.json", buildTeamProfileSegmentation(missDataset));
  writeArtifact("error-persistence.json", buildErrorPersistenceAnalysis(missDataset));
  writeArtifact("market-disagreement-persistence.json", buildMarketDisagreementPersistenceAnalysis(missDataset));
  writeArtifact("context-variable-analysis.json", buildContextVariableAnalysis(missDataset));
  writeArtifact("public-information-inventory.json", PUBLIC_INFORMATION_INVENTORY);

  // Section 7/9/10/21 — candidate feature blocks.
  const qbRows = buildQbCandidateRows(missDataset);
  const qbResultAll = testCandidateFeatureIncremental(qbRows);
  const qbResultWeeks1to4 = testCandidateFeatureIncremental(qbRows.filter((r) => r.week <= 4));
  const qbExtremeDisagreementRows = qbRows.filter((r) => r.modelVsMarketDisagreement !== null && r.modelVsMarketDisagreement >= 7);
  const qbResultExtremeDisagreement = testCandidateFeatureIncremental(qbExtremeDisagreementRows);

  const transferEligibleRows = missDataset.filter((r) => r.season >= TRANSFER_PORTAL_COVERAGE_START_SEASON);
  const transferRows = buildTransferCandidateRows(transferEligibleRows);
  const transferResult = testCandidateFeatureIncremental(transferRows);

  const coachingRows = buildCoachingCandidateRows(missDataset, testSeasons);
  const coachingResult = testCandidateFeatureIncremental(coachingRows);

  writeArtifact("qb-data-feasibility.json", {
    endpoint: "/player/usage (position=QB)",
    coverageSeasons: "2018-2025 (verified via cfb-research-phase7-fetch.ts row counts)",
    definition: "primary QB = highest usage.pass among a team's QBs that season, if usage.pass clears the configured floor",
    feasibility: "GO",
    nGamesWithBothSidesResolved: qbRows.length,
    nTotalGamesInMissDataset: missDataset.length,
  });

  writeArtifact("candidate-feature-results.json", {
    qbContinuity: {
      allWeeks: qbResultAll,
      weeks1to4: qbResultWeeks1to4,
      extremeDisagreementSubset: qbResultExtremeDisagreement,
    },
    transferNet: {
      coverageNote: `restricted to seasons >= ${TRANSFER_PORTAL_COVERAGE_START_SEASON} (CFBD portal coverage is empty before this)`,
      result: transferResult,
    },
    coachingContinuity: {
      result: coachingResult,
    },
  });

  writeArtifact("transfer-data-feasibility.json", {
    endpoint: "/player/portal",
    coverageBySeasonRowCounts:
      "2018: 0, 2019: 0, 2020: 0, 2021: 1770, 2022: 2273, 2023: 2502, 2024: 3378, 2025: 4499 (verified via cfb-research-phase7-fetch.ts)",
    feasibility: `GO for seasons >= ${TRANSFER_PORTAL_COVERAGE_START_SEASON} only`,
    nGamesTested: transferRows.length,
  });

  writeArtifact("coaching-data-feasibility.json", {
    endpoint: "/coaches (bulk, by year)",
    coverageSeasons: "2018-2025",
    definition: "newHeadCoach computed empirically (coach id changed vs. same team's prior fetched season); tenureYearsObservedFloor is a floor bounded by the 2018 backfill start, not true career tenure",
    feasibility: "GO",
    nGamesTested: coachingRows.length,
  });

  writeArtifact("phase7-recommendation.json", PHASE7_RECOMMENDATION);

  const allArtifacts = {
    missDataset,
  };
  assertNoNaNOrInfinity(allArtifacts);

  console.log(`[cfb:research:phase7:run] done in ${Date.now() - t0}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
