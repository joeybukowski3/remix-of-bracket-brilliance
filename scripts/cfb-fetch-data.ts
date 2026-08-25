import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCfbdJson, sha256, writeAtomic, type CfbdRequest } from "./lib/cfb-cfbd-client";
import { fetchPlaysForSeason, playsWeekBatchesFromGames } from "./lib/cfb-cfbd-plays-client";
import type { CfbdGame, CfbdGameTeamStats } from "../src/lib/cfb/pipeline/types";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_DIR = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const API_KEY = process.env.CFBD_API_KEY?.trim();

const requests: CfbdRequest[] = [
  { name: "teams-2026", path: "/teams/fbs", query: { year: 2026 } },
  { name: "venues", path: "/venues", query: {} },
  { name: "games-2025", path: "/games", query: { year: 2025, classification: "fbs" } },
  {
    name: "game-team-stats-2025",
    path: "/games/teams",
    query: { year: 2025 },
  },
  { name: "games-2026", path: "/games", query: { year: 2026, classification: "fbs" } },
  { name: "returning-production-2026", path: "/player/returning", query: { year: 2026 }, optional: true },
  { name: "talent-2026", path: "/talent", query: { year: 2026 }, optional: true },
  // WU5 — current-season (2026) game-team stats and plays. Batches are
  // derived from games-2026's own week numbers (no fixed 1-17 assumption),
  // so a future/incomplete week simply returns empty rows from CFBD rather
  // than erroring — safe to fetch unconditionally every run, including the
  // 2026 preseason (zero completed games today).
  {
    name: "game-team-stats-2026",
    path: "/games/teams",
    query: { year: 2026 },
  },
  { name: "plays-2026", path: "/plays", query: { year: 2026 } },
];

function statsBatchRequests(season: number, games: readonly CfbdGame[]): CfbdRequest[] {
  const batches = new Map<string, { week: number; seasonType: CfbdGame["seasonType"] }>();
  for (const game of games) {
    if (game.season !== season || !Number.isInteger(game.week)) continue;
    batches.set(`${game.seasonType}:${game.week}`, {
      week: game.week,
      seasonType: game.seasonType,
    });
  }
  return [...batches.values()]
    .sort(
      (a, b) =>
        a.seasonType.localeCompare(b.seasonType) || a.week - b.week,
    )
    .map(({ week, seasonType }) => ({
      name: `game-team-stats-${season}-${seasonType}-week-${week}`,
      path: "/games/teams",
      query: { year: season, week, seasonType, classification: "fbs" },
    }));
}

async function fetchGameTeamStats(season: number, games: readonly CfbdGame[], apiKey: string) {
  const batches = statsBatchRequests(season, games);
  if (batches.length === 0) throw new Error(`game-team-stats-${season}: no ${season} game weeks found`);
  const byGameId = new Map<number, CfbdGameTeamStats>();
  const urls: string[] = [];
  let remainingCalls: string | null = null;
  for (const batch of batches) {
    const response = await fetchCfbdJson<CfbdGameTeamStats[]>(batch, apiKey);
    for (const game of response.data) byGameId.set(game.id, game);
    urls.push(response.url);
    remainingCalls = response.remainingCalls;
  }
  return { data: [...byGameId.values()], urls, remainingCalls };
}

