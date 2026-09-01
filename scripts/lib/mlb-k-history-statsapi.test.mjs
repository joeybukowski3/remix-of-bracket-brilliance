import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { acquireMlbKHistoryStatsApi, MLB_STATS_API } from "./mlb-k-history-statsapi.mjs";

const temporaryDirectories = [];
const RANGE = { startDate: "2025-04-01", endDate: "2025-04-07" };

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function schedulePayload() {
  const team = (id, name) => ({ team: { id, name } });
  const game = (gamePk, status, extras = {}) => ({
    gamePk,
    gameType: "R",
    officialDate: extras.officialDate ?? "2025-04-01",
    gameDate: `${extras.officialDate ?? "2025-04-01"}T17:00:00Z`,
    status: {
      detailedState: status,
      codedGameState: status === "Final" ? "F" : "D",
      // StatsAPI can report abstract Final for a postponed entry after the
      // rescheduled game has completed; that must not make this entry final.
      abstractGameState: status === "Final" || extras.abstractFinal ? "Final" : "Preview",
    },
    teams: { away: team(extras.awayId ?? 1, extras.away ?? "Away"), home: team(extras.homeId ?? 2, extras.home ?? "Home") },
    venue: { id: 10, name: "Test Park" },
    doubleHeader: extras.doubleHeader ?? "N",
    gameNumber: extras.gameNumber ?? 1,
  });
  return {
    dates: [
      { date: "2025-04-01", games: [game(1001, "Final"), game(1002, "Postponed", { awayId: 3, homeId: 4 })] },
      { date: "2025-04-05", games: [game(1003, "Final", { officialDate: "2025-04-05", doubleHeader: "Y", gameNumber: 2 })] },
    ],
  };
}

function pitcherPlayer(id, name, pitching) {
  return { person: { id, fullName: name }, stats: { pitching: { gamesStarted: 1, ...pitching } } };
}

function boxscore(gameId) {
  const missingPitchCount = gameId === 1003;
  const starter = (id, name, strikeOuts) => pitcherPlayer(id, name, {
    inningsPitched: "5.2",
    strikeOuts,
    battersFaced: 23,
    numberOfPitches: missingPitchCount && id === 13 ? null : 91,
    baseOnBalls: 2,
    hits: 5,
  });
  const offset = gameId === 1001 ? 10 : 12;
  return {
    teams: {
      away: {
        team: { id: 1 },
        teamStats: { batting: { plateAppearances: 38, strikeOuts: 9, baseOnBalls: 3, hits: 8 } },
        players: { [`ID${offset + 1}`]: starter(offset + 1, `Pitcher ${offset + 1}`, 6) },
      },
      home: {
        team: { id: 2 },
        teamStats: { batting: { plateAppearances: 36, strikeOuts: 7, baseOnBalls: 4, hits: 7 } },
        players: { [`ID${offset + 2}`]: starter(offset + 2, `Pitcher ${offset + 2}`, 5) },
      },
    },
  };
}

function peoplePayload(url) {
  const ids = new URL(url).searchParams.get("personIds").split(",").map(Number);
  return { people: ids.map((id) => ({ id, fullName: `Pitcher ${id}`, pitchHand: { code: id % 2 ? "R" : "L" } })) };
}

function fakeFetch({ failBoxscore = null, attempts = new Map(), schedule = schedulePayload() } = {}) {
  return async (url) => {
    attempts.set(url, (attempts.get(url) ?? 0) + 1);
    if (url.startsWith(`${MLB_STATS_API}/schedule?`)) return response(schedule);
    if (url === `${MLB_STATS_API}/game/${failBoxscore}/boxscore`) return response({ error: "temporary" }, 503);
    const boxscoreMatch = url.match(/\/game\/(\d+)\/boxscore$/);
    if (boxscoreMatch) return response(boxscore(Number(boxscoreMatch[1])));
    if (url.startsWith(`${MLB_STATS_API}/people?`)) return response(peoplePayload(url));
    return response({ error: "unexpected URL" }, 404);
  };
}

