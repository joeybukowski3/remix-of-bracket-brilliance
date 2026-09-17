/**
 * WU3.4 -- Grok HANDICAPPING adapter. Targets the same confirmed-working
 * xAI Agent Tools API endpoint as the research adapter
 * (`POST https://api.x.ai/v1/responses`, nfl-grok-research-adapter.ts) but
 * NEVER sends a `tools` field -- this is a reasoning task over
 * already-supplied context/evidence, never a research task. No web_search,
 * ever (see nfl-grok-analysis-config.ts).
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER splits the single handicap
 * call into two independent provider requests:
 *
 *   Stage A (buildStageAInitialPrompt / runGrokStageAInitial, and the
 *     "*Update" analogues) -- the BLIND football projection. Built from
 *     nfl-ai-context-sanitizer.ts's sanitizeGameContextPacketForBlindStageA()
 *     packet, which has NO `market` key at all, and from evidence already
 *     filtered through filterEvidenceRecordsForBlindStageA() by the caller.
 *     There is no sportsbook spread, total, moneyline, or JKB fair-line
 *     opinion anywhere in this stage's prompt -- physically absent, not
 *     merely instructed against.
 *
 *   Stage B (buildStageBInitialPrompt / runGrokStageBInitial, and the
 *     "*Update" analogues) -- the MARKET decision, given the Stage A output
 *     REVEALED VERBATIM (footballThesis + prediction) as an already-locked
 *     fact. Stage B's prompt explicitly tells the model it cannot revise
 *     that projection, and its output schema has no field for one.
 *
 * Reuses nfl-grok-research-parsing.ts's parseResponsesOutput()/
 * parseUsageTelemetry() unchanged -- both are generic to the `/v1/responses`
 * shape and do not assume a `tools` field was sent.
 *
 * Trust boundary: the raw parsed JSON from EITHER stage is handed to
 * nfl-grok-analysis-validator.ts and NEVER trusted otherwise. This module
 * makes exactly one HTTP request per stage call and never retries with a
 * different prompt because the first result "looks wrong."
 */

import type { EvidenceRecord } from "./nfl-evidence-types";
import type { EvidenceAuthorityView } from "./nfl-evidence-store";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import { sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import { resolveGrokAnalysisConfig, type GrokAnalysisConfig, type GrokAnalysisMode } from "./nfl-grok-analysis-config";
import { MATCHUP_FACTOR_AREAS, type GrokStageAV1 } from "./nfl-grok-analysis-types";
import { parseResponsesOutput, parseUsageTelemetry } from "./nfl-grok-research-parsing";
import { ticksToUsd } from "./nfl-grok-research-config";
import type { SnapshotMarketRecord, SnapshotMarketState } from "./nfl-snapshot-types";

const RESPONSES_API_URL = "https://api.x.ai/v1/responses";

export interface AnalysisGameFacts {
  gameId: string;
  homeTeamFull: string;
  awayTeamFull: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
}

export interface GrokAnalysisTelemetry {
  mode: GrokAnalysisMode;
  model: string;
  reasoningEffort: string;
  httpStatus: number | null;
  latencyMs: number;
  toolsEnabled: false;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
  };
  costInUsdTicks: number | null;
  costUsd: number | null;
}

export type GrokAnalysisRawResult = { ok: true; raw: unknown; telemetry: GrokAnalysisTelemetry } | { ok: false; error: string; telemetry: GrokAnalysisTelemetry | null };

