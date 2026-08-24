import type { CfbdResearchLinesGameRaw, CfbResearchMarketLine } from "../types";

const SOURCE_SEMANTICS =
  "cfbd-v2-lines: spread/overUnder are unqualified, provider-reported latest-observed " +
  "values (CFBD does not document them as closing lines). spreadOpen/overUnderOpen are " +
  "populated only when CFBD explicitly returns a non-null opening value. observedAtUtc " +
  "is always null — CFBD's /lines response has no per-line timestamp.";

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * One row per (game, provider) — providers are never merged or averaged.
 * CFBD itself sometimes includes a "consensus" provider string in the
 * `lines` array; that is passed through like any other provider value,
 * never computed or synthesized here (see MARKET QA COLLECTION constraints).
 */
export function normalizeResearchMarketLines(
  games: readonly CfbdResearchLinesGameRaw[],
): CfbResearchMarketLine[] {
  const rows: CfbResearchMarketLine[] = [];
  for (const game of games) {
    for (const line of game.lines) {
      rows.push({
        gameId: String(game.id),
        provider: line.provider,
        spreadOpen: finiteOrNull(line.spreadOpen),
        spreadLatestObserved: finiteOrNull(line.spread),
        totalOpen: finiteOrNull(line.overUnderOpen),
        totalLatestObserved: finiteOrNull(line.overUnder),
        homeMoneyline: finiteOrNull(line.homeMoneyline),
        awayMoneyline: finiteOrNull(line.awayMoneyline),
        observedAtUtc: null,
        sourceSemantics: SOURCE_SEMANTICS,
      });
    }
  }
  return rows;
}
