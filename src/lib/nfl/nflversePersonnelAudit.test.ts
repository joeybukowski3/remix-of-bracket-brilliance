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
  validateNflverseManifest,
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
      audit.dataset.identityCrosswalk.some((entry) =>
        entry.providerIds.gsisId?.includes("00-ATL-WR1") && entry.warnings.includes("position changed across sources"),
      ),
    ).toBe(true);
    expect(
      audit.dataset.identityCrosswalk.some((entry) =>
        entry.providerIds.gsisId?.includes("00-NYJ-WR2") &&
        entry.normalizedNames.includes("dj oneil smith") &&
        entry.sourceNameVariants.includes("D.J. O'Neil-Smith Jr."),
      ),
    ).toBe(true);
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
    expect(first.dataset.teams.map((team) => team.abbr)).toEqual(["atl", "chi", "nyj", "sea"]);
    expect(first.dataset.completenessEvaluation.readyForScoring).toBe(false);
    expect(JSON.stringify(first.dataset)).not.toMatch(/"(score|rating|edge|pick|projection)"/i);
  });

  it("refuses production personnel artifact output", () => {
    expect(() => assertNonProductionOutput("public/data/nfl/2026/personnel-evidence.json", 2026)).toThrow(
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

    const dir = mkdtempSync(join(tmpdir(), "nflverse-dry-"));
    const output = join(dir, "audit.json");
    try {
      const dryRun = execFileSync("node", [
        "scripts/generate-nfl-personnel-nflverse-audit.mjs",
        "--season=2026",
        "--prior-season=2025",
        `--generated-at=${GENERATED_AT}`,
        `--source-cutoff=${SOURCE_CUTOFF}`,
        `--fixture-dir=${FIXTURE_DIR}`,
        `--output=${output}`,
        "--dry-run",
      ], { cwd: ROOT, encoding: "utf8" });
      expect(dryRun).toContain('"dryRun": true');
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
