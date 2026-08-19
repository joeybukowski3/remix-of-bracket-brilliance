/**
 * Generated model ratings for the matchup hero and matchup comparison surfaces.
 *
 * `rating` / `rank` / `offenseRating` / `offenseRank` / `defenseRating` /
 * `defenseRank` all come from the single canonical Current Power Board
 * (src/lib/nfl/currentRating2026.ts, built by useNflCurrentRating2026()).
 * This resolver never separately joins the raw v0.3.1 OFF/DEF public board —
 * OFF/DEF are now blended (preseason v0.3.1 anchor + live Team Performance
 * Rating) exactly like OVR is, by the same shared blend helper, so reading
 * them from anywhere else would silently diverge from what every other
 * surface on the site shows for the same team.
 *
 * A team absent from the universal board resolves to `null` here, exactly
 * like the old "model unavailable" state — this resolver has no partial
 * result: either all four numbers are available for a team, or none are.
 */

import type { CurrentRatingBoard } from "@/lib/nfl/currentRating2026";

export type HeroModelRating = {
  /** Universal current 2026 OVR, public scale 1-99, centred on 50. */
  rating: number;
  /** Universal current 2026 league rank, 1-32. */
  rank: number;
  /** Universal current 2026 OFF rating, public scale 1-99. */
  offenseRating: number;
  offenseRank: number;
  /** Universal current 2026 DEF rating, public scale 1-99. */
  defenseRating: number;
  defenseRank: number;
};

/** Looks up one team's generated rating. `null` means the universal model is unavailable for this team. */
export type HeroModelRatingResolver = (teamAbbr: string) => HeroModelRating | null;

/** Resolver used when the universal current-rating board has not loaded. */
export const unavailableHeroModelRatings: HeroModelRatingResolver = () => null;

/**
 * Build a hero resolver over the universal current-rating board — OVR, OFF,
 * and DEF all come from the same board, joined by abbreviation.
 *
 * Returns the unavailable resolver when the universal board is absent.
 */
export function createHeroModelRatingResolver(
  currentRating: CurrentRatingBoard | null
): HeroModelRatingResolver {
  if (!currentRating?.teams?.length) return unavailableHeroModelRatings;

  const byAbbr = new Map<string, HeroModelRating>(
    currentRating.teams.map((row) => [
      row.abbr,
      {
        rating: row.rating,
        rank: row.rank,
        offenseRating: row.offenseRating,
        offenseRank: row.offenseRank,
        defenseRating: row.defenseRating,
        defenseRank: row.defenseRank,
      },
    ])
  );

  return (teamAbbr: string) => byAbbr.get(teamAbbr) ?? null;
}

/**
 * Display a public-scale rating.
 *
 * Deliberately NOT formatted as a percentage. A rating is a 1-99 scale value
 * centred on 50, and labelling it "%" would misstate what it is.
 */
export function formatHeroModelRating(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(1);
}
