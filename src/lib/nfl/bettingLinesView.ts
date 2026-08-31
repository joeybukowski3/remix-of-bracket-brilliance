/**
 * Phase 4 — browser-safe view adapter over the public The Odds API betting-line
 * artifacts.
 *
 * This layer turns the sanitized public artifacts produced under
 * `src/lib/market/lines/**` (see {@link ../../market/lines/bettingLinePublicArtifacts})
 * into one stable view model the matchup UI can consume later. It is
 * intentionally dependency-light: the producer module imports `node:path` and
 * filesystem helpers, so it must never be imported into the browser bundle.
 * Only the pure leaf market value types are reused from
 * {@link ../../market/lines/bettingLineTypes}.
 *
 * Scope: current sportsbook-specific line, the selected sportsbook identity,
 * freshness, and spread/total line movement. This adapter never touches the
 * nflverse `matchup-market.json` dataset (that stays behind
 * `useNflMatchupMarket`); the two market concepts remain separate.
 *
 * Nothing here averages sportsbooks, fabricates a consensus, or merges values
 * from different books into one displayed line. One whole sportsbook is
 * selected deterministically and every exposed value comes from that one book.
 */

import type {
  BettingLineMoneyline,
  BettingLineSpread,
  BettingLineTotal,
} from "@/lib/market/lines/bettingLineTypes";

/* -------------------------------------------------------------------------- */
/* Artifact locations                                                          */
/* -------------------------------------------------------------------------- */

export const BETTING_LINES_CURRENT_PATH =
  "/data/market/betting-lines-current.json";

/** Deterministic, path-safe token for a JKB game id (NFL ids are already safe). */
export function toBettingLinesGameToken(jkbGameId: string): string {
  return jkbGameId.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function bettingLinesHistoryPath(jkbGameId: string): string {
  return `/data/market/betting-lines-history/nfl/${toBettingLinesGameToken(jkbGameId)}.json`;
}

/* -------------------------------------------------------------------------- */
/* Browser-safe artifact shapes (mirror of the public producer projections)   */
/* -------------------------------------------------------------------------- */

export interface BettingLineObservation {
  provider: string;
  providerEventId: string;
  sportsbook: string;
  capturedAt: string;
  providerUpdatedAt: string | null;
  firstObservedAt: string;
  lastObservedAt: string;
  contentHash: string | null;
  spread: BettingLineSpread | null;
  total: BettingLineTotal | null;
  moneyline: BettingLineMoneyline | null;
}

export interface BettingLinesCurrentGame {
  league: string;
  season: number;
  week: number | null;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  books: BettingLineObservation[];
}

export interface BettingLinesCurrentArtifact {
  schemaVersion: string;
  generatedAt: string;
  games: BettingLinesCurrentGame[];
}

export interface BettingLinesHistoryArtifact {
  schemaVersion: string;
  generatedAt: string;
  league: string;
  season: number;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  series: BettingLineObservation[];
}

/* -------------------------------------------------------------------------- */
/* Fail-safe parsing                                                           */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function parseSpread(value: unknown): BettingLineSpread | null {
  if (!isRecord(value)) return null;
  const { homeLine, awayLine, homePrice, awayPrice } = value;
  if (![homeLine, awayLine, homePrice, awayPrice].every(isFiniteNumberOrNull)) {
    return null;
  }
  return {
    homeLine: homeLine as number | null,
    awayLine: awayLine as number | null,
    homePrice: homePrice as number | null,
    awayPrice: awayPrice as number | null,
  };
}

function parseTotal(value: unknown): BettingLineTotal | null {
  if (!isRecord(value)) return null;
  const { line, overPrice, underPrice } = value;
  if (![line, overPrice, underPrice].every(isFiniteNumberOrNull)) return null;
  return {
    line: line as number | null,
    overPrice: overPrice as number | null,
    underPrice: underPrice as number | null,
  };
}

function parseMoneyline(value: unknown): BettingLineMoneyline | null {
  if (!isRecord(value)) return null;
  const { homePrice, awayPrice } = value;
  if (![homePrice, awayPrice].every(isFiniteNumberOrNull)) return null;
  return {
    homePrice: homePrice as number | null,
    awayPrice: awayPrice as number | null,
  };
}

function asObservation(raw: unknown): BettingLineObservation | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.sportsbook !== "string" || raw.sportsbook.length === 0) {
    return null;
  }
  if (typeof raw.capturedAt !== "string") return null;
  const firstObservedAt =
    typeof raw.firstObservedAt === "string" ? raw.firstObservedAt : raw.capturedAt;
  const lastObservedAt =
    typeof raw.lastObservedAt === "string" ? raw.lastObservedAt : raw.capturedAt;
  return {
    provider: typeof raw.provider === "string" ? raw.provider : "",
    providerEventId:
      typeof raw.providerEventId === "string" ? raw.providerEventId : "",
    sportsbook: raw.sportsbook,
    capturedAt: raw.capturedAt,
    providerUpdatedAt:
      typeof raw.providerUpdatedAt === "string" ? raw.providerUpdatedAt : null,
    firstObservedAt,
    lastObservedAt,
    contentHash: typeof raw.contentHash === "string" ? raw.contentHash : null,
    spread: parseSpread(raw.spread),
    total: parseTotal(raw.total),
    moneyline: parseMoneyline(raw.moneyline),
  };
}

