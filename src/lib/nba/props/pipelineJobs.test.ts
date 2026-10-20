/**
 * Pregame capture and postgame settlement jobs, run offline against mock
 * providers and synthetic data. No network, no real provider, no real data.
 */
import { describe, expect, it } from "vitest";
import { captureDeps, finalResult, IMPORT_NOW, line, makeGame, MIN, mockProps, mockResults, okLines, played, quotaSetup, SYNTHETIC_LICENSES, at, TIPOFF } from "./__fixtures__/pipelineFixtures";
import { creditsPerCapture, type RequestGate } from "./pipeline/budget";
import { playerKeyOf } from "./pipeline/contracts";
import { importLinesCsv as importLinesRaw, importResultsCsv, type LineImportOptions } from "./pipeline/manualImport";
import { ODDS_SOURCE_LICENSES } from "./pipeline/oddsSources";
import { runPostgameSettlement, settleStoredResults, type PostgameDeps } from "./pipeline/postgameJob";
import { recordResultDraft } from "./pipeline/resultsRecorder";
import { runPregameCapture, type ProviderPropLine } from "./pipeline/pregameJob";
import { evEvaluations, freezePartitions, joinEvaluations, overUnderRecords } from "./pipeline/statistics";
import { MemoryPipelineStore } from "./pipeline/store";

const importLinesCsv = (text: string, options: LineImportOptions) => importLinesRaw(text, { now: IMPORT_NOW, ...options });
const GAME = makeGame();
const NOW = at(TIPOFF, 150);

const LINES: ProviderPropLine[] = [
  line({ playerName: "Sam Rivera", team: "NYK", market: "pts", line: 24.5 }),
  line({ playerName: "Lee Park", team: "BOS", market: "pts", line: 15.5, overPrice: 110, underPrice: -130 }),
  line({ playerName: "Ana Cruz", team: "BOS", market: "reb", line: 7.5 }),
];

async function storeWith(...games: ReturnType<typeof makeGame>[]) {
  const store = new MemoryPipelineStore();
  for (const g of games) await store.upsertGame(g);
  return store;
}

