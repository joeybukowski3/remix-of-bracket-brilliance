/**
 * Zero-cost capacity planning for the NBA pipeline (Phase 5B).
 *
 * Pure arithmetic over provider-reported counters. Nothing here reads a
 * network, an environment variable or a secret. The inputs are observations
 * the repository already commits (the NFL job's quota-state.json) and the
 * documented plan limits; every output is an estimate to be re-measured, not
 * a guarantee.
 */
import { creditsPerCapture } from "./budget";

/** One provider-reported reading of the month counter. */
export interface QuotaObservation {
  at: string;
  used: number;
}

export interface BurnSummary {
  observations: number;
  /** Times the counter fell between readings, read as a monthly reset; those intervals are not counted. */
  resets: number;
  elapsedDays: number;
  creditsUsed: number;
  meanPerDay: number | null;
  /** Highest single-interval daily rate seen. */
  peakPerDay: number | null;
  projectedMonthly: number | null;
}

const DAY_MS = 86_400_000;

export function summarizeBurn(observations: readonly QuotaObservation[], daysInMonth = 31): BurnSummary {
  const sorted = [...observations].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let resets = 0;
  let elapsedDays = 0;
  let creditsUsed = 0;
  let peak: number | null = null;
  for (let i = 1; i < sorted.length; i += 1) {
    const days = (Date.parse(sorted[i].at) - Date.parse(sorted[i - 1].at)) / DAY_MS;
    if (!(days > 0)) continue;
    const delta = sorted[i].used - sorted[i - 1].used;
    if (delta < 0) {
      resets += 1;
      continue;
    }
    elapsedDays += days;
    creditsUsed += delta;
    peak = Math.max(peak ?? 0, delta / days);
  }
  const meanPerDay = elapsedDays > 0 ? creditsUsed / elapsedDays : null;
  return {
    observations: sorted.length,
    resets,
    elapsedDays,
    creditsUsed,
    meanPerDay,
    peakPerDay: peak,
    projectedMonthly: meanPerDay === null ? null : meanPerDay * daysInMonth,
  };
}

export interface DatedCredits {
  at: string;
  credits: number;
}

export interface IntervalReconciliation {
  /** Time of the later of the two counter readings. */
  endAt: string;
  days: number;
  /** Credits the provider's counter rose by. */
  delta: number;
  nflLines: number;
  yardage: number;
  mlb: number;
  /** delta minus everything the committed artifacts account for. This is what stays unattributed. */
  residual: number;
}

/**
 * Splits each rise of the provider's counter between two readings into what the repository's COMMITTED
 * artifacts prove (the NFL job's own call, the yardage cross-check's event count, MLB odds writes sourced
 * from The Odds API) and a residual. The residual is an upper bound on unexplained spend: a run that spent
 * credits but committed nothing is in it. Intervals where the counter fell (a monthly reset) are skipped.
 */
export function reconcileIntervals(readings: ReadonlyArray<QuotaObservation & { lastCost: number | null }>, yardage: readonly DatedCredits[], mlb: readonly DatedCredits[]): IntervalReconciliation[] {
  const sorted = [...readings].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const within = (items: readonly DatedCredits[], from: number, to: number) => items.filter((i) => Date.parse(i.at) > from && Date.parse(i.at) <= to).reduce((sum, i) => sum + i.credits, 0);
  const out: IntervalReconciliation[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const from = Date.parse(sorted[i - 1].at);
    const to = Date.parse(sorted[i].at);
    const delta = sorted[i].used - sorted[i - 1].used;
    if (delta < 0 || !(to > from)) continue;
    const nflLines = sorted[i].lastCost ?? 0;
    const y = within(yardage, from, to);
    const m = within(mlb, from, to);
    out.push({ endAt: sorted[i].at, days: (to - from) / DAY_MS, delta, nflLines, yardage: y, mlb: m, residual: delta - nflLines - y - m });
  }
  return out;
}

