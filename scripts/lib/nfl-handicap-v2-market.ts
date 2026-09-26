/**
 * AI Picks v2 WU3 -- deterministic MARKET CONTEXT for Stage B.
 *
 * Pure facts and neutral metadata only. Nothing here estimates a probability,
 * grades an edge, or recommends a side: the handicapper (the model) makes
 * every betting judgment. What this module provides:
 *
 *   - the exact current line JKB displays for the matchup (the sportsbook the
 *     JKB market view selects; see src/lib/nfl/bettingLinesView.ts), labeled by
 *     team so home/away can never be inverted (the WU7.4 failure mode);
 *   - the spread of lines across the other books in the same artifact, so the
 *     model can say "the market is basically -7 to -7.5";
 *   - line movement since JKB's first tracked observation (NOT a true open);
 *   - KEY-NUMBER METADATA: whether the line sits on / near 3 or 7 and which
 *     margins change from cover to push to loss under a half-point move. This
 *     is arithmetic about the number, not a view on it.
 */
import type { BettingLinesCurrentGame } from "../../src/lib/nfl/bettingLinesView";
import type { GameContextMarket } from "./nfl-full-game-context";

/** NFL margins that land unusually often. Only these two are treated as key numbers here. */
export const KEY_NUMBERS: readonly number[] = [3, 7];

/** A line within this many points of a key number is "near" it. */
const NEAR_KEY_NUMBER_POINTS = 1;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** "-7", "+7", "-7.5", "PK". */
export function formatSignedLine(line: number): string {
  if (line === 0) return "PK";
  const body = Number.isInteger(line) ? String(Math.abs(line)) : Math.abs(line).toFixed(1);
  return `${line > 0 ? "+" : "-"}${body}`;
}

/** "Buffalo Bills" -> "Bills". */
export function teamNickname(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  return words[words.length - 1] ?? fullName;
}

export interface MarketTeams {
  homeTeam: string;
  awayTeam: string;
  homeTeamFull: string;
  awayTeamFull: string;
}

export interface SideLabels {
  home: string;
  away: string;
}

