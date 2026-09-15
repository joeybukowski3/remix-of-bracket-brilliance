/**
 * WU5 -- tests for the internal-snapshot -> public-presentation exporter.
 * Uses a real (temp-dir) snapshot store + a hand-written game-context
 * fixture, exactly like nfl-grok-analysis-pipeline.test.ts's end-to-end
 * suite, so these tests exercise the real nfl-snapshot-store.ts read path
 * rather than a mocked one.
 *
 * WU4.6.1 -- since a provider is now status:"ok" ONLY when its latest
 * analysis-bearing snapshot is WU4.6-compatible (carries both
 * blindPrediction and marketDecision), every fixture below that exercises
 * the "ok" mapping path is built through wu46State() (which fills in
 * blindPrediction/marketDecision alongside the legacy thesis/side/total/
 * independentPrediction fields it mirrors). The legacy-snapshot-shape
 * fixtures (no blindPrediction/marketDecision) are now deliberately used
 * to test the OPPOSITE: that they resolve to analysis_unavailable/
 * independent_handicap_not_generated, never a fabricated "ok" card built
 * from pre-WU4.6 fields (see the WU4.6.1 eligibility describe block).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePresentationForGame } from "./generate-nfl-ai-handicap-presentation";
import { writeSnapshot } from "./lib/nfl-snapshot-store";
import type { AnalysisSnapshot, IndependentPrediction, SideOpinionState, SnapshotAnalysisState, SnapshotModel, TotalOpinionState } from "./lib/nfl-snapshot-types";

const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;
const KICKOFF = "2026-09-13T17:00:00.000Z";

function baseMarket() {
  return {
    sportsbook: "draftkings",
    spread: { homeLine: 3.5, awayLine: -3.5 },
    total: { line: 47.5 },
    moneyline: { homePrice: 145, awayPrice: -175 },
    asOf: "2026-09-11T20:52:14.601Z",
    previousSpread: null,
    previousTotal: null,
    spreadDelta: null,
    totalDelta: null,
    moneylineHomeDelta: null,
    moneylineAwayDelta: null,
    sportsbookChanged: false,
    asOfDeltaMs: null,
  };
}

/**
 * WU4.6.1 -- builds a WU4.6-compatible SnapshotAnalysisState: the legacy
 * thesis/side/total/independentPrediction fields (still populated, exactly
 * as a real pipeline run would leave them) PLUS blindPrediction/
 * marketDecision mirroring them, so the exporter's new eligibility gate
 * treats this fixture as a current, publicly-eligible opinion.
 */
function wu46State(input: {
  thesis: string;
  side: SideOpinionState;
  total: TotalOpinionState;
  independentPrediction?: IndependentPrediction;
}): SnapshotAnalysisState {
  const fairSpread = input.independentPrediction?.fairSpread ?? { team: "ind", line: -1 };
  const projectedTotal = input.independentPrediction?.projectedTotal ?? 45;
  return {
    thesis: input.thesis,
    side: input.side,
    total: input.total,
    ...(input.independentPrediction ? { independentPrediction: input.independentPrediction } : {}),
    blindPrediction: { generatedAt: "2026-09-11T20:00:00.000Z", fairSpread, projectedTotal, footballThesis: input.thesis },
    marketDecision: {
      generatedAt: "2026-09-11T20:52:14.601Z",
      marketAtDecision: { spread: { homeLine: 3.5, awayLine: -3.5 }, total: 47.5, asOf: "2026-09-11T20:52:14.601Z" },
      side: input.side,
      total: input.total,
      sideEdgePoints: null,
      totalEdgePoints: null,
    },
  };
}

/** A legacy (pre-WU4.6) analysis-bearing state -- no blindPrediction/marketDecision. */
function legacyState(input: { thesis: string; side: SideOpinionState; total: TotalOpinionState; independentPrediction?: IndependentPrediction }): SnapshotAnalysisState {
  return { thesis: input.thesis, side: input.side, total: input.total, ...(input.independentPrediction ? { independentPrediction: input.independentPrediction } : {}) };
}

