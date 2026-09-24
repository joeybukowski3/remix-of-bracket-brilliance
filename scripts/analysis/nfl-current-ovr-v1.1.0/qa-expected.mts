/**
 * ANALYSIS-ONLY. Writes the expected canonical Current OVR values (from the committed artifacts, through the
 * production board builder) that browser QA compares every NFL surface against.
 *
 * Run: npx tsx scripts/analysis/nfl-current-ovr-v1.1.0/qa-expected.mts --out=<path>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCurrentRatingBoard } from "../../../src/lib/nfl/currentRating2026.ts";
import { validateNflV03ReviewArtifact } from "../../../src/lib/nfl/v03Review.ts";
import { validateNflV04ProjectionArtifact } from "../../../src/lib/nfl/v04Projection.ts";
import { buildPublicProjectionBoard } from "../../../src/lib/nfl/publicProjection2026.ts";
import { validateTeamPerformanceAnalyticsArtifact } from "../../../src/lib/nfl/teamPerformanceAnalytics.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const data = (rel: string) => JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", rel), "utf-8"));
const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!out) throw new Error("--out is required");

const analytics = validateTeamPerformanceAnalyticsArtifact(data("2026/team-performance-analytics.json"));
const board = buildCurrentRatingBoard({
  season: 2026,
  v04Board: buildPublicProjectionBoard(validateNflV04ProjectionArtifact(data("2026/projected-power-ratings-v04.json"), "v04")),
  preseasonV03: validateNflV03ReviewArtifact("preseason", 2026, data("2026/preseason-power-ratings.json"), "preseason"),
  performanceAnalytics: analytics,
});
const teamsJson = data("teams.json").teams as { abbr: string; name: string; slug: string; shortName?: string }[];
const teams = Object.fromEntries(board.teams.map((t) => {
  const identity = teamsJson.find((x) => x.abbr === t.abbr)!;
  const perf = analytics.teams.find((x) => x.team === t.abbr)!;
  return [t.abbr, { abbr: t.abbr, name: identity.name, slug: identity.slug, ovr: t.rating, ovrRank: t.rank, off: t.offenseRating, offRank: t.offenseRank, def: t.defenseRating, defRank: t.defenseRank, performanceRating: perf.performance.performanceRating, performanceRank: perf.performance.performanceRank, gamesPlayed: t.gamesPlayed }];
}));
const projections = data("matchup-projections.json").projections as Record<string, any>;
const market = data("matchup-market.json").currentMarket as Record<string, any>;
const games = Object.fromEntries(Object.values(projections).map((g: any) => [g.gameId, { gameId: g.gameId, week: g.week, home: g.homeTeam, away: g.awayTeam, neutral: g.neutralSite, homeOvr: g.homeCurrentOVR, awayOvr: g.awayCurrentOVR, jkbSpread: g.formattedJkbSpread, projectedHomeMargin: g.projectedHomeMargin, marketHomeSpread: market[g.gameId]?.spread?.home ?? null, marketTotal: market[g.gameId]?.total ?? null }]));
writeFileSync(out, `${JSON.stringify({ modelVersion: analytics._meta.currentOvrModelVersion, teams, games }, null, 2)}\n`, "utf-8");
console.log(`wrote ${out}: ${Object.keys(teams).length} teams, ${Object.keys(games).length} games`);
