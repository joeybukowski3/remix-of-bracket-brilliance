/**
 * WU6.5 -- CLI integration tests for scripts/replay-nfl-provider-research.ts.
 * Uses the real, committed 2026_01_BAL_IND context artifact (same pattern as
 * nfl-ai-slate-plan.test.ts) copied into a temp root, plus a hand-built
 * archived OpenAI response fixture written directly to disk. No provider/API
 * call is made anywhere in this suite -- global.fetch is spied on and made
 * to throw if it is ever invoked, proving the provider adapter is never
 * reached (item 13).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseReplayArgs, runReplay } from "./replay-nfl-provider-research";
import { evidenceArtifactPath, readEvidenceArtifact } from "./lib/nfl-evidence-store";
import { writeSnapshot } from "./lib/nfl-snapshot-store";
import type { AnalysisSnapshot } from "./lib/nfl-snapshot-types";

const REPO_ROOT = join(__dirname, "..");
const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;
const PROVIDER = "chatgpt";
const RUN_ID = "initial-2026-09-09T10-00-00-000Z";

const PRE_KICKOFF_NOW = () => new Date("2026-09-10T00:00:00.000Z"); // BAL_IND kickoff is 2026-09-13T17:00:00Z
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

const CITED_URL_A = "https://www.ravens.com/news/injury-report";
const CITED_URL_B = "https://www.colts.com/news/injury-report";
const CITED_URL_MALFORMED = "https://www.nfl.com/schedules/game";

function validFinding(n: number) {
  return {
    claim: `Fixture valid finding #${n} about the matchup.`,
    category: "injury",
    sourceName: "Fixture Beat Reporter",
    sourceUrl: n % 2 === 0 ? CITED_URL_A : CITED_URL_B,
    sourceType: "beat_reporter",
    author: "Fixture Author",
    publishedAt: "2026-09-09T09:00:00.000Z",
    subjects: { teams: ["ind", "bal"], players: [], coaches: [] },
    confidence: "high",
    relevance: { summary: "test", areas: [] },
  };
}

const MALFORMED_FINDING = {
  claim: "The official schedule identifies this game's kickoff window and venue.",
  category: "scheduling",
  sourceName: "NFL.com",
  sourceUrl: CITED_URL_MALFORMED,
  sourceType: "official_nfl",
  author: null,
  publishedAt: null,
  subjects: ["ind", "bal"],
  players: [],
  coaches: [],
};

function archivedResponseBody(findings: unknown[]) {
  return {
    id: "resp_fixture_replay_0001",
    model: "gpt-5.6-luna",
    object: "response",
    status: "completed",
    created_at: 1_789_000_000,
    completed_at: 1_789_000_039,
    reasoning: { effort: "none" },
    output: [
      {
        id: "ws_fixture_replay_1",
        type: "web_search_call",
        status: "completed",
        action: { type: "search", query: "Ravens Colts injury report", queries: ["Ravens Colts injury report"], sources: [CITED_URL_A, CITED_URL_B, CITED_URL_MALFORMED].map((url) => ({ type: "url", url })) },
      },
      {
        id: "msg_fixture_replay_1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(findings),
            annotations: [CITED_URL_A, CITED_URL_B, CITED_URL_MALFORMED].map((url, index) => ({ type: "url_citation", url, start_index: index * 10, end_index: index * 10 + 5, title: String(index + 1) })),
          },
        ],
      },
    ],
    usage: { input_tokens: 40000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 900, output_tokens_details: { reasoning_tokens: 200 }, total_tokens: 40900 },
  };
}

function writeArchivedResponse(runId: string, body: unknown): string {
  const canonicalPath = evidenceArtifactPath(root, SEASON, WEEK, GAME_ID, PROVIDER);
  const researchDir = join(dirname(canonicalPath), "research", runId);
  mkdirSync(researchDir, { recursive: true });
  writeFileSync(join(researchDir, "provider-response.raw.json"), `${JSON.stringify(body, null, 2)}\n`);
  return researchDir;
}

function baseSnapshot(): AnalysisSnapshot {
  return {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId: `chatgpt-${GAME_ID}-fixture`,
    model: "chatgpt",
    gameId: GAME_ID,
    season: SEASON,
    week: WEEK,
    snapshotType: "initial",
    createdAt: "2026-09-09T12:00:00.000Z",
    researchCutoff: "2026-09-09T11:00:00.000Z",
    kickoff: "2026-09-13T17:00:00.000Z",
    previousSnapshotId: null,
    context: { contextVersion: "nfl-game-context-v1", contextHash: "context-hash-A", contextGeneratedAt: "2026-09-09T10:00:00.000Z" },
    evidence: { evidenceIds: [], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
    market: { sportsbook: null, spread: { homeLine: null, awayLine: null }, total: { line: null }, moneyline: null, asOf: null, previousSpread: null, previousTotal: null, spreadDelta: null, totalDelta: null, moneylineHomeDelta: null, moneylineAwayDelta: null, sportsbookChanged: false, asOfDeltaMs: null },
    analysisState: null,
    updateAssessment: null,
  } as unknown as AnalysisSnapshot;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "wu65-replay-"));
  copyRealContextFixtures();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runReplay -- CLI parsing", () => {
  it("requires exactly one of --dry-run or --apply", async () => {
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID]);
    const result = await runReplay(args, root, () => {}, () => {});
    expect(result.exitCode).toBe(1);
  });
});

describe("runReplay -- item 1/3/4: dry-run against a valid archived response", () => {
  it("plans successfully with zero API calls and writes nothing to disk", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("provider API adapter must never be invoked by replay");
    });
    writeArchivedResponse(RUN_ID, archivedResponseBody([...Array.from({ length: 11 }, (_, i) => validFinding(i + 1)).slice(0, 9), MALFORMED_FINDING, ...Array.from({ length: 11 }, (_, i) => validFinding(i + 1)).slice(9)]));

    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--dry-run"]);
    const result = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);

    expect(result.exitCode).toBe(0);
    expect(result.applied).toBe(false);
    expect(result.plan?.candidatesParsedCount).toBe(12);
    expect(result.plan?.structurallyRejected).toHaveLength(1);
    expect(result.plan?.accepted.length).toBeGreaterThan(0);

    const liveTestPath = join(dirname(evidenceArtifactPath(root, SEASON, WEEK, GAME_ID, PROVIDER)), "evidence.live-test.json");
    expect(existsSync(liveTestPath)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("runReplay -- apply: persistence + idempotency (items 3/4/6/13)", () => {
  it("13. never invokes the provider API adapter -- fetch throws if called, and the whole apply still succeeds", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("provider API adapter must never be invoked by replay");
    });
    const findings = [...Array.from({ length: 11 }, (_, i) => validFinding(i + 1)).slice(0, 9), MALFORMED_FINDING, ...Array.from({ length: 11 }, (_, i) => validFinding(i + 1)).slice(9)];
    writeArchivedResponse(RUN_ID, archivedResponseBody(findings));

    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--apply"]);
    const result = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);

    expect(result.exitCode).toBe(0);
    expect(result.applied).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("3/4. accepted evidence and rejected diagnostics are both persisted; no malformed candidate enters storage", async () => {
    const findings = [...Array.from({ length: 11 }, (_, i) => validFinding(i + 1)).slice(0, 9), MALFORMED_FINDING, ...Array.from({ length: 11 }, (_, i) => validFinding(i + 1)).slice(9)];
    const researchDir = writeArchivedResponse(RUN_ID, archivedResponseBody(findings));

    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--apply"]);
    const result = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    expect(result.exitCode).toBe(0);

    const liveTestPath = join(dirname(evidenceArtifactPath(root, SEASON, WEEK, GAME_ID, PROVIDER)), "evidence.live-test.json");
    const artifact = readEvidenceArtifact(liveTestPath);
    expect(artifact).not.toBeNull();
    expect(artifact!.evidence.length).toBe(result.plan!.accepted.length);
    expect(artifact!.evidence.every((e) => e.claim !== MALFORMED_FINDING.claim)).toBe(true);

    const manifest = JSON.parse(readFileSync(join(researchDir, "replayed.manifest.json"), "utf8"));
    expect(manifest.replayedFromArchivedResponse).toBe(true);
    expect(manifest.originalResponseId).toBe("resp_fixture_replay_0001");

    const replayRun = JSON.parse(readFileSync(join(researchDir, "replay-run.json"), "utf8"));
    expect(replayRun.structurallyRejected).toHaveLength(1);
    expect(replayRun.structurallyRejected[0].reason).toMatch(/subjects/);
  });

  it("5. preserves the original archived provider response ID and completion time, never fabricating new ones", async () => {
    const researchDir = writeArchivedResponse(RUN_ID, archivedResponseBody(Array.from({ length: 3 }, (_, i) => validFinding(i + 1))));
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--apply"]);
    await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    const manifest = JSON.parse(readFileSync(join(researchDir, "replayed.manifest.json"), "utf8"));
    expect(manifest.originalResponseId).toBe("resp_fixture_replay_0001");
    expect(manifest.originalResponseModel).toBe("gpt-5.6-luna");
    expect(manifest.originalCreatedAtEpochSeconds).toBe(1_789_000_000);
    expect(manifest.originalCompletedAtEpochSeconds).toBe(1_789_000_039);
  });

  it("6. a second replay of the same archived run is an explicit no-op -- no duplicate evidence, file untouched", async () => {
    writeArchivedResponse(RUN_ID, archivedResponseBody(Array.from({ length: 3 }, (_, i) => validFinding(i + 1))));
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--apply"]);

    const first = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    expect(first.applied).toBe(true);

    const liveTestPath = join(dirname(evidenceArtifactPath(root, SEASON, WEEK, GAME_ID, PROVIDER)), "evidence.live-test.json");
    const contentAfterFirst = readFileSync(liveTestPath, "utf8");

    const second = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    expect(second.exitCode).toBe(0);
    expect(second.noOpAlreadyReplayed).toBe(true);
    expect(second.applied).toBe(false);

    const contentAfterSecond = readFileSync(liveTestPath, "utf8");
    expect(contentAfterSecond).toBe(contentAfterFirst); // byte-identical -- the file was never touched a second time
    const artifact = readEvidenceArtifact(liveTestPath)!;
    expect(artifact.evidence).toHaveLength(3); // never duplicated
  });
});

describe("runReplay -- safety checks reject unsafe apply attempts (items 9/10/11)", () => {
  it("9. a missing archived response is rejected with zero mutations", async () => {
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=does-not-exist", "--apply"]);
    const result = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    expect(result.exitCode).toBe(1);
    expect(result.safetyViolations.join(" ")).toMatch(/not found/);
    const liveTestPath = join(dirname(evidenceArtifactPath(root, SEASON, WEEK, GAME_ID, PROVIDER)), "evidence.live-test.json");
    expect(existsSync(liveTestPath)).toBe(false);
  });

  it("10. a post-kickoff replay is refused -- pregame safety remains authoritative", async () => {
    writeArchivedResponse(RUN_ID, archivedResponseBody(Array.from({ length: 3 }, (_, i) => validFinding(i + 1))));
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--apply"]);
    const result = await runReplay(args, root, () => {}, () => {}, POST_KICKOFF_NOW);
    expect(result.exitCode).toBe(1);
    expect(result.safetyViolations.join(" ")).toMatch(/kickoff has already passed/);
  });

  it("11. an existing snapshot lineage prevents replay -- the archive is superseded", async () => {
    writeArchivedResponse(RUN_ID, archivedResponseBody(Array.from({ length: 3 }, (_, i) => validFinding(i + 1))));
    writeSnapshot(root, baseSnapshot());
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--apply"]);
    const result = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    expect(result.exitCode).toBe(1);
    expect(result.safetyViolations.join(" ")).toMatch(/snapshot lineage already exists/);
  });

  it("unsupported provider is refused before any file is touched", async () => {
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=grok", "--run=" + RUN_ID, "--apply"]);
    const result = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    expect(result.exitCode).toBe(1);
  });
});

describe("runReplay -- 12. normal WU6 planner naturally advances after a successful replay", () => {
  it("planGame sees research=bootstrap for the replayed provider, without any DET_BUF/game-specific hardcoding in the planner", async () => {
    const { planGame } = await import("./lib/nfl-ai-slate-plan");
    writeArchivedResponse(RUN_ID, archivedResponseBody(Array.from({ length: 3 }, (_, i) => validFinding(i + 1))));
    const args = parseReplayArgs(["--game=" + GAME_ID, "--provider=chatgpt", "--run=" + RUN_ID, "--apply"]);
    const result = await runReplay(args, root, () => {}, () => {}, PRE_KICKOFF_NOW);
    expect(result.applied).toBe(true);

    const plan = planGame(root, GAME_ID, SEASON, WEEK, "ind", "bal", ["chatgpt"], false, false, PRE_KICKOFF_NOW);
    expect(plan.providers.chatgpt.research).toBe("bootstrap");
    expect(plan.providers.chatgpt.researchReason).toMatch(/zero-cost/);
  });
});