/** Variance cushion on a projected monthly burn; the observed month-to-month spread was about 3%. */
export const DEFAULT_PEER_MARGIN = 0.05;

export interface HeadroomInput {
  planLimit: number;
  /** Credits the NFL job refuses to go below (its own quota guard). */
  guardFloor: number;
  /** Projected monthly credits the other sports will use. */
  peerMonthly: number;
  margin?: number;
}

/** Whole credits per month NBA could add without pushing the pool under the guard floor. Never negative. */
export function freeHeadroom(input: HeadroomInput): number {
  const peer = input.peerMonthly * (1 + (input.margin ?? DEFAULT_PEER_MARGIN));
  return Math.max(0, Math.floor(input.planLimit - input.guardFloor - peer));
}

export interface PeerReserveInput {
  peerPerDay: number;
  daysLeft: number;
  floor: number;
  margin?: number;
}

/** Credits that must remain after an NBA call so the other sports can finish the month. */
export function peerReserveCredits(input: PeerReserveInput): number {
  return input.floor + Math.ceil(input.peerPerDay * Math.max(0, input.daysLeft) * (1 + (input.margin ?? DEFAULT_PEER_MARGIN)));
}

/** NBA regular season: 1,230 games over about 177 days, so about 210 games in a 30-day month. */
export const AVERAGE_GAMES_PER_NIGHT = 7.5;
export const GAME_NIGHTS_PER_MONTH = 28;

export interface CoverageInput {
  monthlyCredits: number;
  marketsPerGame: number;
  regionEquivalents?: number;
  gameNightsPerMonth?: number;
  averageGamesPerNight?: number;
}

export interface Coverage {
  creditsPerGame: number;
  gamesPerMonth: number;
  gamesPerNight: number;
  /** Share of an average slate this allowance can capture, 0 to 1. */
  shareOfAverageSlate: number;
}

export function coverage(input: CoverageInput): Coverage {
  const nights = input.gameNightsPerMonth ?? GAME_NIGHTS_PER_MONTH;
  const slate = input.averageGamesPerNight ?? AVERAGE_GAMES_PER_NIGHT;
  const creditsPerGame = creditsPerCapture(input.marketsPerGame, input.regionEquivalents ?? 1);
  const gamesPerMonth = Math.floor(Math.max(0, input.monthlyCredits) / creditsPerGame);
  const gamesPerNight = gamesPerMonth / nights;
  return { creditsPerGame, gamesPerMonth, gamesPerNight, shareOfAverageSlate: Math.min(1, gamesPerNight / slate) };
}

/** Measured size of one synthetic points snapshot as stored JSON (Phase 5B probe). */
export const MEASURED_SNAPSHOT_JSON_BYTES = 1424;

export interface StorageInput {
  snapshotsPerGame: number;
  games: number;
  jsonBytes?: number;
  /** Row header, key columns and indexes on top of the JSON; an estimate, unverified on a real Postgres. */
  rowOverheadFactor?: number;
  /** Result and evaluation rows kept per snapshot, as a fraction of the snapshot bytes. */
  relatedRecordFactor?: number;
}

export function estimateStorageMb(input: StorageInput): number {
  const bytes = input.snapshotsPerGame * input.games * (input.jsonBytes ?? MEASURED_SNAPSHOT_JSON_BYTES) * (input.rowOverheadFactor ?? 1.4) * (1 + (input.relatedRecordFactor ?? 0.4));
  return bytes / 1_000_000;
}

/**
 * Spend on the shared Odds API pool, in credits per day, from the Oct 1 16:56 to Oct 13 20:51 window
 * (12.16 days, 154 credits): every logged Odds API call in that workflow's Actions logs, reconciled
 * against the provider's own counter.
 */
export interface SpendComponent {
  id: string;
  perDay: number;
  basis: string;
}

