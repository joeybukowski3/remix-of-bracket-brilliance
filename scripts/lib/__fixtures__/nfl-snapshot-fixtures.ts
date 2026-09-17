/**
 * WU3.2 -- SYNTHETIC fixtures for the recurring pregame snapshot framework.
 * Every claim, evidenceId, market number, thesis, and confidence value here
 * is invented for testing nfl-snapshot-*.ts against the documented test
 * game (2026_01_BAL_IND). None of this is real research, a real market
 * read, or a real handicap -- see scripts/lib/__fixtures__/nfl-evidence-fixtures.ts
 * for the equivalent WU2 disclaimer covering the same game.
 *
 * Scenarios (see docs/nfl-grok-chatgpt-handicap-architecture.md, "Recurring
 * pregame snapshot lifecycle" fixture list):
 *   A. Initial snapshot -- IND +3.5, model leans IND (home).
 *   B. Daily update -- new injury evidence, market moves to IND +3, lean
 *      unchanged, confidence increases (6 -> 7).
 *   C. Daily update -- minor news, no market move, no thesis/lean/confidence change.
 *   D. Later update -- material opposing news, model moves to PASS.
 *   E. Post-kickoff snapshot attempt -- must be rejected by canCreatePregameSnapshot.
 */

import type { AnalysisSnapshot, SnapshotMarketState } from "../nfl-snapshot-types";

export const FIXTURE_SNAPSHOT_GAME_ID = "2026_01_BAL_IND";
export const FIXTURE_SNAPSHOT_SEASON = 2026;
export const FIXTURE_SNAPSHOT_WEEK = 1;
export const FIXTURE_SNAPSHOT_HOME_TEAM = "ind"; // matches nfl-evidence-fixtures.ts's FIXTURE_HOME_TEAM
export const FIXTURE_SNAPSHOT_AWAY_TEAM = "bal";
export const FIXTURE_SNAPSHOT_KICKOFF_UTC = "2026-09-13T17:00:00.000Z";
export const FIXTURE_SNAPSHOT_CONTEXT_VERSION = "nfl-game-context-v1-fixture";
export const FIXTURE_SNAPSHOT_CONTEXT_HASH = "fixturecontexthash0001";
export const FIXTURE_SNAPSHOT_CONTEXT_GENERATED_AT = "2026-09-09T10:30:00.000Z";

function marketState(overrides: Partial<SnapshotMarketState>): SnapshotMarketState {
  return {
    sportsbook: "draftkings",
    spread: { homeLine: null, awayLine: null },
    total: { line: null },
    moneyline: null,
    asOf: null,
    ...overrides,
  };
}

/** A. Initial snapshot: IND +3.5, model (synthetically) leans IND (home), moderate confidence, under lean on total. */
export const SNAPSHOT_A_INITIAL: AnalysisSnapshot = {
  schemaVersion: "nfl-snapshot-v1",
  snapshotId: "grok-2026_01_BAL_IND-initial-fixtureaaaaaaaa",
  model: "grok",
  gameId: FIXTURE_SNAPSHOT_GAME_ID,
  season: FIXTURE_SNAPSHOT_SEASON,
  week: FIXTURE_SNAPSHOT_WEEK,
  snapshotType: "initial",
  createdAt: "2026-09-09T12:00:00.000Z",
  researchCutoff: "2026-09-09T11:00:00.000Z",
  kickoff: FIXTURE_SNAPSHOT_KICKOFF_UTC,
  previousSnapshotId: null,
  context: { contextVersion: FIXTURE_SNAPSHOT_CONTEXT_VERSION, contextHash: FIXTURE_SNAPSHOT_CONTEXT_HASH, contextGeneratedAt: FIXTURE_SNAPSHOT_CONTEXT_GENERATED_AT },
  evidence: {
    evidenceIds: ["grok-2026_01_BAL_IND-fixture0001", "grok-2026_01_BAL_IND-fixture0002"],
    addedEvidenceIds: ["grok-2026_01_BAL_IND-fixture0001", "grok-2026_01_BAL_IND-fixture0002"],
    supersededEvidenceIds: [],
    conflictingEvidenceIds: [],
  },
  market: {
    ...marketState({ spread: { homeLine: 3.5, awayLine: -3.5 }, total: { line: 44.5 }, asOf: "2026-09-09T10:00:00.000Z" }),
    previousSpread: null,
    previousTotal: null,
    spreadDelta: null,
    totalDelta: null,
    moneylineHomeDelta: null,
    moneylineAwayDelta: null,
    sportsbookChanged: false,
    asOfDeltaMs: null,
  },
  analysisState: {
    thesis: "IND's home-field spot and Ravens' new-staff uncertainty are worth the home points early in the week.",
    side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } },
    total: { lean: "under", confidence: 5, totalLineAtOpinion: 44.5 },
  },
  updateAssessment: null,
};

