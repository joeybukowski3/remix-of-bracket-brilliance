/**
 * AI Picks v2 WU3 -- SYNTHETIC fixtures for the v2 handicap contract, built
 * around the 2026 Week 3 LAC @ BUF matchup. The football data (record, EPA,
 * points) comes from the real deterministic packet; the market, the evidence
 * and every model output below are INVENTED for tests. The evidence claims name
 * no real player. Nothing here is real reporting or a real betting opinion.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeExternalEvidence } from "../nfl-evidence-normalizer";
import type { EvidenceModel, EvidenceNormalizationContext, EvidenceRecord, RawEvidenceCandidate } from "../nfl-evidence-types";
import { loadFreshGameContextPacket } from "../nfl-full-game-context-loader";
import type { GameContextMarket, NflGameContextPacket } from "../nfl-full-game-context";
import { buildHandicapV2MarketContext, buildBookRange, type HandicapV2MarketContext } from "../nfl-handicap-v2-market";
import type { HandicapV2GameFacts } from "../nfl-handicap-v2-prompts";
import { deriveFairScore } from "../nfl-handicap-v2-text";
import { HANDICAP_V2_SCHEMA_VERSION, type StageAV2 } from "../nfl-handicap-v2-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const V2_GAME_ID = "2026_03_LAC_BUF";

const loaded = loadFreshGameContextPacket({ root: ROOT, season: 2026, week: 3, gameId: V2_GAME_ID, now: () => new Date("2026-09-25T12:00:00.000Z") });
if (loaded.result.status !== "ok") throw new Error(`v2 fixture packet failed to build: ${loaded.result.reason}`);
export const V2_PACKET: NflGameContextPacket = loaded.result.packet;

export const V2_GAME: HandicapV2GameFacts = {
  gameId: V2_GAME_ID,
  homeTeam: "buf",
  awayTeam: "lac",
  homeTeamFull: "Buffalo Bills",
  awayTeamFull: "Los Angeles Chargers",
  kickoffUtc: V2_PACKET.schedule.kickoffUtc,
};

export const V2_CONTEXT_HASH = "fixture-v2-context-hash";
export const V2_STAGE_A_TIME = "2026-09-25T12:00:00.000Z";
export const V2_STAGE_B_TIME = "2026-09-25T12:01:00.000Z";

/* -------------------------------------------------------------------------- */
/* Market                                                                     */
/* -------------------------------------------------------------------------- */

const TEAMS = { homeTeam: V2_GAME.homeTeam, awayTeam: V2_GAME.awayTeam, homeTeamFull: V2_GAME.homeTeamFull, awayTeamFull: V2_GAME.awayTeamFull };

function market(homeLine: number, total: number): GameContextMarket {
  return {
    sportsbook: "draftkings",
    selectionReason: "priority",
    spread: { homeLine, awayLine: -homeLine, homePrice: -115, awayPrice: -105 },
    total: { line: total, overPrice: -105, underPrice: -115 },
    moneyline: { homePrice: null, awayPrice: null },
    firstObserved: { spread: homeLine, total, observedAt: "2026-09-21T10:00:00.000Z" },
    lineMovement: { spread: 0, total: 0 },
    freshness: "fresh",
    openingLineCaveat: true,
    provenance_status: "available",
  };
}

/** Five books at -7.5 and four at -7 -- the target example's "-7 to -7.5". */
const SPLIT_BOOKS = { books: [-7, -7, -7, -7, -7.5, -7.5, -7.5, -7.5, -7.5].map((homeLine, i) => ({ sportsbook: `book${i}`, spread: { homeLine, awayLine: -homeLine, homePrice: -110, awayPrice: -110 }, total: { line: i % 2 ? 50 : 50.5, overPrice: -110, underPrice: -110 } })) };

function context(homeLine: number, total: number, withRange: boolean): HandicapV2MarketContext {
  const built = buildHandicapV2MarketContext({ market: market(homeLine, total), teams: TEAMS, bookRange: withRange ? buildBookRange(SPLIT_BOOKS as never) : null, asOf: "2026-09-25T11:00:00.000Z" });
  if (!built) throw new Error("fixture market failed to build");
  return built;
}