function buildTelemetry(config: GrokAnalysisConfig, httpStatus: number | null, latencyMs: number, usage: ReturnType<typeof parseUsageTelemetry> | null): GrokAnalysisTelemetry {
  return {
    mode: config.mode,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    httpStatus,
    latencyMs,
    toolsEnabled: false,
    usage: {
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
    costInUsdTicks: usage?.costInUsdTicks ?? null,
    costUsd: usage?.costInUsdTicks != null ? ticksToUsd(usage.costInUsdTicks) : null,
  };
}

function formatEvidenceLine(record: EvidenceRecord, authority: EvidenceAuthorityView | undefined): string {
  const authorityStatus = authority?.status ?? "current";
  return (
    `[${record.evidenceId}] (category=${record.category}, sourceType=${record.source.sourceType}, verification=${record.verificationStatus}, ` +
    `freshness=${record.freshness}, citation=${record.source.citationSpecificity}${record.citationNeedsReview ? "(needs review)" : ""}, authority=${authorityStatus}) ` +
    `${record.claim}`
  );
}

/**
 * Only citable evidence is ever shown to the model -- rejected or
 * postgame-unsafe records are filtered out here, not merely flagged, so
 * Grok cannot cite what it never saw (defense in depth alongside the
 * validator's own hard checks). Callers building Stage A's evidence set
 * MUST pre-filter `records` through
 * nfl-ai-context-sanitizer.ts's filterEvidenceRecordsForBlindStageA() first
 * -- this function itself has no opinion on market-pricing content.
 */
export function buildCitableEvidenceLines(records: readonly EvidenceRecord[], authority: readonly EvidenceAuthorityView[]): string[] {
  const authorityById = new Map(authority.map((a) => [a.evidenceId, a] as const));
  return records
    .filter((r) => r.model === "grok" && r.verificationStatus !== "rejected" && r.pregameSafe)
    .map((r) => formatEvidenceLine(r, authorityById.get(r.evidenceId)));
}

const BLIND_CONTEXT_SUMMARY_LINES = (packet: ReturnType<typeof sanitizeGameContextPacketForBlindStageA>): string[] => [
  `identity: ${packet.identity.awayTeamFull} (away) at ${packet.identity.homeTeamFull} (home), season ${packet.identity.season} week ${packet.identity.week}`,
  `jkbModels.powerRating: home=${packet.jkbModels.powerRating.home ?? "?"} away=${packet.jkbModels.powerRating.away ?? "?"}`,
  `teamMetrics.epa (periodWindow=${packet.teamMetrics.periodWindow}): ${JSON.stringify(packet.teamMetrics.epa)}`,
  `teamMetrics.ypp: ${JSON.stringify(packet.teamMetrics.ypp)}`,
  `matchup.trenches: ${JSON.stringify(packet.matchup.trenches)}`,
  `matchup.offenseVsDefense: ${JSON.stringify(packet.matchup.offenseVsDefense)}`,
  `coaching: ${JSON.stringify(packet.coaching)}`,
  `situational: ${JSON.stringify(packet.situational)}`,
  `schedule: kickoff=${packet.schedule.kickoffUtc} venue=${packet.schedule.venue.stadium} isDome=${packet.schedule.venue.isDome}`,
  `weather: ${JSON.stringify(packet.weather)}`,
];

const BLIND_ANTI_HALLUCINATION_RULES = [
  "You are NOT given the sportsbook spread, total, moneyline, opening line, or any line movement -- do not guess, estimate, or assume one. You are also NOT given JKB's own fair-line opinion (no projected spread/total/model-market edge) -- you must form your own from the football data alone.",
  "Use ONLY the supplied JKB football DATA above for any statistic -- never estimate, round, or restate a number you were not given.",
  "Use ONLY the supplied validated evidence for any external fact (injury, personnel, coaching, news, weather) -- do not perform new research.",
  "Do not invent injuries, quotes, market movement, trends, or player status of any kind.",
  "Distinguish FACT (traceable to an evidenceId or jkbContextRef) from INTERPRETATION (your own football judgment) in every finding.",
  "Do not optimize for entertainment value, hot takes, or confident-sounding prose over accuracy.",
];

const BLIND_OUTPUT_DISCIPLINE = [
  "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence) matching the exact schema given below.",
  `matchupFactors[].area MUST be exactly one of these values, and no other: ${MATCHUP_FACTOR_AREAS.map((a) => `"${a}"`).join(", ")}.`,
  "Do NOT use \"trenches\", \"total\", \"side\", \"offense\", or \"defense\" as an area value -- none of those are legal. " +
    "\"trenches\" is not a real category here -- split trench-play findings into \"protection\", \"pass_rush\", or \"run_defense\" as appropriate. " +
    "The total/side bet-type recommendation is a Stage 2 concept -- it does not exist in this stage at all.",
  "Every matchupFactors[].evidenceIds entry must be an evidenceId from the citable evidence list above -- never invent an id.",
  "Every matchupFactors[].jkbContextRefs entry must be a dot-path into the context sections listed above (e.g. \"jkbModels.powerRating\", \"teamMetrics.epa\") -- there is no \"market\" section to reference; it was never supplied to you.",
];

/**
 * WU4.6.4 -- explicit listing of the two legal team-code values for THIS
 * game's prediction.fairSpread.team (and Stage B's optional side.team),
 * rendered in the natural NFL abbreviation casing a provider will naturally
 * answer with (e.g. "KC", "DEN"). The internal canonical game identity
 * (`game.homeTeam`/`game.awayTeam`) is lowercase -- the validator mechanically
 * case-folds the provider's answer against it (nfl-grok-analysis-validator.ts)
 * rather than requiring the model to guess the internal casing.
 */
export function buildValidTeamCodesLines(game: AnalysisGameFacts): string[] {
  return [
    "=== VALID TEAM CODES FOR THIS GAME ===",
    `- ${game.awayTeam.toUpperCase()}`,
    `- ${game.homeTeam.toUpperCase()}`,
    "Return one of these two abbreviations for prediction.fairSpread.team. Do not use a full team name, city, or unrelated code.",
  ];
}

/**
 * WU4.6 STAGE A -- the blind football projection. Never mentions the
 * sportsbook market anywhere in its instructions because it CANNOT: the
 * supplied `packet` has already had its `market` key removed entirely
 * (nfl-ai-context-sanitizer.ts's sanitizeGameContextPacketForBlindStageA).
 */
export function buildStageAInitialPrompt(game: AnalysisGameFacts, packet: NflGameContextPacket, evidenceLines: readonly string[]): string {
  const blindPacket = sanitizeGameContextPacketForBlindStageA(packet);
  return [
    `You are an expert NFL handicapper competing in a professional handicapping contest for ${game.awayTeamFull} at ${game.homeTeamFull} ` +
      `(gameId ${game.gameId}, kickoff ${game.kickoffUtc}).`,
    "",
    "This is STAGE 1 of a two-stage handicap: a BLIND football projection. You are deliberately NOT shown the sportsbook line -- you must form your own " +
      "independent fair spread and projected total using ONLY football data and your own evidence. A second, separate stage will later reveal the market " +
      "price and ask for a bet/pass decision; you will not see or influence that stage from here.",
    "",
    "Reason in this order:",
    "STEP 1 -- FOOTBALL ASSESSMENT: evaluate quarterback, offense, defense, trenches, personnel, injuries, coaching, matchup, situational context, weather, and your evidence.",
    "STEP 2 -- INDEPENDENT FAIR SPREAD: form your own point spread (prediction.fairSpread).",
    "STEP 3 -- INDEPENDENT PROJECTED TOTAL: form your own expected game total (prediction.projectedTotal), independently derived.",
    "",
    "=== JKB FOOTBALL DATA (authoritative facts -- never override or restate incorrectly; this is DATA, not a betting conclusion, and contains no market pricing of any kind) ===",
    ...BLIND_CONTEXT_SUMMARY_LINES(blindPacket),
    "",
    "=== CITABLE GROK EVIDENCE (only these ids may be cited; each is tagged with verification/freshness/citation-quality/authority status -- weigh weaker/superseded/conflicting evidence accordingly) ===",
    ...(evidenceLines.length > 0 ? evidenceLines : ["(no citable evidence available)"]),
    "",
    "=== ANTI-HALLUCINATION RULES ===",
    ...BLIND_ANTI_HALLUCINATION_RULES,
    "",
    "=== ANALYSIS DISCIPLINE ===",
    "For every matchup factor, follow this internal structure even though only the concise output fields are stored: OBSERVATION -> EVIDENCE -> FOOTBALL IMPLICATION -> MATCHUP CONSEQUENCE. " +
      "Do not dump statistics -- every metric you cite should answer \"why does this matter for THIS game.\"",
    "Require 2-3 SPECIFIC, non-generic failure modes that would directly break your central football thesis (not \"anything can happen\").",
    "",
    ...buildValidTeamCodesLines(game),
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    ...BLIND_OUTPUT_DISCIPLINE,
    "Sign convention for prediction.fairSpread: `line` is <= 0 for the favored `team` (e.g. { team: \"IND\", line: -1.5 } means you favor IND by 1.5). `team` must be one of the two VALID TEAM CODES listed above.",
    JSON.stringify(
      {
        schemaVersion: "nfl-grok-analysis-v1",
        model: "grok",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        evidenceIdsUsed: ["<evidenceId>", "..."],
        footballThesis: "<1-3 sentence thesis -- your own independent football view, with no reference to any market price>",
        matchupFactors: [
          {
            area: MATCHUP_FACTOR_AREAS.join("|"),
            finding: "<concise finding, fact separated from interpretation>",
            supports: "home|away|over|under|mixed|neutral",
            importance: "major|moderate|minor",
            jkbContextRefs: ["<dot-path>"],
            evidenceIds: ["<evidenceId>"],
          },
        ],
        prediction: {
          fairSpread: { team: "<home or away team abbr>", line: -1.5 },
          projectedTotal: 46.5,
        },
        failureModes: [{ scenario: "<specific scenario>", whyItMatters: "<why this breaks the thesis>" }],
        evidenceQualityAssessment: { strengths: ["<...>"], limitations: ["<...>"] },
      },
      null,
      2
    ),
  ].join("\n");
}

/**
 * WU7.5 -- shared, provider-neutral Stage B market-line formatting (grok and
 * chatgpt's Stage B prompts both import this rather than each hand-rolling
 * their own copy of the same string). Root cause of the WU7.4 CAR_ATL
 * incident: the old format printed a single bare number labeled only
 * `spread(home)=X`, with the away line never shown at all and no team
 * abbreviation next to either number. ChatGPT inverted home/away in its
 * response -- the strict validator correctly rejected it, but the prompt
 * itself gave the model nothing to anchor "home" and "away" to other than
 * inference. This format explicitly labels every line with its team
 * abbreviation and states both directions, so there is no longer a bare
 * number for the model to misattribute.
 */
export function formatCurrentMarketLine(game: AnalysisGameFacts, currentMarketState: SnapshotMarketState): string {
  return (
    `sportsbook=${currentMarketState.sportsbook ?? "unavailable"} total=${currentMarketState.total.line ?? "?"} asOf=${currentMarketState.asOf ?? "unknown"} -- ` +
    `spread: HOME(${game.homeTeam})=${currentMarketState.spread.homeLine ?? "?"}, AWAY(${game.awayTeam})=${currentMarketState.spread.awayLine ?? "?"}`
  );
}

/** WU7.5 -- same team-labeled treatment as formatCurrentMarketLine, for the update-mode market delta (previous vs current). */
export function formatMarketDeltaLines(game: AnalysisGameFacts, marketRecord: SnapshotMarketRecord): string[] {
  return [
    `previous: spread: HOME(${game.homeTeam})=${marketRecord.previousSpread?.homeLine ?? "?"}, AWAY(${game.awayTeam})=${marketRecord.previousSpread?.awayLine ?? "?"} total=${marketRecord.previousTotal ?? "?"}`,
    `current: spread: HOME(${game.homeTeam})=${marketRecord.spread.homeLine ?? "?"}, AWAY(${game.awayTeam})=${marketRecord.spread.awayLine ?? "?"} total=${marketRecord.total.line ?? "?"} asOf=${marketRecord.asOf ?? "unknown"}`,
    `spreadDelta=${marketRecord.spreadDelta ?? "n/a"} totalDelta=${marketRecord.totalDelta ?? "n/a"}`,
  ];
}

/**
 * WU4.6 STAGE B -- the market decision. `lockedStageA` is the ALREADY
 * VALIDATED Stage A output, revealed here verbatim as a locked fact --
 * the prompt explicitly forbids revising it, and the output schema has no
 * field for a replacement prediction.
 */
/**
 * WU7.9 -- shared long-form editorial-article instructions for Stage B
 * initial, reused verbatim by both this adapter and
 * nfl-chatgpt-analysis-adapter.ts (imported from here) so both providers are
 * held to the identical editorial standard -- same rule as every other
 * Stage A/B prompt rule in this file. Written during this SAME Stage B call
 * (no new paid provider call); the schema below has no field anywhere for a
 * fair spread/projected total, so nothing here can override Stage 1.
 */
export const EDITORIAL_ARTICLE_INSTRUCTIONS: readonly string[] = [
  "STEP 6 -- LONG-FORM ARTICLE: write `editorialArticle`, a genuine long-form NFL handicap article (roughly 1200-2000 words when the evidence supports it -- do not pad a thin game to hit a word count; a section with insufficient evidence should be `null`, never invented prose). Write like a professional analyst at a sports analytics outlet, not a database dump or a FACT/INTERPRETATION list: synthesize the evidence into a football argument, connect causes to consequences (a pressure advantage means more obvious passing downs, which means lower QB efficiency, which means a lower scoring ceiling -- reason like that, in your own words), and describe a realistic game script for both teams and both sides of the ball.",
  "Round statistics for a reader (\"41%\", \"5.6 yards per play\") instead of raw decimals, and never expose an internal field name, snake_case or camelCase token, a 'FACT:'/'INTERPRETATION:' label, or any other implementation/schema/pipeline language anywhere in the article -- write only in plain football English, as if for a human reader who has never seen your underlying data.",
  "sideAnalysis/totalAnalysis must explain WHY your locked fair spread/total differ from the market, tying that number back to the football argument developed earlier in the article -- never a bare 'my fair line is X versus Y' statement with no reasoning attached.",
  "swingFactors must be legitimate ways your own view could be wrong (e.g. an uncertain quarterback, an offensive-line absence, turnover variance, weather) -- never a generic disclaimer.",
  "Write in your own voice. Do not mirror a template mechanically -- choose which facts matter most, and do not lean on filler phrasing like 'this matchup will come down to', 'it is important to note', 'ultimately', or symmetrical paragraph patterns.",
];

/** Placeholder JSON shape shown to the provider for `editorialArticle` -- mirrors src/lib/nfl/aiHandicapPresentation.ts's AiHandicapEditorialArticle exactly (minus `isLegacyPreview`, which the engine always sets to `false` for a freshly-authored article and which the provider never reports). */
export function editorialArticleSchemaExample(game: AnalysisGameFacts): Record<string, unknown> {
  return {
    headline: "<article headline>",
    dek: "<1-2 sentence subheadline stating the central matchup tension>",
    openingRead: ["<paragraph>", "<paragraph>", "<paragraph>"],
    awayOffenseVsHomeDefense: { heading: `When ${game.awayTeam.toUpperCase()} Has the Ball`, paragraphs: ["<paragraph>"] },
    homeOffenseVsAwayDefense: { heading: `When ${game.homeTeam.toUpperCase()} Has the Ball`, paragraphs: ["<paragraph>"] },
    trenchesAndGameControl: ["<paragraph, or null if not enough evidence>"],
    personnelAndAvailability: ["<paragraph, or null if not enough evidence>"],
    gameScript: ["<paragraph, or null if not enough evidence>"],
    matchupKeys: [{ title: "<short analytical callout title>", analysis: "<1-3 sentences>", supportingStats: ["<optional stat in prose form, e.g. '41% pressure rate'>"] }],
    swingFactors: [{ title: "<short title>", analysis: "<1-3 sentences>" }],
    sideAnalysis: ["<paragraph, or null if passing>"],
    totalAnalysis: ["<paragraph, or null if passing>"],
    finalWord: ["<1-2 closing paragraphs>"],
  };
}

export function buildStageBInitialPrompt(game: AnalysisGameFacts, lockedStageA: GrokStageAV1, currentMarketState: SnapshotMarketState): string {
  return [
    `This is STAGE 2 of a two-stage handicap for ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}). ` +
      "STAGE 1 already produced your LOCKED, independent, blind football projection below -- you formed it with zero knowledge of the sportsbook price. " +
      "You may NOT revise, restate differently, or second-guess that projection here. Your only job now is to compare it to the market, decide whether there is a bet, and write it up.",
    "",
    "=== YOUR LOCKED STAGE 1 PROJECTION (immutable -- do not alter) ===",
    `footballThesis: ${lockedStageA.footballThesis}`,
    `fairSpread: ${JSON.stringify(lockedStageA.prediction.fairSpread)}`,
    `projectedTotal: ${lockedStageA.prediction.projectedTotal}`,
    "",
    "=== CURRENT DETERMINISTIC MARKET STATE (do not search for these numbers; this is the FIRST time you are seeing a market price for this game) ===",
    formatCurrentMarketLine(game, currentMarketState),
    `HOME team is ${game.homeTeam} (${game.homeTeamFull}). AWAY team is ${game.awayTeam} (${game.awayTeamFull}). These are the exact, authoritative lines -- you do not restate or echo them anywhere in your output below; the engine attaches them mechanically. Never invert HOME/AWAY, never flip a sign, and never convert a favorite-centric line into a team-centric one.`,
    "",
    "=== YOUR TASK ===",
    "STEP 4 -- MARKET COMPARISON: compare your locked fair spread/total to the current market price.",
    "STEP 5 -- BETTING DECISION: choose side (home/away/pass) and total (over/under/pass) independently. PASS is fully valid and expected when there is no edge -- do not force a play.",
    "Do not assume the sportsbook line is correct, and do not try to force disagreement with it either -- follow your locked projection and the market numbers where they lead.",
    "Confidence (1-10) reflects evidence quality + matchup clarity + market value + uncertainty -- a strong football advantage does NOT automatically mean high betting confidence.",
    "Never write 'sharp money', 'smart money', or 'professional action' unless you have independent evidence supporting that claim.",
    ...EDITORIAL_ARTICLE_INSTRUCTIONS,
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence). Do NOT include a `prediction`, `fairSpread`, or `projectedTotal` field -- those are already locked from Stage 1 and are not yours to resubmit here.",
    "Do NOT include `side.lineAtOpinion`, `total.totalAtOpinion`, or `marketAssessment.currentHomeLine`/`currentAwayLine`/`currentTotal` -- the engine attaches the authoritative market values to your decision mechanically after validation, so there is nothing for you to copy or compute here. Leave marketAssessment.sideEdgePoints/totalEdgePoints as 0 -- the engine computes those mechanically from your locked Stage 1 prediction.",
    JSON.stringify(
      {
        schemaVersion: "nfl-grok-analysis-v1",
        model: "grok",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        side: { lean: "home|away|pass|undecided", team: "<team abbr or omit>", confidence: 5, rationale: "<concise>" },
        total: { lean: "over|under|pass|undecided", confidence: 5, rationale: "<concise>" },
        marketAssessment: {
          sideEdgePoints: 0,
          totalEdgePoints: 0,
          interpretation: "<concise interpretation of your locked fair line vs the market>",
        },
        editorialArticle: editorialArticleSchemaExample(game),
      },
      null,
      2
    ),
  ].join("\n");
}