/** B. Daily update: new injury evidence added, market moves to IND +3, lean unchanged, confidence increases 6 -> 7. */
export const SNAPSHOT_B_DAILY_UPDATE: AnalysisSnapshot = {
  schemaVersion: "nfl-snapshot-v1",
  snapshotId: "grok-2026_01_BAL_IND-daily_update-fixturebbbbbbbb",
  model: "grok",
  gameId: FIXTURE_SNAPSHOT_GAME_ID,
  season: FIXTURE_SNAPSHOT_SEASON,
  week: FIXTURE_SNAPSHOT_WEEK,
  snapshotType: "daily_update",
  createdAt: "2026-09-10T12:00:00.000Z",
  researchCutoff: "2026-09-10T11:00:00.000Z",
  kickoff: FIXTURE_SNAPSHOT_KICKOFF_UTC,
  previousSnapshotId: SNAPSHOT_A_INITIAL.snapshotId,
  context: { contextVersion: FIXTURE_SNAPSHOT_CONTEXT_VERSION, contextHash: FIXTURE_SNAPSHOT_CONTEXT_HASH, contextGeneratedAt: FIXTURE_SNAPSHOT_CONTEXT_GENERATED_AT },
  evidence: {
    evidenceIds: ["grok-2026_01_BAL_IND-fixture0001", "grok-2026_01_BAL_IND-fixture0002", "grok-2026_01_BAL_IND-fixture0003"],
    addedEvidenceIds: ["grok-2026_01_BAL_IND-fixture0003"],
    supersededEvidenceIds: [],
    conflictingEvidenceIds: [],
  },
  market: {
    ...marketState({ spread: { homeLine: 3, awayLine: -3 }, total: { line: 44.5 }, asOf: "2026-09-10T10:00:00.000Z" }),
    previousSpread: { homeLine: 3.5, awayLine: -3.5 },
    previousTotal: 44.5,
    spreadDelta: -0.5,
    totalDelta: 0,
    moneylineHomeDelta: null,
    moneylineAwayDelta: null,
    sportsbookChanged: false,
    asOfDeltaMs: Date.parse("2026-09-10T10:00:00.000Z") - Date.parse("2026-09-09T10:00:00.000Z"),
  },
  analysisState: {
    thesis: "IND's home-field spot and Ravens' new-staff uncertainty are worth the home points early in the week.",
    side: { lean: "home", confidence: 7, spreadLineAtOpinion: { homeLine: 3, awayLine: -3 } },
    total: { lean: "under", confidence: 5, totalLineAtOpinion: 44.5 },
  },
  updateAssessment: {
    developments: [
      {
        developmentId: "fixture-dev-b1",
        evidenceIds: ["grok-2026_01_BAL_IND-fixture0003"],
        summary: "Synthetic: a Ravens starter was added to the injury report as questionable.",
        significance: "moderate",
        direction: "home_positive",
        affectedAreas: ["usage"],
        footballImpact: "Synthetic placeholder football-impact text.",
        marketRelevance: "Synthetic placeholder market-relevance text.",
      },
    ],
    thesisAssessment: { changed: false, explanation: "Synthetic: thesis unchanged, evidence reinforces it." },
    sideAssessment: { previousLean: "home", currentLean: "home", change: "strengthened", previousConfidence: 6, currentConfidence: 7, explanation: "Synthetic placeholder explanation." },
    totalAssessment: { previousLean: "under", currentLean: "under", change: "none", previousConfidence: 5, currentConfidence: 5, explanation: "Synthetic placeholder explanation." },
    overallChange: "minor",
    conciseCommentary: "Synthetic placeholder commentary.",
  },
};