describe("pregame capture job", () => {
  it("refuses to run when the odds source has no recorded permission, and calls nothing", async () => {
    const store = await storeWith(GAME);
    const provider = { ...mockProps([okLines(LINES)]), sourceId: "parlayapi" as const };
    const gate: RequestGate = { accountId: "parlayapi:primary", enforcesNbaAllowance: true, reserve: async () => { throw new Error("quota gate must not be called"); } };
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW, { licenses: ODDS_SOURCE_LICENSES, gate }));
    expect(report).toMatchObject({ outcome: "blocked" });
    expect(report.reason).toMatch(/no recorded permission/);
    expect(provider.calls).toHaveLength(0);
    expect(await store.listSnapshots()).toEqual([]);
    expect(await store.acquireLock("nba-pregame-capture", "someone-else", 1000, NOW)).toBe(true); // the lock was never taken
    expect((await store.listRuns())[0]).toMatchObject({ job: "pregame-capture", outcome: "blocked" });
  });

  it("captures only inside each game's window and records an explicit marker for the rest", async () => {
    const mk = (minutes: number, away: string, home: string, extra = {}) => makeGame({ tipoffUtc: new Date(NOW.getTime() + minutes * 60_000).toISOString().replace(".000Z", "Z"), away, home, ...extra });
    const early = mk(300, "LAL", "GSW");
    const inWindow = mk(150, "MIA", "ORL");
    const late = mk(100, "DEN", "PHX");
    const missed = mk(30, "CHI", "DET");
    const postponed = mk(150, "DAL", "HOU", { status: "postponed" as const });
    const store = await storeWith(early, inWindow, late, missed, postponed);
    const provider = mockProps([okLines([line({ playerName: "Cy Young", team: "MIA" })])]);
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW));
    expect(report).toMatchObject({ outcome: "completed", considered: 5, captured: 2, waiting: 1, missed: 1 });
    expect(provider.calls.map((c) => c.sourceEventId).sort()).toEqual([inWindow.sourceEventId, late.sourceEventId].sort());
    const attempts = await store.listAttempts();
    expect(attempts.filter((a) => a.outcome === "missed_window").map((a) => a.canonicalGameKey)).toEqual([missed.canonicalGameKey]);
    expect(attempts.filter((a) => a.outcome === "postponed")).toHaveLength(1);
    const snapshots = await store.listSnapshots();
    expect(snapshots.map((s) => s.timing.window).sort()).toEqual(["in_window", "late"]);
    expect(snapshots.every((s) => s.timing.minutesToTipoff >= 45)).toBe(true);
    expect(snapshots.some((s) => s.game.canonicalGameKey === early.canonicalGameKey || s.game.canonicalGameKey === missed.canonicalGameKey)).toBe(false);
  });

  it("is idempotent: a repeat run, or another run, makes no calls and writes nothing", async () => {
    const store = await storeWith(GAME);
    const provider = mockProps([okLines(LINES)]);
    const first = await runPregameCapture(captureDeps(store, provider, () => NOW));
    expect(first).toMatchObject({ captured: 1, linesStored: 3, creditsCharged: 3 });
    const before = JSON.stringify([await store.listSnapshots(), await store.listAttempts()]);
    for (const runId of ["run-1", "run-2"]) {
      const again = await runPregameCapture(captureDeps(store, provider, () => new Date(NOW.getTime() + 20 * 60_000), { runId }));
      expect(again).toMatchObject({ outcome: "completed", captured: 0, linesStored: 0, creditsCharged: 0 });
    }
    expect(provider.calls).toHaveLength(1);
    expect(JSON.stringify([await store.listSnapshots(), await store.listAttempts()])).toBe(before);
  });

  it("retries a game whose lines are not posted yet, then gives up after the allowed tries", async () => {
    const store = await storeWith(GAME);
    const provider = mockProps([okLines([], 0), okLines([], 0), okLines(LINES)]);
    const clock = (m: number) => () => at(TIPOFF, m);
    expect(await runPregameCapture(captureDeps(store, provider, clock(170), { runId: "r1" }))).toMatchObject({ noMarket: 1, captured: 0 });
    expect(await runPregameCapture(captureDeps(store, provider, clock(110), { runId: "r2" }))).toMatchObject({ noMarket: 1 });
    expect(await runPregameCapture(captureDeps(store, provider, clock(80), { runId: "r3" }))).toMatchObject({ considered: 1, noMarket: 0, captured: 0 });
    expect(provider.calls).toHaveLength(2);
    expect(await store.listSnapshots()).toEqual([]);
    expect((await store.listAttempts()).map((a) => a.outcome)).toEqual(["no_market", "no_market"]);
  });

  it("skips an unchanged market and stores a changed one as a new snapshot", async () => {
    const store = await storeWith(GAME);
    const provider = mockProps([okLines([LINES[0], LINES[0], line({ ...LINES[0], line: 25.5 })])]);
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW));
    expect(report.linesStored).toBe(2); // the duplicate is skipped; the moved line is new
    const snapshots = await store.listSnapshots();
    expect(snapshots.map((s) => s.line).sort()).toEqual([24.5, 25.5]);
    expect(new Set(snapshots.map((s) => s.marketKey)).size).toBe(1);
  });

  it("marks a stale provider line explicitly and never treats it as an authentic line", async () => {
    const store = await storeWith(GAME);
    const provider = mockProps([okLines([line({ lastUpdateUtc: at(TIPOFF, 600).toISOString().replace(".000Z", "Z") })])]);
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW));
    expect(report).toMatchObject({ staleOnly: 1, captured: 0, staleLinesStored: 1 });
    const [s] = await store.listSnapshots();
    expect(s.freshness).toMatchObject({ status: "stale", ageMinutes: 450 });
    expect((await store.listAttempts())[0].outcome).toBe("stale_only");
  });

  it("does nothing when another run holds the lock", async () => {
    const store = await storeWith(GAME);
    await store.acquireLock("nba-pregame-capture", "other-run", 600_000, NOW);
    const provider = mockProps([okLines(LINES)]);
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW));
    expect(report.outcome).toBe("locked");
    expect(provider.calls).toHaveLength(0);
    expect(await store.listSnapshots()).toEqual([]);
  });

  it("releases its lock after a failure so the next run can proceed", async () => {
    const store = await storeWith(GAME);
    const boom = { ...mockProps([okLines(LINES)]), fetchEventProps: async () => { throw new Error("socket hang up"); } };
    const first = await runPregameCapture(captureDeps(store, boom, () => NOW));
    expect(first.outcome).toBe("completed");
    expect((await store.listAttempts())[0]).toMatchObject({ outcome: "error", creditsCharged: 3 }); // charged conservatively
    expect(await store.acquireLock("nba-pregame-capture", "next", 1000, NOW)).toBe(true);
  });

  it("stops at quota exhaustion, charges the ledger for what it spent, and defers the rest", async () => {
    const { manager, gate, plan, accountId } = await quotaSetup({ windows: [{ kind: "month", limit: 4, source: "provider-docs", resetDayOfMonth: 1 }] });
    // NOW is 150 minutes before TIPOFF, so these tip 150 and 140 minutes after NOW.
    const g1 = makeGame({ tipoffUtc: TIPOFF, away: "MIA", home: "ORL" });
    const g2 = makeGame({ tipoffUtc: at(TIPOFF, 10).toISOString().replace(".000Z", "Z"), away: "DEN", home: "PHX" });
    const store = await storeWith(g1, g2);
    const provider = mockProps([okLines([line({ playerName: "Cy Young", team: "MIA" })])]);
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW, { gate, plan }));
    expect(report).toMatchObject({ captured: 1, budgetDeferred: 1, creditsCharged: 3 });
    expect(provider.calls).toHaveLength(1);
    const attempts = await store.listAttempts();
    // The earlier tipoff (g2) is planned first and gets the only affordable capture; g1 is deferred.
    expect(attempts.find((a) => a.canonicalGameKey === g2.canonicalGameKey)).toMatchObject({ outcome: "captured", creditsCharged: 3 });
    expect(attempts.find((a) => a.canonicalGameKey === g1.canonicalGameKey)).toMatchObject({ outcome: "budget_exhausted", creditsCharged: 0 });
    const ledger = (await manager.state(accountId)).entries;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ attribution: { sport: "nba", workflow: "pregame-capture" }, actualUnits: 3, status: "settled" });
    // A deferred game keeps its tries: it can still be captured by a later run with budget.
    const later = mockProps([okLines([line({ playerName: "Dee Ray", team: "MIA" })])]);
    const retry = await runPregameCapture(captureDeps(store, later, () => at(TIPOFF, 100), { runId: "run-2" }));
    expect(retry.captured).toBe(1);
    expect(later.calls.map((c) => c.sourceEventId)).toEqual([g1.sourceEventId]);
  });

  it("honours a gate that denies after planning (quota exhausted mid-run)", async () => {
    const store = await storeWith(GAME);
    const denyAll: RequestGate = { reserve: async () => ({ ok: false, code: "QUOTA_HARD_STOP", message: "limit reached" }) };
    const provider = mockProps([okLines(LINES)]);
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW, { gate: denyAll }));
    expect(report).toMatchObject({ budgetDeferred: 1, captured: 0 });
    expect(provider.calls).toHaveLength(0);
    expect((await store.listAttempts())[0]).toMatchObject({ outcome: "budget_exhausted", reason: expect.stringContaining("QUOTA_HARD_STOP") });
  });

  it("discards a response that arrives after the capture floor instead of storing a near-tipoff price", async () => {
    const store = await storeWith(GAME);
    let nowMs = at(TIPOFF, 60).getTime();
    const provider = mockProps([okLines(LINES)], () => { nowMs = at(TIPOFF, 30).getTime(); });
    const report = await runPregameCapture(captureDeps(store, provider, () => new Date(nowMs)));
    expect(report).toMatchObject({ missed: 1, captured: 0, creditsCharged: 3 });
    expect(await store.listSnapshots()).toEqual([]);
    expect((await store.listAttempts())[0].outcome).toBe("missed_window");
  });

  it("never fetches a game whose tipoff has passed", async () => {
    const past = makeGame({ tipoffUtc: at(TIPOFF, -60).toISOString().replace(".000Z", "Z"), away: "MIA", home: "ORL" });
    const store = await storeWith(past);
    const provider = mockProps([okLines(LINES)]);
    const report = await runPregameCapture(captureDeps(store, provider, () => new Date(Date.parse(past.tipoffUtc) + 10 * MIN)));
    expect(provider.calls).toHaveLength(0);
    expect(report.missed).toBe(1);
  });

  it("attaches the JKB projection with its model version and input cutoff, and drops lines whose projection postdates the capture", async () => {
    const store = await storeWith(GAME);
    const provider = mockProps([okLines([LINES[0]])]);
    await runPregameCapture(captureDeps(store, provider, () => NOW, { project: () => ({ value: 26.1, minutes: 33.4, modelVersion: "nba-props-baseline-v0", inputCutoffUtc: at(TIPOFF, 200).toISOString().replace(".000Z", "Z") }) }));
    const [s] = await store.listSnapshots();
    expect(s.projection).toMatchObject({ value: 26.1, minutes: 33.4, modelVersion: "nba-props-baseline-v0" });

    const store2 = await storeWith(GAME);
    const report = await runPregameCapture(captureDeps(store2, mockProps([okLines([LINES[0]])]), () => NOW, { project: () => ({ value: 1, minutes: 1, modelVersion: "m", inputCutoffUtc: at(TIPOFF, 10).toISOString().replace(".000Z", "Z") }) }));
    expect(report.rejectedLines).toBe(1);
    expect(await store2.listSnapshots()).toEqual([]);
  });

  it("states a missing projection explicitly when there is no permitted history to project from", async () => {
    const store = await storeWith(GAME);
    await runPregameCapture(captureDeps(store, mockProps([okLines([LINES[0]])]), () => NOW));
    expect((await store.listSnapshots())[0].projection).toMatchObject({ value: null, unavailableReason: "no permitted history to project from" });
  });

  it("costs three credits per game for three markets", () => {
    expect(creditsPerCapture(3)).toBe(3);
  });
});

