import assert from "node:assert/strict";
import test from "node:test";
import { createMlbXPollPlan, PollPlanState } from "./mlb-x-poll-plan.mjs";
import { ReadinessStatus } from "./mlb-x-readiness.mjs";

const ready = { ready: true, finalStatus: ReadinessStatus.READY_CONFIRMED_SELECTIONS };
const waiting = { ready: false, finalStatus: ReadinessStatus.WAITING_FOR_OPPOSING_LINEUP };

test("both posted short-circuits before live data", () => {
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrPosted: true, kPosted: true });
  assert.equal(plan.bothAlreadyPosted, true);
  assert.equal(plan.shouldFetchLiveData, false);
  assert.equal(plan.hr.state, PollPlanState.POSTED);
  assert.equal(plan.k.state, PollPlanState.POSTED);
  assert.equal(plan.hr.shouldRun, false);
  assert.equal(plan.k.shouldRun, false);
});

test("HR ready and K waiting", () => {
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrReadiness: ready, kReadiness: waiting });
  assert.equal(plan.hr.state, PollPlanState.READY);
  assert.equal(plan.hr.shouldRun, true);
  assert.equal(plan.k.state, PollPlanState.WAITING);
  assert.equal(plan.k.shouldRun, false);
});

test("K ready and HR already posted", () => {
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrPosted: true, kReadiness: ready });
  assert.equal(plan.hr.state, PollPlanState.POSTED);
  assert.equal(plan.k.state, PollPlanState.READY);
  assert.equal(plan.k.shouldRun, true);
});

test("both ready", () => {
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrReadiness: ready, kReadiness: ready });
  assert.equal(plan.hr.shouldRun, true);
  assert.equal(plan.k.shouldRun, true);
});

test("neither ready", () => {
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrReadiness: waiting, kReadiness: waiting });
  assert.equal(plan.hr.state, PollPlanState.WAITING);
  assert.equal(plan.k.state, PollPlanState.WAITING);
});

test("expired slate", () => {
  const expired = { ready: false, finalStatus: ReadinessStatus.SKIPPED_AFTER_CUTOFF };
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrReadiness: expired, kReadiness: expired });
  assert.equal(plan.hr.state, PollPlanState.EXPIRED);
  assert.equal(plan.k.state, PollPlanState.EXPIRED);
});

test("no games", () => {
  const noGames = { ready: false, finalStatus: ReadinessStatus.SKIPPED_NO_GAMES };
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrReadiness: noGames, kReadiness: noGames });
  assert.equal(plan.hr.state, PollPlanState.NO_GAMES);
  assert.equal(plan.k.state, PollPlanState.NO_GAMES);
});

test("source failure", () => {
  const failed = { ready: false, finalStatus: ReadinessStatus.FAILED_CONFIRMATION_SOURCE };
  const plan = createMlbXPollPlan({ slateDate: "2026-07-12", hrReadiness: failed, kReadiness: failed });
  assert.equal(plan.hr.state, PollPlanState.SOURCE_FAILURE);
  assert.equal(plan.k.state, PollPlanState.SOURCE_FAILURE);
  assert.equal(plan.hr.shouldRun, false);
  assert.equal(plan.k.shouldRun, false);
});