/** Bills -7 (on the key number), books split -7 / -7.5, total 50.5. */
export const V2_MARKET_MINUS_7 = context(-7, 50.5, true);
/** Bills -7.5 (half-point line: a push is impossible). */
export const V2_MARKET_MINUS_7_5 = context(-7.5, 50.5, false);
/** Bills -5.5: not within a point of 3 or 7. */
export const V2_MARKET_MINUS_5_5 = context(-5.5, 50.5, false);

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

const EVIDENCE_CONTEXT: EvidenceNormalizationContext = {
  gameId: V2_GAME_ID,
  season: 2026,
  week: 3,
  homeTeam: "buf",
  awayTeam: "lac",
  kickoffUtc: V2_GAME.kickoffUtc,
  contextVersion: "nfl-game-context-v1-fixture",
  knownTeamAbbrs: new Set(["buf", "lac"]),
};

function candidate(model: EvidenceModel, overrides: Partial<RawEvidenceCandidate>): RawEvidenceCandidate {
  return {
    model,
    gameId: V2_GAME_ID,
    claim: "Chargers starting tight end [Fixture Tight End] was ruled OUT on the Friday injury report (forearm).",
    category: "injury",
    source: { name: "Chargers Official Injury Report (fixture)", url: "https://example-fixture.test/chargers/injury-report/2026-w3", sourceType: "injury_report", author: null, publishedAt: "2026-09-25T09:00:00.000Z", retrievedAt: "2026-09-25T09:05:00.000Z" },
    subjects: { teams: ["lac"], players: ["fixture-tight-end"], coaches: [] },
    confidence: "high",
    relevance: { summary: "Top tight end out.", areas: ["passing"] },
    ...overrides,
  } as RawEvidenceCandidate;
}

function normalize(c: RawEvidenceCandidate): EvidenceRecord {
  const result = normalizeExternalEvidence(c, EVIDENCE_CONTEXT);
  if (!result.ok) throw new Error(`v2 fixture evidence failed to normalize: ${result.reasons.join("; ")}`);
  return result.evidence;
}

export interface V2ProviderEvidence {
  injury: EvidenceRecord;
  weather: EvidenceRecord;
  bettingOpinion: EvidenceRecord;
  all: EvidenceRecord[];
}

export function providerEvidence(model: EvidenceModel): V2ProviderEvidence {
  const injury = normalize(candidate(model, {}));
  const weather = normalize(
    candidate(model, {
      claim: "The forecast for Sunday at Highmark Stadium is clear with light wind (fixture).",
      category: "weather",
      source: { name: "Weather Provider (fixture)", url: "https://example-fixture.test/weather/buffalo", sourceType: "weather_provider", author: null, publishedAt: "2026-09-25T08:00:00.000Z", retrievedAt: "2026-09-25T08:05:00.000Z" },
      subjects: { teams: [], players: [], coaches: [] },
      relevance: { summary: "Clear, light wind.", areas: ["weather"] },
    })
  );
  const bettingOpinion = normalize(
    candidate(model, {
      claim: "Several analysts pick Buffalo to cover the spread this week (fixture).",
      category: "news",
      source: { name: "Picks Column (fixture)", url: "https://example-fixture.test/picks/week-3", sourceType: "sports_media", author: null, publishedAt: "2026-09-25T07:00:00.000Z", retrievedAt: "2026-09-25T07:05:00.000Z" },
      subjects: { teams: ["buf"], players: [], coaches: [] },
      relevance: { summary: "Outside pick.", areas: ["spread"] },
    })
  );
  return { injury, weather, bettingOpinion, all: [injury, weather, bettingOpinion] };
}

export const V2_EVIDENCE = { grok: providerEvidence("grok"), chatgpt: providerEvidence("chatgpt") };

/* -------------------------------------------------------------------------- */
/* Stage A                                                                    */
/* -------------------------------------------------------------------------- */

