/**
 * AI Picks v2 WU3 -- validators for the v2 Stage A and Stage B outputs.
 *
 * What validation is FOR: rejecting malformed, unsupported, or internally
 * contradictory output (an inverted side, probabilities that do not add up,
 * a write-up that names a different line than the structured fields, a
 * claimed injury with no cited evidence). What it is NOT for: choosing the
 * side, the probability or the verdict. Every betting judgment in the accepted
 * record is the model's own; the only formula in this file is a NORMAL-MODEL
 * REFERENCE probability that produces a warning, never a replacement.
 *
 * Shared, provider-neutral: Grok and ChatGPT outputs go through the identical
 * functions, differing only in the `model` namespace evidence is checked in.
 */
import { sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import { isBettingOpinionEvidence, isMarketPricingEvidence } from "./nfl-ai-context-sanitizer";
import type { EvidenceModel, EvidenceRecord } from "./nfl-evidence-types";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import {
  buildModelEvidenceIndex,
  isRecord,
  normalizeProviderTeamCode,
  validateEvidenceIdCitations,
  validateJkbContextRefs,
  validateProseStrings,
} from "./nfl-grok-analysis-validator";
import { formatSignedLine, teamNickname, type HandicapV2MarketContext } from "./nfl-handicap-v2-market";
import type { HandicapV2GameFacts } from "./nfl-handicap-v2-prompts";
import {
  ANALYTICAL_PARAGRAPHS_MAX,
  ANALYTICAL_PARAGRAPHS_MIN,
  WORD_HARD_MAX,
  WORD_HARD_MIN,
  WORD_TARGET_MAX,
  WORD_TARGET_MIN,
  countWords,
  deriveFairScore,
  findFormatViolations,
  findSpecificityViolations,
  mentionsAny,
  mentionsSignedLine,
  nameVariants,
  overlapRatio,
  parseAnalysisMarkdown,
} from "./nfl-handicap-v2-text";
import {
  CONFIDENCE_LEVELS,
  HANDICAP_V2_SCHEMA_VERSION,
  KEY_DRIVERS_MAX,
  KEY_DRIVERS_MIN,
  UNCERTAINTY_LEVELS,
  VERDICTS,
  type Confidence,
  type KeyDriver,
  type StageAV2,
  type StageBV2,
  type Uncertainty,
  type Verdict,
} from "./nfl-handicap-v2-types";

/* -------------------------------------------------------------------------- */
/* Tunables                                                                   */
/* -------------------------------------------------------------------------- */

const MAX_ABS_FAIR_SPREAD = 28;
const MIN_TOTAL = 25;
const MAX_TOTAL = 75;

const DRIVER_WORDS = { min: 8, max: 70 } as const;
const MAIN_RISK_WORDS = { min: 12, max: 80 } as const;
const COUNTERARGUMENT_WORDS = { min: 12, max: 70 } as const;
const KEY_NUMBER_WORDS = { min: 8, max: 90 } as const;
const CLOSING_MIN_WORDS = 6;
const MAX_CLOSING_PARAGRAPHS = 2;

/** Cover probabilities outside this percent range are not credible for an NFL spread. */
const PROBABILITY_MIN = 5;
const PROBABILITY_MAX = 95;
/** Largest plausible implied push mass on a whole-number line. */
const MAX_IMPLIED_PUSH = 15;
/** Slack for a half-point line's two probabilities summing to 100. */
const HALF_POINT_SUM_TOLERANCE = 1;
const FINAL_READ_PERCENT_TOLERANCE = 1;
const TOTAL_LINE_TOLERANCE = 0.75;

/** Contradiction thresholds (rejections). */
const PASS_MAX_COVER_PROBABILITY = 70;
const OPPOSES_LOCKED_FAIR_SPREAD_POINTS = 2;
const OPPOSING_MIN_COVER_PROBABILITY = 55;
/** Warning thresholds. */
const PASS_HIGH_COVER_WARNING = 62;
const BET_OPPOSES_FAIR_SPREAD_WARNING_POINTS = 1;
/** Std-dev of an NFL game margin used ONLY for the warning-level reference probability. */
const REFERENCE_MARGIN_SIGMA = 13.5;
const REFERENCE_PROBABILITY_WARNING_GAP = 12;
const OVERLAP_MIN = 0.25;
/** Numeric TOKENS (not facts): "0-2" is two, "-0.30" is one. The target write-up itself carries roughly twenty. */
const MAX_NUMERALS_WARNING = 26;

const INJURY_LANGUAGE = /\b(questionable|doubtful|injur\w*|ruled out|listed out|(?:is|are|was|been) out|out (?:for|with|this)|inactive|limited in|limited participant|full participant|practice|sidelined|game-time decision|hamstring|ankle|knee|concussion|groin|forearm)\b/i;
const PASS_LANGUAGE = /\b(pass|no play|stay away|sit (?:this|it) out|no bet|not a play|wouldn't bet|would not bet|keep my money)\b/i;

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
}

function checkEnvelope(raw: Record<string, unknown>, ctx: { model: EvidenceModel; gameId: string }): string[] {
  const reasons: string[] = [];
  if (raw.schemaVersion !== HANDICAP_V2_SCHEMA_VERSION) reasons.push(`schemaVersion must be "${HANDICAP_V2_SCHEMA_VERSION}"`);
  if (raw.model !== ctx.model) reasons.push(`model must be "${ctx.model}"`);
  if (raw.gameId !== ctx.gameId) reasons.push(`gameId must be "${ctx.gameId}"`);
  return reasons;
}

function checkRefs(
  label: string,
  factRefs: readonly string[],
  evidenceRefs: readonly string[],
  ctx: { model: EvidenceModel; contextPacket: NflGameContextPacket; allEvidenceRecords: readonly EvidenceRecord[] },
  evidenceRules: { rejectMarketPricing: boolean }
): string[] {
  const reasons: string[] = [];
  const blind = sanitizeGameContextPacketForBlindStageA(ctx.contextPacket);
  reasons.push(...validateJkbContextRefs(factRefs, blind, label));
  const byId = buildModelEvidenceIndex(ctx.allEvidenceRecords, ctx.model);
  reasons.push(...validateEvidenceIdCitations(evidenceRefs, ctx.allEvidenceRecords, byId, ctx.model, `${label} evidenceRefs`));
  for (const id of evidenceRefs) {
    const record = byId.get(id);
    if (!record) continue;
    if (isBettingOpinionEvidence(record)) reasons.push(`${label} cites evidence ${id}, which is an outside betting opinion -- external evidence may support facts, never the pick`);
    if (evidenceRules.rejectMarketPricing && isMarketPricingEvidence(record)) reasons.push(`${label} cites evidence ${id}, which is market-pricing commentary -- not allowed in the market-blind stage`);
  }
  return reasons;
}

/* -------------------------------------------------------------------------- */
/* Stage A                                                                    */
/* -------------------------------------------------------------------------- */

export interface StageAV2ValidationContext {
  model: EvidenceModel;
  gameId: string;
  /** Trusted orchestration timestamp; never read from the provider. */
  generatedAt: string;
  contextHash: string;
  homeTeam: string;
  awayTeam: string;
  contextPacket: NflGameContextPacket;
  allEvidenceRecords: readonly EvidenceRecord[];
}

export type StageAV2ValidateResult = { ok: true; analysis: StageAV2 } | { ok: false; reasons: string[] };

function validateKeyDrivers(value: unknown, ctx: StageAV2ValidationContext): { reasons: string[]; drivers: KeyDriver[] } {
  const reasons: string[] = [];
  if (!Array.isArray(value)) return { reasons: ["keyDrivers must be an array"], drivers: [] };
  if (value.length < KEY_DRIVERS_MIN || value.length > KEY_DRIVERS_MAX) {
    reasons.push(`keyDrivers must contain ${KEY_DRIVERS_MIN}-${KEY_DRIVERS_MAX} items (got ${value.length}) -- choose only what is material to the projection`);
  }
  const drivers: KeyDriver[] = [];
  value.forEach((item, index) => {
    const label = `keyDrivers[${index}]`;
    if (!isRecord(item)) {
      reasons.push(`${label} must be an object`);
      return;
    }
    const factRefs = stringArray(item.factRefs ?? []);
    const evidenceRefs = stringArray(item.evidenceRefs ?? []);
    if (typeof item.summary !== "string" || item.summary.trim().length === 0) {
      reasons.push(`${label}.summary must be a non-empty string`);
      return;
    }
    if (!factRefs) reasons.push(`${label}.factRefs must be an array of strings`);
    if (!evidenceRefs) reasons.push(`${label}.evidenceRefs must be an array of strings`);
    const words = countWords(item.summary);
    if (words < DRIVER_WORDS.min || words > DRIVER_WORDS.max) reasons.push(`${label}.summary must be ${DRIVER_WORDS.min}-${DRIVER_WORDS.max} words (got ${words})`);
    reasons.push(...validateProseStrings([item.summary], `${label}.summary`));
    if (factRefs && evidenceRefs) {
      if (factRefs.length + evidenceRefs.length === 0) reasons.push(`${label} must cite at least one factRef or evidenceRef -- every driver has to be tied to the supplied data or evidence`);
      reasons.push(...checkRefs(label, factRefs, evidenceRefs, ctx, { rejectMarketPricing: true }));
      drivers.push({ summary: item.summary.trim(), factRefs: [...factRefs], evidenceRefs: [...evidenceRefs] });
    }
  });
  return { reasons, drivers };
}

export function validateStageAV2(raw: unknown, ctx: StageAV2ValidationContext): StageAV2ValidateResult {
  if (!isRecord(raw)) return { ok: false, reasons: ["Stage A payload is not an object"] };
  const reasons = checkEnvelope(raw, ctx);

  // fairSpread
  let fairTeam: string | null = null;
  let fairLine: number | null = null;
  if (!isRecord(raw.fairSpread)) {
    reasons.push("fairSpread must be an object");
  } else {
    const team = normalizeProviderTeamCode(raw.fairSpread.team, ctx.homeTeam, ctx.awayTeam);
    if (team !== ctx.homeTeam && team !== ctx.awayTeam) reasons.push(`fairSpread.team "${String(raw.fairSpread.team)}" must be one of the game's teams ("${ctx.homeTeam}"/"${ctx.awayTeam}")`);
    else fairTeam = team as string;
    const line = raw.fairSpread.line;
    if (!isFiniteNumber(line)) reasons.push("fairSpread.line must be a finite number");
    else if (line > 0) reasons.push(`fairSpread.line (${line}) must be <= 0 -- the favored team's line is never positive`);
    else if (Math.abs(line) > MAX_ABS_FAIR_SPREAD) reasons.push(`fairSpread.line (${line}) is outside a credible NFL range`);
    else fairLine = line;
  }
  if (!isFiniteNumber(raw.projectedTotal) || raw.projectedTotal < MIN_TOTAL || raw.projectedTotal > MAX_TOTAL) {
    reasons.push(`projectedTotal must be a finite number between ${MIN_TOTAL} and ${MAX_TOTAL}`);
  }

  const { reasons: driverReasons, drivers } = validateKeyDrivers(raw.keyDrivers, ctx);
  reasons.push(...driverReasons);

  reasons.push(...findSpecificityViolations(raw.mainRisk, { label: "mainRisk", minWords: MAIN_RISK_WORDS.min, maxWords: MAIN_RISK_WORDS.max }));
  if (typeof raw.mainRisk === "string") reasons.push(...validateProseStrings([raw.mainRisk], "mainRisk"));
  if (typeof raw.mainRisk === "string" && drivers.some((d) => overlapRatio(raw.mainRisk as string, d.summary) > 0.9 && overlapRatio(d.summary, raw.mainRisk as string) > 0.9)) {
    reasons.push("mainRisk duplicates a keyDriver -- it must be a distinct way the projection could fail");
  }

  if (!UNCERTAINTY_LEVELS.includes(raw.uncertainty as Uncertainty)) reasons.push(`uncertainty must be one of ${UNCERTAINTY_LEVELS.join(", ")}`);

  if (reasons.length > 0 || fairTeam === null || fairLine === null) return { ok: false, reasons };

  const fairSpread = { team: fairTeam, line: fairLine };
  const projectedTotal = raw.projectedTotal as number;
  return {
    ok: true,
    analysis: {
      schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
      model: ctx.model,
      gameId: ctx.gameId,
      contextHash: ctx.contextHash,
      generatedAt: ctx.generatedAt,
      fairSpread,
      projectedTotal,
      fairScore: deriveFairScore(fairSpread, projectedTotal, ctx.homeTeam),
      keyDrivers: drivers,
      mainRisk: (raw.mainRisk as string).trim(),
      uncertainty: raw.uncertainty as Uncertainty,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Stage B                                                                    */
/* -------------------------------------------------------------------------- */

export interface StageBV2ValidationContext {
  model: EvidenceModel;
  gameId: string;
  generatedAt: string;
  contextHash: string;
  game: HandicapV2GameFacts;
  lockedStageA: StageAV2;
  market: HandicapV2MarketContext;
  contextPacket: NflGameContextPacket;
  allEvidenceRecords: readonly EvidenceRecord[];
}

export type StageBV2ValidateResult = { ok: true; analysis: StageBV2 } | { ok: false; reasons: string[] };

/** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** How many points the locked fair margin is ABOVE the displayed line for the preferred side (negative = the fair spread says the other side is better). */
function edgeForSide(side: "home" | "away", stageA: StageAV2, market: HandicapV2MarketContext): number {
  const fairHomeMargin = stageA.fairSpread.team.toLowerCase() === market.teams.homeTeam.toLowerCase() ? Math.abs(stageA.fairSpread.line) : -Math.abs(stageA.fairSpread.line);
  const homeEdge = fairHomeMargin + market.spread.homeLine;
  return side === "home" ? homeEdge : -homeEdge;
}

interface ProbabilityCheck {
  reasons: string[];
  warnings: string[];
  impliedPush: number;
}

function checkProbabilities(preferred: unknown, other: unknown, verdict: Verdict, preferredLine: number, edge: number): ProbabilityCheck {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!isFiniteNumber(preferred) || !isFiniteNumber(other)) {
    return { reasons: ["coverProbabilityPreferred and coverProbabilityOther must be finite numbers (percent)"], warnings, impliedPush: 0 };
  }
  if (preferred <= 1 && other <= 1) reasons.push("cover probabilities must be percents (for example 56), not fractions (0.56)");
  for (const [name, value] of [["coverProbabilityPreferred", preferred], ["coverProbabilityOther", other]] as const) {
    if (value < PROBABILITY_MIN || value > PROBABILITY_MAX) reasons.push(`${name} (${value}) is outside a credible ${PROBABILITY_MIN}-${PROBABILITY_MAX}% range for an NFL spread`);
  }
  const sum = preferred + other;
  const impliedPush = Math.round((100 - sum) * 10) / 10;
  if (sum > 100 + HALF_POINT_SUM_TOLERANCE) reasons.push(`the two cover probabilities sum to ${sum}, more than 100`);
  else if (Number.isInteger(preferredLine)) {
    if (impliedPush < -HALF_POINT_SUM_TOLERANCE || impliedPush > MAX_IMPLIED_PUSH) reasons.push(`on a whole-number line the probabilities should sum to 100 minus a push chance of at most ${MAX_IMPLIED_PUSH}% (they sum to ${sum})`);
  } else if (Math.abs(sum - 100) > HALF_POINT_SUM_TOLERANCE) {
    reasons.push(`on a half-point line a push is impossible, so the probabilities must sum to 100 (they sum to ${sum})`);
  }
  if (preferred < other) reasons.push("coverProbabilityPreferred is lower than coverProbabilityOther -- the preferred side must be the one you rate more likely to cover");
  if ((verdict === "BET" || verdict === "LEAN") && preferred <= other) reasons.push(`a ${verdict} needs the preferred side rated strictly more likely to cover than the other side`);
  if (verdict === "PASS" && preferred >= PASS_MAX_COVER_PROBABILITY) reasons.push(`verdict PASS contradicts a ${preferred}% cover probability for the preferred side`);
  else if (verdict === "PASS" && preferred >= PASS_HIGH_COVER_WARNING) warnings.push(`PASS with a ${preferred}% cover probability for the preferred side`);

  if (edge <= -OPPOSES_LOCKED_FAIR_SPREAD_POINTS && preferred >= OPPOSING_MIN_COVER_PROBABILITY) {
    reasons.push(`the locked fair spread makes the preferred side ${Math.abs(edge).toFixed(1)} points worse than the displayed number, yet it is rated ${preferred}% to cover -- that contradicts your own Stage 1 projection`);
  } else if (verdict === "BET" && edge <= -BET_OPPOSES_FAIR_SPREAD_WARNING_POINTS) {
    warnings.push(`BET on a side the locked fair spread rates ${Math.abs(edge).toFixed(1)} points worse than the displayed number`);
  }

  const reference = normalCdf(edge / REFERENCE_MARGIN_SIGMA) * 100;
  if (Math.abs(preferred - reference) > REFERENCE_PROBABILITY_WARNING_GAP) {
    warnings.push(`preferred cover probability ${preferred}% is far from a normal-model reference of ${reference.toFixed(0)}% for the locked fair spread (informational only; the model's estimate is kept)`);
  }
  return { reasons, warnings, impliedPush };
}

interface FinalReadCheckInput {
  finalReadLines: readonly string[];
  preferredVariants: readonly string[];
  otherVariants: readonly string[];
  preferredLine: number;
  otherLine: number;
  preferredProbability: number;
  otherProbability: number;
  stageA: StageAV2;
  game: HandicapV2GameFacts;
}

function firstPercent(line: string): number | null {
  const match = /(\d{1,2}(?:\.\d+)?)\s*%/.exec(line);
  return match ? Number(match[1]) : null;
}

function checkFinalRead(input: FinalReadCheckInput): string[] {
  const reasons: string[] = [];
  const lines = input.finalReadLines;
  const percentLines = lines.filter((l) => firstPercent(l) !== null);
  if (percentLines.length < 2) return ["the final read must give both sides' cover probabilities as percents"];
  const [first, second] = percentLines;
  if (!mentionsAny(first, input.preferredVariants) || !mentionsSignedLine(first, input.preferredLine)) {
    reasons.push(`the first final-read line must name the preferred side with its line (${formatSignedLine(input.preferredLine)}) -- it says: "${first}"`);
  }
  if (Math.abs((firstPercent(first) as number) - input.preferredProbability) > FINAL_READ_PERCENT_TOLERANCE) {
    reasons.push(`the first final-read percentage does not match coverProbabilityPreferred (${input.preferredProbability})`);
  }
  if (!mentionsAny(second, input.otherVariants) || !mentionsSignedLine(second, input.otherLine)) {
    reasons.push(`the second final-read line must name the other side with its line (${formatSignedLine(input.otherLine)}) -- it says: "${second}"`);
  }
  if (Math.abs((firstPercent(second) as number) - input.otherProbability) > FINAL_READ_PERCENT_TOLERANCE) {
    reasons.push(`the second final-read percentage does not match coverProbabilityOther (${input.otherProbability})`);
  }
  const scoreLine = lines.find((l) => /score/i.test(l));
  if (!scoreLine) {
    reasons.push("the final read must include the fair-ish score line");
  } else {
    const numbers = (scoreLine.match(/\d+/g) ?? []).map(Number);
    const { home, away } = input.stageA.fairScore;
    const home$ = teamNickname(input.game.homeTeamFull);
    const away$ = teamNickname(input.game.awayTeamFull);
    if (!numbers.includes(home) || !numbers.includes(away)) reasons.push(`the fair-ish score line must show the derived score (${away$} ${away}, ${home$} ${home})`);
    if (!mentionsAny(scoreLine, [home$]) || !mentionsAny(scoreLine, [away$])) reasons.push("the fair-ish score line must name both teams");
  }
  const totalLine = lines.find((l) => /projected total/i.test(l));
  const totalMatch = totalLine ? /(\d{2}(?:\.\d+)?)/.exec(totalLine) : null;
  if (!totalMatch) reasons.push("the final read must include the projected total line");
  else if (Math.abs(Number(totalMatch[1]) - input.stageA.projectedTotal) > TOTAL_LINE_TOLERANCE) reasons.push(`the projected total line (${totalMatch[1]}) does not match the locked projected total (${input.stageA.projectedTotal})`);
  return reasons;
}

/** Rejects a write-up that pairs a team with the OTHER team's line (the home/away inversion failure). */
function findInvertedLines(text: string, teams: { variants: readonly string[]; actualLine: number; otherLine: number }[]): string[] {
  const reasons: string[] = [];
  for (const team of teams) {
    if (team.actualLine === team.otherLine) continue;
    for (const variant of team.variants) {
      const pattern = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(?:\\(?)(${formatSignedLine(team.otherLine).replace(/[+.]/g, "\\$&")})(?![\\d.]*\\d)`, "i");
      if (pattern.test(text)) {
        reasons.push(`the write-up pairs "${variant}" with ${formatSignedLine(team.otherLine)}, but that side's line is ${formatSignedLine(team.actualLine)} -- home/away appear inverted`);
        break;
      }
    }
  }
  return reasons;
}

export function validateStageBV2(raw: unknown, ctx: StageBV2ValidationContext): StageBV2ValidateResult {
  if (!isRecord(raw)) return { ok: false, reasons: ["Stage B payload is not an object"] };
  const reasons = checkEnvelope(raw, ctx);
  const warnings: string[] = [];
  const { game, market, lockedStageA } = ctx;

  if (!VERDICTS.includes(raw.verdict as Verdict)) reasons.push(`verdict must be one of ${VERDICTS.join(", ")}`);
  if (!CONFIDENCE_LEVELS.includes(raw.confidence as Confidence)) reasons.push(`confidence must be one of ${CONFIDENCE_LEVELS.join(", ")}`);

  const preferredTeam = normalizeProviderTeamCode(raw.preferredTeam, game.homeTeam, game.awayTeam);
  let preferredSide: "home" | "away" | null = null;
  if (preferredTeam === game.homeTeam) preferredSide = "home";
  else if (preferredTeam === game.awayTeam) preferredSide = "away";
  else reasons.push(`preferredTeam "${String(raw.preferredTeam)}" must be "${game.awayTeam.toUpperCase()}" or "${game.homeTeam.toUpperCase()}"`);

  const markdown = raw.analysisMarkdown;
  if (typeof markdown !== "string" || markdown.trim().length === 0) reasons.push("analysisMarkdown must be a non-empty string");

  const factRefsUsed = stringArray(raw.factRefsUsed);
  const evidenceRefsUsed = stringArray(raw.evidenceRefsUsed);
  if (!factRefsUsed) reasons.push("factRefsUsed must be an array of strings");
  else if (factRefsUsed.length === 0) reasons.push("factRefsUsed must list the football facts the write-up relies on");
  if (!evidenceRefsUsed) reasons.push("evidenceRefsUsed must be an array of strings");
  if (factRefsUsed && evidenceRefsUsed) reasons.push(...checkRefs("write-up", factRefsUsed, evidenceRefsUsed, ctx, { rejectMarketPricing: false }));

  // Counterargument and key-number sensitivity.
  reasons.push(...findSpecificityViolations(raw.counterargument, { label: "counterargument", minWords: COUNTERARGUMENT_WORDS.min, maxWords: COUNTERARGUMENT_WORDS.max }));
  if (typeof raw.counterargument === "string") reasons.push(...validateProseStrings([raw.counterargument], "counterargument"));
  const sensitivity = raw.keyNumberSensitivity;
  if (market.keyNumbers.material) {
    reasons.push(...findSpecificityViolations(sensitivity, { label: "keyNumberSensitivity (required: key numbers are material for this line)", minWords: KEY_NUMBER_WORDS.min, maxWords: KEY_NUMBER_WORDS.max }));
  } else if (sensitivity != null && typeof sensitivity !== "string") {
    reasons.push("keyNumberSensitivity must be a string or null");
  } else if (typeof sensitivity === "string" && countWords(sensitivity) > KEY_NUMBER_WORDS.max) {
    reasons.push(`keyNumberSensitivity is too long (keep it under ${KEY_NUMBER_WORDS.max} words)`);
  }
  if (typeof sensitivity === "string") reasons.push(...validateProseStrings([sensitivity], "keyNumberSensitivity"));

  // Everything below needs a resolved side.
  let preferredLine = 0;
  let otherLine = 0;
  let impliedPush = 0;
  let wordCount = typeof markdown === "string" ? countWords(markdown) : 0;

  if (preferredSide && typeof markdown === "string" && VERDICTS.includes(raw.verdict as Verdict)) {
    preferredLine = preferredSide === "home" ? market.spread.homeLine : market.spread.awayLine;
    otherLine = preferredSide === "home" ? market.spread.awayLine : market.spread.homeLine;
    const verdict = raw.verdict as Verdict;

    const edge = edgeForSide(preferredSide, lockedStageA, market);
    const probability = checkProbabilities(raw.coverProbabilityPreferred, raw.coverProbabilityOther, verdict, preferredLine, edge);
    reasons.push(...probability.reasons);
    warnings.push(...probability.warnings);
    impliedPush = probability.impliedPush;

    // Structure and format.
    reasons.push(...findFormatViolations(markdown));
    const parsed = parseAnalysisMarkdown(markdown);
    wordCount = parsed.wordCount;
    if (parsed.wordCount < WORD_HARD_MIN || parsed.wordCount > WORD_HARD_MAX) {
      reasons.push(`analysisMarkdown is ${parsed.wordCount} words; it must be about ${WORD_TARGET_MIN}-${WORD_TARGET_MAX} (hard limits ${WORD_HARD_MIN}-${WORD_HARD_MAX})`);
    } else if (parsed.wordCount < WORD_TARGET_MIN || parsed.wordCount > WORD_TARGET_MAX) {
      warnings.push(`analysisMarkdown is ${parsed.wordCount} words, outside the ${WORD_TARGET_MIN}-${WORD_TARGET_MAX} target`);
    }
    if (!parsed.hasFinalRead) {
      reasons.push('analysisMarkdown needs the compact final read (bold lines with "cover probability" and "Projected total")');
    } else {
      if (parsed.analytical.length < ANALYTICAL_PARAGRAPHS_MIN || parsed.analytical.length > ANALYTICAL_PARAGRAPHS_MAX) {
        reasons.push(`analysisMarkdown needs ${ANALYTICAL_PARAGRAPHS_MIN}-${ANALYTICAL_PARAGRAPHS_MAX} analytical paragraphs before the final read (found ${parsed.analytical.length})`);
      }
      if (parsed.closing.length < 1 || parsed.closing.length > MAX_CLOSING_PARAGRAPHS) {
        reasons.push(`analysisMarkdown needs a closing recommendation of 1-${MAX_CLOSING_PARAGRAPHS} paragraph(s) after the final read (found ${parsed.closing.length})`);
      } else if (parsed.closing.some((p) => countWords(p) < CLOSING_MIN_WORDS)) {
        reasons.push("the closing recommendation is too short to state a line-sensitive conclusion");
      }

      const preferredFull = preferredSide === "home" ? game.homeTeamFull : game.awayTeamFull;
      const otherFull = preferredSide === "home" ? game.awayTeamFull : game.homeTeamFull;
      const preferredAbbr = preferredSide === "home" ? game.homeTeam : game.awayTeam;
      const otherAbbr = preferredSide === "home" ? game.awayTeam : game.homeTeam;
      const preferredVariants = nameVariants(preferredFull, preferredAbbr, otherFull);
      const otherVariants = nameVariants(otherFull, otherAbbr, preferredFull);

      if (isFiniteNumber(raw.coverProbabilityPreferred) && isFiniteNumber(raw.coverProbabilityOther)) {
        reasons.push(
          ...checkFinalRead({
            finalReadLines: parsed.finalReadLines,
            preferredVariants,
            otherVariants,
            preferredLine,
            otherLine,
            preferredProbability: raw.coverProbabilityPreferred,
            otherProbability: raw.coverProbabilityOther,
            stageA: lockedStageA,
            game,
          })
        );
      }

      const analyticalText = parsed.analytical.join("\n\n");
      if (!mentionsAny(analyticalText, preferredVariants) || !mentionsSignedLine(analyticalText, preferredLine)) {
        reasons.push(`the analysis must state the preferred side with its exact line (${formatSignedLine(preferredLine)}) in its own words`);
      }
      const closingText = parsed.closing.join("\n\n");
      if (verdict === "PASS") {
        if (!PASS_LANGUAGE.test(closingText)) reasons.push("verdict is PASS, but the closing recommendation does not say to pass");
      } else if (!mentionsAny(closingText, preferredVariants)) {
        reasons.push(`verdict is ${verdict}, but the closing recommendation does not name the preferred side`);
      }

      const homeVariants = preferredSide === "home" ? preferredVariants : otherVariants;
      const awayVariants = preferredSide === "home" ? otherVariants : preferredVariants;
      reasons.push(
        ...findInvertedLines(markdown, [
          { variants: homeVariants, actualLine: market.spread.homeLine, otherLine: market.spread.awayLine },
          { variants: awayVariants, actualLine: market.spread.awayLine, otherLine: market.spread.homeLine },
        ])
      );

      if (typeof raw.counterargument === "string" && overlapRatio(raw.counterargument, markdown) < OVERLAP_MIN) {
        reasons.push("the counterargument is not reflected in the write-up -- state the same hesitation in the paragraph about the risk");
      }
      if (INJURY_LANGUAGE.test(analyticalText) && evidenceRefsUsed && evidenceRefsUsed.length === 0) {
        reasons.push("the write-up makes injury/availability claims but evidenceRefsUsed is empty -- external claims must be traceable to cited evidence");
      }
      if ((analyticalText.match(/\d+(?:\.\d+)?/g) ?? []).length > MAX_NUMERALS_WARNING) warnings.push("the analytical paragraphs carry a lot of numbers; the goal is a handful of important facts, not a stat dump");
    }
    reasons.push(...validateProseStrings(parsed.blocks, "analysisMarkdown"));
  }

  if (reasons.length > 0 || !preferredSide) return { ok: false, reasons };

  return {
    ok: true,
    analysis: {
      schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
      model: ctx.model,
      gameId: ctx.gameId,
      contextHash: ctx.contextHash,
      generatedAt: ctx.generatedAt,
      verdict: raw.verdict as Verdict,
      preferredTeam: preferredTeam as string,
      preferredSide,
      preferredLine,
      otherLine,
      coverProbabilityPreferred: raw.coverProbabilityPreferred as number,
      coverProbabilityOther: raw.coverProbabilityOther as number,
      impliedPushProbability: impliedPush,
      confidence: raw.confidence as Confidence,
      keyNumberSensitivity: typeof sensitivity === "string" && sensitivity.trim().length > 0 ? sensitivity.trim() : null,
      counterargument: (raw.counterargument as string).trim(),
      analysisMarkdown: (markdown as string).trim(),
      wordCount,
      factRefsUsed: [...(factRefsUsed as string[])],
      evidenceRefsUsed: [...(evidenceRefsUsed as string[])],
      warnings,
    },
  };
}
