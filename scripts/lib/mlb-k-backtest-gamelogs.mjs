/**
 * mlb-k-backtest-gamelogs.mjs  (backtest step 2)
 *
 * Acquires the per-game logs that the leak-free as-of reconstruction needs and
 * that the merged `acquireMlbKHistoryStatsApi` does NOT fetch:
 *
 *   - pitching game logs per starting pitcher, current + previous season
 *     (StatsAPI `people/{id}/stats?stats=gameLog&group=pitching`)
 *   - team hitting game logs per team, per season
 *     (StatsAPI `teams/{id}/stats?stats=gameLog&group=hitting`)
 *
 * Both are cumulative-safe: each split carries `date` + `game.gamePk`, so the
 * reconstruction sums only rows strictly before a start's slate date.
 *
 * All requests go through the shared resumable/hash-verified cache, so an
 * interrupted acquisition never re-fetches a completed log.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { createCachedFetch, writeJsonAtomic } from "./mlb-k-backtest-cache.mjs";

const STATS_API = "https://statsapi.mlb.com/api/v1";

export function pitchingGameLogUrl(pitcherId, season) {
  return `${STATS_API}/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
}

export function teamHittingGameLogUrl(teamId, season) {
  return `${STATS_API}/teams/${teamId}/stats?stats=gameLog&season=${season}&group=hitting`;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Flatten a StatsAPI gameLog payload to plain, sorted per-game rows. */
export function normalizeGameLog(payload) {
  const splits = (payload?.stats ?? []).flatMap((block) => block?.splits ?? []);
  return splits
    .map((split) => {
      const stat = split?.stat ?? {};
      return {
        date: typeof split?.date === "string" ? split.date.slice(0, 10) : null,
        gamePk: finite(split?.game?.gamePk),
        season: finite(split?.season),
        isHome: typeof split?.isHome === "boolean" ? split.isHome : null,
        opponentId: finite(split?.opponent?.id),
        gamesStarted: finite(stat.gamesStarted),
        inningsPitched: stat.inningsPitched ?? null,
        strikeOuts: finite(stat.strikeOuts ?? stat.strikeouts),
        battersFaced: finite(stat.battersFaced),
        baseOnBalls: finite(stat.baseOnBalls ?? stat.walks),
        numberOfPitches: finite(stat.numberOfPitches ?? stat.pitchesThrown),
        hits: finite(stat.hits),
        plateAppearances: finite(stat.plateAppearances),
        atBats: finite(stat.atBats),
      };
    })
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.gamePk ?? 0) - (b.gamePk ?? 0));
}

/** Read every `normalized-outcomes.json` under the StatsAPI corpus root. */
export function collectCorpusTargets(statsApiRoot) {
  const bySeason = new Map();
  if (!existsSync(statsApiRoot)) return bySeason;
  for (const seasonEntry of readdirSync(statsApiRoot, { withFileTypes: true })) {
    if (!seasonEntry.isDirectory() || !/^\d{4}$/.test(seasonEntry.name)) continue;
    const season = Number(seasonEntry.name);
    const seasonDir = path.join(statsApiRoot, seasonEntry.name);
    const pitcherIds = new Set();
    const teamIds = new Set();
    let games = 0;
    let starterRows = 0;
    for (const windowEntry of readdirSync(seasonDir, { withFileTypes: true })) {
      if (!windowEntry.isDirectory()) continue;
      const normalizedPath = path.join(seasonDir, windowEntry.name, "normalized-outcomes.json");
      if (!existsSync(normalizedPath)) continue;
      let payload;
      try {
        payload = JSON.parse(readFileSync(normalizedPath, "utf8"));
      } catch {
        continue;
      }
      for (const game of payload.games ?? []) {
        games += 1;
        if (game.awayTeamId) teamIds.add(game.awayTeamId);
        if (game.homeTeamId) teamIds.add(game.homeTeamId);
        for (const starter of game.startingPitchers ?? []) {
          if (starter.pitcherId) pitcherIds.add(starter.pitcherId);
          starterRows += 1;
        }
      }
    }
    bySeason.set(season, { season, pitcherIds: [...pitcherIds].sort((a, b) => a - b), teamIds: [...teamIds].sort((a, b) => a - b), games, starterRows });
  }
  return bySeason;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, items.length)) }, worker));
  return results;
}