describe("postgame settlement job", () => {
  async function captured() {
    const store = await storeWith(GAME);
    await runPregameCapture(captureDeps(store, mockProps([okLines(LINES)]), () => NOW));
    return store;
  }
  const PERMS = { permittedUses: ["private-research" as const, "model-development" as const], licenseBasis: "synthetic results", licenseReviewedOn: "2026-11-10", attestation: null };
  const morning = new Date("2026-11-10T13:00:00Z"); // ~12 hours after tipoff
  const deps = (store: MemoryPipelineStore, provider: ReturnType<typeof mockResults>, extra: Partial<PostgameDeps> = {}): PostgameDeps => ({ store, provider, now: () => morning, runId: "settle-1", permissions: PERMS, ...extra });
  const box = [played("Sam Rivera", "NYK", { minutes: 34.2, pts: 27, reb: 5, ast: 6 }), played("Lee Park", "BOS", { minutes: 28, pts: 14, reb: 3, ast: 2 })];

  it("settles finished games from the stored pregame snapshots and never edits them", async () => {
    const store = await captured();
    const before = JSON.stringify(await store.listSnapshots());
    const provider = mockResults([finalResult(GAME, box)]);
    const report = await runPostgameSettlement(deps(store, provider));
    expect(report).toMatchObject({ outcome: "completed", gamesChecked: 1, resultsInserted: 3, absentUnverified: 1, evaluationsInserted: 3 });
    expect(JSON.stringify(await store.listSnapshots())).toBe(before); // the pregame line and projection are untouched
    const byName = Object.fromEntries((await joinEvaluations(await store.listSnapshots(), await store.listEvaluations())).map((p) => [p.snapshot.player.sourcePlayerName, p.evaluation]));
    expect(byName["Sam Rivera"]).toMatchObject({ settlement: "over", actual: 27, margin: 2.5 });
    expect(byName["Lee Park"]).toMatchObject({ settlement: "under", actual: 14 });
    expect(byName["Ana Cruz"]).toMatchObject({ settlement: "pending", reason: "participation_unverified" });
    expect(Object.values(byName).every((e) => e.snapshotSha256.length === 64)).toBe(true);
  });

  it("never turns a missing box-score row into a confirmed DNP", async () => {
    const store = await captured();
    await runPostgameSettlement(deps(store, mockResults([finalResult(GAME, box)])));
    const absent = await store.latestResult(GAME.canonicalGameKey, playerKeyOf({ canonicalPlayerId: null, sourcePlayerName: "Ana Cruz", team: "BOS" }));
    expect(absent).toMatchObject({ participation: "unverified_absent", stats: null });
    expect((await store.listEvaluations()).filter((e) => e.settlement === "void")).toEqual([]);
  });

  it("checks a bounded number of times for corrections and records them as new revisions", async () => {
    const store = await captured();
    const corrected = [played("Sam Rivera", "NYK", { minutes: 34.2, pts: 24, reb: 5, ast: 6 }), box[1], { playerName: "Ana Cruz", team: "BOS", participation: "dnp_confirmed" as const }];
    const provider = mockResults([finalResult(GAME, box), finalResult(GAME, corrected)]);
    const runs = [] as Awaited<ReturnType<typeof runPostgameSettlement>>[];
    for (const [i, hour] of [13, 14, 15, 16, 17].entries()) runs.push(await runPostgameSettlement(deps(store, provider, { now: () => new Date(`2026-11-10T${hour}:00:00Z`), runId: `settle-${i}` })));
    expect(provider.calls).toHaveLength(3); // the first fetch plus two bounded correction checks
    expect(runs[1]).toMatchObject({ correctionsInserted: 2, evaluationsInserted: 2 });
    expect(runs[2]).toMatchObject({ resultsInserted: 0, correctionsInserted: 0, evaluationsInserted: 0 }); // nothing changed: no-ops
    expect(runs[3].gamesSkipped).toBe(1);
    const sam = (await store.listResults()).filter((r) => r.player.sourcePlayerName === "Sam Rivera");
    expect(sam.map((r) => [r.revision, r.stats?.pts])).toEqual([[1, 27], [2, 24]]);
    expect(sam[1]).toMatchObject({ supersedesRevision: 1 });
    const samEval = (await store.listEvaluations()).filter((e) => e.settlement !== "pending" && e.market === "pts" && e.line === 24.5);
    expect(samEval.map((e) => [e.revision, e.settlement, e.resultRevision])).toEqual([[1, "over", 1], [2, "under", 2]]);
    const ana = await joinEvaluations(await store.listSnapshots(), await store.listEvaluations());
    expect(ana.find((p) => p.snapshot.player.sourcePlayerName === "Ana Cruz")!.evaluation).toMatchObject({ settlement: "void", reason: "player_did_not_play", revision: 2 });
  });

  it("settles overtime games on full-game totals", async () => {
    const store = await captured();
    const ot = finalResult(GAME, [played("Sam Rivera", "NYK", { minutes: 46.8, pts: 33, reb: 8, ast: 7 }), box[1]], { periods: 6 });
    await runPostgameSettlement(deps(store, mockResults([ot])));
    const sam = (await store.listResults()).find((r) => r.player.sourcePlayerName === "Sam Rivera")!;
    expect(sam.game.periods).toBe(6);
    expect((await store.listEvaluations()).find((e) => e.actual === 33)).toMatchObject({ settlement: "over", margin: 8.5 });
  });

  it("does not fetch before a game can have finished", async () => {
    const store = await captured();
    const provider = mockResults([finalResult(GAME, box)]);
    const report = await runPostgameSettlement(deps(store, provider, { now: () => new Date("2026-11-10T02:30:00Z") }));
    expect(provider.calls).toHaveLength(0);
    expect(report).toMatchObject({ gamesChecked: 0, gamesSkipped: 1 });
  });

  it("voids props for a postponed game without calling the provider", async () => {
    const store = await captured();
    await store.upsertGame({ ...GAME, status: "postponed", observedAtUtc: "2026-11-09T23:00:00Z" });
    const provider = mockResults([finalResult(GAME, box)]);
    const report = await runPostgameSettlement(deps(store, provider));
    expect(provider.calls).toHaveLength(0);
    expect(report.evaluationsInserted).toBe(3);
    expect((await store.listEvaluations()).every((e) => e.settlement === "void" && e.reason === "game_postponed")).toBe(true);
    await runPostgameSettlement(deps(store, provider, { runId: "again" }));
    expect(await store.listEvaluations()).toHaveLength(3); // re-running adds nothing
  });

  it("keeps props pending while a game is in progress or suspended, then settles it when final", async () => {
    const store = await captured();
    const provider = mockResults([finalResult(GAME, box, { status: "in_progress", finalizedAtUtc: null, periods: null }), finalResult(GAME, box)]);
    await runPostgameSettlement(deps(store, provider));
    expect((await store.listEvaluations()).every((e) => e.settlement === "pending" && e.reason === "game_in_progress")).toBe(true);
    expect((await store.listResults()).every((r) => r.stats === null)).toBe(true); // a partial box score is not recorded as production
    await runPostgameSettlement(deps(store, provider, { runId: "settle-2", now: () => new Date("2026-11-10T14:00:00Z") }));
    const latest = await joinEvaluations(await store.listSnapshots(), await store.listEvaluations());
    expect(latest.filter((p) => p.evaluation.settlement === "over" || p.evaluation.settlement === "under")).toHaveLength(2);
  });

  it("records provider unavailability and errors without writing a result, and retries", async () => {
    const store = await captured();
    const provider = mockResults([{ status: "not_available" }, { status: "error", message: "502" }, new Error("timeout"), finalResult(GAME, box)]);
    for (const [i, hour] of [13, 14, 15, 16].entries()) await runPostgameSettlement(deps(store, provider, { runId: `s${i}`, now: () => new Date(`2026-11-10T${hour}:00:00Z`) }));
    expect((await store.listAttempts()).filter((a) => a.outcome.startsWith("result_")).map((a) => a.outcome)).toEqual(["result_unavailable", "result_error", "result_error", "result_fetched"]);
    expect((await store.listResults()).length).toBe(3);
  });

  it("stops fetching a game that never reports a final result", async () => {
    const store = await captured();
    const provider = mockResults([{ status: "not_available" }]);
    const report = await runPostgameSettlement(deps(store, provider, { now: () => new Date("2026-11-20T13:00:00Z") }));
    expect(provider.calls).toHaveLength(0);
    expect(report.gamesSkipped).toBe(1);
    expect(await store.listEvaluations()).toEqual([]);
  });

  it("will not call a metered results provider without quota, and does nothing when locked", async () => {
    const store = await captured();
    const provider = mockResults([finalResult(GAME, box)]);
    const denied = await runPostgameSettlement(deps(store, provider, { gate: { reserve: async () => ({ ok: false, code: "QUOTA_HARD_STOP", message: "no" }) }, creditsPerGame: 1 }));
    expect(provider.calls).toHaveLength(0);
    expect(denied.gamesSkipped).toBe(1);
    await store.acquireLock("nba-postgame-settlement", "other", 600_000, morning);
    expect((await runPostgameSettlement(deps(store, provider))).outcome).toBe("locked");
    expect(provider.calls).toHaveLength(0);
  });
});

