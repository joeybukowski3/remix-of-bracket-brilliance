import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildConfirmationSnapshot } from "./mlb-x-confirmation-snapshot.mjs";
import { getDuplicateStatePath } from "./mlb-x-daily-lock.mjs";
import { createSharedMlbXPollPlan } from "./mlb-x-poll-gate.mjs";
import { PollPlanState } from "./mlb-x-poll-plan.mjs";

const NOW = new Date("2026-07-12T16:00:00.000Z");
const SLATE_DATE = "2026-07-12";
const GAME_DATE = "2026-07-12T17:20:00.000Z";

function schedule() {
  return {
    dates: [{ games: [{
      gamePk: 123,
      gameDate: GAME_DATE,
      status: { abstractGameState: "Preview", detailedState: "Scheduled" },
      teams: {
        away: { team: { abbreviation: "NYY" }, probablePitcher: { id: 11, fullName: "Away Starter" } },
        home: { team: { abbreviation: "BOS" }, probablePitcher: { id: 22, fullName: "Home Starter" } },
      },
    }] }],
  };
}

function boxscore({ confirmed = true } = {}) {
  const ids = confirmed ? Array.from({ length: 9 }, (_, index) => index + 1) : [];
  const team = {
    battingOrder: ids,
    players: Object.fromEntries(ids.map((id) => [`ID${id}`, { person: { fullName: id === 1 ? "Aaron Judge" : `Player ${id}` } }])),
  };
  return { teams: { away: team, home: team } };
}

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => value };
}

function tempState() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mlb-x-poll-"));
  return { root, hr: path.join(root, "hr"), k: path.join(root, "k") };
}

