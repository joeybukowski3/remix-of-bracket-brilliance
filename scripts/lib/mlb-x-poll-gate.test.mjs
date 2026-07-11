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

function saveReceipt(stateDir, key) {
  const file = getDuplicateStatePath(key, stateDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "{}\n");
}

test("both receipts short-circuit before schedule, boxscore, or HR data fetch", async () => {
  const state = tempState();
  try {
    saveReceipt(state.hr, `mlb-hr-props:${SLATE_DATE}`);
    saveReceipt(state.k, `mlb-k-props:${SLATE_DATE}`);
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
