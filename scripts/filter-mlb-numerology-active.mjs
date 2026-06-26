#!/usr/bin/env node

/**
 * Restricts generated MLB numerology output to the active hitter pool already
 * produced by the Joe Knows Ball HR model for the same daily slate.
 *
 * Eligibility:
 * 1. The player must be listed in hr-props-raw.json batters.
 * 2. The player's team must appear in that file's daily game schedule.
 *
 * The HR model is the source of truth for likely active hitters. This avoids
 * expanding numerology results to the broader 40-man roster and does not alter
 * numerology scoring or ranking.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "numerology-daily.json");
const HR_MODEL_PATH = path.join(DATA_DIR, "hr-props-raw.json");

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function playerKey(playerName, team) {
  return `${normalizeName(playerName)}|${String(team ?? "").toUpperCase()}`;
}

function entryKey(player) {
  return playerKey(player?.playerName, player?.team);
}

function collectAllPlayers(data) {
  return [
    ...(data.exactNumberMatches ?? []),
    ...(data.rootNumberMatches ?? []),
    ...(data.featuredPlays ?? []),
    ...(data.bestAvailable ?? []),
    ...(data.watchlist ?? []),
    ...(data.countercurrents ?? []),
  ];
}

function filterAndAnnotate(list, eligibleKeys, hrBatterByKey, checkedAt) {
  return (list ?? [])
    .filter((player) => eligibleKeys.has(entryKey(player)))
    .map((player) => {
      const hrBatter = hrBatterByKey.get(entryKey(player));
      return {
        ...player,
        opposingPitcher: hrBatter?.opposingPitcher ?? player.opposingPitcher ?? null,
        baseballScore: hrBatter?.hrScore != null ? Math.round(Number(hrBatter.hrScore)) : player.baseballScore,
        hrScore: hrBatter?.hrScore ?? player.hrScore ?? null,
        marketScore: hrBatter?.hrScore ?? player.marketScore ?? null,
        candidateSource: "jkb_hr_props",
        recentActivity: {
          source: "jkb_hr_model_active_pool",
          checkedAt,
        },
      };
    });
}

function main() {
  if (!existsSync(OUTPUT_PATH)) throw new Error(`Missing generated output: ${OUTPUT_PATH}`);
  if (!existsSync(HR_MODEL_PATH)) throw new Error(`Missing HR model output: ${HR_MODEL_PATH}`);

  const data = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
  const hrModel = JSON.parse(readFileSync(HR_MODEL_PATH, "utf8"));
  const checkedAt = new Date().toISOString();

  if (hrModel.date && data.date && hrModel.date !== data.date) {
    throw new Error(`Slate date mismatch: numerology=${data.date}, hrModel=${hrModel.date}`);
  }

  const scheduledTeams = new Set();
  for (const game of hrModel.games ?? []) {
    if (game.awayTeam) scheduledTeams.add(String(game.awayTeam).toUpperCase());
    if (game.homeTeam) scheduledTeams.add(String(game.homeTeam).toUpperCase());
  }

  const hrBatterByKey = new Map();
  for (const batter of hrModel.batters ?? []) {
    const team = String(batter.team ?? "").toUpperCase();
    if (!team || !scheduledTeams.has(team) || !batter.player) continue;
    hrBatterByKey.set(playerKey(batter.player, team), batter);
  }
  const eligibleKeys = new Set(hrBatterByKey.keys());
  const uniqueGeneratedPlayers = new Set(collectAllPlayers(data).map(entryKey));

  const before = {
    exact: data.exactNumberMatches?.length ?? 0,
    root: data.rootNumberMatches?.length ?? 0,
    featured: data.featuredPlays?.length ?? 0,
    bestAvailable: data.bestAvailable?.length ?? 0,
    watchlist: data.watchlist?.length ?? 0,
    countercurrents: data.countercurrents?.length ?? 0,
  };

  data.exactNumberMatches = filterAndAnnotate(data.exactNumberMatches, eligibleKeys, hrBatterByKey, checkedAt);
  data.rootNumberMatches = filterAndAnnotate(data.rootNumberMatches, eligibleKeys, hrBatterByKey, checkedAt);
  data.featuredPlays = filterAndAnnotate(data.featuredPlays, eligibleKeys, hrBatterByKey, checkedAt);
  data.bestAvailable = filterAndAnnotate(data.bestAvailable, eligibleKeys, hrBatterByKey, checkedAt);
  data.watchlist = filterAndAnnotate(data.watchlist, eligibleKeys, hrBatterByKey, checkedAt);
  data.countercurrents = filterAndAnnotate(data.countercurrents, eligibleKeys, hrBatterByKey, checkedAt);

  data.candidatePool = {
    ...(data.candidatePool ?? {}),
    candidatePoolType: "daily_jkb_hr_model_batters",
    description: "Only hitters listed in the Joe Knows Ball HR model for teams on today's MLB schedule are eligible for the numerology page.",
    preHrModelFilterCount: uniqueGeneratedPlayers.size,
    eligiblePlayerCount: eligibleKeys.size,
    evaluatedPlayerCount: eligibleKeys.size,
    activityFilterCheckedAt: checkedAt,
  };
  data.activityFilter = {
    rule: "must_be_listed_in_daily_jkb_hr_model",
    scheduleDate: hrModel.date ?? data.date,
    scheduledTeams: [...scheduledTeams].sort(),
    hrModelGeneratedAt: hrModel.generatedAt ?? null,
    checkedAt,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log("[numerology-active] restricted output to daily HR model pool", {
    hrModelBatters: eligibleKeys.size,
    before,
    after: {
      exact: data.exactNumberMatches.length,
      root: data.rootNumberMatches.length,
      featured: data.featuredPlays.length,
      bestAvailable: data.bestAvailable?.length ?? 0,
      watchlist: data.watchlist.length,
      countercurrents: data.countercurrents?.length ?? 0,
    },
  });
}

try {
  main();
} catch (error) {
  console.error(`[numerology-active] ${error.stack ?? error.message}`);
  process.exit(1);
}
