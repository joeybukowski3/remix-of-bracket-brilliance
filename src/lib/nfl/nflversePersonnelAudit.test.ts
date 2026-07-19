import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import teamsJson from "../../../public/data/nfl/teams.json";
import {
  NFLVERSE_DATASETS,
  assertNonProductionOutput,
  buildNflverseFourTeamAudit,
  loadNflverseDataset,
  normalizeNflverseRosterRows,
  REVIEWED_IDENTITY_OVERRIDES_SCHEMA_VERSION,
  validateNflverseManifest,
  validateReviewedIdentityOverrides,
} from "../../../scripts/lib/nfl-personnel/providers/nflverse/audit.mjs";
import { buildNflOffseasonEvidenceDataset } from "./offseasonEvidence";

const ROOT = resolve(__dirname, "../../..");
const FIXTURE_DIR = join(ROOT, "scripts/fixtures/nfl-personnel/nflverse");
const GENERATED_AT = "2026-07-17T12:00:00.000Z";
const SOURCE_CUTOFF = "2026-07-17";

function fixturePath(filename: string) {
  return join(FIXTURE_DIR, filename);
}

async function buildFixtureAudit() {
  return buildNflverseFourTeamAudit({
    season: 2026,
    priorSeason: 2025,
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    rosterSourcePath: fixturePath("roster_2026.csv"),
    priorRosterSourcePath: fixturePath("roster_2025.csv"),
    playerStatsSourcePath: fixturePath("stats_player_reg_2025.csv"),
    snapCountsSourcePath: fixturePath("snap_counts_2025.csv"),
    teamsJson,
    manualDataset: {
      records: [
        {
          teamId: "nfl-atl",
          abbr: "atl",
          personnel: [{ playerName: "Atlas Receiver", normalizedPlayerName: "atlas receiver", kind: "manual_test" }],
        },
      ],
    },
  });
}

function reviewedOverrideRecord(overrides: Record<string, unknown> = {}) {
  return {
    overrideId: "fixture-pfr-conflict-review",
    schemaVersion: REVIEWED_IDENTITY_OVERRIDES_SCHEMA_VERSION,
    provider: "nflverse",
    providerIdType: "pfrId",
    providerPersonId: "PfrCon00",
    sourceSeason: 2025,
    canonicalPersonId: "nflverse-person:gsisid:00-PFR-CON1",
    gsisId: "00-PFR-CON1",
    canonicalName: "Reviewed Corner",
    sourceNameVariants: ["Reviewed Alias", "Reviewed Corner"],
    teamScope: ["nfl-atl"],
    positionContext: ["CB", "DB"],
    resolutionType: "pfr_to_gsis_review",
    evidenceRefs: [
      { sourceId: "nflverse-prior-rosters" },
      { sourceId: "nflverse-snap-counts" },
    ],
    reviewedBy: "fixture-reviewer",
    reviewedAt: "2026-07-17",
    reviewNotes: "Fixture approval based on exact provider IDs; no fuzzy matching.",
    status: "approved",
    expiresAfterSeason: 2026,
    permanent: false,
    ...overrides,
  };
}

function reviewedOverridesFile(records: Array<Record<string, unknown>>) {
  return {
    schemaVersion: REVIEWED_IDENTITY_OVERRIDES_SCHEMA_VERSION,
    provider: "nflverse",
    targetSeason: 2026,
    priorSeason: 2025,
    overrides: records,
  };
}

function fixtureWithPfrConflict() {
  const dir = mkdtempSync(join(tmpdir(), "nflverse-pfr-conflict-"));
  for (const filename of ["roster_2026.csv", "roster_2025.csv", "stats_player_reg_2025.csv", "snap_counts_2025.csv"]) {
    writeFileSync(join(dir, filename), readFileSync(fixturePath(filename), "utf8"));
  }
  writeFileSync(
    join(dir, "roster_2025.csv"),
    `${readFileSync(join(dir, "roster_2025.csv"), "utf8").trimEnd()}\n2025,ATL,DB,CB,ACT,Reviewed Corner,00-PFR-CON1,1999,sr-pfr-con1,PfrCon00,,,,,,1\n`,
  );
  writeFileSync(
    join(dir, "roster_2026.csv"),
    `${readFileSync(join(dir, "roster_2026.csv"), "utf8").trimEnd()}\n2026,ATL,DB,CB,ACT,Reviewed Corner,00-PFR-CON1,1999,sr-pfr-con1,PfrCon00,,,,,,2\n`,
  );
  writeFileSync(
    join(dir, "snap_counts_2025.csv"),
    `${readFileSync(join(dir, "snap_counts_2025.csv"), "utf8").trimEnd()}\n2025_01_ATL,202509070atl,2025,REG,1,Reviewed Alias,PfrCon00,CB,ATL,CAR,0,0,22,.33,1,.1\n`,
  );
  return dir;
}

