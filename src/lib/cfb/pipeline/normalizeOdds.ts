import type { CfbGameOdds } from "../../../data/cfb/types";
import type { CfbdLinesGameRaw } from "./types";

/** One row per (game, provider) — providers are never merged or averaged. */
export type CfbNormalizedMarketLine = {
  gameId: string;
  provider: string;
  spread: number | null;
  spreadOpen: number | null;
  total: number | null;
  totalOpen: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
};

const MAX_ABS_SPREAD = 80;
const MAX_TOTAL = 200;
const MIN_ABS_AMERICAN_ODDS = 100;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validSpread(value: number | null): number | null {
  const finite = finiteOrNull(value);
  if (finite === null) return null;
  return Math.abs(finite) <= MAX_ABS_SPREAD ? finite : null;
}

function validTotal(value: number | null): number | null {
  const finite = finiteOrNull(value);
  if (finite === null) return null;
  return finite > 0 && finite < MAX_TOTAL ? finite : null;
}

function validMoneyline(value: number | null): number | null {
  const finite = finiteOrNull(value);
  if (finite === null) return null;
  return Math.abs(finite) >= MIN_ABS_AMERICAN_ODDS ? finite : null;
}

/**
 * Normalizes the raw CFBD /lines response into one row per (game, provider).
 * Malformed individual fields (NaN, impossible totals, impossible American
 * odds) are nulled rather than dropping the whole row — a provider with a
 * good spread but a malformed moneyline should not lose the spread.
 * Spread/total sign convention matches CfbGameOdds exactly: spread is the
 * home team's spread as reported by CFBD (negative = home favored) — no
 * transform is applied here.
 */
export function normalizeCfbdLines(games: readonly CfbdLinesGameRaw[]): CfbNormalizedMarketLine[] {
  const rows: CfbNormalizedMarketLine[] = [];
  for (const game of games) {
    for (const line of game.lines ?? []) {
      if (!line.provider) continue;
      rows.push({
        gameId: String(game.id),
        provider: line.provider,
        spread: validSpread(line.spread ?? null),
        spreadOpen: validSpread(line.spreadOpen ?? null),
        total: validTotal(line.overUnder ?? null),
        totalOpen: validTotal(line.overUnderOpen ?? null),
        homeMoneyline: validMoneyline(line.homeMoneyline ?? null),
        awayMoneyline: validMoneyline(line.awayMoneyline ?? null),
      });
    }
  }
  return rows;
}

/**
 * A row is "coherent" when its spread direction and moneyline direction
 * agree — home favorite (negative spread) implies homeMoneyline more
 * favored (lower) than awayMoneyline, and vice versa for a home underdog.
 * A pick'em (spread === 0) has no directional expectation. A row missing
 * spread or either moneyline has nothing to contradict and is treated as
 * coherent. This catches the observed live-data case where a book (e.g.
 * Bovada) posts a spread on one side but an extreme sentinel-looking
 * moneyline (e.g. -100000) on the *other* side for the same game.
 */
function isCoherent(row: CfbNormalizedMarketLine): boolean {
  if (row.spread === null || row.homeMoneyline === null || row.awayMoneyline === null) return true;
  if (row.spread < 0) return row.homeMoneyline < row.awayMoneyline;
  if (row.spread > 0) return row.awayMoneyline < row.homeMoneyline;
  return true;
}

function withoutMoneylines(row: CfbNormalizedMarketLine): CfbNormalizedMarketLine {
  return { ...row, homeMoneyline: null, awayMoneyline: null };
}

/**
 * Deterministic provider-selection policy, evaluated per game:
 *   1. prefer a usable "consensus" row if CFBD ever provides one
 *   2. otherwise prefer DraftKings if usable (observed live coverage:
 *      DraftKings posts 113/2026-season games vs. Bovada's 53, and every
 *      Bovada game is a subset of DraftKings' coverage — not a brand
 *      preference, a coverage-driven one)
 *   3. otherwise the alphabetically-first remaining usable provider
 *   4. at every tier above, if the preferred row is internally
 *      incoherent (see isCoherent) and another usable row for the same
 *      game IS coherent, prefer that coherent row instead
 *   5. if no usable row for the game is coherent, keep the originally
 *      preferred row's spread/total but null its moneyline fields rather
 *      than displaying a self-contradictory price or discarding the
 *      whole market
 * Never averages/mixes fields across providers into one record — the
 * "prefer a different row" step above always swaps in another provider's
 * complete row, never blends fields. Matches the same convention already
 * established in the CFB V2 research namespace
 * (src/lib/cfb/research/phase9/marketJoin.ts pickOneRowPerGame).
 */
export function selectProviderLine(
  rows: readonly CfbNormalizedMarketLine[],
): CfbNormalizedMarketLine | null {
  const usable = rows.filter(
    (row) =>
      row.spread !== null ||
      row.total !== null ||
      row.homeMoneyline !== null ||
      row.awayMoneyline !== null,
  );
  if (usable.length === 0) return null;

  const alphabetical = [...usable].sort((a, b) => a.provider.localeCompare(b.provider));
  const consensus = alphabetical.find((row) => row.provider.toLowerCase() === "consensus");
  const draftKings = alphabetical.find((row) => row.provider.toLowerCase() === "draftkings");
  const preferred = consensus ?? draftKings ?? alphabetical[0];

  if (isCoherent(preferred)) return preferred;

  const coherentAlternative = alphabetical.find((row) => row !== preferred && isCoherent(row));
  if (coherentAlternative) return coherentAlternative;

  return withoutMoneylines(preferred);
}

/**
 * Builds one CfbGameOdds per game ID from the raw /lines response, applying
 * the provider-selection policy above. Opening fields are populated only
 * when CFBD explicitly returns a distinct non-null opening value for the
 * selected provider — never copied from current to avoid manufacturing data.
 * Games with no usable line from any provider are omitted from the map
 * (caller decides null vs. last-known-good fallback).
 */
export function buildOddsByGameId(
  games: readonly CfbdLinesGameRaw[],
): Map<string, CfbGameOdds> {
  const rows = normalizeCfbdLines(games);
  const byGame = new Map<string, CfbNormalizedMarketLine[]>();
  for (const row of rows) {
    const arr = byGame.get(row.gameId) ?? [];
    arr.push(row);
    byGame.set(row.gameId, arr);
  }
  const result = new Map<string, CfbGameOdds>();
  for (const [gameId, gameRows] of byGame) {
    const selected = selectProviderLine(gameRows);
    if (!selected) continue;
    result.set(gameId, {
      openingSpread: selected.spreadOpen,
      currentSpread: selected.spread,
      awayMoneyline: selected.awayMoneyline,
      homeMoneyline: selected.homeMoneyline,
      openingTotal: selected.totalOpen,
      currentTotal: selected.total,
    });
  }
  return result;
}
