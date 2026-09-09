import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { refreshTouchdownContextCache } from "./refresh-nfl-touchdown-context-cache.mjs";
import { TOUCHDOWN_PBP_COLUMNS } from "./lib/nfl-touchdown-context-core.mjs";

const roots = [];
test.afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "jkb-td-context-"));
  roots.push(root);
  return root;
}

function publishedResponse(season, omittedColumn = null) {
  const columns = TOUCHDOWN_PBP_COLUMNS.filter((column) => column !== omittedColumn);
  const row = Object.fromEntries(columns.map((column) => [column, ""]));
  Object.assign(row, {
    game_id: `${season}_01_AAA_BBB`, play_id: "10", drive: "1", season: String(season), season_type: "REG", week: "1",
    posteam: "AAA", defteam: "BBB", yardline_100: "5", rush: "1", pass: "0", play_type: "run", two_point_attempt: "0",
    qb_kneel: "0", qb_spike: "0", rusher_player_id: "00-1", rusher_player_name: "Runner", rush_touchdown: "1", pass_touchdown: "0",
  });
  const csv = `${columns.join(",")}\n${columns.map((column) => row[column]).join(",")}\n`;
  return new Response(gzipSync(csv), { status: 200 });
}

async function writeResults(root, season, results = []) {
  const dir = path.join(root, "public", "data", "nfl", String(season));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "results.json"), `${JSON.stringify({ results })}\n`, "utf8");
}

test("publishes a successful historical season with its exact nflverse URL", async () => {
  const root = await tempRoot();
  const requested = [];
  const manifest = await refreshTouchdownContextCache({
    root, seasons: [2025], currentSeason: 2026, log: () => {},
    fetchImpl: async (url) => { requested.push(url); return publishedResponse(2025); },
  });
  assert.deepEqual(requested, ["https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2025.csv.gz"]);
  assert.equal(manifest.sources[0].sourceState, "available");
  assert.equal(manifest.sources[0].compactRows, 1);
  assert.match(await readFile(path.join(root, "data/nfl/nflverse/touchdown-context/touchdown_context_2025.csv"), "utf8"), /00-1/);
});

test("records a legitimate current-season 404 without invalidating historical cache", async () => {
  const root = await tempRoot();
  await writeResults(root, 2026);
  const outputDir = path.join(root, "data/nfl/nflverse/touchdown-context");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "touchdown_context_2026.csv"), "stale-current-season-data\n", "utf8");
  const requested = [];
  const manifest = await refreshTouchdownContextCache({
    root, seasons: [2025, 2026], currentSeason: 2026, log: () => {},
    fetchImpl: async (url) => {
      requested.push(url);
      return url.includes("2025") ? publishedResponse(2025) : new Response(null, { status: 404 });
    },
  });
  assert.equal(requested[1], "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv.gz");
  assert.deepEqual(manifest.sources.map((source) => source.sourceState), ["available", "unavailable"]);
  assert.equal(manifest.sources[1].completedRegularSeasonGames, 0);
  assert.equal(manifest.sources[1].compactRows, 0);
  assert.match(await readFile(path.join(root, "data/nfl/nflverse/touchdown-context/touchdown_context_2025.csv"), "utf8"), /00-1/);
  await assert.rejects(readFile(path.join(root, "data/nfl/nflverse/touchdown-context/touchdown_context_2026.csv"), "utf8"), /ENOENT/);
});

test("unexpected non-404 errors fail before publishing any partial success", async () => {
  const root = await tempRoot();
  const outputDir = path.join(root, "data/nfl/nflverse/touchdown-context");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "touchdown_context_2025.csv"), "known-good-historical-cache\n", "utf8");
  await assert.rejects(refreshTouchdownContextCache({
    root, seasons: [2025, 2026], currentSeason: 2026, log: () => {},
    fetchImpl: async (url) => url.includes("2025") ? publishedResponse(2025) : new Response(null, { status: 503 }),
  }), /503.*play_by_play_2026/);
  assert.equal(await readFile(path.join(outputDir, "touchdown_context_2025.csv"), "utf8"), "known-good-historical-cache\n");
});

test("a current-season 404 fails closed once a regular-season game is complete", async () => {
  const root = await tempRoot();
  await writeResults(root, 2026, [{ seasonType: "REG", final: true }]);
  await assert.rejects(refreshTouchdownContextCache({
    root, seasons: [2026], currentSeason: 2026, log: () => {}, fetchImpl: async () => new Response(null, { status: 404 }),
  }), /after 1 completed regular-season games/);
});

test("malformed published data still fails schema validation", async () => {
  const root = await tempRoot();
  await assert.rejects(refreshTouchdownContextCache({
    root, seasons: [2025], currentSeason: 2026, log: () => {}, fetchImpl: async () => publishedResponse(2025, "play_type"),
  }), /schema missing required columns: play_type/);
});

test("manifest and source-state output is deterministic", async () => {
  const firstRoot = await tempRoot();
  const secondRoot = await tempRoot();
  await Promise.all([writeResults(firstRoot, 2026), writeResults(secondRoot, 2026)]);
  for (const root of [firstRoot, secondRoot]) await refreshTouchdownContextCache({
    root, seasons: [2026, 2025, 2025], currentSeason: 2026, log: () => {},
    fetchImpl: async (url) => url.includes("2025") ? publishedResponse(2025) : new Response(null, { status: 404 }),
  });
  const relative = "data/nfl/nflverse/touchdown-context/manifest.json";
  assert.equal(await readFile(path.join(firstRoot, relative), "utf8"), await readFile(path.join(secondRoot, relative), "utf8"));
  assert.deepEqual(JSON.parse(await readFile(path.join(firstRoot, relative), "utf8")).requestedSeasons, [2025, 2026]);
});
