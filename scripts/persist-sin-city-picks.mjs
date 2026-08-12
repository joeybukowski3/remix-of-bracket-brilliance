/**
 * persist-sin-city-picks.mjs
 *
 * Pregame snapshot step for Sin City forward-tracking. Reads today's
 * hr-props-raw.json (the same live batter+game data the /mlb/sin-city page
 * already reads) and, for every batter evaluated as 4/5 or 5/5 under the
 * existing Sin City rules (src/lib/mlb/mlbHrFilter.ts, mirrored in
 * scripts/lib/mlb-sin-city.mjs), appends a pending record to
 * public/data/mlb/sin-city-performance.json.
 *
 * This does NOT change the Sin City selection algorithm -- it only persists
 * a snapshot of an evaluation that already happens today, so it can be
 * graded against the actual result once the game is final (see
 * scripts/grade-sin-city-picks.mjs).
 *
 * Intended to run right after HR props generation (once hr-props-raw.json
 * has odds + weather injected), before first pitch, so the persisted
 * snapshot only reflects pregame information.
 *
 * Idempotent: re-running for a date that's already persisted for a given
 * player+game is a no-op (keyed on date+playerId+gameId).
 *
 * Usage: node scripts/persist-sin-city-picks.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { evaluateSinCityHitter, SIN_CITY_RULESET_VERSION } from "./lib/mlb-sin-city.mjs";

export const SIN_CITY_TRACKING_MODEL_VERSION = "sin-city-tracking-v1";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");
const PERFORMANCE_PATH = path.join(ROOT, "public", "data", "mlb", "sin-city-performance.json");

const DRY_RUN = process.argv.includes("--dry-run");

function qualificationLevel(matchCount) {
  if (matchCount === 5) return "5/5";
  if (matchCount === 4) return "4/5";
  return null;
}

function recordKey(record) {
  return `${record.date}|${record.playerId}|${record.gameId}`;
}

export function buildSinCitySnapshots(raw) {
  const gamesByKey = new Map((raw.games ?? []).map((g) => [g.gameKey, g]));
  const snapshots = [];

  for (const batter of raw.batters ?? []) {
    const game = gamesByKey.get(batter.gameKey);
    const evaluation = evaluateSinCityHitter({
      barrelRate: batter.barrelRate,
      pullRate: batter.pullRate,
      hardHitRate: batter.hardHitRate,
      exitVelo: batter.exitVelo,
      stadium: game?.stadium ?? null,
      roofType: game?.roofType ?? null,
      windDirection: game?.windDirection ?? null,
      windSpeed: game?.windSpeed ?? null,
    });

    const level = qualificationLevel(evaluation.matchCount);
    if (!level) continue;

    snapshots.push({
      trackingModelVersion: SIN_CITY_TRACKING_MODEL_VERSION,
      sinCityRulesetVersion: SIN_CITY_RULESET_VERSION,
      date: batter.officialGameDate ?? raw.date,
      persistedAt: new Date().toISOString(),
      playerId: batter.playerId,
      playerName: batter.player,
      team: batter.team,
      teamId: batter.teamId,
      opponent: batter.opponent,
      opponentId: batter.opponentId,
      gameId: batter.gameId,
      qualificationLevel: level,
      matchCount: evaluation.matchCount,
      factors: evaluation.factors,
      hrOddsYes: batter.hrOddsYes ?? null,
      hrOddsBook: batter.hrOddsBook ?? null,
      resultStatus: "pending",
      battingLine: null,
      gradedAt: null,
    });
  }

  return snapshots;
}

function main() {
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8"));
  const performanceFile = JSON.parse(readFileSync(PERFORMANCE_PATH, "utf8"));

  const existingKeys = new Set(performanceFile.records.map(recordKey));
  const snapshots = buildSinCitySnapshots(raw);
  const newSnapshots = snapshots.filter((s) => !existingKeys.has(recordKey(s)));

  const fiveOfFive = newSnapshots.filter((s) => s.qualificationLevel === "5/5").length;
  const fourOfFive = newSnapshots.filter((s) => s.qualificationLevel === "4/5").length;
  console.log(`[sin-city-persist] Evaluated ${raw.batters?.length ?? 0} batters. New qualifiers: ${fiveOfFive} at 5/5, ${fourOfFive} at 4/5 (${snapshots.length - newSnapshots.length} already persisted).`);

  if (DRY_RUN) {
    console.log("[sin-city-persist] Dry run -- not writing file.");
    return;
  }

  if (newSnapshots.length === 0) {
    console.log("[sin-city-persist] No new snapshots to persist.");
    return;
  }

  performanceFile.records = [...performanceFile.records, ...newSnapshots];
  performanceFile.generatedAt = new Date().toISOString();
  writeFileSync(PERFORMANCE_PATH, `${JSON.stringify(performanceFile, null, 2)}\n`);
  console.log(`[sin-city-persist] Wrote ${PERFORMANCE_PATH} (${performanceFile.records.length} total records).`);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  main();
}
