#!/usr/bin/env node

/**
 * Restricts generated MLB numerology output to hitters who are both present in
 * the daily Joe Knows Ball HR model and recently active in completed MLB games.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVITY_SOURCE,
  buildRecentActivityResults,
  dedupeCandidatesByKey,
  fetchRecentActivityAggregate,
  filterCollectionByRecentActivity,
  summarizeActivityResults,
} from "./lib/mlb-recent-activity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "numerology-daily.json");
const ARCHIVE_DIR = path.join(DATA_DIR, "numerology", "history");
const HR_MODEL_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const IDENTITY_CACHE_PATH = path.join(DATA_DIR, "player-identity-cache.json");
const LOOKBACK_DAYS = 4;

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function playerKey(playerName, team) {
  return `${normalizeName(playerName)}|${String(team ?? "").toUpperCase()}`;
}

function entryKey(player) {
  return playerKey(player?.playerName, player?.team);
}

function numericId(...values) {
  for (const value of values) {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
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

function loadIdentityByKey() {
  if (!existsSync(IDENTITY_CACHE_PATH)) return new Map();
  const raw = JSON.parse(readFileSync(IDENTITY_CACHE_PATH, "utf8"));
  const byKey = new Map();
  for (const [cacheKey, entry] of Object.entries(raw)) {
    const [name, team] = cacheKey.split("|");
    const key = playerKey(entry?.fullName ?? name, entry?.team ?? team);
    byKey.set(key, entry);
    byKey.set(playerKey(name, team), entry);
  }
  return byKey;
}

function buildHrBatterMap(hrModel) {
  const scheduledTeams = new Set();
  for (const game of hrModel.games ?? []) {
    if (game.awayTeam) scheduledTeams.add(String(game.awayTeam).toUpperCase());
    if (game.homeTeam) scheduledTeams.add(String(game.homeTeam).toUpperCase());
  }

  const hrBatterByKey = new Map();
  for (const batter of hrModel.batters ?? []) {
    const team = String(batter.team ?? "").toUpperCase();
    if (!team || !scheduledTeams.has(team) || !batter.player) continue;
    const key = playerKey(batter.player, team);
    if (!hrBatterByKey.has(key)) hrBatterByKey.set(key, batter);
  }

  return { scheduledTeams, hrBatterByKey };
}

function makeRecentActivityAnnotation(result) {
  return {
    source: result.source,
    checkedAt: result.checkedAt,
    lookbackDays: result.lookbackDays,
    latestGameDate: result.latestGameDate,
    gamesChecked: result.gamesChecked,
    plateAppearances: result.plateAppearances,
    atBats: result.atBats,
  };
}

function annotatePlayer(player, result, hrBatterByKey) {
  const hrBatter = hrBatterByKey.get(entryKey(player));
  return {
    ...player,
    opposingPitcher: hrBatter?.opposingPitcher ?? player.opposingPitcher ?? null,
    baseballScore: hrBatter?.hrScore != null ? Math.round(Number(hrBatter.hrScore)) : player.baseballScore,
    hrScore: hrBatter?.hrScore ?? player.hrScore ?? null,
    marketScore: hrBatter?.hrScore ?? player.marketScore ?? null,
    candidateSource: "jkb_hr_props",
    recentActivity: makeRecentActivityAnnotation(result),
  };
}

async function main() {
  if (!existsSync(OUTPUT_PATH)) throw new Error(`Missing generated output: ${OUTPUT_PATH}`);
  if (!existsSync(HR_MODEL_PATH)) throw new Error(`Missing HR model output: ${HR_MODEL_PATH}`);

  const data = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
  const hrModel = JSON.parse(readFileSync(HR_MODEL_PATH, "utf8"));
  const checkedAt = new Date().toISOString();
  const slateDate = data.date;

  if (hrModel.date && data.date && hrModel.date !== data.date) {
    throw new Error(`Slate date mismatch: numerology=${data.date}, hrModel=${hrModel.date}`);
  }

  const identityByKey = loadIdentityByKey();
  const { scheduledTeams, hrBatterByKey } = buildHrBatterMap(hrModel);
  const generatedPlayers = collectAllPlayers(data);
  const generatedKeys = new Set(generatedPlayers.map(entryKey).filter(Boolean));
  const initialCandidates = dedupeCandidatesByKey(
    [...generatedKeys]
      .filter((key) => hrBatterByKey.has(key))
      .map((key) => {
        const sample = generatedPlayers.find((player) => entryKey(player) === key) ?? {};
        const hrBatter = hrBatterByKey.get(key);
        const identity = identityByKey.get(key);
        return {
          key,
          playerName: sample.playerName ?? hrBatter?.player,
          team: sample.team ?? hrBatter?.team,
          playerId: numericId(sample.playerId, sample.personId, hrBatter?.playerId, hrBatter?.personId, hrBatter?.mlbId, identity?.mlbId),
        };
      }),
  );

  let aggregate;
  try {
    aggregate = await fetchRecentActivityAggregate(slateDate, {
      lookbackDays: LOOKBACK_DAYS,
      checkedAt,
      concurrency: 8,
      retries: 1,
      timeoutMs: 10000,
    });
  } catch (error) {
    console.error(`[numerology-active] activity lookup failed: ${error.message}`);
    aggregate = {
      activityByPlayerId: new Map(),
      completedGames: [],
      checkedAt,
      lookbackDays: LOOKBACK_DAYS,
      source: ACTIVITY_SOURCE,
      failedGamePks: [],
      anyLookupFailed: true,
    };
  }

  const { resultsByKey } = buildRecentActivityResults(initialCandidates, aggregate, {
    anyLookupFailed: aggregate.anyLookupFailed,
    checkedAt,
    lookbackDays: LOOKBACK_DAYS,
  });
  const summary = summarizeActivityResults(resultsByKey);

  const before = {
    exact: data.exactNumberMatches?.length ?? 0,
    root: data.rootNumberMatches?.length ?? 0,
    featured: data.featuredPlays?.length ?? 0,
    bestAvailable: data.bestAvailable?.length ?? 0,
    watchlist: data.watchlist?.length ?? 0,
    countercurrents: data.countercurrents?.length ?? 0,
  };

  const filterOptions = {
    keyForPlayer: entryKey,
    resultsByKey,
    annotatePlayer: (player, result) => annotatePlayer(player, result, hrBatterByKey),
  };
  data.exactNumberMatches = filterCollectionByRecentActivity(data.exactNumberMatches, filterOptions);
  data.rootNumberMatches = filterCollectionByRecentActivity(data.rootNumberMatches, filterOptions);
  data.featuredPlays = filterCollectionByRecentActivity(data.featuredPlays, filterOptions);
  data.bestAvailable = filterCollectionByRecentActivity(data.bestAvailable, filterOptions);
  data.watchlist = filterCollectionByRecentActivity(data.watchlist, filterOptions);
  data.countercurrents = filterCollectionByRecentActivity(data.countercurrents, filterOptions);

  const after = {
    exact: data.exactNumberMatches.length,
    root: data.rootNumberMatches.length,
    featured: data.featuredPlays.length,
    bestAvailable: data.bestAvailable.length,
    watchlist: data.watchlist.length,
    countercurrents: data.countercurrents.length,
  };

  data.candidatePool = {
    ...(data.candidatePool ?? {}),
    candidatePoolType: "daily_jkb_hr_model_recent_active_batters",
    description: "Players from the Joe Knows Ball HR model who recorded at least one plate appearance or at-bat in a completed MLB game during the previous four Eastern Time calendar days.",
    preHrModelFilterCount: generatedKeys.size,
    eligiblePlayerCount: summary.activeCount,
    evaluatedPlayerCount: initialCandidates.length,
    excludedPlayerCount: summary.excludedCount,
    exclusionReasons: summary.exclusionReasons,
    activityLookbackDays: LOOKBACK_DAYS,
    activityRule: "plateAppearances > 0 OR atBats > 0",
    activityFilterCheckedAt: checkedAt,
  };
  data.activityFilter = {
    rule: "must_be_listed_in_daily_jkb_hr_model_and_have_recent_completed_game_pa_or_ab",
    scheduleDate: hrModel.date ?? data.date,
    scheduledTeams: [...scheduledTeams].sort(),
    hrModelGeneratedAt: hrModel.generatedAt ?? null,
    checkedAt,
    lookbackDays: LOOKBACK_DAYS,
    source: ACTIVITY_SOURCE,
    completedGamesChecked: aggregate.completedGames?.length ?? 0,
    failedGamePks: aggregate.failedGamePks ?? [],
  };

  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(OUTPUT_PATH, serialized, "utf8");
  const archivePath = path.join(ARCHIVE_DIR, `${slateDate}.json`);
  if (existsSync(archivePath)) {
    writeFileSync(archivePath, serialized, "utf8");
  }

  const includedSamples = [
    ...data.exactNumberMatches,
    ...data.rootNumberMatches,
    ...data.featuredPlays,
    ...data.watchlist,
  ]
    .filter((player, index, all) => all.findIndex((other) => entryKey(other) === entryKey(player)) === index)
    .slice(0, 5)
    .map((player) => ({
      player: player.playerName,
      latestGameDate: player.recentActivity?.latestGameDate ?? null,
      plateAppearances: player.recentActivity?.plateAppearances ?? 0,
      atBats: player.recentActivity?.atBats ?? 0,
    }));

  console.log("Initial candidates:", initialCandidates.length);
  console.log("Recently active:", summary.activeCount);
  console.log("Excluded:", summary.excludedCount);
  console.log("Exact matches before:", before.exact);
  console.log("Exact matches after:", after.exact);
  console.log("Root matches before:", before.root);
  console.log("Root matches after:", after.root);
  console.log("Included player sample:", includedSamples);
  console.log("[numerology-active] restricted output to recent active HR model hitters", {
    before,
    after,
    exclusionReasons: summary.exclusionReasons,
  });
}

main().catch((error) => {
  console.error(`[numerology-active] ${error.stack ?? error.message}`);
  process.exit(1);
});