export interface PreviousBlindState {
  thesis: string | null;
  fairSpread: GrokStageAV1["prediction"]["fairSpread"] | null;
  projectedTotal: number | null;
}

/** WU4.6 STAGE A UPDATE -- re-runs (or reaffirms) the blind football projection given new evidence. Still no market field anywhere in its input. */
export function buildStageAUpdatePrompt(game: AnalysisGameFacts, packet: NflGameContextPacket, previous: PreviousBlindState, newEvidenceLines: readonly string[]): string {
  const blindPacket = sanitizeGameContextPacketForBlindStageA(packet);
  return [
    `This is STAGE 1 of a two-stage DELTA UPDATE for ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}). ` +
      "You are, as always, blind to the sportsbook market in this stage. Do NOT regenerate your football view from scratch -- evaluate what changed and whether it moves your projection.",
    "",
    "=== YOUR PRIOR BLIND PROJECTION (preserve unless the new evidence below genuinely changes it) ===",
    `previous football thesis: ${previous.thesis ?? "(none)"}`,
    `previous fair spread: ${previous.fairSpread ? JSON.stringify(previous.fairSpread) : "(none)"}`,
    `previous projected total: ${previous.projectedTotal ?? "(none)"}`,
    "",
    "=== NEW/CHANGED CITABLE GROK EVIDENCE SINCE YOUR PRIOR PROJECTION (only these ids may be cited as developments; any market-pricing evidence has already been excluded from this list) ===",
    ...(newEvidenceLines.length > 0 ? newEvidenceLines : ["(no new material evidence -- this is a valid, expected outcome; developments may be an empty array)"]),
    "",
    "=== JKB FOOTBALL DATA (current, authoritative facts -- this is DATA, not a betting conclusion, and contains no market pricing) ===",
    ...BLIND_CONTEXT_SUMMARY_LINES(blindPacket),
    "",
    "=== ANTI-HALLUCINATION RULES ===",
    ...BLIND_ANTI_HALLUCINATION_RULES,
    "",
    "=== RULES FOR THIS UPDATE ===",
    "Only report a development for a GENUINELY new or changed football fact -- do not restate unchanged prior evidence as if newly discovered.",
    "'No material change' is a fully valid result: developments may be [], and your fair spread/projected total may be identical to your prior state.",
    "Preserve your prior football thesis verbatim in currentFootballThesis unless the new evidence genuinely changes your view -- do not paraphrase-drift.",
    "Re-affirm or revise your independent prediction.fairSpread/prediction.projectedTotal based ONLY on football evidence -- you still have no market information.",
    "",
    ...buildValidTeamCodesLines(game),
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence):",
    "Sign convention for prediction.fairSpread: `line` is <= 0 for the favored `team`. `team` must be one of the two VALID TEAM CODES listed above.",
    JSON.stringify(
      {
        schemaVersion: "nfl-grok-analysis-v1",
        model: "grok",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        evidenceIdsUsed: ["<evidenceId>"],
        developments: [{ developmentId: "<short id>", evidenceIds: ["<evidenceId>"], summary: "<...>", significance: "major|moderate|minor|neutral", direction: "home_positive|away_positive|over_positive|under_positive|mixed|neutral", affectedAreas: ["<area>"], footballImpact: "<...>", marketRelevance: "<...>" }],
        currentFootballThesis: "<your current football thesis, unchanged unless justified>",
        thesisChangeExplanation: "<explain what changed, or state 'unchanged' if it did not>",
        prediction: {
          fairSpread: { team: "<home or away team abbr>", line: -1.5 },
          projectedTotal: 46.5,
        },
      },
      null,
      2
    ),
  ].join("\n");
}

