/**
 * WU2 -- SYNTHETIC TEST FIXTURES ONLY. Every claim below is invented for
 * exercising the evidence normalizer/store against the documented test
 * game (2026_01_BAL_IND). None of this is real reporting; nothing here
 * should ever be read as an actual injury/personnel/weather fact about the
 * real Ravens/Colts. See scripts/lib/nfl-evidence-normalizer.test.ts,
 * nfl-evidence-store.test.ts, and generate-nfl-evidence-fixture.ts.
 */

import type { EvidenceNormalizationContext, RawEvidenceCandidate, SubjectIdentitySource } from "../nfl-evidence-types";

export const FIXTURE_GAME_ID = "2026_01_BAL_IND";
export const FIXTURE_SEASON = 2026;
export const FIXTURE_WEEK = 1;
export const FIXTURE_HOME_TEAM = "ind";
export const FIXTURE_AWAY_TEAM = "bal";
export const FIXTURE_KICKOFF_UTC = "2026-09-13T17:00:00.000Z";

export const FIXTURE_CONTEXT: EvidenceNormalizationContext = {
  gameId: FIXTURE_GAME_ID,
  season: FIXTURE_SEASON,
  week: FIXTURE_WEEK,
  homeTeam: FIXTURE_HOME_TEAM,
  awayTeam: FIXTURE_AWAY_TEAM,
  kickoffUtc: FIXTURE_KICKOFF_UTC,
  contextVersion: "nfl-game-context-v1-fixture",
  knownTeamAbbrs: new Set(["ind", "bal", "kc", "buf"]),
  // Deliberately omitted here -- FIXTURE_CONTEXT doubles as the
  // "no authoritative subject-identity source available" case (WU2.1's
  // stale/unavailable-source test uses this context unmodified).
};

/**
 * WU2.1 -- SYNTHETIC canonical roster/coach identity data for the fixture
 * game (ind vs bal), plus one player and one coach conclusively rostered on
 * an unrelated third team (kc) to exercise the wrong-team-association reject
 * path. None of this is real nflverse/coaching data.
 */
export const FIXTURE_SUBJECT_IDENTITY: SubjectIdentitySource = {
  players: [
    { playerId: "00-fixture-001", canonicalName: "Fixture Player A", team: "ind" },
    { playerId: "00-fixture-002", canonicalName: "Fixture Player B", team: "ind" },
    { playerId: "00-fixture-003", canonicalName: "Fixture Player C", team: "bal" },
    { playerId: "00-fixture-999", canonicalName: "Fixture Player Z", team: "kc" },
  ],
  coaches: [
    { coachId: "fixture-ind-coach", canonicalName: "Fixture Head Coach", team: "ind" },
    { coachId: "fixture-bal-coach", canonicalName: "Fixture Bal Coach", team: "bal" },
    { coachId: "fixture-kc-coach", canonicalName: "Fixture Kc Coach", team: "kc" },
  ],
};

export const FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY: EvidenceNormalizationContext = {
  ...FIXTURE_CONTEXT,
  subjectIdentity: FIXTURE_SUBJECT_IDENTITY,
};

/** Case 1: confirmed injury, official source -- should normalize to verified/pregameSafe. */
export const confirmedInjuryCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Colts LT [Fixture Player A] was ruled OUT on the Friday injury report (ankle).",
  category: "injury",
  source: {
    name: "Colts Official Injury Report",
    url: "https://example-fixture.test/colts/injury-report/2026-w1",
    sourceType: "injury_report",
    author: null,
    publishedAt: "2026-09-11T20:00:00.000Z",
    retrievedAt: "2026-09-11T20:05:00.000Z",
  },
  subjects: { teams: ["ind"], players: ["fixture-player-a"], coaches: [] },
  confidence: "high",
  relevance: { summary: "Starting LT out changes pass-protection matchup.", areas: ["protection", "pass_rush"] },
  rawExcerpt: "OUT: [Fixture Player A] (Ankle)",
};

/** Case 2: questionable player, beat reporter -- single_source, still pregame-safe. */
export const questionablePlayerCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "[Fixture Player B] (hamstring) is questionable for Sunday and was limited in Friday's practice.",
  category: "injury",
  source: {
    name: "Fixture Beat Reporter",
    url: "https://example-fixture.test/beat/colts-injury-notes",
    sourceType: "beat_reporter",
    author: "Fixture Reporter",
    publishedAt: "2026-09-12T14:00:00.000Z",
    retrievedAt: "2026-09-12T14:10:00.000Z",
  },
  subjects: { teams: ["ind"], players: ["fixture-player-b"], coaches: [] },
  confidence: "medium",
  relevance: { summary: "Questionable WR could reduce snap share.", areas: ["usage"] },
  rawExcerpt: "[Fixture Player B] was limited Friday with a hamstring issue and is questionable.",
};