function outputRoot() {
  const root = path.join(tmpdir(), `mlb-k-statsapi-${process.pid}-${Date.now()}-${temporaryDirectories.length}`);
  temporaryDirectories.push(root);
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("acquireMlbKHistoryStatsApi", () => {
  it("acquires a deterministic seven-day corpus with final games, doubleheaders, outcomes, team totals, and pitcher metadata", async () => {
    const result = await acquireMlbKHistoryStatsApi({
      ...RANGE,
      outputRoot: outputRoot(),
      fetchImpl: fakeFetch(),
      now: () => new Date("2026-09-01T12:00:00Z"),
      backoffMs: 1,
    });
    assert.equal(result.status, "complete");
    assert.equal(result.scheduledGameCount, 3);
    assert.equal(result.uniqueScheduledGameCount, 3);
    assert.equal(result.completedGameCount, 2);
    assert.equal(result.uniqueCompletedGameCount, 2);
    assert.equal(result.boxscoresAcquired, 2);
    assert.equal(result.uniqueStartingPitchers, 4);
    assert.equal(result.startingPitcherRows, 4);
    assert.equal(result.rowsWithActualK_BF_IP_PitchCount, 3);
    assert.deepEqual(result.postponedGames, [1002]);
    assert.deepEqual(result.doubleheaderGames, [1003]);
    assert.deepEqual(result.duplicateGameIds, []);
    assert.equal(result.failedRequests.length, 0);
    assert.equal(result.missingFields.actualPitchCount, 1);
    assert.equal(result.missingFields.pitcherHand, 0);
    const normalized = JSON.parse(readFileSync(path.join(result.runDirectory, "normalized-outcomes.json"), "utf8"));
    assert.deepEqual(normalized.games.map((game) => game.gameId), [1001, 1003]);
    assert.equal(normalized.games[0].teamBattingTotals.away.plateAppearances, 38);
    assert.equal(normalized.games[0].startingPitchers[0].pitcherHand, "R");
  });

  it("keeps raw schedule-entry counts while normalizing one completed outcome per gamePk", async () => {
    const schedule = schedulePayload();
    const completed = schedule.dates[0].games[0];
    schedule.dates.unshift({
      date: "2025-03-31",
      games: [{
        ...completed,
        gameDate: "2025-03-31T17:00:00Z",
        status: { detailedState: "Postponed", codedGameState: "D", abstractGameState: "Final" },
      }],
    });
    schedule.dates[1].games[1].status.abstractGameState = "Final";
    const attempts = new Map();
    const result = await acquireMlbKHistoryStatsApi({
      ...RANGE,
      outputRoot: outputRoot(),
      fetchImpl: fakeFetch({ schedule, attempts }),
      backoffMs: 1,
    });
    const normalized = JSON.parse(readFileSync(path.join(result.runDirectory, "normalized-outcomes.json"), "utf8"));
    assert.equal(result.scheduledGameCount, 4);
    assert.equal(result.uniqueScheduledGameCount, 3);
    assert.equal(result.completedGameCount, 2);
    assert.equal(result.uniqueCompletedGameCount, 2);
    assert.deepEqual(result.duplicateGameIds, [1001]);
    assert.deepEqual(normalized.games.map((game) => game.gameId), [1001, 1003]);
    assert.equal(normalized.games[0].status, "Final");
    assert.equal(attempts.get(`${MLB_STATS_API}/game/1001/boxscore`), 1);
    assert.equal(attempts.has(`${MLB_STATS_API}/game/1002/boxscore`), false);
  });

  it("resumes by hash-verifying and skipping every already acquired provider file", async () => {
    const root = outputRoot();
    const first = await acquireMlbKHistoryStatsApi({ ...RANGE, outputRoot: root, fetchImpl: fakeFetch(), backoffMs: 1 });
    const normalizedBefore = readFileSync(path.join(first.runDirectory, "normalized-outcomes.json"), "utf8");
    const second = await acquireMlbKHistoryStatsApi({
      ...RANGE,
      outputRoot: root,
      fetchImpl: async () => { throw new Error("network should not be called"); },
      backoffMs: 1,
    });
    assert.equal(second.status, "complete");
    assert.equal(second.totalRequests, 0);
    assert.equal(second.skippedVerifiedFiles, 4);
    assert.equal(readFileSync(path.join(second.runDirectory, "normalized-outcomes.json"), "utf8"), normalizedBefore);
  });

  it("retries a previously failed schedule window without requiring deletion or a force flag", async () => {
    const root = outputRoot();
    const failed = await acquireMlbKHistoryStatsApi({
      ...RANGE,
      outputRoot: root,
      fetchImpl: async () => { throw new Error("offline"); },
      maxAttempts: 1,
      backoffMs: 1,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.totalRequests, 1);

    const retried = await acquireMlbKHistoryStatsApi({
      ...RANGE,
      outputRoot: root,
      fetchImpl: fakeFetch(),
      backoffMs: 1,
    });
    assert.equal(retried.status, "complete");
    assert.equal(retried.boxscoresAcquired, 2);
    assert.equal(JSON.parse(readFileSync(path.join(retried.runDirectory, "manifest.json"), "utf8")).status, "complete");
    assert.equal(JSON.parse(readFileSync(path.join(retried.runDirectory, "schedule.json.manifest.json"), "utf8")).status, "complete");
  });

  it("reports a partial corpus after bounded retries without discarding successful files", async () => {
    const attempts = new Map();
    const result = await acquireMlbKHistoryStatsApi({
      ...RANGE,
      outputRoot: outputRoot(),
      fetchImpl: fakeFetch({ failBoxscore: 1003, attempts }),
      maxAttempts: 2,
      backoffMs: 1,
    });
    assert.equal(result.status, "partial");
    assert.equal(result.boxscoresAcquired, 1);
    assert.equal(result.failedRequests.length, 1);
    assert.match(result.failedRequests[0].sourceUrl, /1003/);
    assert.equal(attempts.get(`${MLB_STATS_API}/game/1003/boxscore`), 2);
    assert.ok(existsSync(path.join(result.runDirectory, "boxscores", "1001.json")));
  });

  it("uses atomic writes and leaves no temporary or backup files after success", async () => {
    const result = await acquireMlbKHistoryStatsApi({ ...RANGE, outputRoot: outputRoot(), fetchImpl: fakeFetch(), backoffMs: 1 });
    const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    });
    assert.equal(walk(result.runDirectory).some((file) => /\.(?:tmp|bak)-/.test(file)), false);
  });
});
