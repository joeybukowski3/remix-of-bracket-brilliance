import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  CURRENT_RATING_WEIGHTS_BY_GAMES,
  buildCurrentRatingBoard,
  clampRating,
  currentRatingWeightsFor,
  type CurrentRatingBoard,
} from "@/lib/nfl/currentRating2026";
import { validateNflV03ReviewArtifact } from "@/lib/nfl/v03Review";
import { validateNflV04ProjectionArtifact } from "@/lib/nfl/v04Projection";
import { buildPublicProjectionBoard } from "@/lib/nfl/publicProjection2026";
import { validateTeamPerformanceAnalyticsArtifact } from "@/lib/nfl/teamPerformanceAnalytics";
import { HOME_FIELD_ADVANTAGE_POINTS, JKB_POWER_NUMBER_MODEL_VERSION, OVR_TO_POINTS_COEFFICIENT, homeFieldAdvantageFor } from "@/lib/nfl/jkbPowerNumber2026";
import { NFL_CURRENT_OVR_MODEL_VERSION } from "@/lib/nfl/currentOvrModelVersion";
import { createHeroModelRatingResolver } from "@/lib/nfl/heroModelRatings";
import { buildDfsTeamRankContext } from "@/lib/nfl/dfs/teamRankContext";
import { buildWeeklyDashboard } from "@/lib/nfl/weeklyDashboard";

/**
 * Architecture guard for the canonical 2026 Current OVR (nfl-current-ovr-v1.1.0):
 *   one production path   generator -> team-performance-analytics.json -> buildCurrentRatingBoard -> every consumer
 *   one spread transform  0.24 x dOVR + HFA, in jkbPowerNumber2026.ts only
 *   no hidden old model   nothing in production code can reach the retired composite or spread model
 * These tests read the COMMITTED artifacts, so they also fail when the artifacts are stale or drift apart.
 */

const ROOT = resolve(__dirname, "../../..");
const readJson = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), "utf-8"));

const analytics = validateTeamPerformanceAnalyticsArtifact(readJson("public/data/nfl/2026/team-performance-analytics.json"));
const preseasonV03 = validateNflV03ReviewArtifact("preseason", 2026, readJson("public/data/nfl/2026/preseason-power-ratings.json"), "preseason");
const v04Board = buildPublicProjectionBoard(validateNflV04ProjectionArtifact(readJson("public/data/nfl/2026/projected-power-ratings-v04.json"), "v04"));
const board: CurrentRatingBoard = buildCurrentRatingBoard({ season: 2026, v04Board, preseasonV03, performanceAnalytics: analytics });
type ProjectionGame = { gameId: string; homeTeam: string; awayTeam: string; homeCurrentOVR: number; awayCurrentOVR: number; projectedHomeMargin: number; neutralSite: boolean; homeFieldAdvantage: number };
const projections = readJson("public/data/nfl/matchup-projections.json") as {
  modelVersion: string;
  model: { currentOvrModelVersion: string; leagueAverageOVR: number; ovrToPointsCoefficient: number; homeFieldAdvantage: number };
  projections: Record<string, ProjectionGame>;
  provenance: { generatedAt: string };
};
const ratingByAbbr = new Map(board.teams.map((t) => [t.abbr, t]));

describe("canonical board from the committed artifacts", () => {
  it("builds with the current model identity and 32 teams", () => {
    expect(analytics._meta.currentOvrModelVersion).toBe(NFL_CURRENT_OVR_MODEL_VERSION);
    expect(board.teams).toHaveLength(32);
    expect(board.state).toBe("live");
  });

  it("ranks are exactly the descending order of the ratings (OVR, OFF and DEF)", () => {
    for (const [rating, rank] of [["rating", "rank"], ["offenseRating", "offenseRank"], ["defenseRating", "defenseRank"]] as const) {
      expect(new Set(board.teams.map((t) => t[rank])).size).toBe(32);
      const byRank = [...board.teams].sort((a, b) => a[rank] - b[rank]);
      for (let i = 1; i < byRank.length; i += 1) expect(byRank[i - 1][rating]).toBeGreaterThanOrEqual(byRank[i][rating]);
    }
  });

  it("re-derives every Current OVR independently from the artifacts: clamp(pre*w + perf*(1-w)) with the documented table", () => {
    for (const row of board.teams) {
      const perf = analytics.teams.find((t) => t.team === row.abbr)!;
      const weights = currentRatingWeightsFor(perf.gamesPlayed);
      expect(row.gamesPlayed).toBe(perf.gamesPlayed);
      const expected = weights.performanceWeight > 0
        ? clampRating(weights.preseasonWeight * row.preseasonV04Rating + weights.performanceWeight * (perf.performance.performanceRating as number))
        : clampRating(row.preseasonV04Rating);
      expect(row.rating, row.abbr).toBeCloseTo(expected, 10);
    }
    expect(Object.values(CURRENT_RATING_WEIGHTS_BY_GAMES).map((w) => w.performanceWeight)).toEqual([0, 0.2, 0.4, 0.6, 0.75, 0.9, 1]);
  });
});