/** Case 3: coach quote -- exactText must appear verbatim inside rawExcerpt. */
export const coachQuoteCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Colts head coach commented on the offensive line plan for Sunday.",
  category: "quote",
  source: {
    name: "Colts Official Press Conference Transcript",
    url: "https://example-fixture.test/colts/presser/2026-w1-friday",
    sourceType: "official_team",
    author: "Fixture Head Coach",
    publishedAt: "2026-09-12T18:00:00.000Z",
    retrievedAt: "2026-09-12T18:05:00.000Z",
  },
  subjects: { teams: ["ind"], players: [], coaches: ["fixture-head-coach"] },
  confidence: "high",
  relevance: { summary: "Direct coach statement on protection plan.", areas: ["protection", "scheme"] },
  quote: { speaker: "Fixture Head Coach", exactText: "We feel good about our depth up front and we'll be ready." },
  rawExcerpt: "Q: How confident are you in the line? A: We feel good about our depth up front and we'll be ready.",
};

/** Case 4: beat-report personnel update. */
export const personnelUpdateCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Ravens are expected to elevate [Fixture Player C] from the practice squad ahead of Sunday.",
  category: "personnel",
  source: {
    name: "Fixture National Reporter",
    url: "https://example-fixture.test/national/ravens-elevation",
    sourceType: "national_reporter",
    author: "Fixture National Reporter",
    publishedAt: "2026-09-12T22:00:00.000Z",
    retrievedAt: "2026-09-12T22:05:00.000Z",
  },
  subjects: { teams: ["bal"], players: ["fixture-player-c"], coaches: [] },
  confidence: "medium",
  relevance: { summary: "Practice-squad elevation signals a depth-chart change.", areas: ["other"] },
  rawExcerpt: "Ravens are elevating [Fixture Player C] from the practice squad, per a source.",
};

/** Case 5: weather claim -- category weather is still AI-researched per architecture §weather. */
export const weatherCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Forecast for kickoff calls for clear skies, 74F, wind 6mph -- no material weather impact expected.",
  category: "weather",
  source: {
    name: "Fixture Weather Provider",
    url: "https://example-fixture.test/weather/indianapolis/2026-09-13",
    sourceType: "weather_provider",
    author: null,
    publishedAt: "2026-09-13T00:00:00.000Z",
    retrievedAt: "2026-09-13T00:05:00.000Z",
  },
  subjects: { teams: ["ind", "bal"], players: [], coaches: [] },
  confidence: "medium",
  relevance: { summary: "Confirms no weather-driven total adjustment needed.", areas: ["weather", "total"] },
  rawExcerpt: "Indianapolis forecast: clear, 74F, wind 6mph SW.",
};

/** Case 6: rejected rumor -- anonymous/tout-style source, should land verificationStatus: rejected. */
export const rejectedRumorCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "An anonymous source claims Colts are 'quietly confident' and will blow this game open early.",
  category: "news",
  source: {
    name: "Anonymous Parlay Tout Account",
    url: "https://example-fixture.test/social/rumor-post-123",
    sourceType: "other",
    author: null,
    publishedAt: "2026-09-12T10:00:00.000Z",
    retrievedAt: "2026-09-12T10:05:00.000Z",
  },
  subjects: { teams: ["ind"], players: [], coaches: [] },
  confidence: "low",
  relevance: { summary: "Unsourced confidence rumor, no factual content.", areas: ["other"] },
  rawExcerpt: "trust me bro, colts blow this out early",
};

/** Case 7: post-kickoff contamination -- retrievedAt after kickoff, must flag pregameSafe:false. */
export const postKickoffContaminationCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "In-game update: [Fixture Player A] returned to the sideline in the second quarter.",
  category: "injury",
  source: {
    name: "Fixture Live Update Wire",
    url: "https://example-fixture.test/live/w1-update",
    sourceType: "sports_media",
    author: null,
    publishedAt: "2026-09-13T18:10:00.000Z", // after FIXTURE_KICKOFF_UTC
    retrievedAt: "2026-09-13T18:12:00.000Z",
  },
  subjects: { teams: ["ind"], players: ["fixture-player-a"], coaches: [] },
  confidence: "medium",
  relevance: { summary: "In-game injury note, not a pregame fact.", areas: ["other"] },
  rawExcerpt: "[Fixture Player A] is back on the sideline early in Q2.",
};

/** Case 8: exact duplicate of confirmedInjuryCandidate -- same claim + same URL. */
export const duplicateInjuryCandidate: RawEvidenceCandidate = {
  ...confirmedInjuryCandidate,
  source: { ...confirmedInjuryCandidate.source, retrievedAt: "2026-09-11T21:00:00.000Z" },
};