/** C. Daily update: minor news, no market move, no thesis/lean/confidence change -- "no material change" is valid. */
export const SNAPSHOT_C_NO_MATERIAL_CHANGE: AnalysisSnapshot = {
  schemaVersion: "nfl-snapshot-v1",
  snapshotId: "grok-2026_01_BAL_IND-daily_update-fixturecccccccc",
  model: "grok",
  gameId: FIXTURE_SNAPSHOT_GAME_ID,
  season: FIXTURE_SNAPSHOT_SEASON,
  week: FIXTURE_SNAPSHOT_WEEK,
  snapshotType: "daily_update",
  createdAt: "2026-09-11T12:00:00.000Z",
  researchCutoff: "2026-09-11T11:00:00.000Z",
  kickoff: FIXTURE_SNAPSHOT_KICKOFF_UTC,
  previousSnapshotId: SNAPSHOT_B_DAILY_UPDATE.snapshotId,
  context: { contextVersion: FIXTURE_SNAPSHOT_CONTEXT_VERSION, contextHash: FIXTURE_SNAPSHOT_CONTEXT_HASH, contextGeneratedAt: FIXTURE_SNAPSHOT_CONTEXT_GENERATED_AT },
  evidence: {
    evidenceIds: ["grok-2026_01_BAL_IND-fixture0001", "grok-2026_01_BAL_IND-fixture0002", "grok-2026_01_BAL_IND-fixture0003", "grok-2026_01_BAL_IND-fixture0004"],
    addedEvidenceIds: ["grok-2026_01_BAL_IND-fixture0004"],
    supersededEvidenceIds: [],
    conflictingEvidenceIds: [],
  },
  market: {
    ...marketState({ spread: { homeLine: 3, awayLine: -3 }, total: { line: 44.5 }, asOf: "2026-09-11T10:00:00.000Z" }),
    previousSpread: { homeLine: 3, awayLine: -3 },
    previousTotal: 44.5,
    spreadDelta: 0,
    totalDelta: 0,
    moneylineHomeDelta: null,
    moneylineAwayDelta: null,
    sportsbookChanged: false,
    asOfDeltaMs: Date.parse("2026-09-11T10:00:00.000Z") - Date.parse("2026-09-10T10:00:00.000Z"),
  },
  analysisState: {
    thesis: "IND's home-field spot and Ravens' new-staff uncertainty are worth the home points early in the week.",
    side: { lean: "home", confidence: 7, spreadLineAtOpinion: { homeLine: 3, awayLine: -3 } },
    total: { lean: "under", confidence: 5, totalLineAtOpinion: 44.5 },
  },
  updateAssessment: {
    developments: [
      {
        developmentId: "fixture-dev-c1",
        evidenceIds: ["grok-2026_01_BAL_IND-fixture0004"],
        summary: "Synthetic: a routine practice-participation note with no status change.",
        significance: "neutral",
        direction: "neutral",
        affectedAreas: ["other"],
        footballImpact: "Synthetic placeholder -- no material football impact.",
        marketRelevance: "Synthetic placeholder -- no market relevance.",
      },
    ],
    thesisAssessment: { changed: false, explanation: "Synthetic: no change." },
    sideAssessment: { previousLean: "home", currentLean: "home", change: "none", previousConfidence: 7, currentConfidence: 7, explanation: "Synthetic placeholder explanation." },
    totalAssessment: { previousLean: "under", currentLean: "under", change: "none", previousConfidence: 5, currentConfidence: 5, explanation: "Synthetic placeholder explanation." },
    overallChange: "none",
    conciseCommentary: "Synthetic: no material change since the prior snapshot.",
  },
};