function saveReceipt(stateDir, key, content = {}) {
  const file = getDuplicateStatePath(key, stateDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(content)}\n`);
}

test("both receipts short-circuit before schedule, boxscore, or HR data fetch", async () => {
  const state = tempState();
  try {
    saveReceipt(state.hr, `mlb-hr-props:${SLATE_DATE}`);
    // K is only "fully posted" (short-circuit eligible) once both the main
    // tweet AND its self-reply are recorded -- see getPollReceiptState.
    saveReceipt(state.k, `mlb-k-props:${SLATE_DATE}`, { tweetId: "111", replyTweetId: "222" });
    let fetchCount = 0;
    const result = await createSharedMlbXPollPlan({
      now: NOW,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => { throw new Error("must not build snapshot"); },
      loadHrRaw: async () => { fetchCount++; return {}; },
    });
    assert.equal(fetchCount, 0);
    assert.equal(result.snapshot, null);
    assert.equal(result.plan.bothAlreadyPosted, true);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test("one schedule and one boxscore create the shared snapshot consumed by HR and K readiness", async () => {
  const state = tempState();
  const calls = [];
  try {
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes("/schedule?")) return jsonResponse(schedule());
      if (String(url).includes("/game/123/boxscore")) return jsonResponse(boxscore());
      throw new Error(`Unexpected URL ${url}`);
    };
    const result = await createSharedMlbXPollPlan({
      now: NOW,
      hrStateDir: state.hr,
      kStateDir: state.k,
      fetchImpl,
      buildSnapshot: (options) => buildConfirmationSnapshot(options),
      loadHrRaw: async () => ({
        date: SLATE_DATE,
        batters: [{ player: "Aaron Judge", playerId: 1, team: "NYY", lineupStatus: "confirmed", battingOrder: 1, hrScore: 99 }],
      }),
    });
    assert.equal(calls.filter((url) => url.includes("/schedule?")).length, 1);
    assert.equal(calls.filter((url) => url.includes("/boxscore")).length, 1);
    assert.equal(result.snapshot.games.length, 1);
    assert.equal(result.plan.hr.state, PollPlanState.WAITING);
    assert.equal(result.plan.k.state, PollPlanState.READY);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test("a posted HR side is independent while K remains eligible", async () => {
  const state = tempState();
  try {
    saveReceipt(state.hr, `mlb-hr-props:${SLATE_DATE}`);
    const snapshot = {
      ok: true,
      timing: { hasGames: true, phase: "PREFERRED", isFinalCutoff: false, isExpired: false, allGamesStarted: false },
      games: [{ started: false, excluded: false, awayStarter: { id: 1 }, homeStarter: { id: 2 }, awayLineup: { confirmed: true }, homeLineup: { confirmed: true } }],
    };
    const result = await createSharedMlbXPollPlan({
      now: NOW,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => snapshot,
      loadHrRaw: async () => { throw new Error("posted HR must not load data"); },
    });
    assert.equal(result.plan.hr.state, PollPlanState.POSTED);
    assert.equal(result.plan.k.shouldRun, true);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test("a K receipt with a main tweet but no reply does NOT short-circuit -- the plan keeps K eligible to recover the missing reply", async () => {
  const state = tempState();
  try {
    // HR already fully posted too (existence-based, no reply concept for
    // HR) so this test isolates K's reply-pending behavior specifically.
    saveReceipt(state.hr, `mlb-hr-props:${SLATE_DATE}`);
    saveReceipt(state.k, `mlb-k-props:${SLATE_DATE}`, { tweetId: "111", replyTweetId: null });
    const result = await createSharedMlbXPollPlan({
      now: NOW,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => ({ ok: true, timing: { hasGames: true, phase: "EXPIRED", isExpired: true, isFinalCutoff: false, allGamesStarted: true }, games: [] }),
      loadHrRaw: async () => { throw new Error("HR is already posted, must not fetch"); },
    });
    // Not the "both fully posted" short-circuit -- K's reply-pending state
    // alone is enough to keep the plan doing live work.
    assert.equal(result.plan.bothAlreadyPosted, false);
    assert.equal(result.plan.hr.state, PollPlanState.POSTED);
    // K is ready to recover the reply EVEN THOUGH normal K market timing
    // (EXPIRED) would otherwise never be ready for a fresh post.
    assert.equal(result.plan.k.shouldRun, true);
    assert.equal(result.plan.k.reason, "READY_REPLY_RECOVERY");
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test("a K receipt with both main tweet and reply IS fully posted -- normal short-circuit resumes", async () => {
  const state = tempState();
  try {
    saveReceipt(state.hr, `mlb-hr-props:${SLATE_DATE}`);
    saveReceipt(state.k, `mlb-k-props:${SLATE_DATE}`, { tweetId: "111", replyTweetId: "222" });
    const result = await createSharedMlbXPollPlan({
      now: NOW,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => { throw new Error("must not build snapshot"); },
      loadHrRaw: async () => { throw new Error("must not fetch HR raw"); },
    });
    assert.equal(result.plan.bothAlreadyPosted, true);
    assert.equal(result.plan.k.state, PollPlanState.POSTED);
    assert.equal(result.plan.k.shouldRun, false);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test("K's 11:00 AM ET earliest-post guard blocks the plan before the floor, even with confirmed starters/lineups", async () => {
  const state = tempState();
  const beforeFloor = new Date("2026-07-17T14:59:00.000Z"); // 10:59 AM EDT
  const atFloor = new Date("2026-07-17T15:00:00.000Z"); // 11:00 AM EDT
  const snapshot = {
    ok: true,
    timing: { hasGames: true, phase: "PREFERRED", isFinalCutoff: false, isExpired: false, allGamesStarted: false },
    games: [{ started: false, excluded: false, awayStarter: { id: 1 }, homeStarter: { id: 2 }, awayLineup: { confirmed: true }, homeLineup: { confirmed: true } }],
  };
  try {
    const before = await createSharedMlbXPollPlan({
      now: beforeFloor,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => snapshot,
      loadHrRaw: async () => ({ date: "2026-07-17", batters: [] }),
    });
    assert.equal(before.plan.k.shouldRun, false);
    assert.equal(before.plan.k.reason, "WAITING_FOR_EARLIEST_POST_TIME");

    const at = await createSharedMlbXPollPlan({
      now: atFloor,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => snapshot,
      loadHrRaw: async () => ({ date: "2026-07-17", batters: [] }),
    });
    assert.equal(at.plan.k.shouldRun, true);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test("HR is entirely unaffected by K's earliest-post guard, before or after 11:00 AM ET", async () => {
  const state = tempState();
  const beforeFloor = new Date("2026-07-17T14:59:00.000Z");
  try {
    saveReceipt(state.k, `mlb-k-props:2026-07-17`, { tweetId: "111", replyTweetId: "222" }); // K fully posted, isolate HR
    const result = await createSharedMlbXPollPlan({
      now: beforeFloor,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => ({ ok: true, timing: { hasGames: true, phase: "PREFERRED", isFinalCutoff: false, isExpired: false, allGamesStarted: false }, games: [] }),
      loadHrRaw: async () => ({
        date: "2026-07-17",
        batters: Array.from({ length: 18 }, (_, i) => ({ player: `P${i}`, team: i < 9 ? "BOS" : "TB", gameId: 1, lineupStatus: "confirmed", battingOrder: (i % 9) + 1, hrScore: 50 - i })),
      }),
    });
    // HR readiness is governed purely by its own first-pitch-relative gate,
    // never by K's 11:00 AM floor.
    assert.equal(result.plan.hr.reason !== "WAITING_FOR_EARLIEST_POST_TIME", true);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test("snapshot source failure fails both sides closed", async () => {
  const state = tempState();
  try {
    const result = await createSharedMlbXPollPlan({
      now: NOW,
      hrStateDir: state.hr,
      kStateDir: state.k,
      buildSnapshot: async () => ({ ok: false, timing: { hasGames: false }, games: [] }),
      loadHrRaw: async () => ({ date: SLATE_DATE, batters: [] }),
    });
    assert.equal(result.plan.hr.state, PollPlanState.SOURCE_FAILURE);
    assert.equal(result.plan.k.state, PollPlanState.SOURCE_FAILURE);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});