function asCurrentGame(raw: unknown): BettingLinesCurrentGame | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.jkbGameId !== "string" || raw.jkbGameId.length === 0) return null;
  if (!Array.isArray(raw.books)) return null;
  const books: BettingLineObservation[] = [];
  for (const entry of raw.books) {
    const observation = asObservation(entry);
    if (observation) books.push(observation);
  }
  return {
    league: typeof raw.league === "string" ? raw.league : "",
    season: typeof raw.season === "number" ? raw.season : 0,
    week: typeof raw.week === "number" ? raw.week : null,
    jkbGameId: raw.jkbGameId,
    awayTeamId: typeof raw.awayTeamId === "string" ? raw.awayTeamId : "",
    homeTeamId: typeof raw.homeTeamId === "string" ? raw.homeTeamId : "",
    kickoffUtc: typeof raw.kickoffUtc === "string" ? raw.kickoffUtc : null,
    books,
  };
}

export function parseBettingLinesCurrentArtifact(
  raw: unknown,
): BettingLinesCurrentArtifact | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.generatedAt !== "string") return null;
  if (!Array.isArray(raw.games)) return null;
  const games: BettingLinesCurrentGame[] = [];
  for (const entry of raw.games) {
    const game = asCurrentGame(entry);
    if (game) games.push(game);
  }
  return {
    schemaVersion:
      typeof raw.schemaVersion === "string" ? raw.schemaVersion : "",
    generatedAt: raw.generatedAt,
    games,
  };
}

export function parseBettingLinesHistoryArtifact(
  raw: unknown,
): BettingLinesHistoryArtifact | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.generatedAt !== "string") return null;
  if (typeof raw.jkbGameId !== "string" || raw.jkbGameId.length === 0) return null;
  if (!Array.isArray(raw.series)) return null;
  const series: BettingLineObservation[] = [];
  for (const entry of raw.series) {
    const observation = asObservation(entry);
    if (observation) series.push(observation);
  }
  return {
    schemaVersion:
      typeof raw.schemaVersion === "string" ? raw.schemaVersion : "",
    generatedAt: raw.generatedAt,
    league: typeof raw.league === "string" ? raw.league : "",
    season: typeof raw.season === "number" ? raw.season : 0,
    jkbGameId: raw.jkbGameId,
    awayTeamId: typeof raw.awayTeamId === "string" ? raw.awayTeamId : "",
    homeTeamId: typeof raw.homeTeamId === "string" ? raw.homeTeamId : "",
    kickoffUtc: typeof raw.kickoffUtc === "string" ? raw.kickoffUtc : null,
    series,
  };
}

/* -------------------------------------------------------------------------- */
/* Deterministic sportsbook selection                                          */
/* -------------------------------------------------------------------------- */

/** Priority order. The first book present (whole book) wins; no mixing. */
export const SPORTSBOOK_PRIORITY = [
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
] as const;

const SPORTSBOOK_DISPLAY_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
};