function makeSnapshot(model: SnapshotModel, overrides: Partial<AnalysisSnapshot>): AnalysisSnapshot {
  return {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId: `${model}-${GAME_ID}-daily_update-fixture${Math.random().toString(16).slice(2)}`,
    model,
    gameId: GAME_ID,
    season: SEASON,
    week: WEEK,
    snapshotType: "daily_update",
    createdAt: "2026-09-11T20:52:14.601Z",
    researchCutoff: "2026-09-11T20:52:14.601Z",
    kickoff: KICKOFF,
    previousSnapshotId: null,
    context: { contextVersion: "nfl-game-context-v1", contextHash: "fixture-hash", contextGeneratedAt: "2026-09-11T20:26:11.487Z" },
    evidence: { evidenceIds: [], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
    market: baseMarket(),
    analysisState: null,
    updateAssessment: null,
    ...overrides,
  };
}

describe("generate-nfl-ai-handicap-presentation", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-ai-handicap-presentation-"));
    const contextDir = join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK));
    mkdirSync(contextDir, { recursive: true });
    writeFileSync(
      join(contextDir, `${GAME_ID}.json`),
      JSON.stringify({
        identity: { gameId: GAME_ID, season: SEASON, week: WEEK, homeTeam: "ind", awayTeam: "bal", homeTeamFull: "Indianapolis Colts", awayTeamFull: "Baltimore Ravens" },
        schedule: { kickoffUtc: KICKOFF },
      })
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("1. resolves Grok's displayName to 'Grokowski'", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: wu46State({ thesis: "t", side: { lean: "home", confidence: 4, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    expect(presentation.handicappers.grokowski.displayName).toBe("Grokowski");
  });

  it("2. resolves ChatGPT's displayName to 'Chatty Ice'", () => {
    writeSnapshot(
      root,
      makeSnapshot("chatgpt", {
        analysisState: wu46State({ thesis: "t", side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "over", confidence: 5, totalLineAtOpinion: 47.5 } }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    expect(presentation.handicappers.chattyIce.displayName).toBe("Chatty Ice");
  });

  it("3. keeps internal provider namespaces as grok/chatgpt, never renamed", () => {
    writeSnapshot(root, makeSnapshot("grok", { analysisState: wu46State({ thesis: "t", side: { lean: "pass", confidence: null, spreadLineAtOpinion: null }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }) }));
    writeSnapshot(root, makeSnapshot("chatgpt", { analysisState: wu46State({ thesis: "t", side: { lean: "pass", confidence: null, spreadLineAtOpinion: null }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }) }));
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    expect(presentation.handicappers.grokowski).toMatchObject({ provider: "grok" });
    expect(presentation.handicappers.chattyIce).toMatchObject({ provider: "chatgpt" });
  });

  it("4/5. resolves the latest WU4.6-compatible ANALYSIS-BEARING snapshot, ignoring a later research-only snapshot", () => {
    const initial = makeSnapshot("grok", {
      snapshotId: "grok-fixture-initial",
      createdAt: "2026-09-11T19:00:00.000Z",
      analysisState: wu46State({ thesis: "initial thesis", side: { lean: "home", confidence: 4, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }),
    });
    writeSnapshot(root, initial);
    const researchOnly = makeSnapshot("grok", {
      snapshotId: "grok-fixture-research-only",
      createdAt: "2026-09-11T21:00:00.000Z",
      previousSnapshotId: initial.snapshotId,
      analysisState: null,
    });
    writeSnapshot(root, researchOnly);

    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    expect(grokowski.status).toBe("ok");
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.analysisSnapshotId).toBe(initial.snapshotId);
    expect(grokowski.centralThesis).toBe("initial thesis");
  });

  it("WU4.6.5. analyzedAt is the trusted snapshot.createdAt, never blindPrediction.generatedAt or marketDecision.generatedAt", () => {
    // wu46State() deliberately gives blindPrediction/marketDecision generatedAt values distinct
    // from the snapshot's own createdAt, so this test would fail if the exporter ever started
    // reading a stage's own (potentially provider-adjacent) generatedAt instead of the trusted
    // snapshot-level timestamp.
    const snapshot = makeSnapshot("grok", {
      createdAt: "2026-09-11T20:52:14.601Z",
      analysisState: wu46State({ thesis: "t", side: { lean: "pass", confidence: null, spreadLineAtOpinion: null }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }),
    });
    expect(snapshot.analysisState?.blindPrediction?.generatedAt).not.toBe(snapshot.createdAt);
    writeSnapshot(root, snapshot);
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.analyzedAt).toBe(snapshot.createdAt);
  });

  it("6. preserves the exact side line-at-opinion", () => {
    writeSnapshot(root, makeSnapshot("grok", { analysisState: wu46State({ thesis: "t", side: { lean: "away", confidence: 7, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }) }));
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.side.line).toBe(-3.5);
    expect(grokowski.side.team).toBe("bal");
  });

  it("7. preserves the exact total line-at-opinion", () => {
    writeSnapshot(root, makeSnapshot("chatgpt", { analysisState: wu46State({ thesis: "t", side: { lean: "pass", confidence: null, spreadLineAtOpinion: null }, total: { lean: "over", confidence: 5, totalLineAtOpinion: 47.5 } }) }));
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const chattyIce = presentation.handicappers.chattyIce;
    if (chattyIce.status !== "ok") throw new Error("expected ok");
    expect(chattyIce.total.line).toBe(47.5);
  });

  it("8. preserves confidence exactly for both markets", () => {
    writeSnapshot(root, makeSnapshot("chatgpt", { analysisState: wu46State({ thesis: "t", side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "over", confidence: 5, totalLineAtOpinion: 47.5 } }) }));
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const chattyIce = presentation.handicappers.chattyIce;
    if (chattyIce.status !== "ok") throw new Error("expected ok");
    expect(chattyIce.side.confidence).toBe(6);
    expect(chattyIce.total.confidence).toBe(5);
  });

  it("9. preserves PASS as a first-class lean, not a missing opinion", () => {
    writeSnapshot(root, makeSnapshot("grok", { analysisState: wu46State({ thesis: "t", side: { lean: "home", confidence: 4, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }) }));
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.total.lean).toBe("pass");
    expect(grokowski.total.confidence).toBeNull();
    expect(grokowski.total.line).toBeNull();
  });

  it("10. reports a provider with no snapshots at all as analysis_unavailable/no_analysis_yet, never fabricated", () => {
    writeSnapshot(root, makeSnapshot("grok", { analysisState: wu46State({ thesis: "t", side: { lean: "home", confidence: 4, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }) }));
    // No chatgpt snapshot written at all.
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    expect(presentation.handicappers.chattyIce).toEqual({ status: "analysis_unavailable", provider: "chatgpt", displayName: "Chatty Ice", reason: "no_analysis_yet" });
  });

  it("11/12. the public artifact never carries raw diagnostics, evidence ids, or filesystem paths", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        evidence: { evidenceIds: ["grok-2026_01_BAL_IND-abc123"], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
        analysisState: wu46State({ thesis: "t", side: { lean: "home", confidence: 4, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 }, rationale: "internal rationale text" }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const serialized = JSON.stringify(presentation);
    expect(serialized).not.toMatch(/evidenceId/i);
    expect(serialized).not.toContain(root); // no absolute filesystem path leaks in
    expect(serialized).not.toMatch(/apiKey|api_key|telemetry|rawResponse|raw_response/i);
  });

  it("15. never computes a consensus, average confidence, or third opinion -- each handicapper's fields depend only on its own snapshot chain", () => {
    writeSnapshot(root, makeSnapshot("grok", { analysisState: wu46State({ thesis: "grok thesis", side: { lean: "home", confidence: 4, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }) }));
    writeSnapshot(root, makeSnapshot("chatgpt", { analysisState: wu46State({ thesis: "chatgpt thesis", side: { lean: "away", confidence: 8, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "over", confidence: 5, totalLineAtOpinion: 47.5 } }) }));
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    const chattyIce = presentation.handicappers.chattyIce;
    if (grokowski.status !== "ok" || chattyIce.status !== "ok") throw new Error("expected ok");
    // Independently disagree on side (home vs away) and confidence -- nothing here averages/merges them.
    expect(grokowski.side.lean).toBe("home");
    expect(chattyIce.side.lean).toBe("away");
    expect(grokowski.side.confidence).toBe(4);
    expect(chattyIce.side.confidence).toBe(8);
    expect(presentation).not.toHaveProperty("consensus");
    expect(presentation).not.toHaveProperty("winner");
    expect(JSON.stringify(presentation)).not.toMatch(/consensus|averageConfidence/i);
  });

  it("14/15. Grokowski's and Chatty Ice's independent predictions are sourced ONLY from their own snapshot chain -- neither can read the other's", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: wu46State({
          thesis: "grok thesis",
          side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
          total: { lean: "pass", confidence: null, totalLineAtOpinion: null },
          independentPrediction: { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 },
        }),
      })
    );
    writeSnapshot(
      root,
      makeSnapshot("chatgpt", {
        analysisState: wu46State({
          thesis: "chatgpt thesis",
          side: { lean: "away", confidence: 7, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
          total: { lean: "over", confidence: 5, totalLineAtOpinion: 47.5 },
          independentPrediction: { fairSpread: { team: "bal", line: -3 }, projectedTotal: 51 },
        }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    const chattyIce = presentation.handicappers.chattyIce;
    if (grokowski.status !== "ok" || chattyIce.status !== "ok") throw new Error("expected ok");
    expect(grokowski.prediction).toEqual({ fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 });
    expect(chattyIce.prediction).toEqual({ fairSpread: { team: "bal", line: -3 }, projectedTotal: 51 });
  });

  it("16. WU4.5: the public artifact displays the handicapper's own independent fair spread/projected total and market comparison", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: wu46State({
          thesis: "t",
          side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
          total: { lean: "pass", confidence: null, totalLineAtOpinion: null },
          independentPrediction: { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 },
        }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.prediction).toEqual({ fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 });
    expect(grokowski.market).toEqual({ spread: { homeLine: 3.5, awayLine: -3.5 }, total: 47.5 });
    // Market has IND (home) at +3.5, model favors IND by 1.5 -- edge = 3.5 - (-1.5) = 5, toward home.
    expect(grokowski.edges.sidePoints).toBe(5);
    expect(grokowski.edges.totalPoints).toBe(46.5 - 47.5);
  });

  it("16b. a PASS decision still displays the fair line/projected total -- valuable even with no wager", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: wu46State({
          thesis: "t",
          side: { lean: "pass", confidence: null, spreadLineAtOpinion: null },
          total: { lean: "pass", confidence: null, totalLineAtOpinion: null },
          independentPrediction: { fairSpread: { team: "bal", line: -2 }, projectedTotal: 44 },
        }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.side.lean).toBe("pass");
    expect(grokowski.prediction).toEqual({ fairSpread: { team: "bal", line: -2 }, projectedTotal: 44 });
  });

  it("17. no JKB projection fields (jkbFairSpread/jkbProjectedTotal/modelMarketEdge) leak into the public AI-handicap JSON", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: wu46State({
          thesis: "t",
          side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
          total: { lean: "pass", confidence: null, totalLineAtOpinion: null },
          independentPrediction: { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 },
        }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const serialized = JSON.stringify(presentation);
    expect(serialized).not.toMatch(/jkbFairSpread|jkbProjectedTotal|modelMarketEdge|jkbModels/i);
  });
});

/**
 * WU4.6.1 -- PART D/E: the exporter must reject legacy (pre-WU4.6)
 * analysis-bearing snapshots for the public AI Picks card. A snapshot with
 * a non-null analysisState but no blindPrediction/marketDecision (the exact
 * shape every snapshot had before WU4.6) must resolve to
 * analysis_unavailable/independent_handicap_not_generated, never a fake
 * "ok" card built from its old thesis/side/total/independentPrediction.
 */
describe("generate-nfl-ai-handicap-presentation -- WU4.6.1 snapshot eligibility", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-ai-handicap-presentation-eligibility-"));
    const contextDir = join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK));
    mkdirSync(contextDir, { recursive: true });
    writeFileSync(
      join(contextDir, `${GAME_ID}.json`),
      JSON.stringify({
        identity: { gameId: GAME_ID, season: SEASON, week: WEEK, homeTeam: "ind", awayTeam: "bal", homeTeamFull: "Indianapolis Colts", awayTeamFull: "Baltimore Ravens" },
        schedule: { kickoffUtc: KICKOFF },
      })
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("13. a legacy snapshot with no blindPrediction is not publicly eligible", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: legacyState({ thesis: "legacy thesis", side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    expect(presentation.handicappers.grokowski.status).toBe("analysis_unavailable");
  });

  it("14. a legacy snapshot with no marketDecision is not publicly eligible", () => {
    const withBlindOnly = wu46State({ thesis: "legacy thesis", side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } });
    const { marketDecision: _drop, ...withoutMarketDecision } = withBlindOnly;
    writeSnapshot(root, makeSnapshot("grok", { analysisState: withoutMarketDecision }));
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    expect(presentation.handicappers.grokowski.status).toBe("analysis_unavailable");
  });

  it("15. exporter returns analysis_unavailable/independent_handicap_not_generated instead of old contaminated thesis/side/total content", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: legacyState({
          thesis: "OLD JKB-CONTAMINATED THESIS -- must never be surfaced",
          side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
          total: { lean: "pass", confidence: null, totalLineAtOpinion: null },
          independentPrediction: { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 },
        }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    expect(grokowski).toEqual({ status: "analysis_unavailable", provider: "grok", displayName: "Grokowski", reason: "independent_handicap_not_generated" });
    const serialized = JSON.stringify(presentation);
    expect(serialized).not.toContain("OLD JKB-CONTAMINATED THESIS");
    expect(serialized).not.toMatch(/"prediction":\{"fairSpread"/); // no leaked prediction object either
  });

  it("16. a valid WU4.6 snapshot (blindPrediction + marketDecision) renders normally as status:ok", () => {
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        analysisState: wu46State({
          thesis: "wu4.6 thesis",
          side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
          total: { lean: "pass", confidence: null, totalLineAtOpinion: null },
          independentPrediction: { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 },
        }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    expect(grokowski.status).toBe("ok");
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.centralThesis).toBe("wu4.6 thesis");
    expect(grokowski.prediction).toEqual({ fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 });
  });

  it("a later legacy update on top of an earlier WU4.6-compatible snapshot still resolves to the earlier WU4.6-compatible one, never the newer legacy one", () => {
    const wu46Snapshot = makeSnapshot("grok", {
      snapshotId: "grok-fixture-wu46",
      createdAt: "2026-09-10T12:00:00.000Z",
      analysisState: wu46State({ thesis: "wu4.6 thesis", side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }),
    });
    writeSnapshot(root, wu46Snapshot);
    // Hypothetical: a later snapshot somehow lacks blindPrediction/marketDecision (should never happen post-WU4.6, but the resolver must not regress to it).
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        snapshotId: "grok-fixture-later-legacy-shaped",
        createdAt: "2026-09-12T12:00:00.000Z",
        previousSnapshotId: wu46Snapshot.snapshotId,
        analysisState: legacyState({ thesis: "should never be surfaced", side: { lean: "away", confidence: 9, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null } }),
      })
    );
    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    if (grokowski.status !== "ok") throw new Error("expected ok");
    expect(grokowski.analysisSnapshotId).toBe(wu46Snapshot.snapshotId);
    expect(grokowski.centralThesis).toBe("wu4.6 thesis");
  });
});

