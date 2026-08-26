/**
 * Phase 10C: operational coverage QA and readiness gate for the Phase 10B
 * canonical NFL yardage-market layer.
 *
 * Nothing here touches projection models, matchup scores, player
 * eligibility, main-line selection policy, or identity matching -- it only
 * measures how much of the market has actually been posted against a
 * simple, structural (not statistical) roster-based candidate estimate, so
 * we know when there is enough real market coverage to bother comparing
 * against projections in Phase 11.
 */
import { classifyBook } from "./nfl-book-classification.mjs";
import { MARKET_PLAUSIBLE_POSITIONS, PASSING_YARDS_MARKET, RECEIVING_YARDS_MARKET, RUSHING_YARDS_MARKET } from "./nfl-prop-line-selection.mjs";

/**
 * Structural (roster-slot-based, not statistical) candidate-universe
 * estimate: "how many players would plausibly have this yardage prop
 * posted somewhere, for teams playing this week." Deliberately coarse --
 * this is a QA denominator only, never a source of player eligibility for
 * the actual projection pipeline (see `currentWeekRosterUniverse.ts` for
 * that, which this module does not read or alter):
 *
 *   passingYards:   depth-chart rank-1 QB per team              (~1/team)
 *   rushingYards:   depth-chart rank-1 RB + rank-1 QB per team  (~2/team)
 *   receivingYards: depth-chart rank-1/2 WR + rank-1 TE per team (~3/team)
 */
const CANDIDATE_SLOT_RULES = Object.freeze({
  [PASSING_YARDS_MARKET]: Object.freeze([{ position: "QB", maxRank: 1 }]),
  [RUSHING_YARDS_MARKET]: Object.freeze([
    { position: "RB", maxRank: 1 },
    { position: "QB", maxRank: 1 },
  ]),
  [RECEIVING_YARDS_MARKET]: Object.freeze([
    { position: "WR", maxRank: 2 },
    { position: "TE", maxRank: 1 },
  ]),
});

/** Earliest week among games not yet final -- i.e. the week the market is currently being posted for. */
export function resolveCurrentWeek(games) {
  const upcoming = (Array.isArray(games) ? games : [])
    .filter((g) => g.status === "scheduled")
    .map((g) => g.week)
    .filter((w) => Number.isFinite(w));
  return upcoming.length ? Math.min(...upcoming) : null;
}

/**
 * @param {readonly {team:string, position:string, depthRank?:number}[]} depthChartEntries  Rows already filtered to QB/RB/WR/TE.
 * @param {readonly {team:string, position:string, depthRank:number}[]} depthChartEntriesWithRank  Same rows but rank-annotated (from the raw CSV -- see caller).
 * @param {ReadonlySet<string>} currentWeekTeams  Lowercase team abbrs playing in the current week.
 */
export function computeCandidateCounts(depthChartEntriesWithRank, currentWeekTeams) {
  const counts = { [PASSING_YARDS_MARKET]: 0, [RUSHING_YARDS_MARKET]: 0, [RECEIVING_YARDS_MARKET]: 0 };
  for (const market of Object.keys(CANDIDATE_SLOT_RULES)) {
    const seen = new Set(); // team|position|rank -- avoids double counting a duplicate source row
    for (const entry of depthChartEntriesWithRank) {
      if (!currentWeekTeams.has(entry.team)) continue;
      const rule = CANDIDATE_SLOT_RULES[market].find((r) => r.position === entry.position);
      if (!rule || !(entry.depthRank <= rule.maxRank)) continue;
      const key = `${entry.team}|${entry.position}|${entry.depthRank}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[market] += 1;
    }
  }
  return counts;
}

export function computeCoveragePercentages(canonicalCounts, candidateCounts) {
  const percentages = {};
  for (const market of Object.keys(candidateCounts)) {
    const candidates = candidateCounts[market] ?? 0;
    const canonical = canonicalCounts[market] ?? 0;
    percentages[market] = candidates > 0 ? Number(((canonical / candidates) * 100).toFixed(1)) : null;
  }
  return percentages;
}

/**
 * Per-approved-book row counts (all quotes, any sidedness) plus one-sided
 * approved-book rows and players observed ONLY on unapproved providers.
 * Never counts novig/prizepicks/sleeper toward sportsbook coverage.
 */
export function computeBookCoverage(allQuotes) {
  const rowsByBook = {};
  let oneSidedApprovedRows = 0;
  const playerHasApproved = new Map(); // player -> boolean

  for (const quote of allQuotes) {
    const isApproved = classifyBook(quote.bookmaker) === "sportsbook";
    if (isApproved) {
      rowsByBook[quote.bookmaker] = (rowsByBook[quote.bookmaker] ?? 0) + 1;
      if (!quote.twoSided) oneSidedApprovedRows += 1;
    }
    const prior = playerHasApproved.get(quote.player) ?? false;
    playerHasApproved.set(quote.player, prior || isApproved);
  }

  const playersWithOnlyUnapprovedObservations = [...playerHasApproved.entries()].filter(([, hasApproved]) => !hasApproved).length;

  return { rowsByBook, oneSidedApprovedRows, playersWithOnlyUnapprovedObservations };
}

/**
 * Operational Phase 11 readiness gate. This is a repeatability/volume gate
 * ONLY -- it says nothing about betting quality or statistical confidence.
 * Thresholds are a structural approximation of "roughly one full week's
 * worth of starter-level lines per market" (~32 teams): 20 passing / 40
 * rushing / 80 receiving mirrors the ~1/~2/~3 candidate-per-team slot rules
 * above. Adjust these constants directly if the candidate-universe rules
 * above change -- there is no statistical tuning involved.
 */
export const READINESS_GATE_THRESHOLDS = Object.freeze({
  [PASSING_YARDS_MARKET]: 20,
  [RUSHING_YARDS_MARKET]: 40,
  [RECEIVING_YARDS_MARKET]: 80,
});

export function evaluateReadinessGate(canonicalCounts) {
  const byMarket = {};
  let overallReady = true;
  for (const market of Object.keys(READINESS_GATE_THRESHOLDS)) {
    const count = canonicalCounts[market] ?? 0;
    const threshold = READINESS_GATE_THRESHOLDS[market];
    const ready = count >= threshold;
    byMarket[market] = { count, threshold, ready };
    if (!ready) overallReady = false;
  }
  return { overallReady, byMarket };
}

export { MARKET_PLAUSIBLE_POSITIONS };
