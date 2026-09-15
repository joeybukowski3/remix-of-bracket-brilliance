/**
 * WU6 -- tests for the zero-cost slate planning phase. No provider/API call
 * is made anywhere in this suite; every fixture is either the real,
 * committed 2026_01_BAL_IND context artifact (reused so context validation
 * exercises real rules) or a hand-built AnalysisSnapshot/evidence artifact
 * written directly to a temp root via the real store functions.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planGame, planSlate } from "./nfl-ai-slate-plan";
import { evidenceArtifactPath } from "./nfl-evidence-store";
import { writeSnapshot } from "./nfl-snapshot-store";
import { footballContextHash, type NflGameContextPacket } from "./nfl-full-game-context";
import type { AnalysisSnapshot } from "./nfl-snapshot-types";

const REPO_ROOT = join(__dirname, "..", "..");
const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;

let root: string;

// The fixture game's kickoff (2026-09-13T17:00:00Z) is in the past relative to real wall-clock
// time -- pin `now` to a moment before kickoff so non-lock scenarios exercise the intended
// pre-kickoff planning path instead of the (also-tested-separately) post-kickoff lock path.
const PRE_KICKOFF_NOW = () => new Date("2026-09-10T00:00:00.000Z");

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
    JSON.stringify({
      schemaVersion: "nfl-evidence-v1",
      model,
      gameId: GAME_ID,
      fixture: false,
      fixtureNote: null,
      generatedAt: "2026-09-09T11:00:00.000Z",
      evidence: evidenceIds.map((id) => ({ evidenceId: id })),
    })
  );
}

function baseSnapshot(model: "grok" | "chatgpt", overrides: Partial<AnalysisSnapshot>): AnalysisSnapshot {
  return {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId: `${model}-${GAME_ID}-fixture-${Math.random().toString(36).slice(2)}`,
    model,
    gameId: GAME_ID,
    season: SEASON,
    week: WEEK,
    snapshotType: "initial",
    createdAt: "2026-09-09T12:00:00.000Z",
    researchCutoff: "2026-09-09T11:00:00.000Z",
    kickoff: "2026-09-13T17:00:00.000Z",
    previousSnapshotId: null,
    context: { contextVersion: "nfl-game-context-v1", contextHash: "context-hash-A", contextGeneratedAt: "2026-09-09T10:00:00.000Z" },
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
    analysisState: null,
    updateAssessment: null,
    ...overrides,
  };
}

function wu46CompatibleAnalysisState() {
  return {
    thesis: "fixture thesis",
    side: { lean: "home" as const, confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
    total: { lean: "under" as const, confidence: 5, totalLineAtOpinion: 44.5 },
    blindPrediction: { footballThesis: "fixture blind thesis", fairSpread: { homeLine: 3, awayLine: -3 }, projectedTotal: 44 },
    marketDecision: {
      side: { lean: "home" as const, confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 }, rationale: "fixture" },
      total: { lean: "under" as const, confidence: 5, totalLineAtOpinion: 44.5, rationale: "fixture" },
    },
  } as unknown as AnalysisSnapshot["analysisState"];
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nfl-ai-slate-plan-"));
  copyRealContextFixtures();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("planGame -- research decision", () => {
  it("1. new game: no live evidence -> research=initial for both providers, handicap=none", () => {
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, PRE_KICKOFF_NOW);
    expect(plan.context).toBe("reuse");
    expect(plan.providers.grok.research).toBe("initial");
    expect(plan.providers.chatgpt.research).toBe("initial");
    expect(plan.providers.grok.handicap).toBe("none");
    expect(plan.providers.chatgpt.handicap).toBe("none");
    expect(plan.presentation).toBe("skip");
  });

  it("2. evidence exists but no snapshot lineage -> research=bootstrap (zero-cost), handicap=none", () => {
    writeLiveEvidence("grok", ["e1", "e2"]);
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.research).toBe("bootstrap");
    expect(plan.providers.grok.handicap).toBe("none");
  });

  it("3. existing research snapshot, no analysis -> research=none (all evidence absorbed), handicap=initial", () => {
    writeLiveEvidence("grok", ["e1", "e2"]);
    writeSnapshot(root, baseSnapshot("grok", { snapshotId: "grok-a", evidence: { evidenceIds: ["e1", "e2"], addedEvidenceIds: ["e1", "e2"], supersededEvidenceIds: [], conflictingEvidenceIds: [] } }));
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.research).toBe("none");
    expect(plan.providers.grok.handicap).toBe("initial");
  });

  it("4. material evidence growth since last snapshot -> research=update", () => {
    writeLiveEvidence("grok", ["e1", "e2", "e3"]);
    writeSnapshot(root, baseSnapshot("grok", { snapshotId: "grok-a", evidence: { evidenceIds: ["e1", "e2"], addedEvidenceIds: ["e1", "e2"], supersededEvidenceIds: [], conflictingEvidenceIds: [] } }));
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.research).toBe("update");
  });

  it("--force-research forces an update pass even with no material change", () => {
    writeLiveEvidence("grok", ["e1", "e2"]);
    writeSnapshot(root, baseSnapshot("grok", { snapshotId: "grok-a" }));
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], true, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.research).toBe("update");
  });
});

describe("planGame -- handicap decision", () => {
  function seedWu46Snapshot(model: "grok" | "chatgpt", contextHash: string, evidenceIds: string[]) {
    writeSnapshot(
      root,
      baseSnapshot(model, {
        snapshotId: `${model}-wu46`,
        context: { contextVersion: "nfl-game-context-v1", contextHash, contextGeneratedAt: "2026-09-09T10:00:00.000Z" },
        evidence: { evidenceIds, addedEvidenceIds: evidenceIds, supersededEvidenceIds: [], conflictingEvidenceIds: [] },
        analysisState: wu46CompatibleAnalysisState(),
      })
    );
  }

  it("5. no material change since last handicap -> handicap=none (market-only changes never trigger an update)", () => {
    const contextHash = contentHashOfContextFixture();
    writeLiveEvidence("grok", ["e1", "e2"]);
    seedWu46Snapshot("grok", contextHash, ["e1", "e2"]);
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("none");
    expect(plan.presentation).toBe("regenerate"); // WU46 analysis already exists
  });

  it("6. evidence grew since last handicap -> handicap=update", () => {
    const contextHash = contentHashOfContextFixture();
    writeLiveEvidence("grok", ["e1", "e2", "e3"]);
    seedWu46Snapshot("grok", contextHash, ["e1", "e2"]);
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("update");
    expect(plan.providers.grok.handicapReason).toMatch(/evidence grew/);
  });

  it("7. context hash changed since last handicap -> handicap=update", () => {
    writeLiveEvidence("grok", ["e1", "e2"]);
    seedWu46Snapshot("grok", "a-stale-context-hash-that-does-not-match-current-file", ["e1", "e2"]);
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("update");
    expect(plan.providers.grok.handicapReason).toMatch(/context hash changed/);
  });

  it("7b. WU6.1: a market-only move (spread ticks) on the persisted context file never triggers a handicap update", () => {
    const contextHash = contentHashOfContextFixture();
    writeLiveEvidence("grok", ["e1", "e2"]);
    seedWu46Snapshot("grok", contextHash, ["e1", "e2"]);

    const contextPath = join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK), `${GAME_ID}.json`);
    const packet = JSON.parse(readFileSync(contextPath, "utf8"));
    packet.market.spread.homeLine = (packet.market.spread.homeLine ?? 0) + 1.5;
    writeFileSync(contextPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");

    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("none");
  });

  it("7c. WU6.1: rewriting the persisted context file with different formatting/timestamps but no football change never triggers a handicap update", () => {
    const contextHash = contentHashOfContextFixture();
    writeLiveEvidence("grok", ["e1", "e2"]);
    seedWu46Snapshot("grok", contextHash, ["e1", "e2"]);

    const contextPath = join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK), `${GAME_ID}.json`);
    const packet = JSON.parse(readFileSync(contextPath, "utf8"));
    packet.generatedAt = "2026-09-09T23:59:59.000Z";
    packet.provenance.builtAt = "2026-09-09T23:59:59.000Z";
    // Compact, unindented rewrite -- deliberately NOT byte-identical to the original pretty-printed file.
    writeFileSync(contextPath, JSON.stringify(packet), "utf8");

    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("none");
  });

  it("--force-handicap forces an update pass even with no material change", () => {
    const contextHash = contentHashOfContextFixture();
    writeLiveEvidence("grok", ["e1", "e2"]);
    seedWu46Snapshot("grok", contextHash, ["e1", "e2"]);
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, true, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.handicap).toBe("update");
  });
});

describe("planGame -- provider isolation", () => {
  it("8. grok and chatgpt states never leak into each other's plan", () => {
    writeLiveEvidence("grok", ["e1", "e2"]);
    writeSnapshot(root, baseSnapshot("grok", { snapshotId: "grok-a" }));
    // chatgpt has NOTHING for this game.
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.grok.research).toBe("none");
    expect(plan.providers.grok.handicap).toBe("initial");
    expect(plan.providers.chatgpt.research).toBe("initial");
    expect(plan.providers.chatgpt.handicap).toBe("none");
  });
});

describe("planGame -- locking and idempotency", () => {
  it("9. post-kickoff game is locked: research/handicap forced to none for every provider", () => {
    const now = () => new Date("2026-09-14T00:00:00.000Z"); // after the fixture's kickoff
    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok", "chatgpt"], false, false, now);
    expect(plan.locked).toBe(true);
    expect(plan.providers.grok.research).toBe("none");
    expect(plan.providers.grok.handicap).toBe("none");
    expect(plan.providers.chatgpt.research).toBe("none");
    expect(plan.providers.chatgpt.handicap).toBe("none");
  });

  it("10. running the same plan twice with no underlying file changes yields identical, all-none actions the second time", () => {
    writeLiveEvidence("grok", ["e1", "e2"]);
    writeSnapshot(root, baseSnapshot("grok", { snapshotId: "grok-a" }));
    const first = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(first.providers.grok.research).toBe("none");
    // Simulate "handicap ran" by writing the WU4.6 snapshot the first plan called for.
    const contextHash = contentHashOfContextFixture();
    writeSnapshot(
      root,
      baseSnapshot("grok", {
        snapshotId: "grok-b",
        previousSnapshotId: "grok-a",
        context: { contextVersion: "nfl-game-context-v1", contextHash, contextGeneratedAt: "2026-09-09T10:00:00.000Z" },
        analysisState: wu46CompatibleAnalysisState(),
      })
    );
    const second = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(second.providers.grok.research).toBe("none");
    expect(second.providers.grok.handicap).toBe("none");
    const third = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["grok"], false, false, PRE_KICKOFF_NOW);
    expect(third).toEqual(second);
  });
});

describe("planSlate -- schedule enumeration", () => {
  it("11. blocked context (no upstream artifacts, no persisted file) marks the game blocked, not silently ready", () => {
    const plan = planGame(root, "2026_01_DEN_KC", 2026, 1, "den", "kc", ["grok"], false, false);
    expect(plan.context).toBe("blocked");
    expect(plan.providers.grok.research).toBe("none");
    expect(plan.providers.grok.handicap).toBe("none");
  });

  it("12. planSlate with an explicit --game bypasses schedule enumeration entirely", () => {
    const plans = planSlate({ root, season: SEASON, gameId: GAME_ID });
    expect(plans).toHaveLength(1);
    expect(plans[0].gameId).toBe(GAME_ID);
  });
});

function contentHashOfContextFixture(): string {
  // Mirrors nfl-ai-slate-plan.ts's own footballContextHash(parsedPacket) call so
  // tests can construct a snapshot whose context.contextHash matches "current".
  const raw = readFileSync(join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK), `${GAME_ID}.json`), "utf8");
  return footballContextHash(JSON.parse(raw) as NflGameContextPacket);
}
