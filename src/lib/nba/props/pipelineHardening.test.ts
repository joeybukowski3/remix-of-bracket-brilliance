/**
 * Tests for the Phase 5A review findings: capture bounds in the record itself,
 * import clock and backfill, freshness, zero-minute rows, revision churn,
 * regressions, evaluation integrity, locks, quota-gate binding, and the
 * postgame edge cases. Synthetic data and mock providers only.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { at, captureDeps, finalResult, IMPORT_NOW, line, makeGame, mockProps, mockResults, okLines, played, quotaSetup, SYNTHETIC_LICENSES, TIPOFF } from "./__fixtures__/pipelineFixtures";
import { quotaRequestGate } from "./pipeline/budget";
import { buildEvaluation, buildResult, buildSnapshot, CAPTURE_BOUNDS, playerKeyOf, type NbaFinalResult, type SnapshotInput } from "./pipeline/contracts";
import { importLinesCsv, importResultsCsv, type ImportAttestation } from "./pipeline/manualImport";
import { runPostgameSettlement, settleStoredResults, type PostgameDeps } from "./pipeline/postgameJob";
import { runPregameCapture } from "./pipeline/pregameJob";
import { recordResultDraft, type ResultDraft } from "./pipeline/resultsRecorder";
import { evaluateSnapshot } from "./pipeline/settlement";
import { freezePartitions, isAuthenticLine, joinEvaluations, minutesHistory, verifyFrozenPartitions } from "./pipeline/statistics";
import { EvaluationIntegrityError, FilePipelineStore, MemoryPipelineStore } from "./pipeline/store";
import { DATA_USES } from "./sources/types";

const GAME = makeGame();
const iso = (d: Date) => d.toISOString().replace(".000Z", "Z");
const PLAYER = { canonicalPlayerId: null, sourcePlayerName: "Sam Rivera", sourcePlayerId: null, team: "NYK" } as const;
const PERMS = { permittedUses: DATA_USES.filter((u) => u !== "raw-redistribution"), licenseBasis: "synthetic", licenseReviewedOn: "2026-10-19", attestation: null };

function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    game: { canonicalGameKey: GAME.canonicalGameKey, sourceEventId: "evt-1", tipoffUtc: GAME.tipoffUtc, awayTeam: "NYK", homeTeam: "BOS", neutralSite: false },
    player: PLAYER,
    market: "pts",
    source: { sourceId: "synthetic-odds", method: "synthetic", sportsbook: "bookone", sourceMarketKey: "player_points" },
    line: 24.5,
    overPrice: -115,
    underPrice: -105,
    sourceLastUpdateUtc: iso(at(TIPOFF, 160)),
    capturedAtUtc: iso(at(TIPOFF, 150)),
    maxAgeMinutes: 120,
    projection: { value: 26, minutes: 33, modelVersion: "m", inputCutoffUtc: iso(at(TIPOFF, 200)), unavailableReason: null },
    permissions: PERMS,
    provenance: { runId: "r", importBatchId: null, creditsCharged: 3 },
    ...over,
  };
}

const NO_PROJECTION = { unavailableReason: "test" } as const;
const finalGame = { canonicalGameKey: GAME.canonicalGameKey, tipoffUtc: GAME.tipoffUtc, status: "final" as const, periods: 4, finalizedAtUtc: "2026-11-10T03:05:00Z" };
const draft = (over: Partial<ResultDraft> = {}): ResultDraft => ({
  game: finalGame, player: PLAYER, participation: "played", stats: { minutes: 34, pts: 27, reb: 5, ast: 6 }, correctionReason: null,
  provider: { sourceId: "synthetic-results", method: "synthetic" }, evidence: { sourceSnapshotId: "r1", importBatchId: null, rowRef: null }, permissions: PERMS, ...over,
});

describe("capture bounds live in the record itself", () => {
  it("refuses a line inside the floor or beyond the earliest window, and derives the window from the minutes", () => {
    expect(() => buildSnapshot(input({ capturedAtUtc: iso(at(TIPOFF, 30)), sourceLastUpdateUtc: null, projection: NO_PROJECTION }))).toThrow(/closer than 45/);
    expect(() => buildSnapshot(input({ capturedAtUtc: iso(at(TIPOFF, 44)), sourceLastUpdateUtc: null, projection: NO_PROJECTION }))).toThrow(/closer than 45/);
    expect(() => buildSnapshot(input({ capturedAtUtc: iso(at(TIPOFF, 241)), sourceLastUpdateUtc: null, projection: NO_PROJECTION }))).toThrow(/more than 240/);
    expect(buildSnapshot(input({ capturedAtUtc: iso(at(TIPOFF, 45)), sourceLastUpdateUtc: null, projection: NO_PROJECTION })).timing.window).toBe("late");
    expect(buildSnapshot(input({ capturedAtUtc: iso(at(TIPOFF, 240)), sourceLastUpdateUtc: null, projection: NO_PROJECTION })).timing.window).toBe("in_window");
    expect(buildSnapshot(input({ capturedAtUtc: iso(at(TIPOFF, 120)), sourceLastUpdateUtc: null, projection: NO_PROJECTION })).timing.window).toBe("in_window");
    expect(CAPTURE_BOUNDS).toEqual({ earliestMinutes: 240, inWindowMinMinutes: 120, floorMinutes: 45 });
  });
});

describe("freshness", () => {
  it("is unknown for an API line with no provider update time, and unknown lines are never authentic", () => {
    const api = buildSnapshot(input({ source: { sourceId: "the-odds-api", method: "api", sportsbook: "bookone", sourceMarketKey: "player_points" }, sourceLastUpdateUtc: null, permissions: { ...PERMS, permittedUses: ["private-research"] } }));
    expect(api.freshness).toMatchObject({ status: "unknown", basis: "none", ageMinutes: null });
    expect(isAuthenticLine(api)).toBe(false);
    const dated = buildSnapshot(input({ source: { sourceId: "the-odds-api", method: "api", sportsbook: "bookone", sourceMarketKey: "player_points" }, permissions: { ...PERMS, permittedUses: ["private-research"] } }));
    expect(dated.freshness).toMatchObject({ status: "fresh", basis: "provider_last_update" });
    expect(isAuthenticLine(dated)).toBe(true);
  });

  it("is fresh by observation for a manual line with no provider time, and an API line can never claim that basis", () => {
    const text = "captured_at_utc,tipoff_utc,away_team,home_team,player,team,market,sportsbook,line,over_price,under_price\n2026-11-09T21:05:00Z,2026-11-10T00:30:00Z,NYK,BOS,Sam Rivera,NYK,points,BookOne,24.5,-115,-105";
    const [s] = importLinesCsv(text, { attestation: ATTEST, now: IMPORT_NOW }).snapshots;
    expect(s.freshness).toMatchObject({ status: "fresh", basis: "observed_at_capture" });
    expect(isAuthenticLine(s)).toBe(true);
    expect(() => buildSnapshot({ ...input(), source: { sourceId: "the-odds-api", method: "api", sportsbook: "b", sourceMarketKey: "player_points" }, sourceLastUpdateUtc: null, permissions: { ...PERMS, permittedUses: ["private-research"] }, ...{} }) ).not.toThrow();
  });
});

const ATTEST: ImportAttestation = { attestedBy: "Joe", attestedOn: "2026-11-09", origin: "typed by hand", permittedUses: ["private-research", "model-development"] };
const HEAD = "captured_at_utc,tipoff_utc,away_team,home_team,player,team,market,sportsbook,line,over_price,under_price";
const row = (capturedAt: string) => `${capturedAt},${TIPOFF},NYK,BOS,Sam Rivera,NYK,points,BookOne,24.5,-115,-105`;

describe("manual import clock and backfill", () => {
  it("rejects lines too early, inside the floor, from the future, or imported after the game started", () => {
    // Imported at 00:10Z, twenty minutes before tipoff.
    const text = [HEAD, row("2026-11-09T18:00:00Z"), row("2026-11-10T00:00:00Z"), row("2026-11-10T00:20:00Z"), row("2026-11-09T21:05:00Z")].join("\n");
    const early = importLinesCsv(text, { attestation: ATTEST, now: new Date("2026-11-10T00:10:00Z") });
    expect(early.rejected.map((r) => r.code)).toEqual(["too_early", "inside_capture_floor", "captured_in_future"]);
    expect(early.snapshots).toHaveLength(1);
    const after = importLinesCsv(`${HEAD}\n${row("2026-11-09T21:05:00Z")}`, { attestation: ATTEST, now: new Date("2026-11-10T09:00:00Z") });
    expect(after.snapshots).toEqual([]);
    expect(after.rejected[0].code).toBe("imported_after_tipoff");
  });

  it("keeps a backfilled line only when asked, flags it, and never treats it as authentic or as training data", () => {
    const result = importLinesCsv(`${HEAD}\n${row("2026-11-09T21:05:00Z")}`, { attestation: ATTEST, now: new Date("2026-11-10T09:00:00Z"), allowBackfill: true });
    const [s] = result.snapshots;
    expect(s.permissions.attestation?.backfilled).toBe(true);
    expect(isAuthenticLine(s)).toBe(false);
    const live = importLinesCsv(`${HEAD}\n${row("2026-11-09T21:05:00Z")}`, { attestation: ATTEST, now: IMPORT_NOW }).snapshots[0];
    expect(live.permissions.attestation?.backfilled).toBe(false);
    expect(live.snapshotId).not.toBe(s.snapshotId);
  });

  it("will not import a played row with zero minutes", () => {
    const head = "tipoff_utc,away_team,home_team,player,team,participation,game_status,finalized_at_utc,minutes,pts,reb,ast";
    const r = importResultsCsv(`${head}\n${TIPOFF},NYK,BOS,Sam Rivera,NYK,played,final,2026-11-10T03:05:00Z,0,0,0,0`, { attestation: ATTEST });
    expect(r.drafts).toEqual([]);
    expect(r.rejected[0].code).toBe("zero_minutes");
    expect(() => buildResult({ ...draft(), stats: { minutes: 0, pts: 0, reb: 0, ast: 0 }, revision: 1, recordedAtUtc: "2026-11-10T12:00:00Z" })).toThrow(/zero-minute row/);
  });
});

describe("results recorder", () => {
  it("does not create a revision just because a source omits or changes the finalization time", async () => {
    const store = new MemoryPipelineStore();
    const a = await recordResultDraft(store, draft(), "2026-11-10T13:00:00Z");
    const b = await recordResultDraft(store, draft({ game: { ...finalGame, finalizedAtUtc: "2026-11-10T14:00:00Z" } }), "2026-11-10T14:00:00Z");
    expect([a.outcome, b.outcome]).toEqual(["inserted", "unchanged"]);
    expect(await store.listResults()).toHaveLength(1);
  });

  it("refuses to move a settled result backwards without an explicit correction reason", async () => {
    const store = new MemoryPipelineStore();
    await recordResultDraft(store, draft(), "2026-11-10T13:00:00Z");
    const inProgress = draft({ game: { ...finalGame, status: "in_progress", finalizedAtUtc: null, periods: null }, participation: "unverified_absent", stats: null });
    expect((await recordResultDraft(store, inProgress, "2026-11-10T14:00:00Z")).outcome).toBe("refused");
    expect((await recordResultDraft(store, draft({ participation: "unverified_absent", stats: null }), "2026-11-10T14:00:00Z")).outcome).toBe("refused");
    expect((await store.latestResult(GAME.canonicalGameKey, playerKeyOf(PLAYER)))!.revision).toBe(1);
    const reasoned = await recordResultDraft(store, { ...inProgress, correctionReason: "league reversed the final" }, "2026-11-10T15:00:00Z");
    expect(reasoned).toMatchObject({ outcome: "inserted", result: { revision: 2, correctionReason: "league reversed the final" } });
  });
});

describe("evaluation integrity", () => {
  const snapshot = buildSnapshot(input());
  const result: NbaFinalResult = buildResult({ ...draft(), revision: 1, recordedAtUtc: "2026-11-10T13:00:00Z" });
  const base = { snapshot, revision: 1, resultId: result.resultId, resultRevision: 1, resultPermittedUses: [...result.permissions.permittedUses], settlement: "over" as const, reason: null, actual: 27, errors: { projection: -1, minutes: -1 }, evaluatedAtUtc: "2026-11-10T14:00:00Z" };

  it("rejects an evaluation of an unknown snapshot, a different snapshot hash, or a result that is not stored", async () => {
    const store = new MemoryPipelineStore();
    await expect(store.appendEvaluation(buildEvaluation(base))).rejects.toThrow(EvaluationIntegrityError);
    await store.insertSnapshot(snapshot);
    await expect(store.appendEvaluation(buildEvaluation(base))).rejects.toThrow(/result revision that is not stored/);
    await store.appendResult(result);
    expect(await store.appendEvaluation(buildEvaluation(base))).toBe("inserted");
    const tampered = { ...buildEvaluation({ ...base, revision: 2, settlement: "under", actual: 20 }), snapshotSha256: "a".repeat(64) };
    // A forged hash cannot even parse; the integrity check is the second line of defense.
    await expect(store.appendEvaluation(tampered)).rejects.toThrow();
  });
});

describe("locks", () => {
  it("lets exactly one process hold a file lock, takes over only an expired one, and treats an unreadable lock as held", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nba-lock2-"));
    try {
      const now = new Date("2026-11-09T20:00:00Z");
      const store = await FilePipelineStore.open(dir);
      expect(await store.acquireLock("job", "a", 60_000, now)).toBe(true);
      expect(await store.acquireLock("job", "b", 60_000, new Date(now.getTime() + 1000))).toBe(false);
      expect(await store.acquireLock("job", "b", 60_000, new Date(now.getTime() + 61_000))).toBe(true);
      writeFileSync(path.join(dir, "locks", "other.json"), "{ half written");
      expect(await store.acquireLock("other", "c", 60_000, now)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serializes whole commands with withLock and releases afterwards, even on failure", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nba-lock3-"));
    try {
      const now = () => new Date("2026-11-09T20:00:00Z");
      let inside = false;
      await FilePipelineStore.withLock(dir, "cli", 60_000, now, async () => {
        inside = true;
        await expect(FilePipelineStore.withLock(dir, "cli", 60_000, now, async () => "never")).rejects.toThrow(/Another process holds/);
      });
      expect(inside).toBe(true);
      await expect(FilePipelineStore.withLock(dir, "cli", 60_000, now, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
      await expect(FilePipelineStore.withLock(dir, "cli", 60_000, now, async () => "again")).resolves.toBe("again");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("quota gate", () => {
  it("enforces the NBA-only allowance itself, counting NBA spend and not other sports", async () => {
    const { manager, accountId, time } = await quotaSetup();
    const gate = quotaRequestGate(manager, accountId, "pregame-capture", { perDayCredits: 6, perMonthCredits: 400 }, time.now);
    expect(gate.enforcesNbaAllowance).toBe(true);
    const first = await gate.reserve(3, "/events/{id}/odds");
    expect(first.ok).toBe(true);
    if (first.ok) await first.settle(3, "ok");
    const nfl = await manager.reserve(accountId, { priority: "essential", attribution: { sport: "nfl", workflow: "lines", endpoint: "/odds" } }, { units: 20, basis: "nfl" });
    expect(nfl.allowed).toBe(true);
    const second = await gate.reserve(3, "/events/{id}/odds");
    expect(second.ok).toBe(true);
    const third = await gate.reserve(3, "/events/{id}/odds");
    expect(third).toMatchObject({ ok: false, code: "NBA_DAILY_ALLOWANCE" });
    expect(quotaRequestGate(manager, accountId, "x").enforcesNbaAllowance).toBe(false);
  });
});

describe("pregame job hardening", () => {
  const grant = { ...SYNTHETIC_LICENSES, "the-odds-api": { ...SYNTHETIC_LICENSES["synthetic-odds"], permittedUses: ["private-research" as const] } };
  const NOW = at(TIPOFF, 150);
  const withGame = async () => {
    const store = new MemoryPipelineStore();
    await store.upsertGame(GAME);
    return store;
  };
  const apiProvider = () => ({ ...mockProps([okLines([line()])]), sourceId: "the-odds-api" as const });

  it("will not run a metered source through a gate for another account or without an enforced NBA allowance", async () => {
    const wrongAccount = await runPregameCapture(captureDeps(await withGame(), apiProvider(), () => NOW, { licenses: grant }));
    expect(wrongAccount).toMatchObject({ outcome: "blocked" });
    expect(wrongAccount.reason).toMatch(/the gate funds test:odds/);
    const noAllowance = await runPregameCapture(captureDeps(await withGame(), apiProvider(), () => NOW, { licenses: grant, gate: { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: false, reserve: async () => ({ ok: true, settle: async () => {} }) } }));
    expect(noAllowance.reason).toMatch(/NBA-only allowance/);
    const store = await withGame();
    const ok = await runPregameCapture(captureDeps(store, apiProvider(), () => NOW, { licenses: grant, gate: { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve: async () => ({ ok: true, settle: async () => {} }) } }));
    expect(ok).toMatchObject({ outcome: "completed", captured: 1 });
    expect((await store.listSnapshots())[0].source).toMatchObject({ sourceId: "the-odds-api", method: "api" });
  });

  it("does not let a repeated run id slip past the lock", async () => {
    const store = await withGame();
    await store.acquireLock("nba-pregame-capture", "run-1", 600_000, NOW);
    const provider = mockProps([okLines([line()])]);
    expect((await runPregameCapture(captureDeps(store, provider, () => NOW, { runId: "run-1" }))).outcome).toBe("locked");
    expect(provider.calls).toHaveLength(0);
  });

  it("audits every try even when the same run id is reused, so the try limit still trips", async () => {
    const store = await withGame();
    const provider = mockProps([{ status: "error", message: "502", creditsCharged: null }]);
    for (const minutes of [170, 140, 100]) await runPregameCapture(captureDeps(store, provider, () => at(TIPOFF, minutes), { runId: "same-run" }));
    expect(provider.calls).toHaveLength(2);
    const attempts = await store.listAttempts();
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts.map((a) => a.attemptId)).size).toBe(2);
  });

  it("reports a failed run, records the paid attempt and releases the lock when storage fails after the provider call", async () => {
    class FailingStore extends MemoryPipelineStore {
      override async insertSnapshot(): Promise<"inserted"> {
        throw new Error("disk full");
      }
    }
    const store = new FailingStore();
    await store.upsertGame(GAME);
    const report = await runPregameCapture(captureDeps(store, mockProps([okLines([line()])]), () => NOW));
    expect(report).toMatchObject({ outcome: "failed", reason: "disk full" });
    expect((await store.listAttempts())[0]).toMatchObject({ outcome: "error", creditsCharged: 3 });
    expect(await store.acquireLock("nba-pregame-capture", "next", 1000, NOW)).toBe(true);
  });

  it("counts a line that fails validation as rejected, with the reason, and stores the rest", async () => {
    const store = await withGame();
    const bad = line({ playerName: "Future Source", lastUpdateUtc: iso(new Date(NOW.getTime() + 60 * 60_000)) });
    const report = await runPregameCapture(captureDeps(store, mockProps([okLines([bad, line()])]), () => NOW));
    expect(report).toMatchObject({ captured: 1, linesStored: 1, rejectedLines: 1 });
    expect(report.rejectionReasons[0]).toMatch(/source update is after the capture/);
  });

  it("reports a blocked run when the account refuses NBA work, and never reserves for a game without an event id", async () => {
    const store = await withGame();
    const blockedPlan = async (keys: readonly string[]) => ({ affordable: [], deferred: keys.map((gameKey) => ({ gameKey, reason: "account_blocked" as const, detail: "x" })), creditsPlanned: 0, blocked: { code: "BLOCKED_BY_POLICY", message: "nope" } });
    const provider = mockProps([okLines([line()])]);
    const report = await runPregameCapture(captureDeps(store, provider, () => NOW, { plan: blockedPlan }));
    expect(report).toMatchObject({ outcome: "blocked" });
    expect(provider.calls).toHaveLength(0);
    expect((await store.listAttempts())[0].outcome).toBe("blocked");

    const noId = new MemoryPipelineStore();
    await noId.upsertGame(makeGame({ sourceEventId: null }));
    let reservations = 0;
    await runPregameCapture(captureDeps(noId, provider, () => NOW, { gate: { accountId: "t", enforcesNbaAllowance: true, reserve: async () => { reservations += 1; return { ok: true, settle: async () => {} }; } } }));
    expect(reservations).toBe(0);
    expect((await noId.listAttempts())[0]).toMatchObject({ outcome: "error", reason: "game has no provider event id" });
  });
});

describe("postgame job hardening", () => {
  const morning = new Date("2026-11-10T13:00:00Z");
  const POST_PERMS = { permittedUses: ["private-research" as const, "model-development" as const], licenseBasis: "synthetic results", licenseReviewedOn: "2026-11-10", attestation: null };
  const LINES = [line({ playerName: "Sam Rivera", team: "NYK", market: "pts", line: 24.5 }), line({ playerName: "Sam Rivera", team: null, market: "reb", line: 5.5 })];
  const box = [played("Sam Rivera", "NYK", { minutes: 34.2, pts: 27, reb: 5, ast: 6 })];
  async function captured(lines = LINES) {
    const store = new MemoryPipelineStore();
    await store.upsertGame(GAME);
    await runPregameCapture(captureDeps(store, mockProps([okLines(lines)]), () => at(TIPOFF, 150)));
    return store;
  }
  const deps = (store: MemoryPipelineStore, provider: ReturnType<typeof mockResults>, extra: Partial<PostgameDeps> = {}): PostgameDeps => ({ store, provider, now: () => morning, runId: "s1", permissions: POST_PERMS, ...extra });

  it("refuses a metered results provider without an allowance-enforcing gate, and a provider with no storage permission", async () => {
    const store = await captured();
    const metered = { ...mockResults([finalResult(GAME, box)]), method: "api" as const };
    expect((await runPostgameSettlement(deps(store, metered))).outcome).toBe("blocked");
    expect((await runPostgameSettlement(deps(store, metered, { gate: { accountId: "t", enforcesNbaAllowance: false, reserve: async () => ({ ok: true, settle: async () => {} }) }, creditsPerGame: 1 }))).outcome).toBe("blocked");
    const plain = mockResults([finalResult(GAME, box)]);
    expect((await runPostgameSettlement(deps(store, plain, { permissions: { ...POST_PERMS, permittedUses: [] } }))).outcome).toBe("blocked");
    expect(metered.calls.length + plain.calls.length).toBe(0);
  });

  it("does not churn revisions when the provider omits the finalization time", async () => {
    const store = await captured();
    const provider = mockResults([finalResult(GAME, box, { finalizedAtUtc: null })]);
    for (const [i, hour] of [13, 14, 15].entries()) await runPostgameSettlement(deps(store, provider, { runId: `s${i}`, now: () => new Date(`2026-11-10T${hour}:00:00Z`) }));
    expect((await store.listResults()).every((r) => r.revision === 1)).toBe(true);
    expect((await store.listEvaluations()).every((e) => e.revision === 1)).toBe(true);
  });

  it("keeps a zero-minute 'played' row unverified and settles nothing from it", async () => {
    const store = await captured();
    const provider = mockResults([finalResult(GAME, [played("Sam Rivera", "NYK", { minutes: 0, pts: 0, reb: 0, ast: 0 })])]);
    const report = await runPostgameSettlement(deps(store, provider));
    expect(report.invalidProviderRows).toBe(1);
    const evals = joinEvaluations(await store.listSnapshots(), await store.listEvaluations());
    expect(evals.every((p) => p.evaluation.settlement === "pending" && p.evaluation.reason === "participation_unverified")).toBe(true);
  });

  it("does not let a later partial answer turn settled props back into pending", async () => {
    const store = await captured();
    const provider = mockResults([finalResult(GAME, box), finalResult(GAME, box, { status: "in_progress", finalizedAtUtc: null, periods: null })]);
    await runPostgameSettlement(deps(store, provider));
    const report = await runPostgameSettlement(deps(store, provider, { runId: "s2", now: () => new Date("2026-11-10T14:00:00Z") }));
    expect(report.refusedRegressions).toBeGreaterThan(0);
    const evals = joinEvaluations(await store.listSnapshots(), await store.listEvaluations());
    // Sam scored 27 (over 24.5) and grabbed 5 rebounds (under 5.5); the later partial answer changes neither.
    expect(evals.map((p) => p.evaluation.settlement).sort()).toEqual(["over", "under"]);
    expect(evals.every((p) => p.evaluation.revision === 1)).toBe(true);
  });

  it("settles every pregame line for the same player, however each was keyed", async () => {
    const store = await captured();
    expect(new Set((await store.listSnapshots()).map((s) => playerKeyOf(s.player))).size).toBe(2); // keyed by name+team and by name alone
    await runPostgameSettlement(deps(store, mockResults([finalResult(GAME, box)])));
    const evals = joinEvaluations(await store.listSnapshots(), await store.listEvaluations());
    expect(evals).toHaveLength(2);
    expect(evals.every((p) => p.evaluation.settlement === "over" || p.evaluation.settlement === "under")).toBe(true);
  });

  it("survives one malformed provider row without aborting the run", async () => {
    const store = await captured();
    const malformed = { playerName: "Bad Row", team: "NYK", participation: "played" as const } as never;
    const report = await runPostgameSettlement(deps(store, mockResults([finalResult(GAME, [...box, malformed])])));
    expect(report.outcome).toBe("completed");
    expect(report.invalidProviderRows).toBe(1);
    expect(joinEvaluations(await store.listSnapshots(), await store.listEvaluations())).toHaveLength(2);
  });
});

describe("statistics hardening", () => {
  const snapshot = buildSnapshot(input());
  const result = buildResult({ ...draft(), revision: 1, recordedAtUtc: "2026-11-10T13:00:00Z" });
  const evaluation = evaluateSnapshot(snapshot, result, null, "2026-11-10T14:00:00Z")!;
  const prop = { snapshot, evaluation };

  it("trains only where both the line and the result carry model-development rights", () => {
    const opts = { allowSynthetic: true };
    const trainEnd = "2026-11-12T00:00:00Z";
    expect(freezePartitions([prop], trainEnd, "2026-11-20T00:00:00Z", opts).manifest.counts.train).toBe(1);
    const privateResult = evaluateSnapshot(snapshot, buildResult({ ...draft({ permissions: { ...PERMS, permittedUses: ["private-research"] } }), revision: 1, recordedAtUtc: "2026-11-10T13:00:00Z" }), null, "2026-11-10T14:00:00Z")!;
    const parts = freezePartitions([{ snapshot, evaluation: privateResult }], trainEnd, "2026-11-20T00:00:00Z", opts);
    expect(parts.manifest.counts.train).toBe(0);
    expect(parts.manifest.excluded.noTrainingRights).toBe(1);
  });

  it("notices when a correction flips a frozen label", () => {
    const opts = { allowSynthetic: true };
    const frozen = freezePartitions([prop], "2026-11-12T00:00:00Z", "2026-11-20T00:00:00Z", opts).manifest;
    const corrected = evaluateSnapshot(snapshot, buildResult({ ...draft({ stats: { minutes: 34, pts: 20, reb: 5, ast: 6 }, correctionReason: "stat correction" }), revision: 2, recordedAtUtc: "2026-11-11T13:00:00Z" }), evaluation, "2026-11-11T14:00:00Z")!;
    expect(verifyFrozenPartitions(frozen, [{ snapshot, evaluation: corrected }], opts).unchanged).toBe(false);
    expect(verifyFrozenPartitions(frozen, [prop], opts).unchanged).toBe(true);
  });

  it("builds minutes history as of a time: a later correction or a result without the required rights is invisible", () => {
    const key = playerKeyOf(PLAYER);
    const later = buildResult({ ...draft({ stats: { minutes: 10, pts: 1, reb: 1, ast: 1 }, correctionReason: "fix" }), revision: 2, recordedAtUtc: "2026-11-12T00:00:00Z" });
    expect(minutesHistory([result, later], key, "2026-11-11T00:00:00Z").last5).toBe(34);
    expect(minutesHistory([result, later], key, "2026-11-13T00:00:00Z").last5).toBe(10);
    const noRights = buildResult({ ...draft({ permissions: { ...PERMS, permittedUses: [] } }), revision: 1, recordedAtUtc: "2026-11-10T13:00:00Z" });
    expect(minutesHistory([noRights], key, "2026-11-13T00:00:00Z").games).toBe(0);
  });
});

describe("settle from stored results", () => {
  it("evaluates manually imported results with no provider and is idempotent", async () => {
    const store = new MemoryPipelineStore();
    const s = buildSnapshot(input());
    await store.insertSnapshot(s);
    await recordResultDraft(store, draft(), "2026-11-10T13:00:00Z");
    expect(await settleStoredResults(store, "2026-11-10T14:00:00Z")).toEqual({ evaluationsInserted: 1 });
    expect(await settleStoredResults(store, "2026-11-10T15:00:00Z")).toEqual({ evaluationsInserted: 0 });
  });
});
