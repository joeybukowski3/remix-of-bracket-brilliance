/**
 * Shared, side-effect-free join helpers for the MLB daily model card live
 * adapters. These only look up and attach already-computed fields from the
 * frozen production artifact (hr-props-raw.json) -- they never rank, score,
 * select, or infer anything. All HR/K row SELECTION happens upstream in the
 * shared TypeScript selectors (src/lib/mlb/hrPropSocialSelection.ts,
 * src/lib/mlb/mlbSocialSelection.ts, src/lib/mlb/kPropValueSorting.ts) --
 * see scripts/generate-social-card-live.ts.
 */

/** @param {{ games?: Array<object> }} raw */
export function buildGameLookup(raw) {
  const byGameKey = new Map();
  for (const game of raw?.games ?? []) {
    if (game?.gameKey) byGameKey.set(String(game.gameKey), game);
  }
  return byGameKey;
}

/**
 * Home/away for a row (batter or pitcher) with a `gameKey` and `team`,
 * resolved strictly against the matching game's stored home/away team codes.
 * Returns null (never a guess) when the game or team code can't be matched.
 */
export function venueSideForRow(row, gameLookup) {
  const game = gameLookup.get(String(row?.gameKey ?? ''));
  if (!game) return null;
  const team = String(row?.team ?? '').trim().toUpperCase();
  if (!team) return null;
  if (team === String(game.homeTeam ?? '').trim().toUpperCase()) return 'home';
  if (team === String(game.awayTeam ?? '').trim().toUpperCase()) return 'away';
  return null;
}

export function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses a stored American-odds display string ("+175", "-120") back to a number. Returns null for anything else -- never fabricates a price. */
export function parseAmericanOddsString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[+-]\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
