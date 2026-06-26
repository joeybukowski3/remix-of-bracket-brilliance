#!/usr/bin/env node

/**
 * Filters generated MLB numerology output to hitters likely to appear today.
 *
 * Eligibility:
 * 1. If a team's active lineup is available, the player must appear in it.
 * 2. If that team's lineup is not available, the player must have recorded
 *    at least one at-bat across his previous three completed MLB games.
 *
 * This script runs after generate-mlb-numerology.mjs and rewrites only the
 * generated daily JSON. Numerology scoring and ranking are not recalculated.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "mlb", "numerology-daily.json");
const TIMEOUT_MS = 20000;
const CONCURRENCY = 8;

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function playerIdOf(player) {
  const value = player?.playerId ?? player?.personId ?? null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function playerKey(player) {
  return `${playerIdOf(player) ?? "no-id"}|${player?.playerName ?? "unknown"}|${player?.team ?? "unknown"}`;
}

function extractPreviousThreeAtBats(statsJson, slateDate) {
  const splits = statsJson?.stats?.flatMap((group) => group?.splits ?? []) ?? [];
  return splits
    .filter((split) => {
      const date = split?.date ?? split?.game?.gameDate?.slice?.(0, 10) ?? null;
      return date && date < slateDate;
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    .slice(0, 3)
    .reduce((total, split) => total + (Number(split?.stat?.atBats) || 0), 0);
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

function filterAndAnnotate(list, eligibility) {
  return (list ?? [])
    .filter((player) => eligibility.get(playerKey(player))?.eligible)
    .map((player) => {
      const activity = eligibility.get(playerKey(player));
      return {
        ...player,
        lineupStatus: activity?.source === "active_lineup" ? "confirmed" : player.lineupStatus,
        recentActivity: {
          source: activity?.source,
          previousThreeGameAtBats: activity?.previousThreeGameAtBats ?? null,
          checkedAt: activity?.checkedAt,
        },
      };
    });
}

async function main() {
  if (!existsSync(OUTPUT_PATH)) throw new Error(`Missing generated output: ${OUTPUT_PATH}`);
  const data = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
  const slateDate = getArg("--date") ?? data.date;
  const year = Number(slateDate.slice(0, 4));

  const [schedule, teams] = await Promise.all([
    fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${slateDate}&hydrate=lineups`),
    fetchJson("https://statsapi.mlb.com/api/v1/teams?sportId=1"),
  ]);

  const abbreviationById = new Map((teams?.teams ?? []).map((team) => [team.id, team.abbreviation]));
  const activeLineupsByTeam = new Map();

  for (const game of schedule?.dates?.[0]?.games ?? []) {
    const awayId = game?.teams?.away?.team?.id;
    const homeId = game?.teams?.home?.team?.id;
    const away = abbreviationById.get(awayId) ?? game?.teams?.away?.team?.abbreviation;
    const home = abbreviationById.get(homeId) ?? game?.teams?.home?.team?.abbreviation;
    const awayPlayers = game?.lineups?.awayPlayers ?? [];
    const homePlayers = game?.lineups?.homePlayers ?? [];
    if (away && awayPlayers.length > 0) activeLineupsByTeam.set(away, new Set(awayPlayers.map((player) => Number(player.id)).filter(Number.isFinite)));
    if (home && homePlayers.length > 0) activeLineupsByTeam.set(home, new Set(homePlayers.map((player) => Number(player.id)).filter(Number.isFinite)));
  }

  const uniquePlayers = [...new Map(collectAllPlayers(data).map((player) => [playerKey(player), player])).values()];
  const eligibility = new Map();
  const checkedAt = new Date().toISOString();

  await mapLimit(uniquePlayers, CONCURRENCY, async (player) => {
    const key = playerKey(player);
    const id = playerIdOf(player);
    const teamLineup = activeLineupsByTeam.get(player.team);

    if (teamLineup) {
      eligibility.set(key, {
        eligible: id != null && teamLineup.has(id),
        source: "active_lineup",
        previousThreeGameAtBats: null,
        checkedAt,
      });
      return;
    }

    if (id == null) {
      eligibility.set(key, {
        eligible: false,
        source: "missing_player_id",
        previousThreeGameAtBats: null,
        checkedAt,
      });
      return;
    }

    try {
      const gameLog = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&group=hitting&season=${year}`);
      const atBats = extractPreviousThreeAtBats(gameLog, slateDate);
      eligibility.set(key, {
        eligible: atBats >= 1,
        source: "previous_three_games",
        previousThreeGameAtBats: atBats,
        checkedAt,
      });
    } catch (error) {
      console.warn(`[numerology-active] game-log lookup failed for ${player.playerName}: ${error.message}`);
      eligibility.set(key, {
        eligible: false,
        source: "game_log_unavailable",
        previousThreeGameAtBats: null,
        checkedAt,
      });
    }
  });

  const before = {
    exact: data.exactNumberMatches?.length ?? 0,
    root: data.rootNumberMatches?.length ?? 0,
    featured: data.featuredPlays?.length ?? 0,
    bestAvailable: data.bestAvailable?.length ?? 0,
    watchlist: data.watchlist?.length ?? 0,
    countercurrents: data.countercurrents?.length ?? 0,
  };

  data.exactNumberMatches = filterAndAnnotate(data.exactNumberMatches, eligibility);
  data.rootNumberMatches = filterAndAnnotate(data.rootNumberMatches, eligibility);
  data.featuredPlays = filterAndAnnotate(data.featuredPlays, eligibility);
  data.bestAvailable = filterAndAnnotate(data.bestAvailable, eligibility);
  data.watchlist = filterAndAnnotate(data.watchlist, eligibility);
  data.countercurrents = filterAndAnnotate(data.countercurrents, eligibility);

  const eligibleKeys = [...eligibility.values()].filter((entry) => entry.eligible).length;
  data.candidatePool = {
    ...(data.candidatePool ?? {}),
    candidatePoolType: "today_lineup_or_recent_three_game_activity",
    description: "Players in an available active lineup; when a team lineup is unavailable, players must have at least one at-bat across their previous three completed MLB games.",
    preActivityFilterCount: uniquePlayers.length,
    activityEligibleCount: eligibleKeys,
    activityFilterCheckedAt: checkedAt,
  };
  data.activityFilter = {
    rule: "active_lineup_or_at_least_1_ab_in_previous_3_games",
    activeLineupTeams: [...activeLineupsByTeam.keys()].sort(),
    checkedAt,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log("[numerology-active] filtered generated output", {
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

main().catch((error) => {
  console.error(`[numerology-active] ${error.stack ?? error.message}`);
  process.exit(1);
});