/** Case 9: corroborating claim -- independent source, same fact-slot, different wording. */
export const corroboratingInjuryCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Team sources confirm [Fixture Player A] did not travel with the team due to the ankle injury.",
  category: "injury",
  source: {
    name: "Fixture Beat Reporter Two",
    url: "https://example-fixture.test/beat/colts-travel-notes",
    sourceType: "beat_reporter",
    author: "Fixture Reporter Two",
    publishedAt: "2026-09-12T12:00:00.000Z",
    retrievedAt: "2026-09-12T12:05:00.000Z",
  },
  subjects: { teams: ["ind"], players: ["fixture-player-a"], coaches: [] },
  confidence: "medium",
  relevance: { summary: "Non-travel corroborates the OUT designation.", areas: ["protection"] },
  rawExcerpt: "[Fixture Player A] (ankle) did not travel with the team, sources confirm.",
};

/** Case 10: conflicting claim -- contradicts confirmedInjuryCandidate's OUT status, weaker/earlier source. */
export const conflictingInjuryCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Early-week report indicated [Fixture Player A] was expected to play through the ankle issue.",
  category: "injury",
  source: {
    name: "Fixture Sports Media Roundup",
    url: "https://example-fixture.test/media/early-week-injury-roundup",
    sourceType: "sports_media",
    author: null,
    publishedAt: "2026-09-09T15:00:00.000Z", // earlier than the official OUT report
    retrievedAt: "2026-09-09T15:05:00.000Z",
  },
  subjects: { teams: ["ind"], players: ["fixture-player-a"], coaches: [] },
  confidence: "low",
  relevance: { summary: "Early-week expectation, later superseded by official report.", areas: ["protection"] },
  rawExcerpt: "Early indications are [Fixture Player A] plays through the ankle injury.",
};

/** Case 11: unsupported "sharp money" language -- market category, sourceType too weak to support it. */
export const unsupportedSharpMoneyCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Sharp money is reportedly all over the Colts at home this week.",
  category: "market",
  source: {
    name: "Fixture Generic Blog",
    url: "https://example-fixture.test/blog/sharp-money-take",
    sourceType: "sports_media",
    author: null,
    publishedAt: "2026-09-11T10:00:00.000Z",
    retrievedAt: "2026-09-11T10:05:00.000Z",
  },
  subjects: { teams: ["ind"], players: [], coaches: [] },
  confidence: "medium",
  relevance: { summary: "Unsupported market characterization.", areas: ["market"] },
  rawExcerpt: "Word around the market is sharp money loves the Colts.",
};

/** Case 12: JKB-metric masquerade -- restates an internal-only metric as if independently researched. */
export const jkbMetricMasqueradeCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Our research shows Indianapolis carries a notably higher power rating than Baltimore entering Week 1.",
  category: "matchup",
  source: {
    name: "Fixture Generic Analysis Site",
    url: "https://example-fixture.test/analysis/power-rating-note",
    sourceType: "other",
    author: null,
    publishedAt: "2026-09-10T10:00:00.000Z",
    retrievedAt: "2026-09-10T10:05:00.000Z",
  },
  subjects: { teams: ["ind", "bal"], players: [], coaches: [] },
  confidence: "medium",
  relevance: { summary: "Restates JKB power rating as if externally sourced.", areas: ["other"] },
  rawExcerpt: "Indianapolis's power rating edge is significant heading into Sunday.",
};

/** Hard-fail case: quote present but exactText not found verbatim in rawExcerpt (paraphrase). */
export const paraphraseAsQuoteCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Colts coach expressed confidence in the offensive line.",
  category: "quote",
  source: {
    name: "Fixture Paraphrase Source",
    url: "https://example-fixture.test/paraphrase/coach-comments",
    sourceType: "sports_media",
    author: null,
    publishedAt: "2026-09-12T18:00:00.000Z",
    retrievedAt: "2026-09-12T18:05:00.000Z",
  },
  subjects: { teams: ["ind"], players: [], coaches: [] },
  confidence: "medium",
  relevance: { summary: "Paraphrased, not a verbatim quote.", areas: ["other"] },
  quote: { speaker: "Fixture Head Coach", exactText: "We are extremely confident in our offensive line's ability to dominate." },
  rawExcerpt: "The coach said he felt good about the line's depth heading into Sunday.",
};

/** Hard-fail case: malformed/missing URL. */
export const missingUrlCandidate: RawEvidenceCandidate = {
  model: "grok",
  gameId: FIXTURE_GAME_ID,
  claim: "Some claim with no traceable source URL.",
  category: "news",
  source: {
    name: "Fixture Source With No URL",
    url: null,
    sourceType: "sports_media",
    author: null,
    publishedAt: null,
    retrievedAt: "2026-09-12T10:00:00.000Z",
  },
  subjects: { teams: ["ind"], players: [], coaches: [] },
  confidence: "low",
  relevance: { summary: "Untraceable.", areas: ["other"] },
  rawExcerpt: null,
};

