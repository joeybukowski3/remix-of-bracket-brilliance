import assert from "node:assert/strict";
import test from "node:test";
import {
  countScheduledGames,
  inspectMlbSlate,
  resolveEasternSlateDate,
  runSlateGate,
} from "./mlb-slate-gate.mjs";

const DATE = "2026-07-13";

test("empty dates is a confirmed successful blank slate", async () => {
  const { result, outputs } = await runWithPayload({ dates: [] });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(outputs, {
    has_games: "false",
    game_count: "0",
    slate_date: DATE,
    reason: "No MLB games scheduled",
  });
});

test("a date object with no games is a confirmed successful blank slate", async () => {
  const { result } = await runWithPayload({ dates: [{ date: DATE, games: [] }] });
  assert.equal(result.exitCode, 0);
  assert.equal(result.hasGames, "false");
  assert.equal(result.gameCount, "0");
});

test("one returned game enables normal generation", async () => {
  const result = await inspectMlbSlate({
    explicitDate: DATE,
    fetchImpl: async () => response({ dates: [{ games: [{ gamePk: 1 }] }] }),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.hasGames, "true");
  assert.equal(result.gameCount, "1");
});

test("multiple returned games are all counted regardless of status", async () => {
  const payload = { dates: [{ games: [
    { gamePk: 1, status: { detailedState: "Scheduled" } },
    { gamePk: 2, status: { detailedState: "Postponed" } },
    { gamePk: 3, status: { detailedState: "Cancelled" } },
  ] }] };
  assert.equal(countScheduledGames(payload), 3);
  const result = await inspectMlbSlate({ explicitDate: DATE, fetchImpl: async () => response(payload) });
  assert.equal(result.hasGames, "true");
  assert.equal(result.gameCount, "3");
});

test("an explicit date is validated and used in the Stats API request", async () => {
  let requestedUrl = "";
  const result = await inspectMlbSlate({
    explicitDate: "2026-12-25",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return response({ dates: [] });
    },
  });
  assert.equal(result.slateDate, "2026-12-25");
  assert.equal(requestedUrl, "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-12-25");
});

test("the default date resolves in Eastern Time across a UTC boundary", () => {
  assert.equal(resolveEasternSlateDate(new Date("2026-07-14T02:30:00Z")), "2026-07-13");
  assert.equal(resolveEasternSlateDate(new Date("2026-07-14T05:00:00Z")), "2026-07-14");
});

test("an HTTP error fails safely and is not reported as blank", async () => {
  const { result, outputs } = await runWithFetch(async () => ({ ok: false, status: 503 }));
  assert.equal(result.exitCode, 1);
  assert.equal(outputs.has_games, "unknown");
  assert.equal(outputs.game_count, "unknown");
  assert.equal(outputs.reason, "Schedule request failed");
});

test("malformed JSON fails safely and is not reported as blank", async () => {
  const { result } = await runWithFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError("Unexpected token"); },
  }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.hasGames, "unknown");
  assert.match(result.detail, /malformed JSON/);
});

test("a contradictory schedule shape fails instead of becoming a blank slate", async () => {
  const { result } = await runWithPayload({ totalGames: 1, dates: [] });
  assert.equal(result.exitCode, 1);
  assert.equal(result.hasGames, "unknown");
  assert.match(result.detail, /ambiguous total game count/);
});

test("a timed-out request fails safely and is not reported as blank", async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const { result } = await runWithFetch(fetchImpl, 5);
  assert.equal(result.exitCode, 1);
  assert.equal(result.hasGames, "unknown");
  assert.equal(result.reason, "Schedule request failed");
});

async function runWithPayload(payload) {
  return runWithFetch(async () => response(payload));
}

async function runWithFetch(fetchImpl, timeoutMs = 100) {
  const outputs = {};
  const result = await runSlateGate({
    args: ["--date", DATE],
    fetchImpl,
    timeoutMs,
    emitOutput: (key, value) => { outputs[key] = value; },
    log: () => {},
    logError: () => {},
  });
  return { result, outputs };
}

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
}
