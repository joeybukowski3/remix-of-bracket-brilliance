/**
 * AI Picks v2 automation -- input fingerprint, locked-Stage-A reconstruction for
 * market repricing, and the guarantee that automation metadata is never published.
 */
import { describe, expect, it } from "vitest";
import { buildHandicapV2PublicCard } from "./nfl-handicap-v2-presentation";
import { buildHandicapV2Record, lockedStageAFromRecord } from "./nfl-handicap-v2-record";
import { stageAEvidenceHash, recordFingerprint } from "./nfl-handicap-v2-inputs";
import type { EvidenceRecord } from "./nfl-evidence-types";
import type { StageAV2, StageBV2 } from "./nfl-handicap-v2-types";
import { market, record } from "./nfl-ai-v2-slate.fixtures";

const ev = (evidenceId: string, claim: string, category: EvidenceRecord["category"] = "injury") => ({ evidenceId, claim, category, source: { name: "Team", url: "https://example.com" } }) as unknown as EvidenceRecord;

describe("stageAEvidenceHash", () => {
  it("is stable across ordering and ignores records Stage A cannot see", () => {
    const a = ev("e1", "Starting QB is questionable");
    const b = ev("e2", "Left tackle is out");
    const marketNoise = ev("e3", "The line moved from -6.5 to -7", "market");
    const opinion = ev("e4", "Experts pick the Bills against the spread");
    expect(stageAEvidenceHash([a, b])).toBe(stageAEvidenceHash([b, a]));
    expect(stageAEvidenceHash([a, b, marketNoise, opinion])).toBe(stageAEvidenceHash([a, b]));
  });

  it("changes when Stage A-visible evidence is added", () => {
    expect(stageAEvidenceHash([ev("e1", "QB questionable")])).not.toBe(stageAEvidenceHash([ev("e1", "QB questionable"), ev("e2", "WR out")]));
  });
});

describe("repricing reuses the locked Stage A exactly", () => {
  const stored = record("grok", {
    fairSpread: { team: "buf", line: -6 },
    fairScoreHome: 27,
    fairScoreAway: 21,
    projectedTotal: 48,
    uncertainty: "MEDIUM",
    mainRisk: "Turnover variance",
    keyDrivers: [{ summary: "Bills run defense", factRefs: ["a.b"], evidenceRefs: ["e1"] }],
  } as never);

  it("rebuilds the Stage A the record was written from, with its original timestamp and context hash", () => {
    const stageA = lockedStageAFromRecord(stored);
    expect(stageA).toMatchObject({
      model: "grok",
      contextHash: "ctx1",
      generatedAt: stored.stageAGeneratedAt,
      fairSpread: { team: "buf", line: -6 },
      projectedTotal: 48,
      fairScore: { home: 27, away: 21 },
      uncertainty: "MEDIUM",
      mainRisk: "Turnover variance",
    });
    expect(stageA.keyDrivers).toEqual(stored.keyDrivers);
  });
});

describe("record fingerprint", () => {
  const stageA = { ...lockedStageAFromRecord(record()), fairSpread: { team: "buf", line: -6 }, fairScore: { home: 27, away: 21 }, projectedTotal: 48, uncertainty: "MEDIUM", mainRisk: "risk", keyDrivers: [{ summary: "driver", factRefs: [], evidenceRefs: [] }] } as StageAV2;
  const stageB = { model: "grok", gameId: "2026_03_LAC_BUF", generatedAt: "2026-09-25T09:00:00.000Z", verdict: "LEAN", confidence: "MEDIUM", preferredSide: "away", preferredTeam: "lac", preferredLine: 7, coverProbabilityPreferred: 53, coverProbabilityOther: 43, impliedPushProbability: 4, keyNumberSensitivity: null, counterargument: "c", analysisMarkdown: "text", wordCount: 1, factRefsUsed: [], evidenceRefsUsed: [], warnings: [] } as unknown as StageBV2;
  const inputs = { stageAEvidenceHash: "ev1", availabilityHash: "av1", weatherHash: "w1", bookRange: null };

  it("is stored on a new record and readable by the planner", () => {
    const built = buildHandicapV2Record({ stageA, stageB, market: market(), evidenceRecords: [], inputs, researchMode: "live" });
    expect(recordFingerprint(built)).toEqual(inputs);
  });

  it("is absent on a record built without it (legacy records stay valid)", () => {
    expect(recordFingerprint(buildHandicapV2Record({ stageA, stageB, market: market(), evidenceRecords: [], researchMode: "live" }))).toBeNull();
  });

  it("is never published to the public card", () => {
    const built = buildHandicapV2Record({ stageA, stageB, market: market(), evidenceRecords: [], inputs, researchMode: "live" });
    const card = buildHandicapV2PublicCard(built, "Grokowski");
    expect(JSON.stringify(card)).not.toMatch(/stageAEvidenceHash|availabilityHash|inputs/);
  });
});