/** Hard-fail case: wrong game association (gameId mismatch). */
export const wrongGameCandidate: RawEvidenceCandidate = {
  ...confirmedInjuryCandidate,
  gameId: "2026_01_KC_BUF",
};

/** Hard-fail case: unknown/irrelevant team in subjects. */
export const unknownTeamSubjectCandidate: RawEvidenceCandidate = {
  ...confirmedInjuryCandidate,
  subjects: { teams: ["kc"], players: ["fixture-player-a"], coaches: [] },
};

/** WU2.1 case: subject player exists on the roster and is rostered on the away (BAL) team. */
export const validBalPlayerSubjectCandidate: RawEvidenceCandidate = {
  ...personnelUpdateCandidate,
  subjects: { teams: ["bal"], players: ["Fixture Player C"], coaches: [] },
};

/** WU2.1 case: subject player exists on the roster and is rostered on the home (IND) team. */
export const validIndPlayerSubjectCandidate: RawEvidenceCandidate = {
  ...confirmedInjuryCandidate,
  subjects: { teams: ["ind"], players: ["Fixture Player A"], coaches: [] },
};

/**
 * WU2.1 hard-fail case: the named player is conclusively rostered on an
 * unrelated third team (kc), even though subjects.teams claims this game --
 * a real identity assigned to the wrong game.
 */
export const wrongTeamPlayerSubjectCandidate: RawEvidenceCandidate = {
  ...confirmedInjuryCandidate,
  subjects: { teams: ["ind"], players: ["Fixture Player Z"], coaches: [] },
};

/** WU2.1 case: subject name not present anywhere in the identity source -- unresolved, not rejected. */
export const unknownPlayerSubjectCandidate: RawEvidenceCandidate = {
  ...confirmedInjuryCandidate,
  subjects: { teams: ["ind"], players: ["Nonexistent Fixture Player Q"], coaches: [] },
};

/** WU2.1 case: subject coach exists and is associated with the home (IND) team. */
export const validCoachSubjectCandidate: RawEvidenceCandidate = {
  ...coachQuoteCandidate,
  subjects: { teams: ["ind"], players: [], coaches: ["Fixture Head Coach"] },
};

/**
 * WU2.1 hard-fail case: the named coach is conclusively associated with an
 * unrelated third team (kc).
 */
export const wrongTeamCoachSubjectCandidate: RawEvidenceCandidate = {
  ...coachQuoteCandidate,
  subjects: { teams: ["ind"], players: [], coaches: ["Fixture Kc Coach"] },
};

/**
 * ChatGPT-namespace mirror of a subset of the above, independently sourced
 * (different URL/reporter), to exercise model-isolation and
 * "same fact discovered independently, retained separately" behavior.
 */
export const chatgptConfirmedInjuryCandidate: RawEvidenceCandidate = {
  ...confirmedInjuryCandidate,
  model: "chatgpt",
  source: { ...confirmedInjuryCandidate.source, name: "ChatGPT-stream Colts Injury Mirror", url: "https://example-fixture.test/chatgpt-mirror/colts-injury-report" },
};

export const chatgptQuestionablePlayerCandidate: RawEvidenceCandidate = {
  ...questionablePlayerCandidate,
  model: "chatgpt",
  source: { ...questionablePlayerCandidate.source, name: "ChatGPT-stream Beat Reporter Mirror", url: "https://example-fixture.test/chatgpt-mirror/beat-injury-notes" },
};

/** WU2.1: chatgpt-namespace mirror of validIndPlayerSubjectCandidate, to exercise identity resolution under model isolation. */
export const chatgptValidIndPlayerSubjectCandidate: RawEvidenceCandidate = {
  ...validIndPlayerSubjectCandidate,
  model: "chatgpt",
  source: { ...validIndPlayerSubjectCandidate.source, name: "ChatGPT-stream Colts Injury Mirror", url: "https://example-fixture.test/chatgpt-mirror/colts-injury-report" },
};

export const GROK_FIXTURE_CANDIDATES: RawEvidenceCandidate[] = [
  confirmedInjuryCandidate,
  questionablePlayerCandidate,
  coachQuoteCandidate,
  personnelUpdateCandidate,
  weatherCandidate,
  rejectedRumorCandidate,
  corroboratingInjuryCandidate,
  conflictingInjuryCandidate,
];

export const CHATGPT_FIXTURE_CANDIDATES: RawEvidenceCandidate[] = [chatgptConfirmedInjuryCandidate, chatgptQuestionablePlayerCandidate, personnelUpdateCandidate].map((c) => ({
  ...c,
  model: "chatgpt",
}));
