/**
 * Research-pipeline core: contracts, settlement, storage, capture window,
 * request budgets, manual import and statistics. Synthetic data only.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore } from "../../api-quota/store";
import { at, IMPORT_NOW, makeGame, MIN, quotaSetup, TIPOFF } from "./__fixtures__/pipelineFixtures";
import { planCaptureBudget, projectSlateCost } from "./pipeline/budget";
import { decideCapture, DEFAULT_CAPTURE_POLICY, assertCapturePolicy, summarizeCaptureState } from "./pipeline/captureWindow";
import {
  buildEvaluation,
  buildResult,
  buildSnapshot,
  parseResult,
  parseSnapshot,
  PipelineValidationError,
  playerKeyOf,
  type NbaFinalResult,
  type NbaPregameSnapshot,
  type SnapshotInput,
} from "./pipeline/contracts";
import { gamesFromSnapshots, importLinesCsv as importLinesRaw, importResultsCsv, type ImportAttestation, type LineImportOptions } from "./pipeline/manualImport";
import { ODDS_SOURCE_LICENSES, ODDS_SOURCE_PROFILES } from "./pipeline/oddsSources";
import { parseCsv } from "./pipeline/csv";
import { recordResultDraft } from "./pipeline/resultsRecorder";
import { americanToDecimal, buildProbabilities, evaluateSnapshot, expectedValue, noVigProbabilities, realizedProfit, settleProp } from "./pipeline/settlement";
import { evEvaluations, freezePartitions, joinEvaluations, minutesHistory, overUnderRecords, projectionErrors, seasonOfInstant, verifyFrozenPartitions, isAuthenticLine } from "./pipeline/statistics";
import { FilePipelineStore, MemoryPipelineStore, RevisionConflictError } from "./pipeline/store";
import { DATA_USES } from "./sources/types";

const GAME = makeGame();
const PLAYER = { canonicalPlayerId: null, sourcePlayerName: "Sam Rivera", sourcePlayerId: null, team: "NYK" } as const;
const PERMS = { permittedUses: [...DATA_USES].filter((u) => u !== "raw-redistribution") as NbaPregameSnapshot["permissions"]["permittedUses"], licenseBasis: "synthetic test lines", licenseReviewedOn: "2026-10-19", attestation: null };
const CAPTURED = at(TIPOFF, 150).toISOString().replace(".000Z", "Z");

function snapshotInput(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    game: { canonicalGameKey: GAME.canonicalGameKey, sourceEventId: "evt-1", tipoffUtc: GAME.tipoffUtc, awayTeam: "NYK", homeTeam: "BOS", neutralSite: false },
    player: PLAYER,
    market: "pts",
    source: { sourceId: "synthetic-odds", method: "synthetic", sportsbook: "bookone", sourceMarketKey: "player_points" },
    line: 24.5,
    overPrice: -115,
    underPrice: -105,
    sourceLastUpdateUtc: at(TIPOFF, 160).toISOString().replace(".000Z", "Z"),
    capturedAtUtc: CAPTURED,
    maxAgeMinutes: 120,
    projection: { value: 26.1, minutes: 33.5, modelVersion: "nba-props-baseline-v0", inputCutoffUtc: at(TIPOFF, 200).toISOString().replace(".000Z", "Z"), unavailableReason: null },
    permissions: PERMS,
    provenance: { runId: "run-1", importBatchId: null, creditsCharged: 3 },
    ...over,
  };
}
const snap = (over: Partial<SnapshotInput> = {}) => buildSnapshot(snapshotInput(over));

function resultFor(over: Partial<Parameters<typeof buildResult>[0]> = {}): NbaFinalResult {
  return buildResult({
    game: { canonicalGameKey: GAME.canonicalGameKey, tipoffUtc: GAME.tipoffUtc, status: "final", periods: 4, finalizedAtUtc: "2026-11-10T03:05:00Z" },
    player: PLAYER,
    participation: "played",
    stats: { minutes: 34.2, pts: 27, reb: 5, ast: 6 },
    recordedAtUtc: "2026-11-10T12:00:00Z",
    revision: 1,
    correctionReason: null,
    provider: { sourceId: "synthetic-results", method: "synthetic" },
    evidence: { sourceSnapshotId: "res-1", importBatchId: null, rowRef: null },
    permissions: PERMS,
    ...over,
  });
}

describe("record contracts", () => {
  it("builds a deterministic, self-verifying snapshot", () => {
    const a = snap();
    expect(snap()).toEqual(a);
    expect(a.snapshotId).toBe(`snap_${a.contentSha256.slice(0, 32)}`);
    expect(a.timing.minutesToTipoff).toBe(150);
    expect(a.freshness).toMatchObject({ status: "fresh", ageMinutes: 10 });
    expect(snap({ line: 25.5 }).snapshotId).not.toBe(a.snapshotId);
  });

  it("detects any edit to a stored snapshot", () => {
    const a = snap();
    expect(() => parseSnapshot({ ...a, line: 99.5 })).toThrow(PipelineValidationError);
    expect(() => parseSnapshot({ ...a, projection: { ...a.projection, value: 1 } })).toThrow(/content hash/);
  });

  it("rejects a snapshot captured at or after tipoff, with inputs from the future, or a postgame-looking line", () => {
    expect(() => snap({ capturedAtUtc: TIPOFF })).toThrow(/before tipoff/);
    expect(() => snap({ capturedAtUtc: at(TIPOFF, -5).toISOString().replace(".000Z", "Z"), sourceLastUpdateUtc: null })).toThrow(PipelineValidationError);
    expect(() => snap({ projection: { value: 20, minutes: 30, modelVersion: "m", inputCutoffUtc: at(TIPOFF, 100).toISOString().replace(".000Z", "Z"), unavailableReason: null } })).toThrow(/postdate the capture/);
    expect(() => snap({ sourceLastUpdateUtc: at(TIPOFF, 100).toISOString().replace(".000Z", "Z") })).toThrow(/after the capture/);
  });

  it("validates lines, prices, probabilities and rights", () => {
    expect(() => snap({ line: 24.3 })).toThrow(/multiple of 0.5/);
    expect(() => snap({ overPrice: -50 })).toThrow(/American price/);
    expect(() => snap({ overPrice: 100.5 })).toThrow();
    expect(() => snap({ probabilities: { pOver: 0.6, pUnder: 0.5, evOver: 0, evUnder: 0, calibrationVersion: "c1" } })).toThrow(/must be 1/);
    expect(() => snap({ permissions: { ...PERMS, permittedUses: ["raw-redistribution"] } })).not.toThrow(); // synthetic only
    expect(() => snap({ source: { sourceId: "the-odds-api", method: "api", sportsbook: "b", sourceMarketKey: "player_points" }, permissions: { ...PERMS, permittedUses: ["raw-redistribution"] } })).toThrow(/never granted/);
    expect(() => snap({ projection: { value: null, minutes: null, modelVersion: null, inputCutoffUtc: null, unavailableReason: null } })).toThrow(/needs a reason/);
  });

  it("flags a stale line explicitly instead of dropping it", () => {
    const stale = snap({ sourceLastUpdateUtc: at(TIPOFF, 400).toISOString().replace(".000Z", "Z") });
    expect(stale.freshness).toMatchObject({ status: "stale", maxAgeMinutes: 120 });
    expect(isAuthenticLine(stale, { allowSynthetic: true })).toBe(false);
  });

  it("ties a player's snapshot and result with the same key, by id or by name and team", () => {
    expect(playerKeyOf(PLAYER)).toBe("name:sam rivera|NYK");
    expect(playerKeyOf({ ...PLAYER, sourcePlayerName: "Sám Rivera Jr." })).toBe("name:sam rivera|NYK");
    expect(playerKeyOf({ ...PLAYER, canonicalPlayerId: "p:7" })).toBe("p:7");
  });

  it("enforces the result contract: stats iff played, no DNP before final, revision chain, evidence", () => {
    expect(() => resultFor({ stats: null })).toThrow(/stats exist exactly when/);
    expect(() => resultFor({ participation: "dnp_confirmed", stats: { minutes: 1, pts: 0, reb: 0, ast: 0 } })).toThrow();
    expect(() => resultFor({ participation: "dnp_confirmed", stats: null, game: { canonicalGameKey: GAME.canonicalGameKey, tipoffUtc: GAME.tipoffUtc, status: "in_progress", periods: null, finalizedAtUtc: null } })).toThrow(/final game/);
    expect(resultFor({ participation: "unverified_absent", stats: null }).participation).toBe("unverified_absent");
    expect(() => resultFor({ revision: 2, correctionReason: null })).toThrow(/reason/);
    expect(() => resultFor({ evidence: { sourceSnapshotId: null, importBatchId: null, rowRef: null } })).toThrow(/evidence/);
    expect(() => parseResult({ ...resultFor(), stats: { minutes: 34.2, pts: 99, reb: 5, ast: 6 } })).toThrow(/content hash/);
  });

  it("makes an evaluation point at the exact snapshot it judges", () => {
    const s = snap();
    const e = buildEvaluation({ snapshot: s, revision: 1, resultId: "r", resultRevision: 1, resultPermittedUses: ["private-research"], settlement: "over", reason: null, actual: 27, errors: { projection: -0.9, minutes: -0.7 }, evaluatedAtUtc: "2026-11-10T12:00:00Z" });
    expect(e).toMatchObject({ snapshotId: s.snapshotId, snapshotSha256: s.contentSha256, margin: 2.5 });
    expect(() => buildEvaluation({ snapshot: s, revision: 1, resultId: "r", resultRevision: 1, resultPermittedUses: [], settlement: "under", reason: null, actual: 27, errors: { projection: null, minutes: null }, evaluatedAtUtc: "2026-11-10T12:00:00Z" })).toThrow(/under requires/);
    expect(() => buildEvaluation({ snapshot: s, revision: 1, resultId: null, resultRevision: null, resultPermittedUses: [], settlement: "void", reason: null, actual: null, errors: { projection: null, minutes: null }, evaluatedAtUtc: "2026-11-10T12:00:00Z" })).toThrow(/need a reason/);
  });
});

describe("settlement", () => {
  const s = snap();
  it("settles over, under and push on full-game totals", () => {
    expect(settleProp(s, resultFor({ stats: { minutes: 30, pts: 25, reb: 1, ast: 1 } }))).toMatchObject({ settlement: "over", actual: 25 });
    expect(settleProp(s, resultFor({ stats: { minutes: 30, pts: 24, reb: 1, ast: 1 } }))).toMatchObject({ settlement: "under" });
    const whole = snap({ line: 25 });
    expect(settleProp(whole, resultFor({ stats: { minutes: 30, pts: 25, reb: 1, ast: 1 } }))).toMatchObject({ settlement: "push" });
  });

  it("counts overtime in the totals", () => {
    const ot = resultFor({ game: { canonicalGameKey: GAME.canonicalGameKey, tipoffUtc: GAME.tipoffUtc, status: "final", periods: 6, finalizedAtUtc: "2026-11-10T03:40:00Z" }, stats: { minutes: 47.5, pts: 31, reb: 5, ast: 6 } });
    expect(settleProp(s, ot)).toMatchObject({ settlement: "over", actual: 31 });
  });

  it("voids a confirmed DNP, but leaves an absence from the box score pending", () => {
    expect(settleProp(s, resultFor({ participation: "dnp_confirmed", stats: null }))).toMatchObject({ settlement: "void", reason: "player_did_not_play" });
    expect(settleProp(s, resultFor({ participation: "unverified_absent", stats: null }))).toMatchObject({ settlement: "pending", reason: "participation_unverified" });
  });

  it("voids postponed and cancelled games, and holds games not yet final", () => {
    const base = { canonicalGameKey: GAME.canonicalGameKey, tipoffUtc: GAME.tipoffUtc, periods: null, finalizedAtUtc: null };
    const absent = { participation: "unverified_absent" as const, stats: null };
    expect(settleProp(s, resultFor({ ...absent, game: { ...base, status: "postponed" } }))).toMatchObject({ settlement: "void", reason: "game_postponed" });
    expect(settleProp(s, resultFor({ ...absent, game: { ...base, status: "cancelled" } }))).toMatchObject({ settlement: "void" });
    expect(settleProp(s, resultFor({ ...absent, game: { ...base, status: "in_progress" } }))).toMatchObject({ settlement: "pending", reason: "game_in_progress" });
    expect(settleProp(s, resultFor({ ...absent, game: { ...base, status: "suspended" } }))).toMatchObject({ settlement: "pending" });
    expect(settleProp(s, null)).toMatchObject({ settlement: "pending", reason: "no_result_yet" });
  });

  it("computes projection and minutes error as projection minus actual", () => {
    const settled = settleProp(s, resultFor({ stats: { minutes: 30, pts: 25, reb: 1, ast: 1 } }));
    expect(settled.errors.projection).toBeCloseTo(26.1 - 25, 10);
    expect(settled.errors.minutes).toBeCloseTo(33.5 - 30, 10);
    expect(settleProp(snap({ projection: { unavailableReason: "none" } }), resultFor()).errors).toEqual({ projection: null, minutes: null });
  });

  it("appends a new evaluation revision only when something changed", () => {
    const first = evaluateSnapshot(s, resultFor(), null, "2026-11-10T12:00:00Z")!;
    expect(first).toMatchObject({ revision: 1, settlement: "over", resultRevision: 1 });
    expect(evaluateSnapshot(s, resultFor(), first, "2026-11-11T12:00:00Z")).toBeNull();
    const corrected = resultFor({ revision: 2, correctionReason: "stat correction", stats: { minutes: 34.2, pts: 24, reb: 5, ast: 6 } });
    const second = evaluateSnapshot(s, corrected, first, "2026-11-11T12:00:00Z")!;
    expect(second).toMatchObject({ revision: 2, supersedesRevision: 1, settlement: "under", resultRevision: 2 });
  });

  it("converts prices and EV correctly", () => {
    expect(americanToDecimal(-110)).toBeCloseTo(1.909091, 5);
    expect(americanToDecimal(150)).toBe(2.5);
    const nv = noVigProbabilities(-110, -110);
    expect(nv.pOver).toBeCloseTo(0.5, 10);
    expect(nv.overround).toBeCloseTo(0.0476, 3);
    expect(expectedValue(0.55, -110)).toBeCloseTo(0.55 * 0.909091 - 0.45, 5);
    expect(buildProbabilities(0.55, -110, -110, "cal-1").evOver).toBeGreaterThan(0);
    expect(realizedProfit("over", "over", 150)).toBe(1.5);
    expect(realizedProfit("over", "under", 150)).toBe(-1);
    expect(realizedProfit("over", "push", 150)).toBe(0);
    expect(realizedProfit("over", "pending", 150)).toBeNull();
    expect(() => americanToDecimal(50)).toThrow();
  });
});

describe("append-only storage", () => {
  it("never overwrites a snapshot: re-inserting is a duplicate, and nothing can edit one", async () => {
    const store = new MemoryPipelineStore();
    const s = snap();
    expect(await store.insertSnapshot(s)).toBe("inserted");
    expect(await store.insertSnapshot(s)).toBe("duplicate");
    expect(await store.listSnapshots()).toHaveLength(1);
    expect(Object.keys(store).sort().join()).not.toMatch(/update|delete/);
    const read = (await store.listSnapshots())[0];
    read.line = 99;
    expect((await store.listSnapshots())[0].line).toBe(24.5);
  });

  it("chains result revisions strictly and refuses a no-op revision", async () => {
    const store = new MemoryPipelineStore();
    expect(await store.appendResult(resultFor())).toBe("inserted");
    expect(await store.appendResult(resultFor())).toBe("duplicate");
    await expect(store.appendResult(resultFor({ revision: 3, correctionReason: "x", stats: { minutes: 1, pts: 1, reb: 1, ast: 1 } }))).rejects.toThrow(RevisionConflictError);
    await expect(store.appendResult(resultFor({ revision: 2, correctionReason: "same again" }))).rejects.toThrow(/changes nothing/);
    expect(await store.appendResult(resultFor({ revision: 2, correctionReason: "box score corrected", stats: { minutes: 34.2, pts: 28, reb: 5, ast: 6 } }))).toBe("inserted");
    expect((await store.latestResult(GAME.canonicalGameKey, playerKeyOf(PLAYER)))!.revision).toBe(2);
    expect(await store.listResults()).toHaveLength(2);
  });

  it("records an unverified absence and later a confirmed DNP as revisions of the same player-game", async () => {
    const store = new MemoryPipelineStore();
    const draft = (participation: "unverified_absent" | "dnp_confirmed") => ({
      game: { canonicalGameKey: GAME.canonicalGameKey, tipoffUtc: GAME.tipoffUtc, status: "final" as const, periods: 4, finalizedAtUtc: "2026-11-10T03:05:00Z" },
      player: PLAYER, participation, stats: null, correctionReason: participation === "dnp_confirmed" ? "confirmed by the team" : null,
      provider: { sourceId: "synthetic-results", method: "synthetic" as const }, evidence: { sourceSnapshotId: "x", importBatchId: null, rowRef: null }, permissions: PERMS,
    });
    expect((await recordResultDraft(store, draft("unverified_absent"), "2026-11-10T12:00:00Z")).outcome).toBe("inserted");
    expect((await recordResultDraft(store, draft("unverified_absent"), "2026-11-10T13:00:00Z")).outcome).toBe("unchanged");
    const second = await recordResultDraft(store, draft("dnp_confirmed"), "2026-11-10T14:00:00Z");
    expect(second.result).toMatchObject({ revision: 2, participation: "dnp_confirmed", correctionReason: "confirmed by the team" });
  });

  it("persists to local JSONL, reloads identically, and fails closed on a corrupt record", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nba-pipeline-"));
    try {
      const store = await FilePipelineStore.open(dir);
      await store.upsertGame(GAME);
      await store.insertSnapshot(snap());
      await store.appendResult(resultFor());
      const reopened = await FilePipelineStore.open(dir);
      expect(await reopened.listSnapshots()).toEqual(await store.listSnapshots());
      expect(await reopened.listResults()).toEqual(await store.listResults());
      expect(await reopened.listGames()).toEqual([GAME]);
      appendFileSync(path.join(dir, "snapshots.jsonl"), `${JSON.stringify({ ...snap({ line: 30.5 }), line: 31.5 })}\n`);
      await expect(FilePipelineStore.open(dir)).rejects.toThrow(/snapshots.jsonl line 2 is invalid/);
      const raw = readFileSync(path.join(dir, "snapshots.jsonl"), "utf8").split("\n")[0];
      writeFileSync(path.join(dir, "snapshots.jsonl"), `${raw}\n`);
      await expect(FilePipelineStore.open(dir)).resolves.toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("holds locks exclusively until released or expired, in memory and on disk", async () => {
    const now = new Date("2026-11-09T20:00:00Z");
    const dir = mkdtempSync(path.join(tmpdir(), "nba-lock-"));
    try {
      for (const store of [new MemoryPipelineStore(), await FilePipelineStore.open(dir)]) {
        expect(await store.acquireLock("capture", "a", 60_000, now)).toBe(true);
        expect(await store.acquireLock("capture", "b", 60_000, now)).toBe(false);
        // Not reentrant: the same owner id cannot take a lock it already holds, so a duplicate run is locked out.
        expect(await store.acquireLock("capture", "a", 60_000, now)).toBe(false);
        expect(await store.acquireLock("capture", "b", 60_000, new Date(now.getTime() + 61_000))).toBe(true);
        await store.releaseLock("capture", "a");
        expect(await store.acquireLock("capture", "c", 60_000, now)).toBe(false);
        await store.releaseLock("capture", "b");
        expect(await store.acquireLock("capture", "c", 60_000, now)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("capture window", () => {
  const state = (over = {}) => ({ snapshotsStored: 0, attempts: 0, lastOutcome: null, ...over });
  const decide = (minutesBefore: number, gameOver = {}, stateOver = {}) => decideCapture(makeGame(gameOver), state(stateOver), at(TIPOFF, minutesBefore));

  it("waits until three hours out, captures in the 120-180 window, tolerates late, and stops at the floor", () => {
    expect(decide(300)).toMatchObject({ action: "wait", capturableAtUtc: "2026-11-09T21:30:00.000Z" });
    expect(decide(200)).toMatchObject({ action: "wait" });
    expect(decide(180)).toMatchObject({ action: "capture", window: "in_window" });
    expect(decide(120)).toMatchObject({ action: "capture", window: "in_window" });
    expect(decide(119)).toMatchObject({ action: "capture", window: "late" });
    expect(decide(45)).toMatchObject({ action: "capture", window: "late" });
    expect(decide(44)).toMatchObject({ action: "skip", reason: "missed_window" });
    expect(decide(-30)).toMatchObject({ action: "skip", reason: "missed_window" });
  });

  it("skips postponed games, already-captured games and exhausted tries", () => {
    expect(decide(150, { status: "postponed" })).toMatchObject({ action: "skip", reason: "postponed" });
    expect(decide(150, { status: "final" })).toMatchObject({ action: "skip", reason: "not_scheduled" });
    expect(decide(150, {}, { snapshotsStored: 4 })).toMatchObject({ reason: "already_captured" });
    expect(decide(150, {}, { attempts: 1, lastOutcome: "no_market" })).toMatchObject({ action: "capture" });
    expect(decide(150, {}, { attempts: 2, lastOutcome: "no_market" })).toMatchObject({ reason: "attempts_exhausted" });
  });

  it("counts only attempts that contacted the provider", () => {
    const attempt = (outcome: string, atUtc: string) => ({ schemaVersion: "nba-capture-attempt-v1" as const, attemptId: atUtc, runId: "r", canonicalGameKey: GAME.canonicalGameKey, outcome: outcome as never, reason: null, minutesToTipoff: 150, creditsCharged: 0, linesStored: 0, atUtc });
    expect(summarizeCaptureState([attempt("blocked", "2026-11-09T21:00:00Z"), attempt("budget_exhausted", "2026-11-09T21:10:00Z")], 0)).toMatchObject({ attempts: 0, lastOutcome: null });
    expect(summarizeCaptureState([attempt("no_market", "2026-11-09T21:00:00Z"), attempt("captured", "2026-11-09T22:00:00Z")], 0)).toMatchObject({ attempts: 2, lastOutcome: "captured" });
  });

  it("rejects an inconsistent policy", () => {
    expect(() => assertCapturePolicy({ ...DEFAULT_CAPTURE_POLICY, floorMinutes: 130 })).toThrow();
    expect(() => assertCapturePolicy({ ...DEFAULT_CAPTURE_POLICY, maxAttemptsPerGame: 0 })).toThrow();
    expect(() => assertCapturePolicy(DEFAULT_CAPTURE_POLICY)).not.toThrow();
  });
});

describe("odds-source records", () => {
  it("limits The Odds API to research, model development and display after the owner decision", () => {
    expect(ODDS_SOURCE_LICENSES["the-odds-api"].permittedUses).toEqual(["private-research", "model-development", "public-display"]);
    for (const id of ["parlayapi", "manual-import"] as const) expect(ODDS_SOURCE_LICENSES[id].permittedUses).toEqual([]);
    expect(ODDS_SOURCE_LICENSES.parlayapi.status).toBe("restricted");
    expect(ODDS_SOURCE_LICENSES["synthetic-odds"].permittedUses).toEqual([...DATA_USES]);
    expect(Object.isFrozen(ODDS_SOURCE_LICENSES)).toBe(true);
  });

  it("map every live odds source to a registered quota account", () => {
    const ids = new Set(PROVIDER_ACCOUNTS.map((a) => a.accountId));
    for (const profile of Object.values(ODDS_SOURCE_PROFILES)) {
      if (profile.method === "api") expect(ids.has(profile.quotaAccountId!)).toBe(true);
      else expect(profile.quotaAccountId).toBeNull();
    }
  });
});

describe("request budgets", () => {
  it("projects the credit cost of 5- and 10-game slates", () => {
    expect(projectSlateCost(5, 3, 25)).toMatchObject({ creditsPerDay: 15, creditsPerMonth: 375 });
    expect(projectSlateCost(10, 3, 25)).toMatchObject({ creditsPerDay: 30, creditsPerMonth: 750 });
    expect(projectSlateCost(5, 1, 25)).toMatchObject({ creditsPerDay: 5, creditsPerMonth: 125 });
    expect(projectSlateCost(10, 1, 25).creditsPerMonth).toBe(250);
  });

  it("requires approval on the real shared Odds API pool, so no NBA credit can be planned against NFL/MLB/PGA", async () => {
    const manager = new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store: new MemoryUsageStore(), now: () => new Date("2026-11-09T20:00:00Z") });
    const plan = await planCaptureBudget({ manager, accountId: "the-odds-api:unverified-pool", gameKeys: ["g1", "g2"], marketsPerGame: 3, allowance: { perDayCredits: 90, perMonthCredits: 400 }, now: new Date("2026-11-09T20:00:00Z") });
    expect(plan.affordable).toEqual([]);
    expect(plan.blocked?.code).toBe("NOT_APPROVED");
    expect(plan.deferred.every((d) => d.reason === "account_blocked")).toBe(true);
    const parlay = await planCaptureBudget({ manager, accountId: "parlayapi:primary", gameKeys: ["g1"], marketsPerGame: 3, allowance: { perDayCredits: 90, perMonthCredits: 400 }, now: new Date("2026-11-09T20:00:00Z") });
    expect(parlay.blocked).not.toBeNull();
  });

  it("caps a 10-game slate at the NBA daily allowance even when the pool has room", async () => {
    const { manager, accountId } = await quotaSetup();
    const keys = Array.from({ length: 10 }, (_, i) => `g${i}`);
    const plan = await planCaptureBudget({ manager, accountId, gameKeys: keys, marketsPerGame: 3, allowance: { perDayCredits: 15, perMonthCredits: 400 }, now: new Date("2026-11-09T20:00:00Z") });
    expect(plan.affordable).toHaveLength(5);
    expect(plan.creditsPlanned).toBe(15);
    expect(plan.deferred).toHaveLength(5);
    expect(plan.deferred.every((d) => d.reason === "nba_daily_allowance")).toBe(true);
  });

  it("stops at quota exhaustion and does not count other sports against the NBA allowance", async () => {
    const { manager, accountId, time } = await quotaSetup({ windows: [{ kind: "month", limit: 20, source: "provider-docs", resetDayOfMonth: 1 }] }, "2026-11-09T20:00:00Z", 10);
    const plan = await planCaptureBudget({ manager, accountId, gameKeys: ["a", "b", "c", "d"], marketsPerGame: 3, allowance: { perDayCredits: 90, perMonthCredits: 400 }, now: time.now() });
    expect(plan.affordable.map((a) => a.gameKey)).toEqual(["a", "b", "c"]); // 10 used + 9 = 19 fits; a fourth would reach 22 > 20
    expect(plan.deferred[0]).toMatchObject({ gameKey: "d", reason: "quota_denied" });
    // An NFL reservation consumes the pool but not the NBA allowance.
    const res = await manager.reserve(accountId, { priority: "essential", attribution: { sport: "nfl", workflow: "lines", endpoint: "/odds" } }, { units: 3, basis: "nfl" });
    expect(res.allowed).toBe(true);
    const after = await planCaptureBudget({ manager, accountId, gameKeys: ["a", "b", "c", "d"], marketsPerGame: 3, allowance: { perDayCredits: 90, perMonthCredits: 400 }, now: time.now() });
    expect(after.affordable).toHaveLength(2);
  });

  it("counts NBA spending from the ledger toward the monthly allowance", async () => {
    const { manager, accountId, time } = await quotaSetup();
    const gate = (await import("./pipeline/budget")).quotaRequestGate(manager, accountId, "pregame-capture");
    const r = await gate.reserve(3, "/events/{id}/odds");
    expect(r.ok).toBe(true);
    if (r.ok) await r.settle(3, "ok");
    const plan = await planCaptureBudget({ manager, accountId, gameKeys: ["a", "b"], marketsPerGame: 3, allowance: { perDayCredits: 90, perMonthCredits: 6 }, now: time.now() });
    expect(plan.affordable).toHaveLength(1);
    expect(plan.deferred[0].reason).toBe("nba_monthly_allowance");
  });
});

const importLinesCsv = (text: string, options: LineImportOptions) => importLinesRaw(text, { now: IMPORT_NOW, ...options });
const ATTEST: ImportAttestation = { attestedBy: "Joe", attestedOn: "2026-11-09", origin: "typed by hand from a sportsbook app at 3:05 pm ET", permittedUses: ["private-research"] };
const HEADER = "captured_at_utc,tipoff_utc,away_team,home_team,player,team,market,sportsbook,line,over_price,under_price,source_last_update_utc";
const row = (over: Record<string, string> = {}) => {
  const base: Record<string, string> = { captured_at_utc: "2026-11-09T21:05:00Z", tipoff_utc: TIPOFF, away_team: "NYK", home_team: "BOS", player: "Sam Rivera", team: "NYK", market: "points", sportsbook: "BookOne", line: "24.5", over_price: "-115", under_price: "-105", source_last_update_utc: "2026-11-09T21:00:00Z" };
  return Object.keys(base).map((k) => (/[",]/.test(over[k] ?? base[k]) ? `"${(over[k] ?? base[k]).replace(/"/g, '""')}"` : over[k] ?? base[k])).join(",");
};

describe("manual CSV import", () => {
  it("parses quoted fields, embedded commas, doubled quotes, BOM and CRLF", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(() => parseCsv('a,"b')).toThrow(/quoted/);
  });

  it("imports valid pregame lines with the importer's attestation and no raw-redistribution right", () => {
    const result = importLinesCsv(`${HEADER}\n${row()}\n${row({ market: "rebounds", line: "5.5" })}\n`, { attestation: ATTEST });
    expect(result.rejected).toEqual([]);
    expect(result.snapshots).toHaveLength(2);
    const [s] = result.snapshots;
    expect(s).toMatchObject({ market: "pts", game: { canonicalGameKey: "2026-11-09|NYK@BOS", awayTeam: "NYK", homeTeam: "BOS" }, source: { sourceId: "manual-import", method: "manual-import", sportsbook: "bookone" } });
    expect(s.permissions).toMatchObject({ permittedUses: ["private-research"], attestation: { attestedBy: "Joe", origin: expect.stringContaining("typed by hand") } });
    expect(s.permissions.permittedUses).not.toContain("raw-redistribution");
    expect(s.provenance.importBatchId).toBe(result.batchId);
    expect(s.projection.unavailableReason).toMatch(/no JKB projection/);
    expect(s.timing).toMatchObject({ minutesToTipoff: 205, window: "in_window" });
  });

  it("rejects, with a reason, any row that is not a provable pregame line", () => {
    const text = [
      HEADER,
      row({ captured_at_utc: "2026-11-10T00:31:00Z" }), // after tipoff
      row({ away_team: "XXX" }),
      row({ market: "steals" }),
      row({ team: "LAL" }),
      row({ under_price: "" }),
      row({ line: "abc" }),
      row({ captured_at_utc: "2026-11-09 21:05" }),
      row({ over_price: "-50" }),
      row({ line: "24.3" }),
    ].join("\n");
    const result = importLinesCsv(text, { attestation: ATTEST });
    expect(result.snapshots).toEqual([]);
    expect(result.rejected.map((r) => r.code)).toEqual(["captured_after_tipoff", "unknown_team", "unknown_market", "player_team_not_in_game", "missing_numbers", "missing_numbers", "bad_captured_at", "invalid_row", "invalid_row"]);
  });

  it("is idempotent: the same file gives the same batch and snapshots, and duplicates collapse", async () => {
    const text = `${HEADER}\n${row()}\n${row()}\n`;
    const a = importLinesCsv(text, { attestation: ATTEST });
    const b = importLinesCsv(text, { attestation: ATTEST });
    expect(a.duplicateRows).toBe(1);
    expect(a.batchId).toBe(b.batchId);
    expect(a.snapshots.map((s) => s.snapshotId)).toEqual(b.snapshots.map((s) => s.snapshotId));
    const store = new MemoryPipelineStore();
    for (const s of a.snapshots) await store.insertSnapshot(s);
    for (const s of b.snapshots) expect(await store.insertSnapshot(s)).toBe("duplicate");
    expect(importLinesCsv(text, { attestation: { ...ATTEST, origin: "different origin" } }).batchId).not.toBe(a.batchId);
  });

  it("derives the schedule rows for imported lines, so no schedule provider is needed", async () => {
    const result = importLinesCsv(`${HEADER}\n${row()}\n${row({ player: "Lee Park", team: "BOS" })}\n`, { attestation: ATTEST });
    const games = gamesFromSnapshots(result.snapshots, "2026-11-09T21:10:00Z");
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ canonicalGameKey: "2026-11-09|NYK@BOS", status: "scheduled", awayTeam: "NYK", homeTeam: "BOS" });
    const store = new MemoryPipelineStore();
    await store.upsertGame(games[0]);
    expect(await store.listGames()).toEqual(games);
  });

  it("refuses attestations that overreach or are incomplete, and missing columns", () => {
    expect(() => importLinesCsv(`${HEADER}\n${row()}`, { attestation: { ...ATTEST, permittedUses: ["raw-redistribution"] } })).toThrow(/cannot attest/);
    expect(() => importLinesCsv(`${HEADER}\n${row()}`, { attestation: { ...ATTEST, origin: " " } })).toThrow(/origin/);
    expect(() => importLinesCsv(`${HEADER}\n${row()}`, { attestation: { ...ATTEST, permittedUses: [] } })).toThrow(/at least one/);
    expect(() => importLinesCsv("a,b\n1,2", { attestation: ATTEST })).toThrow(/missing required column/);
  });

  it("imports results, requires a finalization time, and never imports an absence as a DNP", () => {
    const head = "tipoff_utc,away_team,home_team,player,team,participation,game_status,finalized_at_utc,minutes,pts,reb,ast,periods,correction_reason";
    const text = [
      head,
      `${TIPOFF},NYK,BOS,Sam Rivera,NYK,played,final,2026-11-10T03:05:00Z,34.2,27,5,6,4,`,
      `${TIPOFF},NYK,BOS,Lee Park,BOS,dnp_confirmed,final,2026-11-10T03:05:00Z,,,,,4,`,
      `${TIPOFF},NYK,BOS,Ana Cruz,BOS,absent,final,2026-11-10T03:05:00Z,,,,,4,`,
      `${TIPOFF},NYK,BOS,Max Doe,BOS,played,final,,30,10,3,2,4,`,
      `${TIPOFF},NYK,BOS,Kim Wu,BOS,played,final,2026-11-10T03:05:00Z,30,10.5,3,2,4,`,
    ].join("\n");
    const result = importResultsCsv(text, { attestation: ATTEST });
    expect(result.drafts.map((d) => [d.player.sourcePlayerName, d.participation])).toEqual([["Sam Rivera", "played"], ["Lee Park", "dnp_confirmed"]]);
    expect(result.rejected.map((r) => r.code)).toEqual(["bad_participation", "missing_finalized_at", "bad_stats"]);
  });
});

describe("incremental statistics", () => {
  function evaluated(overs: Array<{ points: number; line?: number; player?: string; sportsbook?: string; tipoffMinutesBefore?: number; stale?: boolean; team?: string }>) {
    const snapshots: NbaPregameSnapshot[] = [];
    const evaluations = [];
    for (const [index, o] of overs.entries()) {
      const tipoff = new Date(Date.parse("2026-11-10T00:30:00Z") + index * 86_400_000).toISOString().replace(".000Z", "Z");
      const game = makeGame({ tipoffUtc: tipoff, away: o.team ?? "NYK", home: "BOS" });
      const s = snap({
        game: { canonicalGameKey: game.canonicalGameKey, sourceEventId: "e", tipoffUtc: tipoff, awayTeam: (o.team ?? "NYK") as never, homeTeam: "BOS", neutralSite: false },
        player: { ...PLAYER, sourcePlayerName: o.player ?? "Sam Rivera", team: (o.team ?? "NYK") as never },
        line: o.line ?? 24.5,
        capturedAtUtc: new Date(Date.parse(tipoff) - 150 * MIN).toISOString().replace(".000Z", "Z"),
        sourceLastUpdateUtc: new Date(Date.parse(tipoff) - (o.stale ? 600 : 160) * MIN).toISOString().replace(".000Z", "Z"),
        projection: { value: 25, minutes: 33, modelVersion: "m1", inputCutoffUtc: new Date(Date.parse(tipoff) - 200 * MIN).toISOString().replace(".000Z", "Z"), unavailableReason: null },
        source: { sourceId: "synthetic-odds", method: "synthetic", sportsbook: o.sportsbook ?? "bookone", sourceMarketKey: "player_points" },
      });
      snapshots.push(s);
      const result = resultFor({ game: { canonicalGameKey: game.canonicalGameKey, tipoffUtc: tipoff, status: "final", periods: 4, finalizedAtUtc: new Date(Date.parse(tipoff) + 170 * MIN).toISOString().replace(".000Z", "Z") }, player: s.player, stats: { minutes: 30, pts: o.points, reb: 4, ast: 4 } });
      evaluations.push(evaluateSnapshot(s, result, null, "2026-12-01T00:00:00Z")!);
    }
    return joinEvaluations(snapshots, evaluations);
  }

  it("tallies O/U and pushes against the captured line, by market, player, opponent, venue and book", () => {
    const props = evaluated([{ points: 30 }, { points: 20 }, { points: 25, line: 25 }, { points: 30, player: "Lee Park", team: "NYK" }, { points: 10, sportsbook: "booktwo" }]);
    const opts = { allowSynthetic: true };
    expect(overUnderRecords(props, "market", opts).groups.pts).toMatchObject({ over: 2, under: 2, push: 1, decided: 4, overRate: 0.5 });
    expect(overUnderRecords(props, "player", opts).groups["name:sam rivera|NYK|pts"]).toMatchObject({ over: 1, under: 2, push: 1 });
    expect(overUnderRecords(props, "opponent", opts).groups.BOS.decided).toBe(4);
    expect(overUnderRecords(props, "venue", opts).groups.away.decided).toBe(4);
    expect(overUnderRecords(props, "sportsbook", opts).groups.booktwo).toMatchObject({ under: 1 });
  });

  it("uses only authentic lines: stale and synthetic lines never feed a trend", () => {
    const props = evaluated([{ points: 30 }, { points: 30, stale: true }]);
    expect(overUnderRecords(props, "market").groups).toEqual({}); // synthetic by default
    const withSynthetic = overUnderRecords(props, "market", { allowSynthetic: true });
    expect(withSynthetic.excludedNotAuthentic).toBe(1);
    expect(withSynthetic.groups.pts.decided).toBe(1);
  });

  it("summarizes projection and minutes error as projection minus actual", () => {
    const e = projectionErrors(evaluated([{ points: 30 }, { points: 20 }]));
    expect(e.byMarket.pts).toMatchObject({ n: 2, bias: 0, mae: 5 });
    expect(e.minutes).toMatchObject({ n: 2, bias: 3 });
  });

  it("builds minutes history from games the player played, final before the as-of time", () => {
    const rows = [30, 32, 28, 34, 36, 20].map((minutes, i) =>
      resultFor({ recordedAtUtc: `2026-11-0${i + 1}T04:00:00Z`, game: { canonicalGameKey: `2026-11-0${i + 1}|NYK@BOS`, tipoffUtc: `2026-11-0${i + 1}T00:30:00Z`, status: "final", periods: 4, finalizedAtUtc: `2026-11-0${i + 1}T03:00:00Z` }, stats: { minutes, pts: 1, reb: 1, ast: 1 } }),
    );
    const dnp = resultFor({ recordedAtUtc: "2026-11-07T04:00:00Z", game: { canonicalGameKey: "2026-11-07|NYK@BOS", tipoffUtc: "2026-11-07T00:30:00Z", status: "final", periods: 4, finalizedAtUtc: "2026-11-07T03:00:00Z" }, participation: "dnp_confirmed", stats: null });
    const h = minutesHistory([...rows, dnp], playerKeyOf(PLAYER), "2026-11-08T00:00:00Z");
    expect(h).toMatchObject({ games: 6, last5: (32 + 28 + 34 + 36 + 20) / 5, last10: 30 });
    expect(h.season).toBe(30);
    expect(minutesHistory(rows, playerKeyOf(PLAYER), "2026-11-03T12:00:00Z").games).toBe(3); // later games are not yet final
    expect(seasonOfInstant("2026-11-08T00:00:00Z")).toBe("2026-27");
    expect(seasonOfInstant("2027-03-08T00:00:00Z")).toBe("2026-27");
  });

  it("evaluates calibration and EV only where a calibrated probability exists", () => {
    const base = evaluated([{ points: 30 }, { points: 20 }, { points: 30 }]);
    expect(evEvaluations(base, 0, { allowSynthetic: true })).toEqual([]);
    const withP = base.map((p, i) => ({ ...p, snapshot: { ...p.snapshot, probabilities: buildProbabilities(i === 1 ? 0.3 : 0.7, p.snapshot.overPrice, p.snapshot.underPrice, "cal-1") } }));
    const [ev] = evEvaluations(withP, 0, { allowSynthetic: true });
    expect(ev).toMatchObject({ calibrationVersion: "cal-1", n: 3, bets: 3 });
    expect(ev.calibration.reduce((s, b) => s + b.n, 0)).toBe(3);
    expect(ev.meanRealizedProfit).not.toBeNull();
  });

  it("freezes chronological partitions, excludes rows without training rights, and detects late arrivals", () => {
    const props = evaluated([{ points: 30 }, { points: 20 }, { points: 30 }, { points: 20 }, { points: 30 }]);
    const noRights = props.map((p, i) => (i === 0 ? { ...p, snapshot: { ...p.snapshot, permissions: { ...p.snapshot.permissions, permittedUses: ["private-research" as const] } } } : p));
    const opts = { allowSynthetic: true };
    const parts = freezePartitions(noRights, "2026-11-12T00:30:00Z", "2026-11-14T00:30:00Z", opts);
    expect(parts.manifest.counts).toEqual({ train: 2, gap: 1, holdout: 1 }); // day 1 lacks rights; day 5 > cutoff window -> holdout
    expect(parts.manifest.excluded.noTrainingRights).toBe(1);
    expect(parts.train.some((id) => id === noRights[0].snapshot.snapshotId)).toBe(false);
    expect(() => freezePartitions(props, "2026-11-14T00:30:00Z", "2026-11-12T00:30:00Z")).toThrow(/before holdoutStart/);
    expect(verifyFrozenPartitions(parts.manifest, noRights, opts).unchanged).toBe(true);
    const late = evaluated([{ points: 30 }, { points: 20 }, { points: 30 }, { points: 20 }, { points: 30 }, { points: 22, player: "Late Add" }]);
    expect(verifyFrozenPartitions(parts.manifest, late.map((p, i) => (i === 0 ? noRights[0] : p)), opts).unchanged).toBe(false);
    expect(freezePartitions(props, "2026-11-12T00:30:00Z", "2026-11-14T00:30:00Z").manifest.excluded.notAuthentic).toBe(5); // synthetic excluded by default
  });
});
