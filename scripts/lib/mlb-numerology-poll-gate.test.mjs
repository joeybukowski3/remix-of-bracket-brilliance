/**
 * mlb-numerology-poll-gate.test.mjs
 * Run via: node --test scripts/lib/mlb-numerology-poll-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createNumerologyPollPlan,
  getNumerologyDeliveryState,
  resolveNumerologyPollReadiness,
} from "./mlb-numerology-poll-gate.mjs";
import { ReadinessStatus } from "./mlb-x-readiness.mjs";
import { computeNumerologySlateTiming } from "./mlb-x-slate-timing.mjs";

const SLATE_DATE = "2026-07-20";
const NOW = new Date("2026-07-20T18:00:00.000Z"); // 2:00 PM ET (EDT)
const FIRST_PITCH = new Date("2026-07-20T19:30:00.000Z"); // 90 min out -- POLLING phase (120-75)

function buildSnapshot({
  now = NOW,
  firstPitch = FIRST_PITCH,
  ok = true,
  confirmedBatters = [{ id: 101, name: "Confirmed Player", battingOrder: 1 }],
} = {}) {
  const timing = computeNumerologySlateTiming({
    games: [{ gameDate: firstPitch.toISOString(), status: { detailedState: "Scheduled" } }],
    now,
    slateDate: SLATE_DATE,
  });
  return {
    ok,
    slateDate: SLATE_DATE,
    asOf: now.toISOString(),
    timing,
    games: [
      {
        gamePk: 1,
        started: false,
        excluded: false,
        awayAbbr: "NYY",
        homeAbbr: "BOS",
        awayStarter: { id: null, name: null },
        homeStarter: { id: null, name: null },
        awayLineup: { confirmed: true, batters: confirmedBatters },
        homeLineup: { confirmed: false, batters: [] },
      },
    ],
  };
}

function play(overrides = {}) {
  return { player: "Test Player", team: "NYY", opponent: "BOS", numerologyScore: 70, ...overrides };
}

describe("resolveNumerologyPollReadiness", () => {
  it("is not ready during POLLING with no confirmed plays", () => {
    const { readiness } = resolveNumerologyPollReadiness({ plays: [play()], snapshot: buildSnapshot() });
    assert.equal(readiness.ready, false);
  });

  it("is ready during POLLING (before the 75-minute target) only once a full table of 5 is confirmed early", () => {
    const snapshot = buildSnapshot();
    const onePlay = resolveNumerologyPollReadiness({
      plays: [play({ player: "Confirmed Player", playerId: 101 })],
      snapshot,
    });
    assert.equal(onePlay.selection.confirmedCount, 1);
    assert.equal(onePlay.readiness.ready, false, "a single confirmed play should keep waiting before the 75-minute target");

    const fiveBatterSnapshot = buildSnapshot({
      confirmedBatters: [1, 2, 3, 4, 5].map((n) => ({ id: 100 + n, name: `Confirmed Player ${n}`, battingOrder: n })),
    });
    const fivePlays = resolveNumerologyPollReadiness({
      plays: [1, 2, 3, 4, 5].map((n) => play({ player: `Confirmed Player ${n}`, playerId: 100 + n })),
      snapshot: fiveBatterSnapshot,
    });
    assert.equal(fivePlays.selection.confirmedCount, 5);
    assert.equal(fivePlays.readiness.ready, true);
    assert.equal(fivePlays.readiness.finalStatus, ReadinessStatus.READY_CONFIRMED_SELECTIONS);
  });

  it("fails closed when the confirmation source itself failed", () => {
    const { readiness } = resolveNumerologyPollReadiness({ plays: [play()], snapshot: buildSnapshot({ ok: false }) });
    assert.equal(readiness.ready, false);
    assert.equal(readiness.finalStatus, ReadinessStatus.FAILED_CONFIRMATION_SOURCE);
  });

  it("skips cleanly with zero confirmed plays once past the 30-minute cutoff (expired)", () => {
    // 20 minutes before first pitch -- past NUMEROLOGY_FINAL_CUTOFF_MINUTES (30).
    const nearCutoff = new Date(FIRST_PITCH.getTime() - 20 * 60_000);
    const snapshot = buildSnapshot({ now: nearCutoff });
    const { readiness } = resolveNumerologyPollReadiness({ plays: [play()], snapshot });
    assert.equal(readiness.ready, false);
    assert.equal(readiness.finalStatus, ReadinessStatus.SKIPPED_AFTER_CUTOFF);
  });

  it("posts whatever is confirmed (below the 5-target) once past the 75-minute target", () => {
    // 50 minutes before first pitch -- inside the 75-30 "post what's confirmed" window.
    const pastTarget = new Date(FIRST_PITCH.getTime() - 50 * 60_000);
    const snapshot = buildSnapshot({ now: pastTarget });
    const { readiness, selection } = resolveNumerologyPollReadiness({
      plays: [play({ player: "Confirmed Player", playerId: 101 })],
      snapshot,
    });
    assert.equal(selection.confirmedCount, 1);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.selectedCount, 1);
  });
});

describe("createNumerologyPollPlan", () => {
  it("shouldRun is true only when readiness.ready is true and nothing was already delivered", () => {
    const readyPlan = createNumerologyPollPlan({
      slateDate: SLATE_DATE,
      alreadyDelivered: false,
      readiness: { ready: true, finalStatus: ReadinessStatus.READY_CONFIRMED_SELECTIONS },
    });
    assert.equal(readyPlan.numerology.shouldRun, true);

    const alreadyDeliveredPlan = createNumerologyPollPlan({
      slateDate: SLATE_DATE,
      alreadyDelivered: true,
      readiness: { ready: true, finalStatus: ReadinessStatus.READY_CONFIRMED_SELECTIONS },
    });
    assert.equal(alreadyDeliveredPlan.numerology.shouldRun, false);
    assert.equal(alreadyDeliveredPlan.numerology.reason, ReadinessStatus.SKIPPED_ALREADY_POSTED_TODAY);
  });
});

describe("getNumerologyDeliveryState", () => {
  it("reports independent x/email delivery state -- neither implies the other", () => {
    const state = getNumerologyDeliveryState({
      slateDate: SLATE_DATE,
      xStateDir: ".cache/mlb-numerology-x-posted",
      emailReceiptPath: "public/data/mlb/numerology/email-send-state.json",
      exists: () => true, // X delivered
      readEmailReceipt: () => null, // email not delivered
    });
    assert.equal(state.xDelivered, true);
    assert.equal(state.emailDelivered, false);
    assert.equal(state.bothDelivered, false);
  });

  it("bothDelivered is true only when both independent receipts are valid", () => {
    const state = getNumerologyDeliveryState({
      slateDate: SLATE_DATE,
      xStateDir: ".cache/mlb-numerology-x-posted",
      emailReceiptPath: "public/data/mlb/numerology/email-send-state.json",
      exists: () => true,
      readEmailReceipt: () => ({
        date: SLATE_DATE,
        subject: `MLB Numerology Plays — ${SLATE_DATE}`,
        result: "sent",
        sentAt: "2026-07-20T18:00:00.000Z",
      }),
    });
    assert.equal(state.bothDelivered, true);
  });
});
