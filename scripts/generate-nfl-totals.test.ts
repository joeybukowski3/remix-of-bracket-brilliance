/**
 * Guards the Week 1 current-season cache relief added to
 * generate-nfl-totals.ts: nflverse hasn't published a target season's PBP
 * yet when Week 1 needs to run, so the target-season scoring-support cache
 * is legitimately empty at that point. The frozen model's Week 1 feature
 * builder (buildNflTotalFeatures -> computeEwmaWindow) is strictly-prior-
 * only, so it never reads the target season's own rows for a week-1 cutoff
 * -- these tests prove the production guard now matches that reality
 * without weakening it for week 2+, and that no current/future-week data
 * can reach a week-1 prediction even if it existed in the cache.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeCacheSeasons, computeRequiredScoringSupportSeasons } from "./generate-nfl-totals";
import { buildNflTotalFeatures, buildScoringSupportIndex } from "../src/lib/nfl/props/totals/totalsFeatures";
import { NFL_TOTAL_TRAINING_SEASONS } from "../src/lib/nfl/props/totals/totalsModelContract";
import type { NflTotalResearchScoringSupportRow } from "../src/lib/nfl/research/total/types";

const CWD = join(__dirname, "..");
const TRAINING_SEASONS = [...NFL_TOTAL_TRAINING_SEASONS]; // [2022, 2023, 2024]

function runCli(args: string[]): string {
  return execFileSync("npx", ["tsx", "scripts/generate-nfl-totals.ts", ...args], { cwd: CWD, stdio: "pipe", shell: true }).toString();
}

describe("computeRequiredScoringSupportSeasons (production guard)", () => {
  it("week 1: does not require the target season's own cache", () => {
    expect(computeRequiredScoringSupportSeasons(TRAINING_SEASONS, 2026, 1)).toEqual([2022, 2023, 2024]);
    expect(computeRequiredScoringSupportSeasons(TRAINING_SEASONS, 2026, 1)).not.toContain(2026);
  });

  it("week 2+: still requires the target season's own cache (guard unchanged for weeks where prior completed games should exist)", () => {
    expect(computeRequiredScoringSupportSeasons(TRAINING_SEASONS, 2026, 2)).toEqual([2022, 2023, 2024, 2026]);
    expect(computeRequiredScoringSupportSeasons(TRAINING_SEASONS, 2025, 12)).toEqual([2022, 2023, 2024, 2025]);
  });

  it("never widens or narrows the fixed training window itself", () => {
    expect(computeRequiredScoringSupportSeasons(TRAINING_SEASONS, 2026, 1)).toEqual(TRAINING_SEASONS);
    expect(computeRequiredScoringSupportSeasons(TRAINING_SEASONS, 2026, 2).slice(0, 3)).toEqual(TRAINING_SEASONS);
  });
});

describe("computeCacheSeasons (what gets loaded into the EWMA index)", () => {
  it("always includes the season immediately prior to the target season, even outside the training window", () => {
    // Target 2026 with training window 2022-2024: without 2025 explicitly
    // added, week 1's most recent, most relevant history would be silently
    // skipped in favor of stale 2022-2024 rows.
    expect(computeCacheSeasons(TRAINING_SEASONS, 2026)).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
  });

  it("dedupes when the prior season already falls inside the training window", () => {
    expect(computeCacheSeasons(TRAINING_SEASONS, 2025)).toEqual([2021, 2022, 2023, 2024, 2025]);
  });
});

function row(partial: Partial<NflTotalResearchScoringSupportRow> & Pick<NflTotalResearchScoringSupportRow, "gameId" | "season" | "week" | "team" | "opponent">): NflTotalResearchScoringSupportRow {
  return { eligiblePlays: 60, offEpaSum: 6, successNum: 24, successDen: 60, explosiveCount: 6, ...partial };
}

describe("week-1 feature builder is leakage-safe regardless of what the cache contains", () => {
  it("a target-season row at the same or a later week never enters a week-1 feature, even if present in the loaded index", () => {
    const priorSeasonOnly = buildScoringSupportIndex([
      row({ gameId: "2025_17_KC_DEN", season: 2025, week: 17, team: "kc", opponent: "den", offEpaSum: 5 }),
    ]);
    const withLeakedCurrentSeasonRow = buildScoringSupportIndex([
      row({ gameId: "2025_17_KC_DEN", season: 2025, week: 17, team: "kc", opponent: "den", offEpaSum: 5 }),
      // Simulates a would-be leak: a 2026 week-1 row for the same team,
      // present in the index as if the cache had already been populated.
      row({ gameId: "2026_01_KC_LAC", season: 2026, week: 1, team: "kc", opponent: "lac", offEpaSum: 9999 }),
    ]);
    const clean = buildNflTotalFeatures(priorSeasonOnly, "kc", "lac", { season: 2026, week: 1 }, "home");
    const withLeak = buildNflTotalFeatures(withLeakedCurrentSeasonRow, "kc", "lac", { season: 2026, week: 1 }, "home");
    expect(withLeak).toEqual(clean);
    expect(withLeak.offenseGamesUsed).toBe(1);
    expect(withLeak.offenseEpaPerPlay).toBeCloseTo(5 / 60, 6);
  });
});

describe("generate-nfl-totals CLI: Week 1 2026 (empty target-season cache)", () => {
  it("--dry-run succeeds without the 2026 scoring-support cache and prices the full slate from 2025 history", () => {
    const dir = mkdtempSync(join(tmpdir(), "nfl-totals-2026-w1-"));
    const output = join(dir, "totals-2026-w1.json");
    try {
      const stdout = runCli(["--season=2026", "--week=1", "--dry-run", `--output=${output}`, "--generated-at=2026-09-04T00:00:00.000Z"]);
      expect(stdout).toContain("--dry-run: not archiving.");
      expect(stdout).not.toMatch(/Scoring-support cache has no rows for required season 2026/);

      expect(existsSync(output)).toBe(true);
      const artifact = JSON.parse(readFileSync(output, "utf8")) as { season: number; week: number; games: { gameId: string; status: string; homeExpectedPoints: number; awayExpectedPoints: number; projectedGameTotal: number }[] };
      expect(artifact.season).toBe(2026);
      expect(artifact.week).toBe(1);
      expect(artifact.games.length).toBe(16); // full Week 1 REG slate
      for (const g of artifact.games) {
        expect(g.status).toBe("projected");
        expect(Number.isFinite(g.homeExpectedPoints)).toBe(true);
        expect(Number.isFinite(g.awayExpectedPoints)).toBe(true);
        expect(g.projectedGameTotal).toBeCloseTo(g.homeExpectedPoints + g.awayExpectedPoints, 6);
        // Sanity band on a per-team-expected-points basis -- catches gross
        // regressions (e.g. accidentally feeding zero-imputed features)
        // without pinning to exact model output.
        expect(g.homeExpectedPoints).toBeGreaterThan(0);
        expect(g.homeExpectedPoints).toBeLessThan(60);
        expect(g.awayExpectedPoints).toBeGreaterThan(0);
        expect(g.awayExpectedPoints).toBeLessThan(60);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("--dry-run does not write to the production prediction archive", () => {
    const stdout = runCli(["--season=2026", "--week=1", "--dry-run", "--generated-at=2026-09-04T00:00:00.000Z"]);
    expect(stdout).toContain("--dry-run: not archiving.");
    expect(stdout).not.toContain("archive appended=");
  }, 60_000);
});

describe("generate-nfl-totals CLI: guard still fails closed for week 2+ without current-season cache", () => {
  it("--week=2 still throws when the target season's scoring-support cache has no rows", () => {
    expect(() => runCli(["--season=2026", "--week=2", "--dry-run", "--generated-at=2026-09-04T00:00:00.000Z"])).toThrow();
  }, 60_000);
});
