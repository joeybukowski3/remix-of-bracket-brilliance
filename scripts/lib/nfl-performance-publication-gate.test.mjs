import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { teamGameCoverageFingerprint, finalResultFingerprint } from "./nfl-current-season-coverage.mjs";
import { verifyPerformancePublicationInput } from "./nfl-performance-publication-gate.mjs";

const now = "2026-10-22T20:00:00.000Z";
const keys = [{ gameId: "2026_01_A_B", team: "a" }, { gameId: "2026_01_A_B", team: "b" }];
const results = { results: [{ gameId: "2026_01_A_B", seasonType: "REG", final: true, awayAbbr: "a", homeAbbr: "b", homeScore: 21, awayScore: 17 }] };
const performance = () => ({ _meta: { season: 2026, generatedAt: "2026-10-22T19:00:00.000Z", includedGameCount: 1,
  coverage: { teamGames: keys.map((row) => `${row.gameId}|${row.team}`), sha256: teamGameCoverageFingerprint(keys), resultsSha256: finalResultFingerprint(results.results),
    cacheSha256: null, sourceRetrievedAt: "2026-10-22T18:00:00.000Z", gameDataCutoffAt: "2026-10-22T17:00:00.000Z" } },
  teams: ["a", "b"].map((team) => ({ team, gamesPlayed: 1, windows: { fullSeason: { sampleSize: 1 } } })) });

test("complete coverage and matching cache/manifest fingerprints pass", () => {
  const dir = mkdtempSync(join(tmpdir(), "jkb-performance-gate-"));
  try {
    const cachePath = join(dir, "performance_team_game_2026.csv");
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(cachePath, "fixture");
    const sha = createHash("sha256").update(readFileSync(cachePath)).digest("hex");
    writeFileSync(manifestPath, JSON.stringify({ files: [{ season: 2026, filename: "performance_team_game_2026.csv", sha256: sha, rowCount: 2, retrievedDateUtc: "2026-10-22", sourceRetrievedAt: "2026-10-22T18:00:00.000Z" }] }));
    const artifact = performance();
    artifact._meta.coverage.cacheSha256 = sha;
    const input = { performance: artifact, results, cachePath, manifestPath, generatedAt: now };
    assert.equal(verifyPerformancePublicationInput(input).teamGames, 2);
    artifact._meta.coverage.sha256 = "wrong";
    assert.throws(() => verifyPerformancePublicationInput(input), /fingerprint mismatch/);
    artifact._meta.coverage.sha256 = teamGameCoverageFingerprint(keys);
    artifact._meta.coverage.cacheSha256 = "wrong";
    assert.throws(() => verifyPerformancePublicationInput(input), /cache\/manifest fingerprint mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("stale artifact is rejected before any file I/O", () => {
  const artifact = performance();
  delete artifact._meta.coverage;
  assert.throws(() => verifyPerformancePublicationInput({ performance: artifact, results, cachePath: "missing", manifestPath: "missing", generatedAt: now }), /lacks exact team-game coverage/);
});

test("a corrected final score invalidates a performance artifact with unchanged game IDs", () => {
  const artifact = performance();
  const corrected = { results: [{ ...results.results[0], homeScore: 27, awayScore: 20 }] };
  assert.throws(() => verifyPerformancePublicationInput({ performance: artifact, results: corrected, cachePath: "missing", manifestPath: "missing", generatedAt: now }), /final-result fingerprint mismatch/);
});

test("missing team-game, duplicate, and same-count wrong game all fail", () => {
  for (const replacement of [keys.slice(1).map((row) => `${row.gameId}|${row.team}`),
    [...keys, keys[0]].map((row) => typeof row === "string" ? row : `${row.gameId}|${row.team}`),
    keys.map((row) => `2026_01_X_Y|${row.team}`)]) {
    const artifact = performance();
    artifact._meta.coverage.teamGames = replacement;
    assert.throws(() => verifyPerformancePublicationInput({ performance: artifact, results, cachePath: "missing", manifestPath: "missing", generatedAt: now }), /team-games|duplicate/);
  }
});

test("zero-game preseason passes without cache or manifest", () => {
  const artifact = { _meta: { season: 2026, generatedAt: now, includedGameCount: 0,
    coverage: { teamGames: [], sha256: teamGameCoverageFingerprint([]), resultsSha256: finalResultFingerprint([]), cacheSha256: null, sourceRetrievedAt: null, gameDataCutoffAt: null } },
    teams: [{ team: "a", gamesPlayed: 0, windows: { fullSeason: { sampleSize: 0 } } }] };
  assert.equal(verifyPerformancePublicationInput({ performance: artifact, results: { results: [] }, cachePath: "missing", manifestPath: "missing", generatedAt: now }).games, 0);
});
