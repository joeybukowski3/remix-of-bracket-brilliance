// CFB Model V2 — production team-rating shadow generator (WU2 §27).
// Loads existing production CFBD raw caches, builds CfbV2TeamRating[],
// validates fail-closed, writes a shadow artifact under data/generated/cfb/v2/.
// Does NOT wire the artifact into any UI/loader, generate game projections,
// or touch any V1/V1.1 file.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCfbV2TeamRatings } from "../src/lib/cfb/production/v2/buildTeamRatings";
import { buildCfbV2TeamRatingArtifact, writeCfbV2TeamRatingArtifact } from "../src/lib/cfb/production/v2/artifactWriter";
import { validateCfbV2TeamRatings } from "../src/lib/cfb/production/v2/ratingValidation";
import type { CfbdGame, CfbdGameTeamStats, CfbdReturningProduction, CfbdTalent, CfbdTeam } from "../src/lib/cfb/production/v2/ratingInputs";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_DIR = resolve(ROOT, "data", "cfb", "cfbd", "raw");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(RAW_DIR, `${name}.json`), "utf8")) as T;
}

function readOptionalJson<T>(name: string, fallback: T): T {
  try {
    return readJson<T>(name);
  } catch {
    return fallback;
  }
}

function parseArgs(argv: readonly string[]): { season: number; asOfWeek: number } {
  const seasonArg = argv.find((a) => a.startsWith("--season="))?.split("=")[1];
  const asOfArg = argv.find((a) => a.startsWith("--as-of="))?.split("=")[1];
  return {
    season: seasonArg ? Number(seasonArg) : 2026,
    // Safe, clearly-documented default for normal production use: preseason
    // (0 completed games folded in). A historical replay MUST pass --as-of
    // explicitly — this default never derives from today's calendar date.
    asOfWeek: asOfArg ? Number(asOfArg) : 0,
  };
}

function main(): void {
  const { season, asOfWeek } = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(season) || season < 2000) throw new Error(`invalid --season=${season}`);
  if (!Number.isInteger(asOfWeek) || asOfWeek < 0) throw new Error(`invalid --as-of=${asOfWeek}`);

  const teams = readJson<CfbdTeam[]>(`teams-${season}`);
  const currentSeasonGames = readJson<CfbdGame[]>(`games-${season}`);
  const currentSeasonTeamGameStats = readOptionalJson<CfbdGameTeamStats[]>(`game-team-stats-${season}`, []);
  const priorSeasonGames = readJson<CfbdGame[]>(`games-${season - 1}`);
  const priorSeasonTeamGameStats = readJson<CfbdGameTeamStats[]>(`game-team-stats-${season - 1}`);
  const returningProduction = readOptionalJson<CfbdReturningProduction[]>(`returning-production-${season}`, []);
  const talent = readOptionalJson<CfbdTalent[]>(`talent-${season}`, []);

  const completedCurrentSeasonGames = currentSeasonGames.filter((g) => g.completed);
  const dataAsOf =
    completedCurrentSeasonGames.length > 0
      ? completedCurrentSeasonGames.map((g) => g.startDate).sort().at(-1)!
      : priorSeasonGames.filter((g) => g.completed).map((g) => g.startDate).sort().at(-1)!;
  const generatedAt = new Date().toISOString();

  console.log(`[cfb:v2:build-ratings] season=${season} asOfWeek=${asOfWeek} dataAsOf=${dataAsOf}`);
  console.log(`[cfb:v2:build-ratings] inputs: teams=${teams.length} currentGames=${currentSeasonGames.length} (completed=${completedCurrentSeasonGames.length}) priorGames=${priorSeasonGames.length} returningProduction=${returningProduction.length} talent=${talent.length}`);

  const ratings = buildCfbV2TeamRatings({
    season,
    dataAsOf,
    generatedAt,
    asOfWeek,
    teams,
    currentSeasonGames,
    currentSeasonTeamGameStats,
    priorSeasonGames,
    priorSeasonTeamGameStats,
    returningProduction,
    talent,
  });

  const expectedFbsTeamIds = new Set(ratings.map((r) => r.teamId));
  validateCfbV2TeamRatings(ratings, expectedFbsTeamIds);
  console.log(`[cfb:v2:build-ratings] validated ${ratings.length} team ratings`);

  const artifact = buildCfbV2TeamRatingArtifact({ season, asOfWeek, generatedAt, dataAsOf, records: ratings });
  const relativePath = writeCfbV2TeamRatingArtifact(ROOT, artifact);
  console.log(`[cfb:v2:build-ratings] wrote shadow artifact to ${relativePath}`);

  const priorTierCounts = new Map<string, number>();
  const componentSizeBuckets = new Map<string, number>();
  const multiplierBuckets = new Map<string, number>();
  for (const r of ratings) {
    priorTierCounts.set(r.priorTier, (priorTierCounts.get(r.priorTier) ?? 0) + 1);
    const csBucket = r.connectivity.componentSize === 1 ? "1 (isolated)" : r.connectivity.componentSize <= 10 ? "2-10" : r.connectivity.componentSize <= 50 ? "11-50" : "51+";
    componentSizeBuckets.set(csBucket, (componentSizeBuckets.get(csBucket) ?? 0) + 1);
    const mult = r.connectivity.regularizationMultiplier;
    const multBucket = mult >= 2.9 ? "~3.0 (max)" : mult >= 2 ? "2.0-2.9" : mult > 1 ? "1.0-2.0" : "1.0 (min)";
    multiplierBuckets.set(multBucket, (multiplierBuckets.get(multBucket) ?? 0) + 1);
  }
  console.log(`[cfb:v2:build-ratings] priorTier distribution: ${JSON.stringify(Object.fromEntries(priorTierCounts))}`);
  console.log(`[cfb:v2:build-ratings] componentSize distribution: ${JSON.stringify(Object.fromEntries(componentSizeBuckets))}`);
  console.log(`[cfb:v2:build-ratings] regularizationMultiplier distribution: ${JSON.stringify(Object.fromEntries(multiplierBuckets))}`);
  console.log(`[cfb:v2:build-ratings] available ratings (computed): ${ratings.filter((r) => r.ratingStatus === "computed").length}/${ratings.length}`);
  console.log(`[cfb:v2:build-ratings] unavailable ratings (insufficient-data): ${ratings.filter((r) => r.ratingStatus === "insufficient-data").length}/${ratings.length}`);
}

main();
