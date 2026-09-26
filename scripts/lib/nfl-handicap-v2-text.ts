/**
 * AI Picks v2 WU3 -- pure text helpers for the v2 write-up: word counting,
 * structural parsing of `analysisMarkdown`, team-name matching, generic-phrase
 * detection and the deterministic fair-score derivation.
 *
 * Deliberately structural, not stylistic: it checks that the write-up has the
 * requested SHAPE (4-6 analytical paragraphs, a compact final read, a closing
 * line, a sane length, no old article headings) and never grades wording.
 */
import type { FairScore, PredictedFairSpread } from "./nfl-handicap-v2-types";

/** The requested target length. */
export const WORD_TARGET_MIN = 250;
export const WORD_TARGET_MAX = 450;
/** Hard bounds (roughly the target +/- 15-20%): outside these the write-up is rejected; between them and the target it only warns. */
export const WORD_HARD_MIN = 210;
export const WORD_HARD_MAX = 520;

export const ANALYTICAL_PARAGRAPHS_MIN = 4;
export const ANALYTICAL_PARAGRAPHS_MAX = 6;

/* -------------------------------------------------------------------------- */
/* Fair score                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Splits a projected total around a fair margin: the favorite gets
 * (total + margin) / 2 and the underdog (total - margin) / 2, each rounded to a
 * whole number. Pure arithmetic on the model's OWN two Stage A numbers -- no
 * new judgment. Rounding can move the margin or the sum by up to one point,
 * hence "fair-ish".
 */
export function deriveFairScore(fairSpread: PredictedFairSpread, projectedTotal: number, homeTeam: string): FairScore {
  const margin = Math.abs(fairSpread.line);
  const favorite = Math.max(0, Math.round((projectedTotal + margin) / 2));
  const underdog = Math.max(0, Math.round((projectedTotal - margin) / 2));
  const favoriteIsHome = fairSpread.team.toLowerCase() === homeTeam.toLowerCase();
  return favoriteIsHome ? { home: favorite, away: underdog } : { home: underdog, away: favorite };
}

/* -------------------------------------------------------------------------- */
/* Markdown structure                                                         */
/* -------------------------------------------------------------------------- */