describe("generate-nfl-ai-handicap-presentation -- WU6.8 market repricing", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-ai-handicap-presentation-reprice-"));
    const contextDir = join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK));
    mkdirSync(contextDir, { recursive: true });
    writeFileSync(
      join(contextDir, `${GAME_ID}.json`),
      JSON.stringify({
        identity: { gameId: GAME_ID, season: SEASON, week: WEEK, homeTeam: "ind", awayTeam: "bal", homeTeamFull: "Indianapolis Colts", awayTeamFull: "Baltimore Ravens" },
        schedule: { kickoffUtc: KICKOFF },
      })
    );
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("12. shows the ORIGINAL locked blind prediction/thesis alongside the NEWEST market decision -- never looks like Stage A was regenerated", () => {
    const originalFairSpread = { team: "ind", line: -1.5 };
    const originalProjectedTotal = 46.5;
    const newMarket = { spread: { homeLine: -2, awayLine: 2 }, total: { line: 45 } };
    const repricedAnalysisState: SnapshotAnalysisState = {
      thesis: "ORIGINAL locked football thesis -- must never change on repricing",
      side: { lean: "home", confidence: 7, spreadLineAtOpinion: { homeLine: -2, awayLine: 2 }, rationale: "repriced" },
      total: { lean: "over", confidence: 6, totalLineAtOpinion: 45, rationale: "repriced" },
      independentPrediction: { fairSpread: originalFairSpread, projectedTotal: originalProjectedTotal },
      blindPrediction: { generatedAt: "2026-09-11T20:00:00.000Z", fairSpread: originalFairSpread, projectedTotal: originalProjectedTotal, footballThesis: "ORIGINAL locked football thesis -- must never change on repricing" },
      marketDecision: {
        generatedAt: "2026-09-15T15:00:00.000Z", // NEWER than blindPrediction.generatedAt -- proves the market decision, not the football prediction, moved
        marketAtDecision: { spread: newMarket.spread, total: newMarket.total.line, asOf: "2026-09-15T15:00:00.000Z" },
        side: { lean: "home", confidence: 7, spreadLineAtOpinion: { homeLine: -2, awayLine: 2 }, rationale: "repriced" },
        total: { lean: "over", confidence: 6, totalLineAtOpinion: 45, rationale: "repriced" },
        sideEdgePoints: -0.5, // marketHomeLine(-2) - modelHomeLine(-1.5) = -0.5
        totalEdgePoints: 1.5, // projectedTotal(46.5) - marketTotal(45) = 1.5
      },
      analysisUpdateKind: "market_reprice",
    };
    writeSnapshot(
      root,
      makeSnapshot("grok", {
        snapshotId: "grok-fixture-repriced",
        createdAt: "2026-09-15T15:00:00.000Z",
        market: { ...baseMarket(), spread: newMarket.spread, total: newMarket.total },
        analysisState: repricedAnalysisState,
      })
    );

    const presentation = generatePresentationForGame(root, GAME_ID, SEASON, WEEK);
    const grokowski = presentation.handicappers.grokowski;
    expect(grokowski.status).toBe("ok");
    if (grokowski.status !== "ok") throw new Error("expected ok");

    // ORIGINAL locked prediction/thesis -- unchanged by repricing.
    expect(grokowski.centralThesis).toBe("ORIGINAL locked football thesis -- must never change on repricing");
    expect(grokowski.prediction).toEqual({ fairSpread: originalFairSpread, projectedTotal: originalProjectedTotal });

    // NEWEST market + deterministic edges recomputed against it.
    expect(grokowski.market).toEqual({ spread: newMarket.spread, total: newMarket.total.line });
    expect(grokowski.edges.sidePoints).toBe(-0.5);
    expect(grokowski.edges.totalPoints).toBe(1.5);
    expect(grokowski.side.lean).toBe("home");
    expect(grokowski.total.lean).toBe("over");
  });
});
