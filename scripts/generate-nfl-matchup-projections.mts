/**
 * Generate public/data/nfl/matchup-projections.json — the canonical public
 * JKB Projected Spread (jkb-power-number-v1.0.0).
 *
 * REPLACES the nfl-spread-v0.1.0 shadow composite as the authoritative
 * public spread generator. That model's own code (scripts/lib/nfl-spread-
 * model.mjs, nfl-spread-dataset.mjs) is left untouched for historical/model
 * comparison and backtesting (see scripts/analysis/nfl-current-ovr-spread-
 * calibration/) — it just no longer feeds this artifact.
 *
 * Uses ONLY the canonical universal Current OVR board as its team-strength
 * input. Reads the exact three artifacts src/hooks/useNflCurrentRating2026.ts
 * composes client-side (preseason v0.3.1, preseason v0.4-beta, live Team
 * Performance Analytics) and calls the SAME framework-free functions
 * (buildCurrentRatingBoard, buildPowerNumberBoard) — this file contains zero
 * rating or Power Number math of its own, only artifact loading and
 * per-game projection assembly. If Current OVR or Power Number math ever
 * needs to change, it changes in exactly one place (src/lib/nfl/
 * currentRating2026.ts / jkbPowerNumber2026.ts), not here.
 *
 * NO MARKET DATA IS READ HERE. Nothing in this file opens matchup-market.json
 * or accepts a spread/line/odds value — market comparison is strictly a
 * consumer-layer concern (src/lib/nfl/projectionData.ts), after a projection
 * already exists.
 *
 * Run via tsx (imports TypeScript modules directly):
 *   npx tsx scripts/generate-nfl-matchup-projections.mts
 *   npx tsx scripts/generate-nfl-matchup-projections.mts --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { buildCurrentRatingBoard } from "../src/lib/nfl/currentRating2026.ts";
import { validateNflV03ReviewArtifact } from "../src/lib/nfl/v03Review.ts";
import { validateNflV04ProjectionArtifact } from "../src/lib/nfl/v04Projection.ts";
import { buildPublicProjectionBoard } from "../src/lib/nfl/publicProjection2026.ts";
import { validateTeamPerformanceAnalyticsArtifact } from "../src/lib/nfl/teamPerformanceAnalytics.ts";
import {
  HOME_FIELD_ADVANTAGE_POINTS,
  JKB_POWER_NUMBER_MODEL_VERSION,
  OVR_TO_POINTS_COEFFICIENT,
  buildPowerNumberBoard,
  homeFieldAdvantageFor,
  neutralMarginFor,
  toSportsbookSpread,
} from "../src/lib/nfl/jkbPowerNumber2026.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT_SEASON = 2026;
const DATA_DIR = join(ROOT, "public", "data", "nfl", String(CURRENT_SEASON));
const OUT_FILE = join(ROOT, "public", "data", "nfl", "matchup-projections.json");

export const PROJECTIONS_SCHEMA_VERSION = "nfl-matchup-projections-v2";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Real minus sign (U+2212) so this matches the market line's typography exactly, per existing convention. */
function formatTeamSpread(
  side: "home" | "away" | "pk",
  line: number,
  homeAbbr: string,
  awayAbbr: string
): string {
  if (side === "pk") return "PK";
  const favorite = side === "home" ? homeAbbr : awayAbbr;
  return `${favorite.toUpperCase()} −${Math.abs(line).toFixed(1)}`;
}