/** WU4.6 STAGE B UPDATE -- the current bet/pass decision against the (possibly moved) market, given the LOCKED Stage A update prediction. */
export function buildStageBUpdatePrompt(game: AnalysisGameFacts, lockedFairSpread: GrokStageAV1["prediction"]["fairSpread"], lockedProjectedTotal: number, marketRecord: SnapshotMarketRecord): string {
  return [
    `This is STAGE 2 of a two-stage DELTA UPDATE for ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}). ` +
      "STAGE 1 already produced your LOCKED, blind football projection for this update below. You may NOT revise it here -- your only job is to compare it to the current market and decide whether there is a bet.",
    "",
    "=== YOUR LOCKED STAGE 1 PROJECTION FOR THIS UPDATE (immutable -- do not alter) ===",
    `fairSpread: ${JSON.stringify(lockedFairSpread)}`,
    `projectedTotal: ${lockedProjectedTotal}`,
    "",
    "=== DETERMINISTIC MARKET DELTA (do not search for these numbers) ===",
    ...formatMarketDeltaLines(game, marketRecord),
    `HOME team is ${game.homeTeam} (${game.homeTeamFull}). AWAY team is ${game.awayTeam} (${game.awayTeamFull}). These are the exact, authoritative lines -- you do not restate or echo them anywhere in your output below; the engine attaches them mechanically. Never invert HOME/AWAY, never flip a sign, and never convert a favorite-centric line into a team-centric one.`,
    "If the market moved, do not assume or claim a reason (e.g. \"sharp money\") unless you have independent evidence for it.",
    "",
    "=== YOUR TASK ===",
    "Compare your locked fair spread/total to the current market and choose side (home/away/pass) and total (over/under/pass) independently. 'No material change' is fully valid -- your lean/confidence may be identical to your prior decision.",
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence). Do NOT include a `prediction`, `fairSpread`, or `projectedTotal` field -- those are already locked from Stage 1.",
    "Do NOT include `side.lineAtOpinion`, `total.totalAtOpinion`, or `marketAssessment.currentHomeLine`/`currentAwayLine`/`currentTotal` -- the engine attaches the authoritative market values to your decision mechanically after validation.",
    JSON.stringify(
      {
        schemaVersion: "nfl-grok-analysis-v1",
        model: "grok",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        side: { lean: "home|away|pass|undecided", team: "<team abbr or omit>", confidence: 5, rationale: "<concise>" },
        total: { lean: "over|under|pass|undecided", confidence: 5, rationale: "<concise>" },
        marketAssessment: {
          sideEdgePoints: 0,
          totalEdgePoints: 0,
          interpretation: "<concise interpretation of your locked fair line vs the current market>",
        },
        conciseCommentary: "<1-2 sentence summary of this update>",
      },
      null,
      2
    ),
  ].join("\n");
}