describe("no-paid-provider path: manual CSV in, evaluation and statistics out", () => {
  const attestation = { attestedBy: "Joe", attestedOn: "2026-11-09", origin: "typed by hand from a sportsbook app", permittedUses: ["private-research" as const, "model-development" as const] };
  const LINES_CSV = ["captured_at_utc,tipoff_utc,away_team,home_team,player,team,market,sportsbook,line,over_price,under_price", `2026-11-09T21:05:00Z,${TIPOFF},NYK,BOS,Sam Rivera,NYK,points,BookOne,24.5,-115,-105`, `2026-11-09T21:05:00Z,${TIPOFF},NYK,BOS,Lee Park,BOS,points,BookOne,15.5,110,-130`, `2026-11-09T21:05:00Z,${TIPOFF},NYK,BOS,Ana Cruz,BOS,rebounds,BookOne,7.5,-110,-110`].join("\n");
  const RESULTS_CSV = ["tipoff_utc,away_team,home_team,player,team,participation,game_status,finalized_at_utc,minutes,pts,reb,ast,periods", `${TIPOFF},NYK,BOS,Sam Rivera,NYK,played,final,2026-11-10T03:05:00Z,34.2,27,5,6,4`, `${TIPOFF},NYK,BOS,Lee Park,BOS,played,final,2026-11-10T03:05:00Z,28,14,3,2,4`].join("\n");

  async function imported() {
    const store = await storeWith(GAME);
    for (const snapshot of importLinesCsv(LINES_CSV, { attestation }).snapshots) await store.insertSnapshot(snapshot);
    for (const draft of importResultsCsv(RESULTS_CSV, { attestation }).drafts) await recordResultDraft(store, draft, "2026-11-10T13:00:00Z");
    return store;
  }

  it("settles imported results with no provider and no credits, and re-running adds nothing", async () => {
    const store = await imported();
    // Ana Cruz has no stored result at all, so there is nothing to evaluate yet (not a DNP, not a loss).
    expect(await settleStoredResults(store, "2026-11-10T13:05:00Z")).toEqual({ evaluationsInserted: 2 });
    expect(await settleStoredResults(store, "2026-11-10T14:05:00Z")).toEqual({ evaluationsInserted: 0 });
    const byName = Object.fromEntries(joinEvaluations(await store.listSnapshots(), await store.listEvaluations()).map((p) => [p.snapshot.player.sourcePlayerName, p.evaluation]));
    expect(byName["Sam Rivera"]).toMatchObject({ settlement: "over" });
    expect(byName["Lee Park"]).toMatchObject({ settlement: "under" });
    expect(byName["Ana Cruz"]).toBeUndefined();
  });

  it("confirming a DNP for a player with no result yet voids that prop", async () => {
    const store = await imported();
    await settleStoredResults(store, "2026-11-10T13:05:00Z");
    const confirm = importResultsCsv(["tipoff_utc,away_team,home_team,player,team,participation,game_status,finalized_at_utc,correction_reason", `${TIPOFF},NYK,BOS,Ana Cruz,BOS,dnp_confirmed,final,2026-11-10T03:05:00Z,confirmed out by the team`].join("\n"), { attestation });
    await recordResultDraft(store, confirm.drafts[0], "2026-11-10T15:00:00Z");
    expect(await settleStoredResults(store, "2026-11-10T15:05:00Z")).toEqual({ evaluationsInserted: 1 });
    const ana = (await store.listEvaluations()).filter((e) => e.market === "reb");
    expect(ana.map((e) => [e.revision, e.settlement])).toEqual([[1, "void"]]);
  });

  it("feeds statistics from authentic manual lines, and training only from lines whose own record grants model development", async () => {
    const store = await imported();
    await settleStoredResults(store, "2026-11-10T13:05:00Z");
    const evaluated = joinEvaluations(await store.listSnapshots(), await store.listEvaluations());
    expect(overUnderRecords(evaluated, "market").groups.pts).toMatchObject({ over: 1, under: 1, decided: 2, overRate: 0.5 });
    const parts = freezePartitions(evaluated, "2026-11-11T00:00:00Z", "2026-11-20T00:00:00Z");
    expect(parts.manifest.counts.train).toBe(2);
    expect(parts.manifest.excluded.undecided).toBe(0);

    const privateOnly = await storeWith(GAME);
    for (const snapshot of importLinesCsv(LINES_CSV, { attestation: { ...attestation, permittedUses: ["private-research"] } }).snapshots) await privateOnly.insertSnapshot(snapshot);
    for (const draft of importResultsCsv(RESULTS_CSV, { attestation }).drafts) await recordResultDraft(privateOnly, draft, "2026-11-10T13:00:00Z");
    await settleStoredResults(privateOnly, "2026-11-10T13:05:00Z");
    const restricted = freezePartitions(joinEvaluations(await privateOnly.listSnapshots(), await privateOnly.listEvaluations()), "2026-11-11T00:00:00Z", "2026-11-20T00:00:00Z");
    expect(restricted.manifest.counts.train).toBe(0);
    expect(restricted.manifest.excluded.noTrainingRights).toBe(2);
    expect(evEvaluations(evaluated)).toEqual([]); // manual lines carry no calibrated probability, so no EV is invented
  });

  it("keeps capture-time rights when the source record grants more", async () => {
    const restricted = { ...SYNTHETIC_LICENSES, "synthetic-odds": { ...SYNTHETIC_LICENSES["synthetic-odds"], permittedUses: ["private-research" as const] } };
    const store = await storeWith(GAME);
    await runPregameCapture(captureDeps(store, mockProps([okLines([LINES[0]])]), () => NOW, { licenses: restricted }));
    expect((await store.listSnapshots())[0].permissions.permittedUses).toEqual(["private-research"]);
    expect(SYNTHETIC_LICENSES["synthetic-odds"].permittedUses).toContain("model-development");
  });
});