export async function acquireBacktestGameLogs({
  statsApiRoot,
  cacheDir,
  manifestPath,
  concurrency = 3,
  includePreviousSeason = true,
  fetchImpl = globalThis.fetch,
  log = (message) => console.log(message),
} = {}) {
  const startedAt = Date.now();
  const cachedFetch = createCachedFetch({
    cacheDir,
    mode: "online",
    networkFetch: fetchImpl,
    minIntervalMs: 80,
    maxAttempts: 5,
    backoffMs: 600,
    timeoutMs: 20_000,
  });
  const targets = collectCorpusTargets(statsApiRoot);
  if (!targets.size) throw new Error(`No normalized-outcomes.json found under ${statsApiRoot} - run acquire-mlb-k-backtest-history first`);

  const seasons = [...targets.keys()].sort((a, b) => a - b);
  const pitcherRequests = [];
  const teamRequests = [];
  for (const season of seasons) {
    const { pitcherIds, teamIds } = targets.get(season);
    const wantedSeasons = includePreviousSeason ? [season - 1, season] : [season];
    for (const pitcherId of pitcherIds) {
      for (const logSeason of wantedSeasons) pitcherRequests.push({ pitcherId, season: logSeason, forSeason: season });
    }
    for (const teamId of teamIds) teamRequests.push({ teamId, season });
  }
  const uniquePitcher = [...new Map(pitcherRequests.map((r) => [`${r.pitcherId}:${r.season}`, r])).values()];
  const uniqueTeam = [...new Map(teamRequests.map((r) => [`${r.teamId}:${r.season}`, r])).values()];
  log(`[gamelogs] ${uniquePitcher.length} pitching logs + ${uniqueTeam.length} team hitting logs across seasons ${seasons.join(", ")}`);

  const pitcherResults = await mapLimit(uniquePitcher, concurrency, async (request) => {
    const url = pitchingGameLogUrl(request.pitcherId, request.season);
    try {
      const response = await cachedFetch(url);
      const rows = normalizeGameLog(await response.json());
      return { ...request, status: "ok", url, gameRows: rows.length, startRows: rows.filter((r) => r.gamesStarted === 1).length };
    } catch (error) {
      return { ...request, status: "failed", url, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const teamResults = await mapLimit(uniqueTeam, concurrency, async (request) => {
    const url = teamHittingGameLogUrl(request.teamId, request.season);
    try {
      const response = await cachedFetch(url);
      const rows = normalizeGameLog(await response.json());
      return { ...request, status: "ok", url, gameRows: rows.length };
    } catch (error) {
      return { ...request, status: "failed", url, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const failed = [...pitcherResults, ...teamResults].filter((r) => r.status === "failed");
  const manifest = {
    schemaVersion: 1,
    kind: "mlb-k-backtest-gamelogs",
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    cacheDir: path.relative(process.cwd(), cacheDir),
    seasons: seasons.map((season) => {
      const target = targets.get(season);
      return {
        season,
        starters: target.pitcherIds.length,
        teams: target.teamIds.length,
        games: target.games,
        starterRows: target.starterRows,
        pitchingLogsOk: pitcherResults.filter((r) => r.forSeason === season && r.status === "ok").length,
        pitchingLogsFailed: pitcherResults.filter((r) => r.forSeason === season && r.status === "failed").length,
        teamLogsOk: teamResults.filter((r) => r.season === season && r.status === "ok").length,
        teamLogsFailed: teamResults.filter((r) => r.season === season && r.status === "failed").length,
      };
    }),
    network: cachedFetch.stats,
    failedRequests: failed.map((r) => ({ url: r.url, error: r.error })),
  };
  if (manifestPath) writeJsonAtomic(manifestPath, manifest);
  return manifest;
}