describe("projected spread uses the canonical Current OVR and the unchanged transform", () => {
  const games = Object.values(projections.projections);
  // Workflows commit the analytics artifact (Tue 7:55 ET) before the projections (daily 8:10 ET); between the two commits
  // the projections legitimately predate the analytics. Only then is the exact-agreement check deferred.
  const projectionsPredateAnalytics = Date.parse(projections.provenance.generatedAt) < Date.parse(analytics._meta.generatedAt);

  it("is stamped with the current spread model and Current OVR versions", () => {
    expect(projections.modelVersion).toBe(JKB_POWER_NUMBER_MODEL_VERSION);
    expect(projections.model.currentOvrModelVersion).toBe(analytics._meta.currentOvrModelVersion);
    expect(projections.model.ovrToPointsCoefficient).toBe(0.24);
    expect(projections.model.homeFieldAdvantage).toBe(2.0);
  });

  it.skipIf(projectionsPredateAnalytics)("every game embeds exactly the canonical board's Current OVR for both teams", () => {
    expect(games.length).toBe(272);
    for (const g of games) {
      expect(g.homeCurrentOVR, `${g.gameId} home`).toBeCloseTo(ratingByAbbr.get(g.homeTeam)!.rating, 9);
      expect(g.awayCurrentOVR, `${g.gameId} away`).toBeCloseTo(ratingByAbbr.get(g.awayTeam)!.rating, 9);
    }
    const mean = board.teams.reduce((s, t) => s + t.rating, 0) / board.teams.length;
    expect(projections.model.leagueAverageOVR).toBeCloseTo(mean, 9);
  });

  it.skipIf(projectionsPredateAnalytics)("projectedHomeMargin is exactly 0.24 x (home OVR - away OVR) + HFA (0 at neutral sites), computed from the canonical board", () => {
    for (const g of games) {
      const home = ratingByAbbr.get(g.homeTeam)!.rating;
      const away = ratingByAbbr.get(g.awayTeam)!.rating;
      const expected = OVR_TO_POINTS_COEFFICIENT * (home - away) + homeFieldAdvantageFor(g.neutralSite === true);
      expect(g.projectedHomeMargin, g.gameId).toBeCloseTo(expected, 9);
      expect(g.homeFieldAdvantage).toBe(g.neutralSite === true ? 0 : HOME_FIELD_ADVANTAGE_POINTS);
    }
    expect(games.some((g) => g.neutralSite === true)).toBe(true);
  });
});

describe("major consumers all show the same canonical rating and rank", () => {
  it("hero / matchup resolver returns the board's OVR, OFF, DEF and ranks for all 32 teams", () => {
    const resolve = createHeroModelRatingResolver(board);
    for (const row of board.teams) {
      expect(resolve(row.abbr)).toEqual({ rating: row.rating, rank: row.rank, offenseRating: row.offenseRating, offenseRank: row.offenseRank, defenseRating: row.defenseRating, defenseRank: row.defenseRank });
    }
  });

  it("DFS team-rank context uses the board's OFF/DEF ranks (no second ranking definition)", () => {
    const context = buildDfsTeamRankContext(board);
    for (const row of board.teams) expect(context.get(row.abbr)).toEqual({ offenseRank: row.offenseRank, defenseRank: row.defenseRank });
  });

  it.skipIf(Date.parse(projections.provenance.generatedAt) < Date.parse(analytics._meta.generatedAt))(
    "Weekly Game Board: displayed team OVR/rank and the displayed JKB spread agree with the board for every week",
    () => {
      const teams = readJson("public/data/nfl/teams.json").teams;
      const games = readJson("public/data/nfl/2026/games.json").games;
      let checked = 0;
      for (let week = 1; week <= 18; week += 1) {
        const dashboard = buildWeeklyDashboard({ season: 2026, week, games, teams, projectionsArtifact: projections as never, currentRatings: board.teams });
        for (const game of dashboard.games) {
          const home = ratingByAbbr.get(game.home.abbr)!;
          const away = ratingByAbbr.get(game.away.abbr)!;
          expect(game.home.rating?.ovr).toBe(home.rating);
          expect(game.home.rating?.ovrRank).toBe(home.rank);
          expect(game.away.rating?.ovr).toBe(away.rating);
          expect(game.away.rating?.ovrRank).toBe(away.rank);
          expect(game.projection?.projectedHomeMargin).toBeCloseTo(OVR_TO_POINTS_COEFFICIENT * (home.rating - away.rating) + homeFieldAdvantageFor(game.neutralSite), 9);
          checked += 1;
        }
      }
      expect(checked).toBe(272);
    }
  );
});

