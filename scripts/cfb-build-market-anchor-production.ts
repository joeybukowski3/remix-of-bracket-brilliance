import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import statisticalBase from "../data/generated/cfb/2026-preseason-ratings-v1.json";
import { CFB_AP_RANKS_2026 } from "../src/data/cfb/season2026/apRankings";
import { CFB_PRESEASON_MARKET_BASELINE_2026 } from "../src/data/cfb/season2026/preseasonMarketBaseline";
import { CFB_GAMES_2026 } from "../src/data/cfb/season2026/schedule";
import { CFB_FBS_TEAM_COUNT, CFB_TEAM_METADATA } from "../src/data/cfb/teamMetadata";
import {
  CFB_MARKET_ANCHOR_VERSION,
  CFB_MARKET_FADE_BANDS,
  buildCfbMarketAnchorRatings,
} from "../src/lib/cfb/marketAnchor";
import { computeRawSosForAllTeams, computeSosDisplay, toSosGameInputs } from "../src/lib/cfb/model";

const OUTPUT_DIR = resolve("data/generated/cfb");
const JSON_PATH = resolve(OUTPUT_DIR, "2026-preseason-ratings-v1.1.json");
const CSV_PATH = resolve(OUTPUT_DIR, "2026-preseason-ratings-v1.1.csv");
const provenance = "JKB Preseason Power combines a market-informed preseason strength baseline with JoeKnowsBall efficiency data.";

function round(value: number | null, places = 8): number | null {
  if (value === null) return null;
  return Number(value.toFixed(places));
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, content, "utf8");
  renameSync(temporaryPath, path);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const statisticalRows = statisticalBase.rows;
const statisticalByTeam = new Map(statisticalRows.map((row) => [row.teamId, row]));
const baselineByTeam = new Map(CFB_PRESEASON_MARKET_BASELINE_2026.map((row) => [row.teamId, row]));
const expectedIds = new Set(CFB_TEAM_METADATA.map((team) => team.id));
const missing = [...expectedIds].filter((teamId) => !baselineByTeam.has(teamId));
const extra = [...baselineByTeam.keys()].filter((teamId) => !expectedIds.has(teamId));
if (baselineByTeam.size !== CFB_FBS_TEAM_COUNT || missing.length || extra.length) {
  throw new Error(`Market baseline mapping invalid: count=${baselineByTeam.size}, missing=${missing.join("|")}, extra=${extra.join("|")}`);
}

const ratings = buildCfbMarketAnchorRatings(CFB_TEAM_METADATA.map((team) => {
  const baseline = baselineByTeam.get(team.id);
  const statistical = statisticalByTeam.get(team.id);
  if (!baseline || !statistical) throw new Error(`Missing production input for ${team.id}`);
  return {
    teamId: team.id,
    marketRating: baseline.sourcePowerRating,
    statisticalOffense: statistical.performanceOffense,
    statisticalDefense: statistical.performanceDefense,
    displayedOffense: statistical.jkbOffense,
    displayedDefense: statistical.jkbDefense,
    apRank: CFB_AP_RANKS_2026[team.id] ?? null,
  };
}), 0);

const productionPower = new Map(ratings.map((row) => [
  row.teamId,
  round(row.jkbPowerRating, 2) as number,
]));
const productionSos = new Map(computeSosDisplay(computeRawSosForAllTeams(
  CFB_TEAM_METADATA.map((team) => team.id),
  toSosGameInputs(CFB_GAMES_2026),
  productionPower,
)).map((row) => [row.teamId, row]));

const rows = ratings.map((rating) => {
  const statistical = statisticalByTeam.get(rating.teamId);
  const sos = productionSos.get(rating.teamId);
  if (!statistical || !sos || sos.sosRemainingRank === null || sos.sosRemainingRating === null) {
    throw new Error(`Missing production output for ${rating.teamId}`);
  }
  return {
    ...statistical,
    rank: rating.finalJkbRank,
    rawPower: round(rating.rawJkbPower),
    jkbPower: productionPower.get(rating.teamId) as number,
    jkbOffense: round(rating.displayedOffense, 2),
    jkbDefense: round(rating.displayedDefense, 2),
    sosRemainingRating: round(sos.sosRemainingRating, 2),
    sosRemainingRank: sos.sosRemainingRank,
    apRank: rating.apRank,
    provenance: {
      ...statistical.provenance,
      modelVersion: CFB_MARKET_ANCHOR_VERSION,
      power: provenance,
      apRank: rating.apRank === null ? "unavailable" : "official-ap-poll",
    },
  };
});

if (
  rows.length !== CFB_FBS_TEAM_COUNT ||
  rows.some((row, index) => row.rank !== index + 1) ||
  new Set(rows.map((row) => row.teamId)).size !== CFB_FBS_TEAM_COUNT
) {
  throw new Error("Production ratings must contain 138 unique teams ranked 1-138");
}
const top25 = rows.filter((row) => row.rank <= 25);
if (top25.length !== 25) throw new Error(`Production Top 25 has ${top25.length} rows`);