export const PEER_COMPONENTS: readonly SpendComponent[] = Object.freeze([
  { id: "nfl-lines", perDay: 2.96, basis: "12 logged 3-credit league calls (nfl-betting-lines-daily), one per day." },
  { id: "mlb-logged", perDay: 5.18, basis: "63 logged 1-credit h2h calls: 58 Generate MLB Data (scheduled and manual) + 5 Props Value Refresh." },
  { id: "mlb-adjacent", perDay: 1.56, basis: "19 credits that appeared next to MLB runs with no logged call (Props Value Refresh shows 5 calls in 33 runs). Probably MLB; treated as a peer until shown otherwise." },
  { id: "nfl-yardage-crosscheck", perDay: 0.82, basis: "NFL Yardage Market diagnostic cross-check: free /events, then 2 one-credit event calls per run. 5 committed runs in the window = 10 credits, read from crossCheck.eventsChecked in the committed artifact. A lower bound: a run that committed nothing is not counted." },
  { id: "unattributed-residual", perDay: 2.14, basis: "What is left of the +3 credit jump before almost every NFL run (12 of 12 days) after the cross-check above. No workflow log or committed artifact in this repository accounts for it. Not attributed; reserved." },
]);

/** Components whose spend has no known owner. They are reserved in full and never assumed to stop. */
export const UNATTRIBUTED_COMPONENT_IDS: readonly string[] = Object.freeze(["unattributed-residual"]);

export interface Scenario {
  id: string;
  label: string;
  active: readonly string[];
}

export const SEASON_SCENARIOS: readonly Scenario[] = Object.freeze([
  { id: "now", label: "As measured (MLB on)", active: ["nfl-lines", "mlb-logged", "mlb-adjacent", "nfl-yardage-crosscheck", "unattributed-residual"] },
  { id: "mlb-off-planning", label: "MLB + NCAAB off, every unexplained credit still reserved", active: ["nfl-lines", "mlb-adjacent", "nfl-yardage-crosscheck", "unattributed-residual"] },
  { id: "mlb-off-expected", label: "MLB + NCAAB off, MLB-adjacent credits stop too", active: ["nfl-lines", "nfl-yardage-crosscheck", "unattributed-residual"] },
  { id: "nfl-only", label: "Stretch: only the logged NFL call remains", active: ["nfl-lines"] },
]);

export function scenarioPeerMonthly(scenario: Scenario, daysInMonth = 31): number {
  const perDay = PEER_COMPONENTS.filter((c) => scenario.active.includes(c.id)).reduce((sum, c) => sum + c.perDay, 0);
  return perDay * daysInMonth;
}

export interface HybridInput {
  monthlyCredits: number;
  /** Games in the month the pipeline could cover. */
  gamesPerMonth: number;
  /** Highest-interest games per night that get the full market set. */
  topGamesPerNight: number;
  nights?: number;
  topMarkets?: number;
  baseMarkets?: number;
}

export interface HybridPlan {
  topGames: number;
  baseGames: number;
  creditsUsed: number;
  /** Games with any capture, over gamesPerMonth, 0 to 1. */
  share: number;
}

/**
 * The top games each night are funded first with the full market set; what is left buys the base market
 * (points) for as many remaining games as it covers. Which games are "top" is the caller's ordering.
 */
export function hybridPlan(input: HybridInput): HybridPlan {
  const nights = input.nights ?? GAME_NIGHTS_PER_MONTH;
  const topMarkets = input.topMarkets ?? 3;
  const baseMarkets = input.baseMarkets ?? 1;
  const credits = Math.max(0, input.monthlyCredits);
  const topGames = Math.min(input.gamesPerMonth, Math.floor(credits / topMarkets), Math.round(input.topGamesPerNight * nights));
  const left = credits - topGames * topMarkets;
  const baseGames = Math.min(Math.max(0, input.gamesPerMonth - topGames), Math.floor(left / baseMarkets));
  return { topGames, baseGames, creditsUsed: topGames * topMarkets + baseGames * baseMarkets, share: input.gamesPerMonth > 0 ? (topGames + baseGames) / input.gamesPerMonth : 0 };
}