/** e.g. { home: "Bills -7", away: "Chargers +7" }. */
export function buildSideLabels(teams: MarketTeams, homeLine: number, awayLine: number): SideLabels {
  return {
    home: `${teamNickname(teams.homeTeamFull)} ${formatSignedLine(homeLine)}`,
    away: `${teamNickname(teams.awayTeamFull)} ${formatSignedLine(awayLine)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Book range                                                                 */
/* -------------------------------------------------------------------------- */

export interface BookLineGroup {
  homeLine: number;
  bookCount: number;
}

/** The spread and total across every book in the artifact for this game. */
export interface BookRange {
  bookCount: number;
  spreadByHomeLine: BookLineGroup[];
  homeLineMin: number | null;
  homeLineMax: number | null;
  totalMin: number | null;
  totalMax: number | null;
}

export function buildBookRange(game: Pick<BettingLinesCurrentGame, "books"> | null): BookRange | null {
  if (!game || game.books.length === 0) return null;
  const counts = new Map<number, number>();
  const totals: number[] = [];
  for (const book of game.books) {
    const line = book.spread?.homeLine;
    if (typeof line === "number" && Number.isFinite(line)) counts.set(line, (counts.get(line) ?? 0) + 1);
    const total = book.total?.line;
    if (typeof total === "number" && Number.isFinite(total)) totals.push(total);
  }
  const groups = [...counts.entries()].map(([homeLine, bookCount]) => ({ homeLine, bookCount })).sort((a, b) => a.homeLine - b.homeLine);
  return {
    bookCount: game.books.length,
    spreadByHomeLine: groups,
    homeLineMin: groups.length > 0 ? groups[0].homeLine : null,
    homeLineMax: groups.length > 0 ? groups[groups.length - 1].homeLine : null,
    totalMin: totals.length > 0 ? Math.min(...totals) : null,
    totalMax: totals.length > 0 ? Math.max(...totals) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Key numbers                                                                */
/* -------------------------------------------------------------------------- */

type MarginOutcome = "cover" | "push" | "loss";

/** How a game that ends with the favorite winning by exactly `margin` grades for someone who laid `favoriteLine` points. */
function favoriteOutcomeAtMargin(margin: number, favoriteLine: number): MarginOutcome {
  if (margin > favoriteLine) return "cover";
  if (margin === favoriteLine) return "push";
  return "loss";
}

/** Key numbers whose exact-margin result differs between two favorite lines (i.e. moving from one to the other "crosses" them). */
export function keyNumbersCrossed(favoriteLineA: number, favoriteLineB: number): number[] {
  return KEY_NUMBERS.filter((key) => favoriteOutcomeAtMargin(key, favoriteLineA) !== favoriteOutcomeAtMargin(key, favoriteLineB));
}

export interface HalfPointMove {
  favoriteLine: number;
  crossesKeyNumbers: number[];
}

export interface KeyNumberContext {
  /** Points the favorite is laying (positive; 0 for a pick'em). */
  favoriteLine: number;
  /** The key number the line sits exactly on, else null. */
  onKeyNumber: number | null;
  /** The closest key number when within one point of it (including on it), else null. */
  nearKeyNumber: number | null;
  /** The favorite laying half a point less / more. */
  halfPointBetterForFavorite: HalfPointMove;
  halfPointWorseForFavorite: HalfPointMove;
  /** True when the book range (if any) straddles a key number. */
  bookRangeCrossesKeyNumber: boolean;
  /** True when the key number is close enough to the line (or range) that the number itself deserves discussion. */
  material: boolean;
}

export function buildKeyNumberContext(favoriteLine: number, bookRange: BookRange | null): KeyNumberContext {
  const line = Math.abs(favoriteLine);
  const onKeyNumber = KEY_NUMBERS.find((key) => key === line) ?? null;
  const nearest = [...KEY_NUMBERS].sort((a, b) => Math.abs(a - line) - Math.abs(b - line))[0];
  const nearKeyNumber = nearest !== undefined && Math.abs(nearest - line) <= NEAR_KEY_NUMBER_POINTS ? nearest : null;

  const lower = Math.max(0, line - 0.5);
  const upper = line + 0.5;

  let bookRangeCrossesKeyNumber = false;
  if (bookRange && bookRange.homeLineMin != null && bookRange.homeLineMax != null) {
    bookRangeCrossesKeyNumber = keyNumbersCrossed(Math.abs(bookRange.homeLineMin), Math.abs(bookRange.homeLineMax)).length > 0;
  }

  return {
    favoriteLine: line,
    onKeyNumber,
    nearKeyNumber,
    halfPointBetterForFavorite: { favoriteLine: lower, crossesKeyNumbers: keyNumbersCrossed(line, lower) },
    halfPointWorseForFavorite: { favoriteLine: upper, crossesKeyNumbers: keyNumbersCrossed(line, upper) },
    bookRangeCrossesKeyNumber,
    material: nearKeyNumber !== null || bookRangeCrossesKeyNumber,
  };
}

/* -------------------------------------------------------------------------- */
/* Market context                                                             */
/* -------------------------------------------------------------------------- */

export interface HandicapV2SpreadMarket {
  sportsbook: string | null;
  homeLine: number;
  awayLine: number;
  homePrice: number | null;
  awayPrice: number | null;
}

export interface HandicapV2MarketContext {
  teams: MarketTeams;
  spread: HandicapV2SpreadMarket;
  total: { line: number | null; overPrice: number | null; underPrice: number | null };
  sideLabels: SideLabels;
  /** Favorite by the displayed line; null for a pick'em. */
  favorite: { side: "home" | "away"; team: string; line: number } | null;
  bookRange: BookRange | null;
  /** Movement of the displayed book's home line / total since JKB first tracked it (not a true opening line). Null when unknown. */
  movementSinceFirstTracked: { homeLine: number | null; total: number | null };
  keyNumbers: KeyNumberContext;
  asOf: string | null;
  freshness: GameContextMarket["freshness"];
}

/** Null when the packet has no usable spread -- Stage B needs the exact line, so callers must stop rather than guess. */
export function buildHandicapV2MarketContext(input: { market: GameContextMarket; teams: MarketTeams; bookRange: BookRange | null; asOf: string | null }): HandicapV2MarketContext | null {
  const { market, teams, bookRange } = input;
  const { homeLine, awayLine } = market.spread;
  if (homeLine == null || awayLine == null) return null;
  const favorite = homeLine === 0 ? null : homeLine < 0 ? { side: "home" as const, team: teams.homeTeam, line: Math.abs(homeLine) } : { side: "away" as const, team: teams.awayTeam, line: Math.abs(awayLine) };
  return {
    teams,
    spread: { sportsbook: market.sportsbook, homeLine, awayLine, homePrice: market.spread.homePrice, awayPrice: market.spread.awayPrice },
    total: { line: market.total.line, overPrice: market.total.overPrice, underPrice: market.total.underPrice },
    sideLabels: buildSideLabels(teams, homeLine, awayLine),
    favorite,
    bookRange,
    movementSinceFirstTracked: { homeLine: market.lineMovement.spread, total: market.lineMovement.total },
    keyNumbers: buildKeyNumberContext(favorite ? favorite.line : 0, bookRange),
    asOf: input.asOf,
    freshness: market.freshness,
  };
}

function priceText(price: number | null): string {
  return price == null ? "n/a" : price > 0 ? `+${price}` : String(price);
}

function bookRangeText(range: BookRange, teams: MarketTeams): string {
  const groups = range.spreadByHomeLine.map((g) => `${teamNickname(teams.homeTeamFull)} ${formatSignedLine(g.homeLine)} at ${g.bookCount} book${g.bookCount === 1 ? "" : "s"}`);
  const total = range.totalMin != null && range.totalMax != null ? (range.totalMin === range.totalMax ? `total ${range.totalMin}` : `total ${range.totalMin} to ${range.totalMax}`) : "total n/a";
  return `${range.bookCount} books: ${groups.join("; ")}; ${total}`;
}

function movementText(ctx: HandicapV2MarketContext): string {
  const m = ctx.movementSinceFirstTracked;
  if (m.homeLine == null && m.total == null) return "line movement: not available";
  const parts: string[] = [];
  if (m.homeLine != null) parts.push(m.homeLine === 0 ? "spread unchanged" : `${teamNickname(ctx.teams.homeTeamFull)} line moved ${m.homeLine > 0 ? "+" : ""}${m.homeLine}`);
  if (m.total != null) parts.push(m.total === 0 ? "total unchanged" : `total moved ${m.total > 0 ? "+" : ""}${m.total}`);
  return `line movement since JKB first tracked this game (NOT the true opening line): ${parts.join(", ")}`;
}

function keyNumberLines(ctx: HandicapV2MarketContext): string[] {
  const k = ctx.keyNumbers;
  if (!ctx.favorite) return ["key numbers: pick'em, so 3 and 7 are not directly in play at this number."];
  const fav = teamNickname(ctx.favorite.side === "home" ? ctx.teams.homeTeamFull : ctx.teams.awayTeamFull);
  const lines = [`favorite by the displayed line: ${fav}, laying ${ctx.favorite.line} points`];
  if (k.onKeyNumber !== null) lines.push(`the line sits exactly on the key number ${k.onKeyNumber}: a game decided by exactly ${k.onKeyNumber} is a push.`);
  else if (k.nearKeyNumber !== null) lines.push(`the line is within a point of the key number ${k.nearKeyNumber}.`);
  else lines.push("the line is not within a point of the key numbers 3 or 7.");
  const better = k.halfPointBetterForFavorite;
  const worse = k.halfPointWorseForFavorite;
  lines.push(`if ${fav} were laying ${better.favoriteLine} instead: ${better.crossesKeyNumbers.length > 0 ? `the result of a game decided by exactly ${better.crossesKeyNumbers.join(" or ")} changes` : "no key-number result changes"}.`);
  lines.push(`if ${fav} were laying ${worse.favoriteLine} instead: ${worse.crossesKeyNumbers.length > 0 ? `the result of a game decided by exactly ${worse.crossesKeyNumbers.join(" or ")} changes` : "no key-number result changes"}.`);
  if (k.bookRangeCrossesKeyNumber) lines.push("the books disagree across a key number, so the price you can get depends on the book.");
  lines.push(`key-number discussion is ${k.material ? "MATERIAL for this game" : "NOT material for this game -- do not force it"}.`);
  return lines;
}

/** The exact market block Stage B's prompt prints. Team-labeled on every number so home/away cannot be misread. */
export function renderHandicapV2MarketLines(ctx: HandicapV2MarketContext): string[] {
  const t = ctx.teams;
  return [
    `book displayed by JKB: ${ctx.spread.sportsbook ?? "unknown"}${ctx.asOf ? ` (as of ${ctx.asOf}, freshness ${ctx.freshness})` : ""}`,
    `spread: HOME ${t.homeTeam.toUpperCase()} (${teamNickname(t.homeTeamFull)}) ${formatSignedLine(ctx.spread.homeLine)} (price ${priceText(ctx.spread.homePrice)}); AWAY ${t.awayTeam.toUpperCase()} (${teamNickname(t.awayTeamFull)}) ${formatSignedLine(ctx.spread.awayLine)} (price ${priceText(ctx.spread.awayPrice)})`,
    `side labels to use in your write-up: "${ctx.sideLabels.home}" and "${ctx.sideLabels.away}"`,
    `total: ${ctx.total.line ?? "n/a"} (over ${priceText(ctx.total.overPrice)}, under ${priceText(ctx.total.underPrice)})`,
    ctx.bookRange ? `across the market: ${bookRangeText(ctx.bookRange, t)}` : "across the market: only one book available",
    movementText(ctx),
    ...keyNumberLines(ctx),
  ];
}