function parseArgs(argv: string[]) {
  return { dryRun: argv.includes("--dry-run") };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const gamesPath = join(DATA_DIR, "games.json");
  if (!existsSync(gamesPath)) throw new Error(`Missing schedule for ${CURRENT_SEASON}: ${gamesPath}`);
  const games = (readJson(gamesPath) as { games: any[] }).games ?? [];

  const preseasonPath = join(DATA_DIR, "preseason-power-ratings.json");
  const preseasonV03 = validateNflV03ReviewArtifact(
    "preseason",
    CURRENT_SEASON as 2026,
    readJson(preseasonPath),
    preseasonPath
  );

  const v04Path = join(DATA_DIR, "projected-power-ratings-v04.json");
  const v04Artifact = validateNflV04ProjectionArtifact(readJson(v04Path), v04Path);
  const v04Board = buildPublicProjectionBoard(v04Artifact);

  const performancePath = join(DATA_DIR, "team-performance-analytics.json");
  const performanceAnalytics = validateTeamPerformanceAnalyticsArtifact(readJson(performancePath));

  const currentRatingBoard = buildCurrentRatingBoard({
    season: CURRENT_SEASON,
    v04Board,
    preseasonV03,
    performanceAnalytics,
  });

  const powerBoard = buildPowerNumberBoard(currentRatingBoard);
  const powerByAbbr = new Map(powerBoard.teams.map((t) => [t.abbr, t]));

  const projections: Record<string, unknown> = {};
  let projected = 0;
  for (const g of games) {
    if (g.seasonType !== "REG") continue;
    const home = powerByAbbr.get(g.homeAbbr);
    const away = powerByAbbr.get(g.awayAbbr);
    if (!home || !away) continue;

    const neutralSite = g.neutralSite === true;
    const neutralProjectedMargin = neutralMarginFor(home.powerNumber, away.powerNumber);
    const homeFieldAdvantage = homeFieldAdvantageFor(neutralSite);
    const projectedHomeMargin = neutralProjectedMargin + homeFieldAdvantage;
    const spread = toSportsbookSpread(projectedHomeMargin);

    projections[g.gameId] = {
      gameId: g.gameId,
      week: g.week,
      kickoff: g.dateUtc,
      homeTeam: g.homeAbbr,
      awayTeam: g.awayAbbr,
      homeCurrentOVR: home.currentOVR,
      awayCurrentOVR: away.currentOVR,
      leagueAverageOVR: powerBoard.leagueAverageOVR,
      homePowerNumber: home.powerNumber,
      awayPowerNumber: away.powerNumber,
      neutralSite,
      homeFieldAdvantage,
      neutralProjectedMargin,
      projectedHomeMargin,
      formattedJkbSpread: formatTeamSpread(spread.side, spread.line, g.homeAbbr, g.awayAbbr),
    };
    projected += 1;
  }

  if (projected === 0) throw new Error("no games projected; refusing to overwrite a known-good artifact");

  const artifact = {
    _meta: buildNflMeta({
      source: "src/lib/nfl/currentRating2026.ts + jkbPowerNumber2026.ts (canonical Current OVR board)",
      season: CURRENT_SEASON,
      week: null,
      modelVersion: JKB_POWER_NUMBER_MODEL_VERSION,
      notes: [
        "The ONLY team-strength input is the canonical universal Current OVR board (the same rating shown everywhere else on the site) — never OFF/DEF independently, never a separately-maintained composite.",
        `Power Number = (Current OVR - league-average Current OVR) x ${OVR_TO_POINTS_COEFFICIENT}, the empirically calibrated NFL-points-per-OVR-point coefficient (Current-OVR Spread Calibration, walk-forward, no-leakage, 2023-2025).`,
        `Home-field advantage is a fixed ${HOME_FIELD_ADVANTAGE_POINTS} points, 0.0 at neutral sites, and is never fitted. No intercept.`,
        "neutralSite comes from nflverse's own `location` column (\"Home\"/\"Neutral\") at the schedule layer — never inferred from stadium name.",
        "Positive projectedHomeMargin means the home team is favoured by that many points.",
        "NO MARKET DATA IS READ HERE. Market comparison happens only in the consumer layer (src/lib/nfl/projectionData.ts), strictly after this projection already exists.",
        "REPLACES nfl-spread-v0.1.0 as the authoritative public JKB spread. That model's code and backtest remain available for historical/model comparison but no longer generate this artifact.",
      ],
    }),
    schemaVersion: PROJECTIONS_SCHEMA_VERSION,
    modelVersion: JKB_POWER_NUMBER_MODEL_VERSION,
    currentSeason: CURRENT_SEASON,
    model: {
      ovrToPointsCoefficient: OVR_TO_POINTS_COEFFICIENT,
      homeFieldAdvantage: HOME_FIELD_ADVANTAGE_POINTS,
      neutralSiteHomeFieldAdvantage: 0,
      leagueAverageOVR: powerBoard.leagueAverageOVR,
      strengthInput: "canonical universal Current OVR (src/lib/nfl/currentRating2026.ts)",
      fittedParameters: [] as string[],
      marketInputUsed: false,
    },
    projections,
    provenance: {
      generatedAt: new Date().toISOString(),
      gamesProjected: projected,
      inputs: {
        preseasonV03: "public/data/nfl/2026/preseason-power-ratings.json",
        preseasonV04: "public/data/nfl/2026/projected-power-ratings-v04.json",
        performanceAnalytics: "public/data/nfl/2026/team-performance-analytics.json",
        schedule: "public/data/nfl/2026/games.json",
      },
    },
  };

  console.log(
    `[nfl:projections] ${JKB_POWER_NUMBER_MODEL_VERSION} leagueAverageOVR=${powerBoard.leagueAverageOVR.toFixed(3)} ` +
      `projected ${projected} ${CURRENT_SEASON} games`
  );

  if (args.dryRun) {
    console.log("[nfl:projections] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort — the known-good artifact is what matters */
      }
    }
    throw err;
  }
  console.log(`[nfl:projections] wrote ${OUT_FILE}`);
}

try {
  main();
} catch (err) {
  console.error(`[nfl:projections] FAILED: ${err instanceof Error ? err.message : err}`);
  console.error("[nfl:projections] existing artifact left untouched");
  process.exit(1);
}
