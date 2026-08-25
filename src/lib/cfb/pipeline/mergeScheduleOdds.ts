import type { CfbGame, CfbGameOdds } from "../../../data/cfb/types";

const EMPTY_ODDS: CfbGameOdds = Object.freeze({
  openingSpread: null,
  currentSpread: null,
  awayMoneyline: null,
  homeMoneyline: null,
  openingTotal: null,
  currentTotal: null,
});

/**
 * Merges freshly-normalized market odds into a schedule, joined strictly by
 * CFBD game ID (never team name/date). Last-known-good policy:
 * - `freshOddsByGameId === null` means the /lines endpoint fetch itself
 *   failed (raw cache missing/unreadable) — every game falls back to its
 *   previously-committed odds rather than being nulled out.
 * - When the fetch succeeded but a specific game has no usable line from any
 *   provider, that game also falls back to its previously-committed odds
 *   (a market briefly dropping from the response should not flicker to
 *   null) — new games with no prior committed odds correctly show null.
 * - When fresh odds exist for a game, they always win.
 */
export function mergeScheduleOdds(
  schedule: readonly CfbGame[],
  freshOddsByGameId: ReadonlyMap<string, CfbGameOdds> | null,
  previousOddsByGameId: ReadonlyMap<string, CfbGameOdds>,
): CfbGame[] {
  return schedule.map((game) => {
    const fresh = freshOddsByGameId?.get(game.id);
    const odds = fresh ?? previousOddsByGameId.get(game.id) ?? EMPTY_ODDS;
    return { ...game, odds };
  });
}

/** Builds the previous-odds lookup from a previously-generated schedule artifact. */
export function previousOddsByGameId(
  previousSchedule: readonly Pick<CfbGame, "id" | "odds">[],
): Map<string, CfbGameOdds> {
  return new Map(previousSchedule.map((game) => [game.id, game.odds]));
}
