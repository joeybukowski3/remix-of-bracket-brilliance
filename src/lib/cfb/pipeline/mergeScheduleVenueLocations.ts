import type { CfbGame } from "../../../data/cfb/types";
import type { CfbdGame, CfbdVenue } from "./types";

export type CfbVenueLocation = { city: string | null; state: string | null };

/** Empty strings (e.g. CFBD's state for non-US venues) are not a location — normalize to null. */
const cleanString = (value: string | null | undefined): string | null =>
  value && value.trim().length > 0 ? value.trim() : null;

/** Builds venueId -> {city, state} from the raw CFBD /venues cache. */
export function buildVenueLocationById(
  venues: readonly CfbdVenue[],
): Map<number, CfbVenueLocation> {
  return new Map(
    venues.map((venue) => [
      venue.id,
      { city: cleanString(venue.city), state: cleanString(venue.state) },
    ]),
  );
}

/**
 * Builds CFBD game ID -> venueId from the raw /games cache. The committed
 * schedule artifact stores venue name only (never an ID), so this bridge is
 * required to join in city/state without fuzzy venue-name matching.
 */
export function buildVenueIdByGameId(rawGames: readonly CfbdGame[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const game of rawGames) {
    if (game.venueId != null) map.set(String(game.id), game.venueId);
  }
  return map;
}

/**
 * Merges verified venue city/state into a schedule, joined strictly by CFBD
 * venue ID (never venue-name matching, never a home team's city). A game
 * whose venueId is unmapped or missing from /venues keeps venue name only —
 * it never falls back to a guessed location.
 */
export function mergeScheduleVenueLocations(
  schedule: readonly CfbGame[],
  venueIdByGameId: ReadonlyMap<string, number>,
  venueLocationById: ReadonlyMap<number, CfbVenueLocation>,
): CfbGame[] {
  return schedule.map((game) => {
    const venueId = venueIdByGameId.get(game.id);
    const location = venueId != null ? venueLocationById.get(venueId) : undefined;
    return {
      ...game,
      venueCity: location?.city ?? null,
      venueState: location?.state ?? null,
    };
  });
}