export function sportsbookDisplayName(id: string): string {
  return SPORTSBOOK_DISPLAY_NAMES[id] ?? id.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface SelectedSportsbook {
  id: string;
  name: string;
}

export interface SportsbookSelection {
  sportsbook: SelectedSportsbook;
  reason: "priority" | "first-available";
  observation: BettingLineObservation;
}

/**
 * Pick exactly one sportsbook for a game. Priority list first; otherwise the
 * alphabetically-first available book id (deterministic, never random). Returns
 * `null` only when there is no usable book at all.
 */
export function selectSportsbook(
  books: readonly BettingLineObservation[],
): SportsbookSelection | null {
  const valid = books.filter(
    (book) => typeof book.sportsbook === "string" && book.sportsbook.length > 0,
  );
  if (valid.length === 0) return null;

  for (const id of SPORTSBOOK_PRIORITY) {
    const match = valid.find((book) => book.sportsbook === id);
    if (match) {
      return {
        sportsbook: { id, name: sportsbookDisplayName(id) },
        reason: "priority",
        observation: match,
      };
    }
  }

  const firstAvailable = [...valid].sort((left, right) =>
    left.sportsbook.localeCompare(right.sportsbook),
  )[0];
  return {
    sportsbook: {
      id: firstAvailable.sportsbook,
      name: sportsbookDisplayName(firstAvailable.sportsbook),
    },
    reason: "first-available",
    observation: firstAvailable,
  };
}

/* -------------------------------------------------------------------------- */
/* Freshness                                                                   */
/* -------------------------------------------------------------------------- */

export type FreshnessLevel = "fresh" | "recent" | "stale" | "unknown";

export type FreshnessBasis =
  | "providerUpdatedAt"
  | "lastObservedAt"
  | "capturedAt"
  | "generatedAt"
  | "none";

/**
 * Presentation-safe freshness contract.
 *
 * `basisAt` is always a real pipeline/provider timestamp — never the page
 * render time. `evaluatedAt` (wall clock) is used ONLY to age that timestamp,
 * so a book can never look "fresh" just because the page rendered. When no
 * usable timestamp exists the level is `unknown`, not `fresh`.
 */
export interface FreshnessView {
  level: FreshnessLevel;
  basis: FreshnessBasis;
  basisAt: string | null;
  ageMs: number | null;
  evaluatedAt: string;
}

export const FRESHNESS_FRESH_MAX_MS = 6 * 60 * 60 * 1000;
export const FRESHNESS_RECENT_MAX_MS = 24 * 60 * 60 * 1000;

function levelForAge(ageMs: number): FreshnessLevel {
  if (ageMs <= FRESHNESS_FRESH_MAX_MS) return "fresh";
  if (ageMs <= FRESHNESS_RECENT_MAX_MS) return "recent";
  return "stale";
}

export function deriveFreshness(input: {
  providerUpdatedAt?: string | null;
  lastObservedAt?: string | null;
  capturedAt?: string | null;
  generatedAt?: string | null;
  now?: number;
}): FreshnessView {
  const now =
    typeof input.now === "number" && Number.isFinite(input.now)
      ? input.now
      : Date.now();
  const evaluatedAt = new Date(now).toISOString();

  const candidates: Array<[FreshnessBasis, string | null | undefined]> = [
    ["providerUpdatedAt", input.providerUpdatedAt],
    ["lastObservedAt", input.lastObservedAt],
    ["capturedAt", input.capturedAt],
    ["generatedAt", input.generatedAt],
  ];

  for (const [basis, value] of candidates) {
    if (typeof value !== "string") continue;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) continue;
    const ageMs = Math.max(0, now - timestamp);
    return { level: levelForAge(ageMs), basis, basisAt: value, ageMs, evaluatedAt };
  }

  return { level: "unknown", basis: "none", basisAt: null, ageMs: null, evaluatedAt };
}

/* -------------------------------------------------------------------------- */
/* Line movement (pure derivation)                                             */
/* -------------------------------------------------------------------------- */

export type LineMovementMarket = "spread" | "total";

export interface LineMovementPoint {
  /** Actual stored observation value. Spread uses `homeLine`; total uses `line`. */
  value: number;
  /** Timestamp that observed state was first stored. */
  at: string;
}

