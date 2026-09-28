/** Shared, synthetic fixtures for the v2 slate planner/executor/CLI tests. No real game data, no provider calls. */
import { buildKeyNumberContext, buildSideLabels, type HandicapV2MarketContext } from "./nfl-handicap-v2-market";
import type { HandicapV2Record } from "./nfl-handicap-v2-types";
import type { V2GameFacts, V2ProviderFacts } from "./nfl-ai-v2-slate-plan";
import type { EvidenceModel } from "./nfl-evidence-types";

export const GAME_ID = "2026_03_LAC_BUF";
export const KICKOFF = "2026-09-27T17:00:00.000Z";
/** 53h before kickoff: the late-week phase, and only 2h after the fixture evidence was collected. */
export const NOW = new Date("2026-09-25T12:00:00.000Z");
const TEAMS = { homeTeam: "buf", awayTeam: "lac", homeTeamFull: "Buffalo Bills", awayTeamFull: "Los Angeles Chargers" };

export function market(homeLine = -7, total = 45.5): HandicapV2MarketContext {
  const favoriteLine = Math.abs(homeLine);
  return {
    teams: TEAMS,
    spread: { sportsbook: "DraftKings", homeLine, awayLine: -homeLine, homePrice: -110, awayPrice: -110 },
    total: { line: total, overPrice: -110, underPrice: -110 },
    sideLabels: buildSideLabels(TEAMS, homeLine, -homeLine),
    favorite: homeLine === 0 ? null : { side: homeLine < 0 ? "home" : "away", team: homeLine < 0 ? "buf" : "lac", line: favoriteLine },
    bookRange: null,
    movementSinceFirstTracked: { homeLine: 0, total: 0 },
    keyNumbers: buildKeyNumberContext(favoriteLine, null),
    asOf: "2026-09-25T10:00:00.000Z",
    freshness: "current",
  } as HandicapV2MarketContext;
}

export function record(provider: EvidenceModel = "grok", over: Partial<HandicapV2Record> = {}): HandicapV2Record {
  const m = market();
  return {
    schemaVersion: "nfl-handicap-v2",
    gameId: GAME_ID,
    provider,
    generatedAt: "2026-09-25T09:00:00.000Z",
    stageAGeneratedAt: "2026-09-25T08:59:00.000Z",
    contextHash: "ctx1",
    promptVersion: "nfl-handicap-v2-prompts-1",
    marketSpread: { sportsbook: "DraftKings", homeLine: -7, awayLine: 7, homePrice: -110, awayPrice: -110, asOf: m.asOf },
    marketTotal: 45.5,
    keyNumberContext: m.keyNumbers,
    inputs: { stageAEvidenceHash: "ev1", availabilityHash: "av1", weatherHash: "w1", bookRange: null },
    ...over,
  } as unknown as HandicapV2Record;
}

export function gameFacts(over: Partial<V2GameFacts> = {}): V2GameFacts {
  return {
    gameId: GAME_ID,
    season: 2026,
    week: 3,
    homeTeam: "buf",
    awayTeam: "lac",
    kickoffUtc: KICKOFF,
    now: NOW,
    contextBlockedReason: null,
    footballContextHash: "ctx1",
    availabilityHash: "av1",
    weatherHash: "w1",
    market: market(),
    ...over,
  };
}

export function providerFacts(provider: EvidenceModel = "grok", over: Partial<V2ProviderFacts> = {}): V2ProviderFacts {
  return {
    provider,
    evidence: { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev1", count: 5 },
    hasSnapshotLineage: true,
    record: record(provider),
    presentationStale: false,
    ledger: {},
    ...over,
  };
}