const artifact = {
  schemaVersion: "jkb-cfb-2026-preseason-ratings-v1.1",
  modelVersion: CFB_MARKET_ANCHOR_VERSION,
  status: "production",
  config: {
    version: CFB_MARKET_ANCHOR_VERSION,
    statisticalBaseVersion: statisticalBase.modelVersion,
    marketBaselineNormalization: "population league z-score",
    statisticalPowerNormalization: "population league z-score",
    preseasonWeights: { market: 0.75, jkbStatistics: 0.25 },
    statisticalOffense: { yardsPerPlayWeight: 0.5, pointsPerPlayWeight: 0.5 },
    statisticalDefense: { yardsPerPlayAllowedWeight: 0.5, pointsPerPlayAllowedWeight: 0.5, higherIsBetter: true },
    statisticalPower: { offenseWeight: 0.5, defenseWeight: 0.5 },
    returningProduction: "excluded from JKB Power; retained only in the carried-forward statistical offense display rating",
    displayScale: { min: 40, max: 99 },
    transitionFallback: statisticalBase.config.transitionFallback,
    marketFadeBands: CFB_MARKET_FADE_BANDS,
    apRank: "independent comparison field; not a model input",
  },
  teamCount: rows.length,
  top25Count: top25.length,
  scheduleGameCount: statisticalBase.scheduleGameCount,
  provenance,
  rows,
};

const csvRows = rows.map((row) => ({
  rank: row.rank,
  teamId: row.teamId,
  team: row.team,
  conference: row.conference,
  jkbPower: row.jkbPower,
  jkbOffense: row.jkbOffense,
  jkbDefense: row.jkbDefense,
  sosPlayedRating: row.sosPlayedRating,
  sosPlayedRank: row.sosPlayedRank,
  sosRemainingRating: row.sosRemainingRating,
  sosRemainingRank: row.sosRemainingRank,
  apRank: row.apRank,
  rawPower: row.rawPower,
  rawOffense: row.rawOffense,
  rawDefense: row.rawDefense,
  games: row.games,
  priorPerformanceSource: row.priorPerformanceSource,
  sourceClassification: row.sourceClassification,
  transitionShrinkageApplied: row.transitionShrinkageApplied,
  transitionPriorPerformanceWeight: row.transitionPriorPerformanceWeight,
  rawYppOffense: row.rawYppOffense,
  rawYppDefenseAllowed: row.rawYppDefenseAllowed,
  adjustedYppOffense: row.adjustedYppOffense,
  adjustedYppDefenseAllowed: row.adjustedYppDefenseAllowed,
  rawPointsPerPlayOffense: row.rawPointsPerPlayOffense,
  rawPointsPerPlayDefenseAllowed: row.rawPointsPerPlayDefenseAllowed,
  adjustedPointsPerPlayOffense: row.adjustedPointsPerPlayOffense,
  adjustedPointsPerPlayDefenseAllowed: row.adjustedPointsPerPlayDefenseAllowed,
  standardizedYppOffense: row.standardizedYppOffense,
  standardizedYppDefense: row.standardizedYppDefense,
  standardizedPointsPerPlayOffense: row.standardizedPointsPerPlayOffense,
  standardizedPointsPerPlayDefense: row.standardizedPointsPerPlayDefense,
  returningProduction: row.returningProduction,
  standardizedReturningProduction: row.standardizedReturningProduction,
  sosProvenance: row.sosProvenance,
  modelVersion: CFB_MARKET_ANCHOR_VERSION,
  provenance,
}));
const json = `${JSON.stringify(artifact, null, 2)}\n`;
const headers = Object.keys(csvRows[0]) as Array<keyof (typeof csvRows)[number]>;
const csv = `${headers.join(",")}\n${csvRows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
writeAtomic(JSON_PATH, json);
writeAtomic(CSV_PATH, csv);

const keyTeamIds = ["osu", "nd", "ore", "ind", "uga", "tex", "ttu", "mia", "tolu", "ndsu", "northtx"];
console.log(JSON.stringify({
  mappedTeams: baselineByTeam.size,
  missing,
  extra,
  jsonPath: JSON_PATH,
  csvPath: CSV_PATH,
  jsonSha256: sha256(json),
  csvSha256: sha256(csv),
  top25: top25.map((row) => ({ rank: row.rank, team: row.team, power: row.jkbPower })),
  keyTeams: keyTeamIds.map((teamId) => {
    const row = rows.find((candidate) => candidate.teamId === teamId);
    return row && { rank: row.rank, team: row.team, power: row.jkbPower, sosRemainingRank: row.sosRemainingRank };
  }),
}, null, 2));