describe("nflverse personnel cache manifests", () => {
  it("validates fixture checksums and reports mismatches", () => {
    const manifest = JSON.parse(readFileSync(fixturePath("manifest.fixture.json"), "utf8"));
    const validation = validateNflverseManifest(manifest, { baseDir: ROOT });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const broken = structuredClone(manifest);
    broken.datasets[0].sha256 = "bad";
    const checksum = validateNflverseManifest(broken, { baseDir: ROOT });

    expect(checksum.valid).toBe(false);
    expect(checksum.errors.map((error) => error.code)).toContain("checksum_mismatch");
  });

  it("supports offline cached replay and fails on schema drift", async () => {
    const loaded = await loadNflverseDataset({
      dataset: "rosters",
      season: 2026,
      sourcePath: fixturePath("roster_2026.csv"),
      retrievedAt: GENERATED_AT,
    });

    expect(loaded.rowCount).toBe(13);
    expect(loaded.headerColumns).toContain("gsis_id");

    const dir = mkdtempSync(join(tmpdir(), "nflverse-schema-"));
    try {
      const driftPath = join(dir, "roster_2026.csv");
      writeFileSync(driftPath, "season,team,position\n2026,ATL,QB\n");
      await expect(loadNflverseDataset({
        dataset: "rosters",
        season: 2026,
        sourcePath: driftPath,
        retrievedAt: GENERATED_AT,
      })).rejects.toThrow(/schema drift/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("nflverse personnel identity", () => {
  it("selects the current season-specific stats_player regular-season file family", () => {
    expect(NFLVERSE_DATASETS.playerStats.release).toBe("stats_player");
    expect(NFLVERSE_DATASETS.playerStats.filename(2025)).toBe("stats_player_reg_2025.csv");
    expect(NFLVERSE_DATASETS.playerStats.requiredFields).toEqual(
      expect.arrayContaining(["season", "season_type", "recent_team", "player_id", "player_display_name", "position"]),
    );
  });

  it("uses GSIS first, preserves provider IDs, and warns on name-only collisions", async () => {
    const roster = await loadNflverseDataset({
      dataset: "rosters",
      season: 2026,
      sourcePath: fixturePath("roster_2026.csv"),
      retrievedAt: GENERATED_AT,
    });
    const normalized = normalizeNflverseRosterRows(roster.rows, {
      teamsJson,
      allowedTeamAbbrs: ["atl", "chi", "nyj", "sea"],
      season: 2026,
      sourceId: "nflverse-rosters",
    });
    const atlas = normalized.find((row) => row.name === "Atlas Returning")!;

    expect(atlas.providerId).toBe("00-ATL-QB1");
    expect(atlas.identityKey).toBe("provider:00-atl-qb1");
    expect(atlas.providerIds).toMatchObject({
      gsisId: "00-ATL-QB1",
      espnId: "1001",
      pfrId: "AtlaRe00",
      sportradarId: "sr-atl-qb1",
    });

    const audit = await buildFixtureAudit();
    expect(audit.dataset.identityMatchSummary.warnings).toContain(
      "name-only collision requires provider ID before merge: alex same",
    );
    expect(audit.dataset.conflicts.some((conflict) => conflict.message.includes("00-CONFLICT"))).toBe(true);
    expect(audit.dataset.identityMatchSummary.resolvedGsis).toBeGreaterThan(0);
    expect(audit.dataset.identityCrosswalk.some((entry) => entry.providerIds.gsisId?.includes("00-NYJ-WR2"))).toBe(true);
    expect(audit.dataset.identityReview.reasonTaxonomy).toMatchObject({
      providerIdConflict: "provider_id_conflict",
      pfrOnlySnapIdentity: "pfr_only_snap_identity",
      suffixVariant: "suffix_variant",
    });
    expect(audit.dataset.identityReview.resolutionPolicy.noFuzzyMatching).toBe(true);
  });

  it("allows legitimate team movement across seasons without counting incoming production as retained", async () => {
    const audit = await buildFixtureAudit();
    const sea = audit.dataset.teams.find((team) => team.abbr === "sea")!;
    const atl = audit.dataset.teams.find((team) => team.abbr === "atl")!;

    expect(sea.returningProduction.metrics.receivingYards).toMatchObject({
      numerator: 650,
      denominator: 1510,
      value: 0.430464,
    });
    expect(atl.returningProduction.metrics.receivingYards).toMatchObject({
      numerator: 900,
      denominator: 1000,
      value: 0.9,
    });
    expect(
      audit.dataset.identityCrosswalk.some((entry) =>
        entry.providerIds.gsisId?.includes("00-SEA-WR1") && entry.warnings.includes("team changed across prior and target sources"),
      ),
    ).toBe(true);
  });

  it("surfaces PFR-only snap identities, position changes, and suffix/punctuation variants", async () => {
    const audit = await buildFixtureAudit();

    expect(
      audit.dataset.identityCrosswalk.some((entry) =>
        entry.sourceNameVariants.includes("PFR Only Runner") && entry.warnings.includes("unresolved PFR-only snap identity"),
      ),
    ).toBe(true);
    expect(
      audit.dataset.identityReview.unresolvedIdentities.some((entry) =>
        entry.sourceNameVariants.includes("PFR Only Runner") &&
        entry.reasonCategories.includes("pfr_only_snap_identity") &&
        entry.resolutionStatus === "excluded",
      ),
    ).toBe(true);
    expect(
      audit.dataset.identityCrosswalk.some((entry) =>
        entry.providerIds.gsisId?.includes("00-ATL-WR1") && entry.warnings.includes("position changed across sources"),
      ),
    ).toBe(true);
    expect(
      audit.dataset.identityReview.automaticallyResolvedIdentities.some((entry) =>
        entry.providerIds.gsisId?.includes("00-ATL-WR1") &&
        entry.reasonCategories.includes("position_change"),
      ),
    ).toBe(true);
    expect(
      audit.dataset.identityCrosswalk.some((entry) =>
        entry.providerIds.gsisId?.includes("00-NYJ-WR2") &&
        entry.normalizedNames.includes("dj oneil smith") &&
        entry.sourceNameVariants.includes("D.J. O'Neil-Smith Jr."),
      ),
    ).toBe(true);
    expect(
      audit.dataset.identityReview.automaticallyResolvedIdentities.some((entry) =>
        entry.providerIds.gsisId?.includes("00-NYJ-WR2") &&
        entry.reasonCategories.includes("suffix_variant"),
      ),
    ).toBe(true);
  });

  it("diagnoses provider conflicts without hardcoded resolutions", async () => {
    const audit = await buildFixtureAudit();
    const conflict = audit.dataset.identityReview.criticalConflicts.find((entry) =>
      entry.providerId === "00-CONFLICT" || entry.message.includes("00-CONFLICT"),
    )!;

    expect(conflict).toMatchObject({
      severity: "critical",
      category: "identity",
      deterministicResolutionPossible: false,
      likelyCause: "conflicting_name_for_provider_id_in_approved_inputs",
      fixtureIssue: false,
      adapterLogicIssue: false,
    });
    expect(conflict.names).toEqual(["Conflict Person", "Different Person"]);
    expect(conflict.sourceRows.length).toBe(2);
  });

  it("builds provider crosswalk diagnostics and per-team quality summaries", async () => {
    const audit = await buildFixtureAudit();
    const review = audit.dataset.identityReview;

    expect(review.providerCrosswalkDiagnostics.gsisToPfr.length).toBeGreaterThan(0);
    expect(review.providerCrosswalkDiagnostics.missingIdRates.snap_counts.missingGsisRate).toBe(1);
    expect(review.identityQualityByTeam["nfl-atl"]).toMatchObject({
      teamAbbr: "atl",
      criticalConflicts: 1,
      offensiveSnapCoveragePercentage: 0.608696,
      defensiveSnapCoveragePercentage: 0,
    });
    expect(review.all32ExpansionGateEvaluation.safeForAll32IdentityExpansion).toBe(false);
    expect(review.all32ExpansionGateEvaluation.failures).toContain("critical_provider_conflicts_present");
  });
});

describe("nflverse returning-production audit", () => {
  it("filters regular season only and excludes postseason snaps", async () => {
    const audit = await buildFixtureAudit();
    const sea = audit.dataset.teams.find((team) => team.abbr === "sea")!;

    expect(sea.returningProduction.metrics.offensiveSnaps).toMatchObject({
      numerator: 120,
      denominator: 180,
      value: 0.666667,
      coverageComplete: true,
    });
  });

  it("calculates retained numerators and denominators with unmatched-player warnings", async () => {
    const audit = await buildFixtureAudit();
    const atl = audit.dataset.teams.find((team) => team.abbr === "atl")!;

    expect(atl.returningProduction.metrics.offensiveSnaps).toMatchObject({
      numerator: 70,
      denominator: 115,
      value: 0.608696,
      matchedPlayerCount: 1,
      unmatchedPlayerCount: 2,
      unmatchedProduction: 45,
    });
    expect(atl.returningProduction.metrics.defensiveSnaps).toMatchObject({
      numerator: 0,
      denominator: 65,
      value: 0,
    });
    expect(atl.returningProduction.advisory.unmatchedPlayers.defensiveSnaps[0]).toMatchObject({
      playerName: "Atlas Defender",
      amount: 65,
    });
    const pfrOnly = audit.dataset.identityReview.unresolvedIdentities.find((entry) =>
      entry.sourceNameVariants.includes("PFR Only Runner"),
    )!;
    expect(pfrOnly.affectedProduction).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          teamAbbr: "atl",
          affectedMetric: "offensiveSnaps",
          excludedQuantity: 5,
          retainedShareCouldChangeMaterially: true,
          coverageCompleteRecommendation: "become_false_until_reviewed",
        }),
      ]),
    );
  });

  it("calculates retained passing, rushing, and receiving production without zero-filling", async () => {
    const audit = await buildFixtureAudit();
    const atl = audit.dataset.teams.find((team) => team.abbr === "atl")!;
    const nyj = audit.dataset.teams.find((team) => team.abbr === "nyj")!;

    expect(atl.returningProduction.metrics.qbPassAttempts).toMatchObject({
      numerator: 500,
      denominator: 500,
      value: 1,
      matchedPlayerCount: 1,
      unmatchedProduction: 0,
    });
    expect(atl.returningProduction.metrics.carries).toMatchObject({
      numerator: 22,
      denominator: 222,
      value: 0.099099,
      unmatchedProduction: 200,
    });
    expect(atl.returningProduction.metrics.rushingYards).toMatchObject({
      numerator: 90,
      denominator: 990,
      value: 0.090909,
      unmatchedProduction: 900,
    });
    expect(atl.returningProduction.metrics.targets).toMatchObject({
      numerator: 100,
      denominator: 120,
      value: 0.833333,
      unmatchedProduction: 20,
    });
    expect(nyj.returningProduction.metrics.receivingYards).toMatchObject({
      numerator: 140,
      denominator: 740,
      value: 0.189189,
      unmatchedProduction: 600,
    });
  });

  it("validates reviewed identity override schema and required approval metadata", () => {
    const pending = validateReviewedIdentityOverrides(reviewedOverridesFile([
      reviewedOverrideRecord({ status: "pending", reviewedBy: null, reviewedAt: null }),
    ]), { targetSeason: 2026, priorSeason: 2025 });
    expect(pending.valid).toBe(true);

    const approvedWithoutReview = validateReviewedIdentityOverrides(reviewedOverridesFile([
      reviewedOverrideRecord({ reviewedBy: null, reviewedAt: null }),
    ]), { targetSeason: 2026, priorSeason: 2025 });
    expect(approvedWithoutReview.valid).toBe(false);
    expect(approvedWithoutReview.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["missing_reviewer", "missing_review_date"]),
    );

    const duplicate = validateReviewedIdentityOverrides(reviewedOverridesFile([
      reviewedOverrideRecord({ overrideId: "fixture-pfr-conflict-review-a" }),
      reviewedOverrideRecord({ overrideId: "fixture-pfr-conflict-review-b" }),
    ]), { targetSeason: 2026, priorSeason: 2025 });
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors.map((error) => error.code)).toContain("duplicate_active_override");

    const conflicting = validateReviewedIdentityOverrides(reviewedOverridesFile([
      reviewedOverrideRecord({ overrideId: "fixture-pfr-conflict-review-a", teamScope: ["nfl-atl"] }),
      reviewedOverrideRecord({
        overrideId: "fixture-pfr-conflict-review-b",
        teamScope: ["nfl-chi"],
        canonicalPersonId: "nflverse-person:gsisid:00-PFR-CON2",
      }),
    ]), { targetSeason: 2026, priorSeason: 2025 });
    expect(conflicting.valid).toBe(false);
    expect(conflicting.errors.map((error) => error.code)).toContain("conflicting_provider_override");

    const expired = validateReviewedIdentityOverrides(reviewedOverridesFile([
      reviewedOverrideRecord({ expiresAfterSeason: 2025 }),
    ]), { targetSeason: 2026, priorSeason: 2025 });
    expect(expired.valid).toBe(false);
    expect(expired.errors.map((error) => error.code)).toContain("expired_override");
  });

  it("applies approved PFR-to-GSIS overrides without weakening stable GSIS conflicts", async () => {
    const dir = fixtureWithPfrConflict();
    try {
      const baseline = await buildNflverseFourTeamAudit({
        season: 2026,
        priorSeason: 2025,
        generatedAt: GENERATED_AT,
        sourceCutoff: SOURCE_CUTOFF,
        rosterSourcePath: join(dir, "roster_2026.csv"),
        priorRosterSourcePath: join(dir, "roster_2025.csv"),
        playerStatsSourcePath: join(dir, "stats_player_reg_2025.csv"),
        snapCountsSourcePath: join(dir, "snap_counts_2025.csv"),
        teamsJson,
      });
      expect(baseline.identityReview.criticalConflicts.some((conflict) => conflict.providerId === "PfrCon00")).toBe(true);

      const reviewedIdentityOverrides = reviewedOverridesFile([reviewedOverrideRecord()]);
      const reviewed = await buildNflverseFourTeamAudit({
        season: 2026,
        priorSeason: 2025,
        generatedAt: GENERATED_AT,
        sourceCutoff: SOURCE_CUTOFF,
        rosterSourcePath: join(dir, "roster_2026.csv"),
        priorRosterSourcePath: join(dir, "roster_2025.csv"),
        playerStatsSourcePath: join(dir, "stats_player_reg_2025.csv"),
        snapCountsSourcePath: join(dir, "snap_counts_2025.csv"),
        teamsJson,
        reviewedIdentityOverrides,
      });

      expect(reviewed.identityReview.criticalConflicts.some((conflict) => conflict.providerId === "PfrCon00")).toBe(false);
      expect(reviewed.dataset.reviewedIdentityOverrides.counts.applied).toBe(1);
      expect(reviewed.dataset.identityMatchSummary.conflicts.some((conflict) => conflict.message.includes("00-CONFLICT"))).toBe(true);
      expect(JSON.stringify(reviewed.dataset)).not.toMatch(/"(score|rating)"/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps pending, rejected, and superseded overrides out of normal audit while simulation stays isolated", async () => {
    const dir = fixtureWithPfrConflict();
    try {
      const reviewedIdentityOverrides = reviewedOverridesFile([
        reviewedOverrideRecord({ status: "pending", reviewedBy: null, reviewedAt: null }),
        reviewedOverrideRecord({
          overrideId: "fixture-rejected-pfr-conflict-review",
          providerPersonId: "NoMatch00",
          status: "rejected",
        }),
        reviewedOverrideRecord({
          overrideId: "fixture-superseded-pfr-conflict-review",
          providerPersonId: "OldMatch00",
          status: "superseded",
        }),
      ]);
      const audit = await buildNflverseFourTeamAudit({
        season: 2026,
        priorSeason: 2025,
        generatedAt: GENERATED_AT,
        sourceCutoff: SOURCE_CUTOFF,
        rosterSourcePath: join(dir, "roster_2026.csv"),
        priorRosterSourcePath: join(dir, "roster_2025.csv"),
        playerStatsSourcePath: join(dir, "stats_player_reg_2025.csv"),
        snapCountsSourcePath: join(dir, "snap_counts_2025.csv"),
        teamsJson,
        reviewedIdentityOverrides,
        simulatePendingOverrides: true,
      });

      expect(audit.identityReview.criticalConflicts.some((conflict) => conflict.providerId === "PfrCon00")).toBe(true);
      expect(audit.dataset.reviewedIdentityOverrides.counts.applied).toBe(0);
      expect(audit.dataset.reviewedIdentityOverrides.pendingSimulation).toMatchObject({
        enabled: true,
        simulationOnly: true,
        criticalConflictCountAfterSimulation: 1,
      });
      expect(audit.dataset.reviewedIdentityOverrides.pendingSimulation.simulatedDecisions.some(
        (decision) => decision.overrideId === "fixture-pfr-conflict-review" && decision.wouldClearCriticalConflict,
      )).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not zero-fill unsupported metrics or infer starts, sacks, pressures, or position groups", async () => {
    const audit = await buildFixtureAudit();
    const atl = audit.dataset.teams.find((team) => team.abbr === "atl")!;

    for (const key of ["starts", "sacks", "pressures", "offensiveLineSnaps", "defensiveBackSnaps"] as const) {
      expect(atl.returningProduction.metrics[key]).toMatchObject({
        value: null,
        numerator: null,
        denominator: null,
        coverageComplete: false,
      });
    }
  });

  it("marks missing prior-season player-stat coverage unavailable instead of complete zero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nflverse-empty-stats-"));
    try {
      const emptyStats = join(dir, "player_stats_season.csv");
      writeFileSync(
        emptyStats,
        "season,season_type,recent_team,player_id,player_display_name,position,attempts,carries,rushing_yards,targets,receptions,receiving_yards\n2024,REG,ATL,00-OLD,Old Player,QB,1,0,0,0,0,0\n",
      );
      const audit = await buildNflverseFourTeamAudit({
        season: 2026,
        priorSeason: 2025,
        generatedAt: GENERATED_AT,
        sourceCutoff: SOURCE_CUTOFF,
        rosterSourcePath: fixturePath("roster_2026.csv"),
        priorRosterSourcePath: fixturePath("roster_2025.csv"),
        playerStatsSourcePath: emptyStats,
        snapCountsSourcePath: fixturePath("snap_counts_2025.csv"),
        teamsJson,
      });
      const atl = audit.dataset.teams.find((team) => team.abbr === "atl")!;

      expect(atl.returningProduction.metrics.qbPassAttempts).toMatchObject({
        value: null,
        numerator: null,
        denominator: null,
        coverageComplete: false,
      });
      expect(atl.returningProduction.metrics.qbPassAttempts.warnings[0]).toContain("unavailable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generates a deterministic audit-only artifact for exactly ATL, CHI, NYJ, and SEA", async () => {
    const first = await buildFixtureAudit();
    const second = await buildFixtureAudit();

    expect(second.json).toBe(first.json);
    expect(first.validation.valid).toBe(true);
    expect(first.dataset.auditOnly).toBe(true);
    expect(second.identityReviewJson).toBe(first.identityReviewJson);
    expect(first.dataset.teams.map((team) => team.abbr)).toEqual(["atl", "chi", "nyj", "sea"]);
    expect(first.dataset.completenessEvaluation.readyForScoring).toBe(false);
    expect(JSON.stringify(first.dataset)).not.toMatch(/"(score|rating|edge|pick|projection)"/i);
  });

  it("refuses production personnel artifact output", () => {
    expect(() => assertNonProductionOutput("public/data/nfl/2026/personnel-evidence.json", 2026)).toThrow(
      /refusing to write production/,
    );
    expect(() => assertNonProductionOutput("public/data/nfl/2026/identity-review.json", 2026)).toThrow(
      /refusing to write production/,
    );
  });
});

describe("nflverse audit CLI behavior", () => {
  it("supports validate-only and dry-run without writing output", () => {
    const validateOnly = execFileSync("node", [
      "scripts/generate-nfl-personnel-nflverse-audit.mjs",
      "--season=2026",
      "--prior-season=2025",
      `--generated-at=${GENERATED_AT}`,
      `--source-cutoff=${SOURCE_CUTOFF}`,
      `--fixture-dir=${FIXTURE_DIR}`,
      "--validate-only",
    ], { cwd: ROOT, encoding: "utf8" });
    expect(validateOnly).toContain('"validateOnly": true');
    expect(validateOnly).toContain('"wrote": false');
    expect(validateOnly).toContain('"safeForAll32IdentityExpansion": false');

    const dir = mkdtempSync(join(tmpdir(), "nflverse-dry-"));
    const output = join(dir, "audit.json");
    const reviewOutput = join(dir, "identity-review.json");
    try {
      const dryRun = execFileSync("node", [
        "scripts/generate-nfl-personnel-nflverse-audit.mjs",
        "--season=2026",
        "--prior-season=2025",
        `--generated-at=${GENERATED_AT}`,
        `--source-cutoff=${SOURCE_CUTOFF}`,
        `--fixture-dir=${FIXTURE_DIR}`,
        `--output=${output}`,
        `--identity-review-output=${reviewOutput}`,
        "--dry-run",
      ], { cwd: ROOT, encoding: "utf8" });
      expect(dryRun).toContain('"dryRun": true');
      expect(existsSync(output)).toBe(false);
      expect(existsSync(reviewOutput)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails on critical conflicts unless explicitly kept audit-only", () => {
    expect(() =>
      execFileSync("node", [
        "scripts/generate-nfl-personnel-nflverse-audit.mjs",
        "--season=2026",
        "--prior-season=2025",
        `--generated-at=${GENERATED_AT}`,
        `--source-cutoff=${SOURCE_CUTOFF}`,
        `--fixture-dir=${FIXTURE_DIR}`,
        "--validate-only",
        "--fail-on-critical-conflict",
      ], { cwd: ROOT, encoding: "utf8" }),
    ).toThrow(/critical identity conflicts remain/);

    const auditOverride = execFileSync("node", [
      "scripts/generate-nfl-personnel-nflverse-audit.mjs",
      "--season=2026",
      "--prior-season=2025",
      `--generated-at=${GENERATED_AT}`,
      `--source-cutoff=${SOURCE_CUTOFF}`,
      `--fixture-dir=${FIXTURE_DIR}`,
      "--validate-only",
      "--fail-on-critical-conflict",
      "--audit-override",
    ], { cwd: ROOT, encoding: "utf8" });

    expect(auditOverride).toContain('"auditOverride": true');
    expect(auditOverride).toContain('"criticalIdentityConflicts": 1');
  });

  it("validates reviewed override files through the audit CLI", () => {
    const overridePath = join(ROOT, "data/nfl/personnel/reviewed-identity-overrides.json");
    const output = execFileSync("node", [
      "scripts/generate-nfl-personnel-nflverse-audit.mjs",
      "--season=2026",
      "--prior-season=2025",
      `--generated-at=${GENERATED_AT}`,
      `--source-cutoff=${SOURCE_CUTOFF}`,
      `--fixture-dir=${FIXTURE_DIR}`,
      `--reviewed-overrides=${overridePath}`,
      "--validate-overrides-only",
    ], { cwd: ROOT, encoding: "utf8" });

    expect(output).toContain('"validateOverridesOnly": true');
    expect(output).toContain('"pending": 2');
    expect(output).toContain('"approved": 0');
  });

  it("preserves the existing manual offseason evidence contract", async () => {
    const before = buildNflOffseasonEvidenceDataset();
    await buildFixtureAudit();
    const after = buildNflOffseasonEvidenceDataset();

    expect(after.records.length).toBe(before.records.length);
    expect(after.records.find((record) => record.abbr === "atl")?.personnel.length).toBe(
      before.records.find((record) => record.abbr === "atl")?.personnel.length,
    );
  });
});
