// Client-side flat-bet ROI helper for the /mlb/performance-preview compact
// tracker. Mirrors the exact formula in scripts/lib/mlb-hr-performance-summary.mjs
// (americanOddsToImplied / flatBetPayout / buildPerformanceSummary) so a
// client-recomputed ROI for a filtered (windowed + categorized) population
// never disagrees with the pre-generated all-time ROI's methodology -- only
// the population differs.

export function parseAmericanOdds(odds: string | null | undefined): number | null {
  if (odds == null) return null;
  const n = Number(String(odds).replace(/[^0-9+\-.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Payout per $100 flat stake: -100 on a loss, else the American-odds payout. */
export function flatBetPayout(odds: string | null | undefined, isWin: boolean): number | null {
  const n = parseAmericanOdds(odds);
  if (n == null) return null;
  if (!isWin) return -100;
  return n > 0 ? n : (100 * 100) / -n;
}

export interface FlatBetRoiEntry {
  odds: string | null | undefined;
  isWin: boolean;
}

/**
 * Flat-bet ROI percent across entries carrying a parseable odds value.
 * Entries with no odds are excluded from both numerator and denominator
 * (never treated as a $0 stake or a loss) -- returns null when nothing in
 * the population has usable odds, never a fabricated 0%.
 */
export function computeFlatBetRoi(entries: FlatBetRoiEntry[]): number | null {
  const withOdds = entries.filter((entry) => parseAmericanOdds(entry.odds) != null);
  if (withOdds.length === 0) return null;
  const totalPayout = withOdds.reduce((sum, entry) => sum + (flatBetPayout(entry.odds, entry.isWin) ?? 0), 0);
  const totalStaked = withOdds.length * 100;
  return Math.round((totalPayout / totalStaked) * 1000) / 10;
}

export function oddsCoveragePercent(entries: FlatBetRoiEntry[]): number {
  if (entries.length === 0) return 0;
  const withOdds = entries.filter((entry) => parseAmericanOdds(entry.odds) != null).length;
  return Math.round((withOdds / entries.length) * 1000) / 10;
}