export const V2_FAIR_SPREAD = { team: "BUF", line: -7.5 };
export const V2_PROJECTED_TOTAL = 50;

const FACT_REFS = {
  lacPoints: "teamForm.away.seasonToDate.points",
  lacRecentEpa: "teamForm.away.recentGame.facts.efficiency.offense.epaPerPlay",
  lacRecentRushEpa: "teamForm.away.recentGame.facts.efficiency.offense.epaPerRush",
  bufPoints: "teamForm.home.seasonToDate.points",
  bufEpa: "teamForm.home.seasonToDate.efficiency.offense.epaPerPlay",
};
export { FACT_REFS as V2_FACT_REFS };

export function stageARaw(model: EvidenceModel): Record<string, unknown> {
  return {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    model,
    gameId: V2_GAME_ID,
    contextHash: "",
    fairSpread: V2_FAIR_SPREAD,
    projectedTotal: V2_PROJECTED_TOTAL,
    keyDrivers: [
      { summary: "Los Angeles has scored 14 points in both games and its offense is at -0.30 EPA per play with a rushing game at -0.54 per attempt, so I expect it to struggle to reach 21 in Buffalo.", factRefs: [FACT_REFS.lacPoints, FACT_REFS.lacRecentEpa, FACT_REFS.lacRecentRushEpa], evidenceRefs: [] },
      { summary: "Buffalo is scoring 38.5 points a game at a strong EPA per play through two games, a small sample but one that supports a large Bills scoring output at home.", factRefs: [FACT_REFS.bufPoints, FACT_REFS.bufEpa], evidenceRefs: [] },
      { summary: "Los Angeles is missing its starting tight end, which removes a reliable outlet against the Buffalo pass rush and lowers its scoring ceiling.", factRefs: [], evidenceRefs: [V2_EVIDENCE[model].injury.evidenceId] },
    ],
    mainRisk: "Buffalo's defense has allowed 31 points per game, so if Los Angeles stops turning the ball over its offense could score enough to keep this within a touchdown.",
    uncertainty: "MEDIUM",
  };
}

export function trustedStageA(model: EvidenceModel): StageAV2 {
  const raw = stageARaw(model);
  return {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    model,
    gameId: V2_GAME_ID,
    contextHash: V2_CONTEXT_HASH,
    generatedAt: V2_STAGE_A_TIME,
    // The validator canonicalizes the team code to the packet's lowercase form.
    fairSpread: { team: "buf", line: V2_FAIR_SPREAD.line },
    projectedTotal: V2_PROJECTED_TOTAL,
    fairScore: deriveFairScore(V2_FAIR_SPREAD, V2_PROJECTED_TOTAL, "buf"),
    keyDrivers: raw.keyDrivers as StageAV2["keyDrivers"],
    mainRisk: raw.mainRisk as string,
    uncertainty: "MEDIUM",
  };
}

/* -------------------------------------------------------------------------- */
/* Stage B                                                                    */
/* -------------------------------------------------------------------------- */

export interface StageBFixtureOptions {
  verdict?: "BET" | "LEAN" | "PASS";
  preferredLabel?: string;
  otherLabel?: string;
  probabilityPreferred?: number;
  probabilityOther?: number;
  firstParagraph?: string;
  closing?: string;
  counterargument?: string;
  keyNumberSensitivity?: string | null;
  injuryParagraph?: string | null;
  confidence?: "LOW" | "MEDIUM" | "MEDIUM_HIGH" | "HIGH";
  evidenceRefs?: string[];
  factRefs?: string[];
}

const HESITATION = "My main hesitation is the number itself. Seven is a lot when Los Angeles has a quarterback who can keep pace, and Buffalo's defense has allowed 31 points a game. If the Chargers stop turning the ball over, one or two late drives could keep this within a touchdown.";
const COUNTER = "Seven is a lot when Los Angeles has a quarterback who can keep pace, and Buffalo's defense has allowed 31 points a game, so one or two late drives after a cleaner turnover day could keep this within a touchdown.";

