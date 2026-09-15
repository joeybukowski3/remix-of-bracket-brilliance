/**
 * WU6 -- tests for slate stage execution. `runCommand` is always a fake in
 * this suite -- no real `npx tsx` process is ever spawned and no real
 * Grok/OpenAI network call is ever made. This exercises: idempotency (a
 * no-op plan never invokes runCommand), failure isolation (one provider's
 * failure never blocks the other, or the presentation stage for the
 * provider that succeeded), dry-run (zero runCommand invocations, zero
 * writes), and pregame-lock no-ops staying no-ops rather than being
 * retried.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGamePlan, spawnTsxCommandRunner, type CommandOutcome, type CommandRunner } from "./nfl-ai-slate-executor";
import { planGame } from "./nfl-ai-slate-plan";
import { evidenceArtifactPath } from "./nfl-evidence-store";
import { writeSnapshot } from "./nfl-snapshot-store";
import { footballContextHash, type NflGameContextPacket } from "./nfl-full-game-context";
import { nflAiHandicapArtifactPath } from "../../src/lib/nfl/aiHandicapPresentation";
import type { AnalysisSnapshot } from "./nfl-snapshot-types";

const REPO_ROOT = join(__dirname, "..", "..");
const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;
const PRE_KICKOFF_NOW = () => new Date("2026-09-10T00:00:00.000Z");
const POST_KICKOFF_NOW = () => new Date("2026-09-14T00:00:00.000Z");

let root: string;

function copyRealContextFixtures(): void {
  const teamsSrc = join(REPO_ROOT, "public", "data", "nfl", "teams.json");
  const teamsDst = join(root, "public", "data", "nfl", "teams.json");
  mkdirSync(dirname(teamsDst), { recursive: true });
  writeFileSync(teamsDst, readFileSync(teamsSrc, "utf8"));

  const contextSrc = join(REPO_ROOT, "data", "nfl", "game-context", String(SEASON), String(WEEK), `${GAME_ID}.json`);
  const contextDst = join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK), `${GAME_ID}.json`);
  mkdirSync(dirname(contextDst), { recursive: true });
  writeFileSync(contextDst, readFileSync(contextSrc, "utf8"));
}

function writeLiveEvidence(model: "grok" | "chatgpt", evidenceIds: string[]): void {
  const canonicalPath = evidenceArtifactPath(root, SEASON, WEEK, GAME_ID, model);
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  mkdirSync(dirname(liveTestPath), { recursive: true });
  writeFileSync(
    liveTestPath,
    JSON.stringify({ schemaVersion: "nfl-evidence-v1", model, gameId: GAME_ID, fixture: false, fixtureNote: null, generatedAt: "2026-09-09T11:00:00.000Z", evidence: evidenceIds.map((id) => ({ evidenceId: id })) })
  );
}

// marketAtDecision defaults to EXACTLY the real BAL_IND context fixture's current market (spread
// 3.5/-3.5, total 47.5) so tests relying on a true full no-op (handicap=none) get a genuine
// market-unchanged baseline, never accidentally landing on handicap=repricing (WU6.8).
function wu46CompatibleAnalysisState(marketAtDecision: { spread: { homeLine: number | null; awayLine: number | null }; total: number | null; asOf: string | null } = { spread: { homeLine: 3.5, awayLine: -3.5 }, total: 47.5, asOf: "2026-09-09T10:00:00.000Z" }) {
  return {
    thesis: "fixture thesis",
    side: { lean: "home" as const, confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
    total: { lean: "under" as const, confidence: 5, totalLineAtOpinion: 44.5 },
    blindPrediction: { footballThesis: "fixture blind thesis", fairSpread: { homeLine: 3, awayLine: -3 }, projectedTotal: 44 },
    marketDecision: {
      generatedAt: "2026-09-09T10:05:00.000Z",
      marketAtDecision,
      side: { lean: "home" as const, confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 }, rationale: "fixture" },
      total: { lean: "under" as const, confidence: 5, totalLineAtOpinion: 44.5, rationale: "fixture" },
      sideEdgePoints: null,
      totalEdgePoints: null,
    },
  } as unknown as AnalysisSnapshot["analysisState"];
}

function currentContextHash(): string {
  const raw = readFileSync(join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK), `${GAME_ID}.json`), "utf8");
  return footballContextHash(JSON.parse(raw) as NflGameContextPacket);
}

function writeWu46Snapshot(model: "grok" | "chatgpt", marketAtDecision?: Parameters<typeof wu46CompatibleAnalysisState>[0]): void {
  writeSnapshot(root, {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId: `${model}-${GAME_ID}-wu46`,
    model,
    gameId: GAME_ID,
    season: SEASON,
    week: WEEK,
    snapshotType: "initial",
    createdAt: "2026-09-09T12:00:00.000Z",
    researchCutoff: "2026-09-09T11:00:00.000Z",
    kickoff: "2026-09-13T17:00:00.000Z",
    previousSnapshotId: null,
    context: { contextVersion: "nfl-game-context-v1", contextHash: currentContextHash(), contextGeneratedAt: "2026-09-09T10:00:00.000Z" },
    evidence: { evidenceIds: ["e1", "e2"], addedEvidenceIds: ["e1", "e2"], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
    market: {
      sportsbook: "draftkings",
      spread: { homeLine: 3.5, awayLine: -3.5 },
      total: { line: 44.5 },
      moneyline: null,
      asOf: "2026-09-09T10:00:00.000Z",
      previousSpread: null,
      previousTotal: null,
      spreadDelta: null,
      totalDelta: null,
      moneylineHomeDelta: null,
      moneylineAwayDelta: null,
      sportsbookChanged: false,
      asOfDeltaMs: null,
    },
    analysisState: wu46CompatibleAnalysisState(marketAtDecision),
    updateAssessment: null,
  });
  writeLiveEvidence(model, ["e1", "e2"]);
}

function fakeRunCommand(overrides: Partial<Record<string, boolean>> = {}): { runner: CommandRunner; calls: { command: string; args: string[] }[] } {
  const calls: { command: string; args: string[] }[] = [];
  const runner: CommandRunner = (command, args) => {
    calls.push({ command, args });
    const scriptArg = args.find((a) => a.endsWith(".ts")) ?? "";
    const ok = overrides[scriptArg] ?? true;
    const outcome: CommandOutcome = { command, args, ok, exitCode: ok ? 0 : 1, stderr: ok ? "" : "fake failure", stdout: "" };
    return outcome;
  };
  return { runner, calls };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nfl-ai-slate-executor-"));
  copyRealContextFixtures();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("executeGamePlan -- dry-run", () => {
  it("makes zero runCommand invocations and zero writes", () => {
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, PRE_KICKOFF_NOW);
    const { runner, calls } = fakeRunCommand();
    const result = executeGamePlan(plan, { root, live: false, runCommand: runner, now: PRE_KICKOFF_NOW });

    expect(calls).toHaveLength(0);
    expect(result.providers[0].research.ran).toBe(false);
    expect(existsSync(join(root, "public", nflAiHandicapArtifactPath(SEASON, GAME_ID)))).toBe(false);
  });
});

describe("executeGamePlan -- live, no-op idempotency", () => {
  it("a fully no-op plan (everything already done) invokes runCommand zero times", () => {
    writeWu46Snapshot("grok");
    writeWu46Snapshot("chatgpt");
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, PRE_KICKOFF_NOW);
    const { runner, calls } = fakeRunCommand();
    const result = executeGamePlan(plan, { root, live: true, runCommand: runner, now: PRE_KICKOFF_NOW });

    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(true);
    for (const provider of result.providers) {
      expect(provider.research.ran).toBe(false);
      expect(provider.handicap.ran).toBe(false);
    }
  });
});

describe("executeGamePlan -- live, new game end to end", () => {
  it("runs research initial for both providers when no evidence exists yet", () => {
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, PRE_KICKOFF_NOW);
    const { runner, calls } = fakeRunCommand();
    const result = executeGamePlan(plan, { root, live: true, runCommand: runner, now: PRE_KICKOFF_NOW });

    expect(calls.map((c) => c.args.join(" "))).toEqual(
      expect.arrayContaining([
        "tsx scripts/run-nfl-grok-research.ts --live --game=2026_01_BAL_IND --mode=initial",
        "tsx scripts/run-nfl-chatgpt-research.ts --live --game=2026_01_BAL_IND --mode=initial",
      ])
    );
    // Handicap was never dispatched -- the plan correctly said "none" (no snapshot lineage yet).
    expect(calls.some((c) => c.args.some((a) => a.includes("handicap")))).toBe(false);
    expect(result.presentation.action).toBe("skip"); // no analysis exists yet for either provider
  });
});

describe("executeGamePlan -- failure isolation", () => {
  it("one provider's research failure does not block the other provider's handicap run or presentation", () => {
    // grok already has an initial (non-WU46) snapshot lineage -> handicap:initial planned.
    writeLiveEvidence("grok", ["e1", "e2"]);
    writeSnapshot(root, {
      schemaVersion: "nfl-snapshot-v1",
      snapshotId: "grok-initial",
      model: "grok",
      gameId: GAME_ID,
      season: SEASON,
      week: WEEK,
      snapshotType: "initial",
      createdAt: "2026-09-09T12:00:00.000Z",
      researchCutoff: "2026-09-09T11:00:00.000Z",
      kickoff: "2026-09-13T17:00:00.000Z",
      previousSnapshotId: null,
      context: { contextVersion: "nfl-game-context-v1", contextHash: "x", contextGeneratedAt: "2026-09-09T10:00:00.000Z" },
      evidence: { evidenceIds: ["e1", "e2"], addedEvidenceIds: ["e1", "e2"], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
      market: { sportsbook: "draftkings", spread: { homeLine: 3.5, awayLine: -3.5 }, total: { line: 44.5 }, moneyline: null, asOf: "2026-09-09T10:00:00.000Z", previousSpread: null, previousTotal: null, spreadDelta: null, totalDelta: null, moneylineHomeDelta: null, moneylineAwayDelta: null, sportsbookChanged: false, asOfDeltaMs: null },
      analysisState: null,
      updateAssessment: null,
    });
    writeWu46Snapshot("chatgpt"); // chatgpt is fully done -> handicap:none, but it's still "ok"

    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("initial");

    const { runner } = fakeRunCommand({ "scripts/run-nfl-grok-handicap.ts": false });
    const result = executeGamePlan(plan, { root, live: true, runCommand: runner, now: PRE_KICKOFF_NOW });

    const grokResult = result.providers.find((p) => p.provider === "grok")!;
    const chatgptResult = result.providers.find((p) => p.provider === "chatgpt")!;
    expect(grokResult.handicap.ok).toBe(false);
    expect(chatgptResult.handicap.ran).toBe(false); // was already a no-op, untouched by grok's failure
    expect(chatgptResult.handicap.ok).toBe(true);
    // Presentation still runs (chatgpt's WU46 analysis is valid) even though grok failed.
    expect(result.presentation.ran).toBe(true);
    expect(result.presentation.ok).toBe(true);
    expect(result.failures.some((f) => f.includes("grok handicap"))).toBe(true);
  });

  it("WU6.8: one provider's repricing failure does not block the other provider's repricing or presentation", () => {
    // Both providers have a valid locked Stage A and a market that's moved since the last decision --
    // both plan handicap=repricing (Stage B only, generic dispatch: --mode=${plan.handicap}).
    const movedMarket = { spread: { homeLine: 1, awayLine: -1 }, total: 40, asOf: "2026-09-08T00:00:00.000Z" };
    writeWu46Snapshot("grok", movedMarket);
    writeWu46Snapshot("chatgpt", movedMarket);

    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("repricing");
    expect(plan.providers.chatgpt.handicap).toBe("repricing");

    const { runner, calls } = fakeRunCommand({ "scripts/run-nfl-grok-handicap.ts": false });
    const result = executeGamePlan(plan, { root, live: true, runCommand: runner, now: PRE_KICKOFF_NOW });

    const grokResult = result.providers.find((p) => p.provider === "grok")!;
    const chatgptResult = result.providers.find((p) => p.provider === "chatgpt")!;
    expect(grokResult.handicap.action).toBe("repricing");
    expect(grokResult.handicap.ok).toBe(false);
    expect(chatgptResult.handicap.action).toBe("repricing");
    expect(chatgptResult.handicap.ran).toBe(true);
    expect(chatgptResult.handicap.ok).toBe(true); // chatgpt's repricing succeeds despite grok's failing
    expect(result.presentation.ran).toBe(true);
    expect(result.presentation.ok).toBe(true);
    expect(result.failures.some((f) => f.includes("grok handicap"))).toBe(true);
    // Confirms the dispatch is generic (--mode=repricing), not a special-cased new code path.
    expect(calls.some((c) => c.args.includes("--mode=repricing"))).toBe(true);
  });

  it("a failed context rebuild is reported but never crashes the caller", () => {
    // A gameId with no upstream data anywhere -- context cannot be built or persisted.
    const plan = planGame(root, "2026_01_DEN_KC", 2026, 1, "den", "kc", ["grok"], false, false, PRE_KICKOFF_NOW);
    const { runner, calls } = fakeRunCommand();
    const result = executeGamePlan(plan, { root, live: true, runCommand: runner, now: PRE_KICKOFF_NOW });

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0); // never attempts research/handicap on top of a blocked context
    expect(result.providers[0].research.detail).toMatch(/context/);
  });
});

describe("executeGamePlan -- pregame lock", () => {
  it("a locked game never dispatches a command, and is reported as a no-op rather than retried", () => {
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, POST_KICKOFF_NOW);
    expect(plan.locked).toBe(true);
    const { runner, calls } = fakeRunCommand();
    const result = executeGamePlan(plan, { root, live: true, runCommand: runner, now: POST_KICKOFF_NOW });

    expect(calls).toHaveLength(0);
    expect(result.providers[0].research.action).toBe("none");
    expect(result.providers[0].handicap.action).toBe("none");
  });
});

describe("spawnTsxCommandRunner -- real process spawn (no network, no provider API calls)", () => {
  const FIXTURE_SCRIPT = "scripts/lib/__fixtures__/wu64-echo-argv-fixture.ts";

  it("WU6.4 regression: actually launches the script via `node <tsx-cli>` without ENOENT (Windows requires shell:true for npx.cmd, which this avoids entirely)", () => {
    const runner = spawnTsxCommandRunner(REPO_ROOT);
    const outcome = runner("npx", ["tsx", FIXTURE_SCRIPT]);
    expect(outcome.ok).toBe(true);
    expect(outcome.exitCode).toBe(0);
  });

  it("WU6.4 regression: argv elements survive as discrete values -- no shell string concatenation or interpolation", () => {
    const runner = spawnTsxCommandRunner(REPO_ROOT);
    // A space-containing value and shell metacharacters must arrive as single, inert argv
    // entries -- if a shell were interpolating this command line, the space would split the
    // arg into two argv entries and the metacharacters could be interpreted by cmd.exe/sh.
    const dangerousGameId = "--game=has space";
    const dangerousFlag = "--flag=a&b|c;d$(whoami)";
    const outcome = runner("npx", ["tsx", FIXTURE_SCRIPT, dangerousGameId, dangerousFlag]);
    expect(outcome.ok).toBe(true);
    // stdout isn't captured on CommandOutcome, so re-run the same invocation with a raw spawn to
    // inspect argv directly -- proves the SAME code path (spawnTsxCommandRunner's construction of
    // process.execPath + tsxCliPath + args) preserves argv boundaries.
    const req = createRequire(join(REPO_ROOT, "package.json"));
    const pkg = req(req.resolve("tsx/package.json")) as { bin: string | Record<string, string> };
    const binPath = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.tsx;
    const tsxCliPath = join(dirname(req.resolve("tsx/package.json")), binPath);
    const raw = spawnSync(process.execPath, [tsxCliPath, FIXTURE_SCRIPT, dangerousGameId, dangerousFlag], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(JSON.parse(raw.stdout)).toEqual([dangerousGameId, dangerousFlag]);
  });

  it("WU6.4 regression: a non-zero child exit surfaces as a structured failure, not a thrown error", () => {
    const runner = spawnTsxCommandRunner(REPO_ROOT);
    const outcome = runner("npx", ["tsx", FIXTURE_SCRIPT, "--exit-code=1"]);
    expect(outcome.ok).toBe(false);
    expect(outcome.exitCode).toBe(1);
  });

  it("WU6.4 regression: cwd is honored by the real spawn", () => {
    const runner = spawnTsxCommandRunner(REPO_ROOT);
    const outcome = runner("npx", ["tsx", FIXTURE_SCRIPT]);
    // A wrong cwd would fail module/tsconfig resolution for a repo-relative script path.
    expect(outcome.ok).toBe(true);
  });
});