export interface LineMovement {
  firstObserved: number;
  current: number;
  move: number;
  points: LineMovementPoint[];
  firstObservedAt: string;
  lastObservedAt: string;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function movementValue(
  observation: BettingLineObservation,
  market: LineMovementMarket,
): number | null {
  const raw =
    market === "spread"
      ? (observation.spread?.homeLine ?? null)
      : (observation.total?.line ?? null);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Derive movement for ONE market from a single sportsbook's observations.
 *
 * - FIRST OBSERVED = earliest stored observed state (not "Open" — the provider
 *   does not supply an opening line).
 * - CURRENT = latest stored state.
 * - MOVE = current - firstObserved.
 * - `points` are only real stored observations, in chronological order.
 *   Consecutive unchanged values do not create a new state. Nothing is
 *   interpolated or fabricated.
 * - Returns `null` when this market has no usable observation (degrades
 *   independently of the other market).
 */
export function deriveLineMovement(
  observations: readonly BettingLineObservation[],
  market: LineMovementMarket,
): LineMovement | null {
  const ordered = [...observations]
    .filter((observation) => Number.isFinite(Date.parse(observation.firstObservedAt)))
    .sort(
      (left, right) =>
        Date.parse(left.firstObservedAt) - Date.parse(right.firstObservedAt) ||
        Date.parse(left.lastObservedAt) - Date.parse(right.lastObservedAt),
    );

  const points: LineMovementPoint[] = [];
  let lastObservedAt = "";
  for (const observation of ordered) {
    const value = movementValue(observation, market);
    if (value === null) continue;
    const previous = points[points.length - 1];
    if (!previous || previous.value !== value) {
      points.push({ value, at: observation.firstObservedAt });
    }
    lastObservedAt = observation.lastObservedAt;
  }

  if (points.length === 0) return null;
  const first = points[0];
  const current = points[points.length - 1];
  return {
    firstObserved: first.value,
    current: current.value,
    move: round(current.value - first.value),
    points,
    firstObservedAt: first.at,
    lastObservedAt: lastObservedAt || current.at,
  };
}

export function observationsForSportsbook(
  series: readonly BettingLineObservation[],
  sportsbookId: string,
): BettingLineObservation[] {
  return series.filter((observation) => observation.sportsbook === sportsbookId);
}

export interface LineMovementView {
  sportsbook: SelectedSportsbook;
  spread: LineMovement | null;
  total: LineMovement | null;
}

/** Line movement for the already-selected sportsbook only. */
export function buildLineMovementView(input: {
  history: BettingLinesHistoryArtifact;
  sportsbookId: string;
}): LineMovementView {
  const observations = observationsForSportsbook(
    input.history.series,
    input.sportsbookId,
  );
  return {
    sportsbook: {
      id: input.sportsbookId,
      name: sportsbookDisplayName(input.sportsbookId),
    },
    spread: deriveLineMovement(observations, "spread"),
    total: deriveLineMovement(observations, "total"),
  };
}

/* -------------------------------------------------------------------------- */
/* Current market view model                                                   */
/* -------------------------------------------------------------------------- */

export interface CurrentMarketView {
  sportsbook: SelectedSportsbook;
  selectionReason: "priority" | "first-available";
  spread: BettingLineSpread | null;
  total: BettingLineTotal | null;
  moneyline: BettingLineMoneyline | null;
  capturedAt: string;
  providerUpdatedAt: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  artifactGeneratedAt: string;
  freshness: FreshnessView;
}

export function findCurrentGame(
  artifact: BettingLinesCurrentArtifact,
  jkbGameId: string,
): BettingLinesCurrentGame | null {
  return artifact.games.find((game) => game.jkbGameId === jkbGameId) ?? null;
}

/**
 * Build the single current-market view for a matchup, using the JKB canonical
 * game id published in the artifact (e.g. `2026_01_NE_SEA`). Returns `null`
 * when the game is absent or has no usable sportsbook.
 */
export function buildCurrentMarketView(input: {
  artifact: BettingLinesCurrentArtifact;
  jkbGameId: string;
  now?: number;
}): CurrentMarketView | null {
  const game = findCurrentGame(input.artifact, input.jkbGameId);
  if (!game) return null;

  const selection = selectSportsbook(game.books);
  if (!selection) return null;

  const observation = selection.observation;
  return {
    sportsbook: selection.sportsbook,
    selectionReason: selection.reason,
    spread: observation.spread,
    total: observation.total,
    moneyline: observation.moneyline,
    capturedAt: observation.capturedAt,
    providerUpdatedAt: observation.providerUpdatedAt,
    firstObservedAt: observation.firstObservedAt || null,
    lastObservedAt: observation.lastObservedAt || null,
    artifactGeneratedAt: input.artifact.generatedAt,
    freshness: deriveFreshness({
      providerUpdatedAt: observation.providerUpdatedAt,
      lastObservedAt: observation.lastObservedAt,
      capturedAt: observation.capturedAt,
      generatedAt: input.artifact.generatedAt,
      now: input.now,
    }),
  };
}