/** A compliant Stage B payload (the LEAN from the target example unless overridden). */
export function stageBRaw(model: EvidenceModel, options: StageBFixtureOptions = {}): Record<string, unknown> {
  const preferredLabel = options.preferredLabel ?? "Bills -7";
  const otherLabel = options.otherLabel ?? "Chargers +7";
  const probabilityPreferred = options.probabilityPreferred ?? 56;
  const probabilityOther = options.probabilityOther ?? 40;
  const injury = options.injuryParagraph === undefined
    ? "The injury picture also leans Buffalo. Los Angeles is missing its starting tight end, ruled out on the injury report, which thins an already limited group of pass catchers, while Buffalo has no significant absences."
    : options.injuryParagraph;
  const paragraphs = [
    options.firstParagraph ?? "I like **Bills -7** more than **Chargers +7** at the current number, but I would not call it an automatic play.",
    "DraftKings has Bills -7 and the total at 50.5, while several books sit at -7.5 and the total drops to 50 at some of them. That makes -7 slightly better than -7.5, because a game decided by exactly seven is a push instead of a loss for Buffalo backers.",
    "The current-season evidence favors Buffalo pretty clearly. The Chargers are 0-2 and scored 14 points in both games. Against Las Vegas last week they managed -0.30 EPA per play and three turnovers, and their rushing offense was especially poor at -0.54 EPA per attempt. Buffalo is 2-0 and averaging 38.5 points per game.",
    ...(injury ? [injury] : []),
    HESITATION,
  ];
  const finalRead = [
    `**${preferredLabel}: ~${probabilityPreferred}% cover probability**`,
    `**${otherLabel}: ~${probabilityOther}%**`,
    "**Fair-ish score: Chargers 21, Bills 29**",
    "**Projected total: ~50**",
  ].join("\n");
  const closing = options.closing ?? "So at the exact line, I would choose Bills -7. If it moved to -7.5, I'd be noticeably less interested because losing the push at seven matters.";
  return {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    model,
    gameId: V2_GAME_ID,
    contextHash: "",
    verdict: options.verdict ?? "LEAN",
    preferredTeam: "BUF",
    coverProbabilityPreferred: probabilityPreferred,
    coverProbabilityOther: probabilityOther,
    confidence: options.confidence ?? "MEDIUM",
    keyNumberSensitivity: options.keyNumberSensitivity === undefined ? "Bills -7 sits on the key number, so a game decided by exactly seven is a push; at -7.5 that push becomes a loss for Buffalo, which makes the case noticeably weaker." : options.keyNumberSensitivity,
    counterargument: options.counterargument ?? COUNTER,
    analysisMarkdown: `${paragraphs.join("\n\n")}\n\n${finalRead}\n\n${closing}`,
    factRefsUsed: options.factRefs ?? [FACT_REFS.lacPoints, FACT_REFS.lacRecentEpa, FACT_REFS.lacRecentRushEpa, FACT_REFS.bufPoints],
    evidenceRefsUsed: options.evidenceRefs ?? [V2_EVIDENCE[model].injury.evidenceId],
  };
}

export function stageBBet(model: EvidenceModel): Record<string, unknown> {
  return stageBRaw(model, {
    verdict: "BET",
    confidence: "MEDIUM_HIGH",
    probabilityPreferred: 61,
    probabilityOther: 35,
    firstParagraph: "I like **Bills -7** a lot more than **Chargers +7** at the current number, and this is a play for me.",
    closing: "So at the exact line I would bet Bills -7. At -7.5 I would still be on Buffalo but with less enthusiasm, because losing the push at seven matters.",
  });
}

export function stageBPass(model: EvidenceModel): Record<string, unknown> {
  return stageBRaw(model, {
    verdict: "PASS",
    confidence: "LOW",
    probabilityPreferred: 51,
    probabilityOther: 45,
    firstParagraph: "I would pass on this number. If I were forced to be on a side I would take **Bills -7** over **Chargers +7**, but the edge is too small to pay for.",
    closing: "So I would pass at the exact line. Bills -6.5 would start to interest me, and I would be much less interested at -7.5.",
  });
}
