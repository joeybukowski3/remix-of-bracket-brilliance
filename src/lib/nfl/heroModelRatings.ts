/**
 * Generated model ratings for the matchup hero (Phase 7B).
 *
 * The hero previously read `src/data/nflPreseason2026.ts` — a hand-curated
 * static file whose ratings already disagreed with the generated model. Showing
 * a static team-strength number beside model-driven matchup metrics meant the
 * page carried two contradictory rating systems, so the hero now reads the
 * active `nfl-power-v0.3.1` artifact instead.
 *
 * Nothing is derived here. Rating, rank, offense rating, defense rating and
 * their ranks all come straight from `buildPublicPowerBoard`, which is the same
 * board the /nfl landing page renders — so the two surfaces cannot drift apart.
 *
 * These are neutral-field team-strength ratings on the model's 1-99 public
 * scale, centred on 50. They are NOT a game prediction: no projected spread,
 * win probability, model edge or picked winner is produced from them.
 */

import type { NflPublicPowerBoard } from "@/lib/nfl/publicPowerRatings";

export type HeroModelRating = {
  /** Public scale rating, 1-99, centred on 50. */
  rating: number;
  rank: number;
  offenseRating: number;
  offenseRank: number;
  defenseRating: number;
  defenseRank: number;
};

/** Looks up one team's generated rating. `null` means the model is unavailable. */
export type HeroModelRatingResolver = (teamAbbr: string) => HeroModelRating | null;

/** Resolver used when the generated board has not loaded. */
export const unavailableHeroModelRatings: HeroModelRatingResolver = () => null;

/**
 * Build a hero resolver over the generated power-rating board.
 *
 * Returns nothing when the board is absent, so the hero degrades to its
 * unavailable state rather than silently falling back to a different rating
 * system.
 */
export function createHeroModelRatingResolver(
  board: NflPublicPowerBoard | null
): HeroModelRatingResolver {
  if (!board?.teams?.length) return unavailableHeroModelRatings;

  const byAbbr = new Map(
    board.teams.map((team) => [
      team.abbr,
      {
        rating: team.publicRating,
        rank: team.rank,
        offenseRating: team.offenseRating,
        offenseRank: team.offRank,
        defenseRating: team.defenseRating,
        defenseRank: team.defRank,
      },
    ])
  );

  return (teamAbbr: string) => byAbbr.get(teamAbbr) ?? null;
}

/**
 * Display a public-scale rating.
 *
 * Deliberately NOT formatted as a percentage. The retired static values were
 * signed percentages above average ("+7.69%"); a v0.3 rating is a 1-99 scale
 * value centred on 50, and labelling it "%" would misstate what it is.
 */
export function formatHeroModelRating(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(1);
}