// ---------------------------------------------------------------------------
// No hidden second path
// ---------------------------------------------------------------------------
function productionFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(ROOT, path).replace(/\\/g, "/");
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || rel === "scripts/analysis" || rel === "scripts/research" || rel === "dist") continue;
      productionFiles(path, out);
    } else if (/\.(ts|tsx|mts|mjs|js)$/.test(name) && !/\.test\.|\.spec\.|__fixtures__|performanceLeagueFixtures/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}
const PRODUCTION = [...productionFiles(join(ROOT, "src")), ...productionFiles(join(ROOT, "scripts"))];
// Read every production file once: the scan runs in several tests and must stay fast under a loaded parallel run.
const CONTENT = new Map(PRODUCTION.map((rel) => [rel, readFileSync(join(ROOT, rel), "utf-8")]));
const filesMatching = (pattern: RegExp) => PRODUCTION.filter((rel) => pattern.test(CONTENT.get(rel)!));

describe("no hidden path to the old model in production code", { timeout: 60_000 }, () => {
  it("nothing in src/ or the production scripts imports the frozen legacy v1.0.0 composite", () => {
    expect(filesMatching(/legacy-performance-composite/)).toEqual([]);
  });

  it("nothing in production code imports the retired nfl-spread-v0.1.0 model or dataset", () => {
    const offenders = filesMatching(/from\s+["'][^"']*nfl-spread-(model|dataset)(\.mjs)?["']|import\(["'][^"']*nfl-spread-(model|dataset)/).filter(
      // the retired model's own library files may reference each other
      (rel) => !/^scripts\/lib\/nfl-spread-(model|dataset)\./.test(rel)
    );
    expect(offenders).toEqual([]);
  });

  it("the performance composite is built in exactly one place: the analytics generator", () => {
    const callers = filesMatching(/\bbuildPerformanceRatingBoard\s*\(/);
    expect(callers.sort()).toEqual(["scripts/generate-nfl-team-performance-analytics.mts", "src/lib/nfl/performanceComposite2026.ts"]);
  });

  it("the Current OVR board is built only by the canonical hook and the two generators that must reproduce it", () => {
    const callers = filesMatching(/\bbuildCurrentRatingBoard\s*\(/).filter((rel) => rel !== "src/lib/nfl/currentRating2026.ts");
    expect(callers.sort()).toEqual([
      "scripts/generate-nfl-dfs-lineup-context.ts",
      "scripts/generate-nfl-matchup-projections.mts",
      "src/hooks/useNflCurrentRating2026.ts",
    ]);
  });

  it("the 0.24 OVR->points conversion and the HFA are applied in exactly one module", () => {
    const offenders = filesMatching(/\*\s*0\.24\b|\b0\.24\s*\*/).filter((rel) => rel !== "src/lib/nfl/jkbPowerNumber2026.ts");
    // Comments/prose may mention the constant; code must not multiply by the literal.
    const codeOffenders = offenders.filter((rel) =>
      CONTENT.get(rel)!
        .split("\n")
        .some((line) => /(\*\s*0\.24\b|\b0\.24\s*\*)/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line) && !/(dropShadow|rgba|shadow|bg-|q4WinRate|rankPct)/.test(line))
    );
    expect(codeOffenders.filter((rel) => /nfl/i.test(rel))).toEqual([]);
  });

  it("the spread model version is defined once (projectionData re-exports it)", () => {
    const definers = filesMatching(/export const JKB_POWER_NUMBER_MODEL_VERSION\s*=/);
    expect(definers).toEqual(["src/lib/nfl/jkbPowerNumber2026.ts"]);
  });

  it("no production file hard-codes the superseded live model identities as current", () => {
    const stale = filesMatching(/["'`]nfl-current-ovr-v1\.0\.0["'`]/);
    expect(stale).toEqual([]);
  });
});