async function runNarrowMode(mode: string, apiKey: string): Promise<boolean> {
  if (mode === "--audit-game-team-stats-cache") {
    const games = JSON.parse(readFileSync(resolve(RAW_DIR, "games-2025.json"), "utf8")) as CfbdGame[];
    const stats = JSON.parse(
      readFileSync(resolve(RAW_DIR, "game-team-stats-2025.json"), "utf8"),
    ) as CfbdGameTeamStats[];
    const statsIds = new Set(stats.map((game) => game.id));
    const matchupTypes = new Map<string, number>();
    for (const game of games) {
      if (!statsIds.has(game.id)) continue;
      const key = [game.homeClassification ?? "unknown", game.awayClassification ?? "unknown"]
        .sort()
        .join("-vs-");
      matchupTypes.set(key, (matchupTypes.get(key) ?? 0) + 1);
    }
    console.log(
      `[cfb:fetch-data] cache audit: ${stats.length} stats rows; ${statsIds.size} unique IDs; ` +
        `${games.filter((game) => !statsIds.has(game.id)).length} games missing stats`,
    );
    console.log(
      `[cfb:fetch-data] matchup classifications: ${JSON.stringify(Object.fromEntries(matchupTypes))}`,
    );
    return true;
  }
  if (mode === "--diagnose-old-game-team-stats") {
    await fetchCfbdJson(
      {
        name: "diagnose-old-game-team-stats-2025",
        path: "/games/teams",
        query: { year: 2025, classification: "fbs" },
      },
      apiKey,
    );
    return true;
  }
  if (mode !== "--test-game-team-stats") return false;
  const response = await fetchCfbdJson<CfbdGameTeamStats[]>(
    {
      name: "test-game-team-stats-2025-regular-week-1",
      path: "/games/teams",
      query: { year: 2025, week: 1, seasonType: "regular", classification: "fbs" },
    },
    apiKey,
  );
  const first = response.data[0];
  const categories = [...new Set(response.data.flatMap((game) => game.teams.flatMap((team) => team.stats.map((stat) => stat.category))))].sort();
  console.log(`[cfb:fetch-data] narrow game-team-stats test: ${response.data.length} rows`);
  console.log(`[cfb:fetch-data] response shape: ${JSON.stringify(first ? Object.keys(first) : [])}; team shape: ${JSON.stringify(first?.teams[0] ? Object.keys(first.teams[0]) : [])}`);
  console.log(`[cfb:fetch-data] stat categories: ${categories.join(", ")}`);
  if (response.remainingCalls) console.log(`[cfb:fetch-data] ${response.remainingCalls} calls remaining`);
  return true;
}

async function main() {
  if (!API_KEY) {
    throw new Error(
      "CFBD_API_KEY is required. Set it in the process environment, then run npm run cfb:fetch-data. No cache files were written.",
    );
  }

  if (await runNarrowMode(process.argv[2] ?? "", API_KEY)) return;

  const fetchedAt = new Date().toISOString();
  const pending: Array<{ name: string; text: string }> = [];
  const manifestFiles: Array<Record<string, unknown>> = [];
  const fetchedData = new Map<string, unknown[]>();

  for (const request of requests) {
    try {
      let response: { data: unknown[]; urls: string[]; remainingCalls: string | null };
      if (request.name === "game-team-stats-2025") {
        response = await fetchGameTeamStats(2025, (fetchedData.get("games-2025") ?? []) as CfbdGame[], API_KEY);
      } else if (request.name === "game-team-stats-2026") {
        response = await fetchGameTeamStats(2026, (fetchedData.get("games-2026") ?? []) as CfbdGame[], API_KEY);
      } else if (request.name === "plays-2026") {
        const batches = playsWeekBatchesFromGames((fetchedData.get("games-2026") ?? []) as CfbdGame[]);
        response = await fetchPlaysForSeason(2026, batches, API_KEY);
      } else {
        const result = await fetchCfbdJson<unknown[]>(request, API_KEY);
        response = { ...result, urls: [result.url] };
      }
      const text = `${JSON.stringify(response.data, null, 2)}\n`;
      fetchedData.set(request.name, response.data);
      pending.push({ name: request.name, text });
      manifestFiles.push({
        name: request.name,
        filename: `${request.name}.json`,
        requestUrls: response.urls,
        requestCount: response.urls.length,
        optional: Boolean(request.optional),
        rowCount: response.data.length,
        byteSize: Buffer.byteLength(text),
        sha256: sha256(text),
        fetchedAt,
      });
      console.log(
        `[cfb:fetch-data] ${request.name}: ${response.data.length} rows` +
          (response.remainingCalls ? `; ${response.remainingCalls} calls remaining` : ""),
      );
    } catch (error) {
      if (!request.optional) throw error;
      console.warn(`[cfb:fetch-data] optional ${request.name} unavailable: ${(error as Error).message}`);
    }
  }

  for (const file of pending) writeAtomic(resolve(RAW_DIR, `${file.name}.json`), file.text);
  writeAtomic(
    resolve(RAW_DIR, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: "jkb-cfbd-raw-cache-v1",
        provider: "CollegeFootballData.com API v2",
        authentication: "Bearer CFBD_API_KEY (credential not stored)",
        fetchedAt,
        files: manifestFiles,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[cfb:fetch-data] wrote ${pending.length} bulk-response caches to ${RAW_DIR}`);
}

main().catch((error) => {
  console.error(`[cfb:fetch-data] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