async function callGrokAnalysis(prompt: string, config: GrokAnalysisConfig, apiKey: string, fetchImpl: typeof fetch): Promise<GrokAnalysisRawResult> {
  const body = {
    model: config.model,
    input: [{ role: "user", content: prompt }],
    reasoning_effort: config.reasoningEffort,
    max_output_tokens: config.maxOutputTokens,
    // Deliberately NO `tools` field -- this is a reasoning task, never a research task.
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  const started = Date.now();
  let httpStatus: number | null = null;
  let responseText: string;
  try {
    const response = await fetchImpl(RESPONSES_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    httpStatus = response.status;
    responseText = await response.text();
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} from xAI /v1/responses: ${responseText.slice(0, 500)}`, telemetry: buildTelemetry(config, httpStatus, Date.now() - started, null) };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Request to xAI /v1/responses failed: ${message}`, telemetry: buildTelemetry(config, httpStatus, Date.now() - started, null) };
  } finally {
    clearTimeout(timeoutHandle);
  }

  const latencyMs = Date.now() - started;
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    return { ok: false, error: "xAI /v1/responses returned non-JSON body.", telemetry: buildTelemetry(config, httpStatus, latencyMs, null) };
  }

  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const parsedOutput = parseResponsesOutput(record.output);
  const usage = parseUsageTelemetry(record.usage);
  const telemetry = buildTelemetry(config, httpStatus, latencyMs, usage);

  if (!parsedOutput.messageText) {
    return { ok: false, error: "No final message text found in xAI /v1/responses output.", telemetry };
  }

  let raw: unknown;
  try {
    const cleaned = parsedOutput.messageText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    raw = JSON.parse(cleaned);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to parse analysis JSON: ${message}`, telemetry };
  }

  return { ok: true, raw, telemetry };
}

export interface RunGrokStageAInitialInput {
  game: AnalysisGameFacts;
  packet: NflGameContextPacket;
  evidenceLines: readonly string[];
  apiKey: string;
  configOverrides?: Partial<Omit<GrokAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

/** WU4.6 -- makes the Stage A request. Deliberately takes NO `currentMarketState` parameter at all -- there is no way to accidentally pass market pricing into this call. */
export async function runGrokStageAInitial(input: RunGrokStageAInitialInput): Promise<GrokAnalysisRawResult> {
  const config = resolveGrokAnalysisConfig("stageAInitial", input.configOverrides);
  const prompt = buildStageAInitialPrompt(input.game, input.packet, input.evidenceLines);
  return callGrokAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}

export interface RunGrokStageBInitialInput {
  game: AnalysisGameFacts;
  lockedStageA: GrokStageAV1;
  currentMarketState: SnapshotMarketState;
  apiKey: string;
  configOverrides?: Partial<Omit<GrokAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

export async function runGrokStageBInitial(input: RunGrokStageBInitialInput): Promise<GrokAnalysisRawResult> {
  const config = resolveGrokAnalysisConfig("stageBInitial", input.configOverrides);
  const prompt = buildStageBInitialPrompt(input.game, input.lockedStageA, input.currentMarketState);
  return callGrokAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}

export interface RunGrokStageAUpdateInput {
  game: AnalysisGameFacts;
  packet: NflGameContextPacket;
  previous: PreviousBlindState;
  newEvidenceLines: readonly string[];
  apiKey: string;
  configOverrides?: Partial<Omit<GrokAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

export async function runGrokStageAUpdate(input: RunGrokStageAUpdateInput): Promise<GrokAnalysisRawResult> {
  const config = resolveGrokAnalysisConfig("stageAUpdate", input.configOverrides);
  const prompt = buildStageAUpdatePrompt(input.game, input.packet, input.previous, input.newEvidenceLines);
  return callGrokAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}

export interface RunGrokStageBUpdateInput {
  game: AnalysisGameFacts;
  lockedFairSpread: GrokStageAV1["prediction"]["fairSpread"];
  lockedProjectedTotal: number;
  marketRecord: SnapshotMarketRecord;
  apiKey: string;
  configOverrides?: Partial<Omit<GrokAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

export async function runGrokStageBUpdate(input: RunGrokStageBUpdateInput): Promise<GrokAnalysisRawResult> {
  const config = resolveGrokAnalysisConfig("stageBUpdate", input.configOverrides);
  const prompt = buildStageBUpdatePrompt(input.game, input.lockedFairSpread, input.lockedProjectedTotal, input.marketRecord);
  return callGrokAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}