/** D. Later update: material opposing news, model moves to PASS (home lean -> pass, no directional confidence). */
export const SNAPSHOT_D_MOVED_TO_PASS: AnalysisSnapshot = {
  schemaVersion: "nfl-snapshot-v1",
  snapshotId: "grok-2026_01_BAL_IND-daily_update-fixturedddddddd",
  model: "grok",
  gameId: FIXTURE_SNAPSHOT_GAME_ID,
  season: FIXTURE_SNAPSHOT_SEASON,
  week: FIXTURE_SNAPSHOT_WEEK,
  snapshotType: "daily_update",
  createdAt: "2026-09-12T12:00:00.000Z",
  researchCutoff: "2026-09-12T11:00:00.000Z",
  kickoff: FIXTURE_SNAPSHOT_KICKOFF_UTC,
  previousSnapshotId: SNAPSHOT_C_NO_MATERIAL_CHANGE.snapshotId,
  context: { contextVersion: FIXTURE_SNAPSHOT_CONTEXT_VERSION, contextHash: FIXTURE_SNAPSHOT_CONTEXT_HASH, contextGeneratedAt: FIXTURE_SNAPSHOT_CONTEXT_GENERATED_AT },
  evidence: {
    evidenceIds: [
      "grok-2026_01_BAL_IND-fixture0001",
      "grok-2026_01_BAL_IND-fixture0002",
      "grok-2026_01_BAL_IND-fixture0003",
      "grok-2026_01_BAL_IND-fixture0004",
      "grok-2026_01_BAL_IND-fixture0005",
    ],
    addedEvidenceIds: ["grok-2026_01_BAL_IND-fixture0005"],
    supersededEvidenceIds: [],
    conflictingEvidenceIds: [],
  },
  market: {
    ...marketState({ spread: { homeLine: 2.5, awayLine: -2.5 }, total: { line: 44.5 }, asOf: "2026-09-12T10:00:00.000Z" }),
    previousSpread: { homeLine: 3, awayLine: -3 },
    previousTotal: 44.5,
    spreadDelta: -0.5,
    totalDelta: 0,
    moneylineHomeDelta: null,
    moneylineAwayDelta: null,
    sportsbookChanged: false,
    asOfDeltaMs: Date.parse("2026-09-12T10:00:00.000Z") - Date.parse("2026-09-11T10:00:00.000Z"),
  },
  analysisState: {
    thesis: "Synthetic: IND's projected starting LT is now out; the home-field edge no longer clears a real number.",
    side: { lean: "pass", confidence: null, spreadLineAtOpinion: { homeLine: 2.5, awayLine: -2.5 } },
    total: { lean: "under", confidence: 5, totalLineAtOpinion: 44.5 },
  },
  updateAssessment: {
    developments: [
      {
        developmentId: "fixture-dev-d1",
        evidenceIds: ["grok-2026_01_BAL_IND-fixture0005"],
        summary: "Synthetic: IND's starting LT ruled out for Sunday.",
        significance: "major",
        direction: "away_positive",
        affectedAreas: ["protection", "pass_rush"],
        footballImpact: "Synthetic placeholder -- material protection downgrade.",
        marketRelevance: "Synthetic placeholder -- line moved in response.",
      },
    ],
    thesisAssessment: { changed: true, explanation: "Synthetic: the protection downgrade removes the prior edge." },
    sideAssessment: { previousLean: "home", currentLean: "pass", change: "moved_to_pass", previousConfidence: 7, currentConfidence: null, explanation: "Synthetic placeholder explanation." },
    totalAssessment: { previousLean: "under", currentLean: "under", change: "none", previousConfidence: 5, currentConfidence: 5, explanation: "Synthetic placeholder explanation." },
    overallChange: "material",
    conciseCommentary: "Synthetic: material opposing news moves this to a pass.",
  },
};

/**
 * E. Post-kickoff snapshot attempt fixture data -- used with canCreatePregameSnapshot(), not a
 * stored AnalysisSnapshot (creation must be rejected before one would ever be written). The
 * researchCutoff itself is still validly pregame (before kickoff) -- what makes this attempt
 * illegal is that the current wall-clock time ("now") is already past kickoff, i.e. someone
 * trying to create a new pregame snapshot late, after the stream has locked.
 */
export const FIXTURE_POST_KICKOFF_ATTEMPT = {
  kickoffUtc: FIXTURE_SNAPSHOT_KICKOFF_UTC,
  researchCutoff: "2026-09-13T16:00:00.000Z", // before kickoff -- the cutoff itself is fine
  snapshotType: "daily_update" as const,
  now: () => new Date("2026-09-13T19:00:00.000Z"), // well after kickoff -- stream is locked
};
