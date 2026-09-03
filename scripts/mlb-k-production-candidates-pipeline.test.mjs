/**
 * mlb-k-production-candidates-pipeline.test.mjs
 * Run via: node --test scripts/mlb-k-production-candidates-pipeline.test.mjs
 *
 * End-to-end pipeline test for the Phase 7 K production source: runs the
 * REAL generate-mlb-k-production-candidates.ts CLI (via tsx) against a
 * deterministic fixture raw payload, loads its output through the REAL
 * mlb-k-production-candidates.mjs loader, and feeds that through the REAL
 * composeSocialPostPlan -- proving the full two-step production pipeline
 * (tsx generator -> .mjs loader -> canonical composition) never produces a
 * candidate absent from buildKPropBestBets's own output, includes both
 * Overs and Unders, and still applies canonical's 2-5 row policy on top.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProductionKCandidatePool } from "./lib/mlb-k-production-candidates.mjs";
import { composeSocialPostPlan, SOCIAL_PRODUCT } from "./lib/mlb-social-composition.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function game(gameKey, gameStartTime) {
  return { gameKey, matchup: gameKey, awayTeam: gameKey.split("@")[0], homeTeam: gameKey.split("@")[1], stadium: "Park", roofType: "open", temperature: 75, precipitation: 0, windSpeed: 5, windDirection: "out", conditions: "clear", parkFactor: 1, gameStartTime };
}

function pitcher({ gameKey, gameId, pitcher, pitcherId, team, opponent, kLine, projectedKs, kOddsOver, kOddsUnder }) {
  return {
    gameKey, gameId, pitcher, pitcherId, team, opponent, hand: "R", ballpark: "Park", parkFactor: 1,
    xera: null, hardHitRate: null, flyBallRate: null, barrelRate: null,
    kRate: 28, bbRate: 6, whiffRate: 30, last7HR: 1, hrPerStart: 0.4, hrVs: 4, hitsVs: 35, kVs: 70,
    kLine, kOddsOver, kOddsUnder, kOddsBook: "draftkings",
    projectedIP: 6, projectedK9: 9, projectedKs,
    workloadRole: "starter", projectionSource: "v2", publicRecommendationEligible: true,
    workloadConfidenceGrade: "A", workloadFlags: [],
  };
}

// 3 clear Overs (projectedKs well above kLine) + 3 clear Unders (projectedKs
// well below kLine), each in its own distinct game -- 6 qualified candidates
// total, matching buildKPropBestBets(rows, 3)'s per-side cap exactly.
const FIXTURE_RAW = {
  // Phase 1 stale-data guard (generate-mlb-k-production-candidates.ts):
  // this must match the --slate-date passed below, or the generator now
  // fails closed with an empty candidatePool instead of deriving candidates.
  date: "2026-08-22",
  generatedAt: "2026-08-21T12:00:00.000Z",
  games: [
    game("AAA@BBB", "2026-08-22T00:00:00Z"), game("CCC@DDD", "2026-08-22T00:00:00Z"), game("EEE@FFF", "2026-08-22T00:00:00Z"),
    game("GGG@HHH", "2026-08-22T00:00:00Z"), game("III@JJJ", "2026-08-22T00:00:00Z"), game("KKK@LLL", "2026-08-22T00:00:00Z"),
  ],
  pitchers: [
    pitcher({ gameKey: "AAA@BBB", gameId: 1, pitcher: "Over One", pitcherId: 101, team: "AAA", opponent: "BBB", kLine: 5.5, projectedKs: 7.5, kOddsOver: "+100", kOddsUnder: "-120" }),
    pitcher({ gameKey: "CCC@DDD", gameId: 2, pitcher: "Over Two", pitcherId: 102, team: "CCC", opponent: "DDD", kLine: 5.5, projectedKs: 7.2, kOddsOver: "+105", kOddsUnder: "-125" }),
    pitcher({ gameKey: "EEE@FFF", gameId: 3, pitcher: "Over Three", pitcherId: 103, team: "EEE", opponent: "FFF", kLine: 5.5, projectedKs: 7.0, kOddsOver: "+110", kOddsUnder: "-130" }),
    pitcher({ gameKey: "GGG@HHH", gameId: 4, pitcher: "Under One", pitcherId: 104, team: "GGG", opponent: "HHH", kLine: 7.5, projectedKs: 5.0, kOddsOver: "-120", kOddsUnder: "+100" }),
    pitcher({ gameKey: "III@JJJ", gameId: 5, pitcher: "Under Two", pitcherId: 105, team: "III", opponent: "JJJ", kLine: 7.5, projectedKs: 5.2, kOddsOver: "-125", kOddsUnder: "+105" }),
    pitcher({ gameKey: "KKK@LLL", gameId: 6, pitcher: "Under Three", pitcherId: 106, team: "KKK", opponent: "LLL", kLine: 7.5, projectedKs: 5.4, kOddsOver: "-130", kOddsUnder: "+110" }),
  ],
  batters: [],
};

function withFixtureDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-k-pipeline-"));
  const rawPath = path.join(dir, "raw.json");
  const outputPath = path.join(dir, "candidates.json");
  writeFileSync(rawPath, JSON.stringify(FIXTURE_RAW), "utf8");
  try {
    return fn({ dir, rawPath, outputPath });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("K production pipeline (tsx generator -> .mjs loader -> composeSocialPostPlan)", () => {
  it("produces exactly the buildKPropBestBets candidate set (3 overs + 3 unders), never fabricating a candidate absent from it", () => {
    withFixtureDir(({ rawPath, outputPath }) => {
      const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
      execFileSync(process.execPath, [TSX_CLI, "scripts/generate-mlb-k-production-candidates.ts", `--raw=${rawPath}`, `--output=${outputPath}`, "--slate-date=2026-08-22"], { cwd: ROOT, encoding: "utf8" });

      const { candidatePool, pendingConfirmationCount } = loadProductionKCandidatePool({ path: outputPath });
      assert.equal(pendingConfirmationCount, 0);
      assert.equal(candidatePool.length, 6, "expected exactly 3 overs + 3 unders");

      const expectedPitchers = new Set(["Over One", "Over Two", "Over Three", "Under One", "Under Two", "Under Three"]);
      for (const candidate of candidatePool) {
        assert.ok(expectedPitchers.has(candidate.pitcher), `unexpected candidate "${candidate.pitcher}" not present in the fixture's qualifying set`);
      }
      assert.equal(new Set(candidatePool.map((c) => c.pitcher)).size, 6, "no duplicate/fabricated pitcher entries");

      const overs = candidatePool.filter((c) => c.direction === "OVER");
      const unders = candidatePool.filter((c) => c.direction === "UNDER");
      assert.equal(overs.length, 3, "expected 3 Over candidates");
      assert.equal(unders.length, 3, "expected 3 Under candidates");
    });
  });

  it("canonical composition caps the 6-candidate pool at 5 (DISPLAY_MAX_ROWS) without inventing new candidates", () => {
    withFixtureDir(({ rawPath, outputPath }) => {
      const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
      execFileSync(process.execPath, [TSX_CLI, "scripts/generate-mlb-k-production-candidates.ts", `--raw=${rawPath}`, `--output=${outputPath}`, "--slate-date=2026-08-22"], { cwd: ROOT, encoding: "utf8" });
      const { candidatePool } = loadProductionKCandidatePool({ path: outputPath });
      assert.equal(candidatePool.length, 6);

      const plan = composeSocialPostPlan({
        product: SOCIAL_PRODUCT.K, slateDate: "2026-08-22", candidatePool,
        title: "MLB STRIKEOUT PROPS", generatedAt: new Date().toISOString(), sourceSummary: ["test"],
      });

      assert.ok(plan, "expected a composed plan (6 candidates is well above DISPLAY_MIN_ROWS)");
      assert.ok(plan.rows.length >= 2 && plan.rows.length <= 5, `composed plan must respect the 2-5 row policy, got ${plan.rows.length}`);
      assert.equal(plan.rows.length, 5, "6 qualified candidates must be capped at DISPLAY_MAX_ROWS (5)");

      const candidatePitchers = new Set(candidatePool.map((c) => c.pitcher));
      for (const row of plan.rows) {
        assert.ok(candidatePitchers.has(row.playerName), `composed row "${row.playerName}" was not present in the candidate pool -- composition must never fabricate a candidate`);
      }
    });
  });

  it("Phase 1 stale-data guard: raw.date for a different day than --slate-date -> empty candidatePool, staleData surfaced, no fabricated candidates", () => {
    withFixtureDir(({ rawPath, outputPath }) => {
      const staleRaw = { ...FIXTURE_RAW, date: "2026-08-21" }; // one day off from --slate-date below
      writeFileSync(rawPath, JSON.stringify(staleRaw), "utf8");

      const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
      execFileSync(process.execPath, [TSX_CLI, "scripts/generate-mlb-k-production-candidates.ts", `--raw=${rawPath}`, `--output=${outputPath}`, "--slate-date=2026-08-22"], { cwd: ROOT, encoding: "utf8" });

      const result = loadProductionKCandidatePool({ path: outputPath });
      assert.equal(result.staleData, true);
      assert.equal(result.dataDate, "2026-08-21");
      assert.equal(result.requestedSlateDate, "2026-08-22");
      assert.deepEqual(result.candidatePool, []);
    });
  });
});