export function stripMarkdown(text: string): string {
  return text.replace(/[*_`#>]/g, "");
}

export function countWords(markdown: string): number {
  return stripMarkdown(markdown)
    .split(/\s+/)
    .filter((token) => /[A-Za-z0-9]/.test(token)).length;
}

export interface ParsedAnalysis {
  wordCount: number;
  blocks: string[];
  /** Paragraphs before the final read. */
  analytical: string[];
  /** Every line of the final-read block(s), in order. */
  finalReadLines: string[];
  /** Paragraphs after the final read. */
  closing: string[];
  /** False when no final-read block could be located. */
  hasFinalRead: boolean;
}

export function parseAnalysisMarkdown(markdown: string): ParsedAnalysis {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 0);
  const start = blocks.findIndex((b) => /cover probability/i.test(b));
  let end = -1;
  blocks.forEach((b, index) => {
    if (/projected total/i.test(b)) end = index;
  });
  const wordCount = countWords(normalized);
  if (start === -1 || end === -1 || end < start) {
    return { wordCount, blocks, analytical: blocks, finalReadLines: [], closing: [], hasFinalRead: false };
  }
  return {
    wordCount,
    blocks,
    analytical: blocks.slice(0, start),
    finalReadLines: blocks.slice(start, end + 1).flatMap((b) => b.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)),
    closing: blocks.slice(end + 1),
    hasFinalRead: true,
  };
}

/** Headings and section labels from the retired 12-section article, plus generic-report scaffolding. */
const RETIRED_HEADING_PATTERNS: readonly RegExp[] = [
  /key takeaways?/i,
  /\bthe read\b/i,
  /matchup keys?/i,
  /what could flip/i,
  /\bfinal word\b/i,
  /betting breakdown/i,
  /trenches and game control/i,
  /when \w+ has the ball/i,
  /how the game could play out/i,
  /personnel, injuries and context/i,
  /\bexecutive summary\b/i,
  /\bconclusion\b\s*:/i,
];

/** Structural violations (headings, lists) as human-readable reasons. */
export function findFormatViolations(markdown: string): string[] {
  const reasons: string[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (lines.some((l) => /^\s{0,3}#{1,6}\s/.test(l))) reasons.push("analysisMarkdown contains a markdown heading -- it must be plain paragraphs (bold is allowed only for the final read)");
  if (lines.some((l) => /^\s*(?:[-+]|\*(?!\*)|\d+[.)])\s+\S/.test(l))) reasons.push("analysisMarkdown contains a bulleted or numbered list -- write paragraphs");
  for (const pattern of RETIRED_HEADING_PATTERNS) {
    if (pattern.test(markdown)) reasons.push(`analysisMarkdown uses retired article scaffolding matching ${pattern}`);
  }
  if (/\bjkb\b/i.test(markdown)) reasons.push("analysisMarkdown references JKB -- the write-up must stand on its own football reasoning");
  return reasons;
}

/* -------------------------------------------------------------------------- */
/* Team names                                                                 */
/* -------------------------------------------------------------------------- */

/** Ways a write-up may name a team: full name, nickname, abbreviation, and its city unless the other team shares it (LA, NY). */
export function nameVariants(teamFull: string, teamAbbr: string, otherTeamFull: string): string[] {
  const words = teamFull.trim().split(/\s+/);
  const nickname = words[words.length - 1] ?? teamFull;
  const city = words.slice(0, -1).join(" ");
  const otherCity = otherTeamFull.trim().split(/\s+/).slice(0, -1).join(" ");
  const variants = [teamFull, nickname, teamAbbr.toUpperCase()];
  if (city && city.toLowerCase() !== otherCity.toLowerCase()) variants.push(city);
  return variants;
}

export function mentionsAny(text: string, variants: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return variants.some((v) => new RegExp(`\\b${v.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));
}

/** True when `text` contains the signed line (e.g. "-7", "+7.5"), tolerating "-7.0" and treating PK/pick as zero. */
export function mentionsSignedLine(text: string, line: number): boolean {
  if (line === 0) return /\b(pk|pick'?em|pick-em)\b|(^|[^\d.])[+-]?0(\.0)?([^\d.]|$)/i.test(text);
  const abs = Math.abs(line);
  const body = Number.isInteger(abs) ? `${abs}(?:\\.0)?` : abs.toFixed(1).replace(".", "\\.");
  const sign = line > 0 ? "\\+" : "[-−–]";
  return new RegExp(`(^|[^\\d.])${sign}${body}(?![\\d.]*\\d)`).test(text);
}

/* -------------------------------------------------------------------------- */
/* Generic-statement detection                                                */
/* -------------------------------------------------------------------------- */

const GENERIC_PHRASES: readonly string[] = [
  "anything can happen",
  "any given sunday",
  "on any given",
  "both teams will need to execute",
  "need to execute",
  "come down to execution",
  "will come down to",
  "it is important to note",
  "ultimately",
  "only time will tell",
  "injuries could",
  "turnovers could",
  "unforeseen",
];

const STOPWORDS = new Set(["about", "after", "again", "against", "because", "before", "being", "could", "every", "first", "their", "there", "these", "those", "which", "while", "would", "where", "other", "through", "should", "still", "under", "since", "until", "than", "that", "this", "with", "have", "from", "they", "them", "were", "what", "when", "will", "your", "into", "just", "more", "most", "much", "only", "over", "some", "such", "then", "very"]);

export function contentWords(text: string): string[] {
  const words = stripMarkdown(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/** Share of `statement`'s distinct content words that also appear in `corpus`. 1 when the statement has none to compare. */
export function overlapRatio(statement: string, corpus: string): number {
  const words = contentWords(statement);
  if (words.length === 0) return 1;
  const haystack = new Set(contentWords(corpus));
  return words.filter((w) => haystack.has(w)).length / words.length;
}

export interface SpecificityOptions {
  label: string;
  minWords: number;
  maxWords: number;
}

/** A risk/counterargument must be a real, bounded, non-boilerplate statement. */
export function findSpecificityViolations(text: unknown, options: SpecificityOptions): string[] {
  if (typeof text !== "string" || text.trim().length === 0) return [`${options.label} must be a non-empty string`];
  const reasons: string[] = [];
  const words = countWords(text);
  if (words < options.minWords) reasons.push(`${options.label} is too thin (${words} words; need at least ${options.minWords}) -- state the specific way this fails`);
  if (words > options.maxWords) reasons.push(`${options.label} is too long (${words} words; keep it under ${options.maxWords})`);
  const lower = text.toLowerCase();
  const generic = GENERIC_PHRASES.find((p) => lower.includes(p));
  if (generic) reasons.push(`${options.label} is generic boilerplate ("${generic}") -- name the specific team, player, unit or number involved`);
  return reasons;
}
