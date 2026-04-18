import { rbcHeritage2026Tournament } from "@/data/pga/tournaments/rbc-heritage-2026";
import { wellsFargoChampionship2026Tournament } from "@/data/pga/tournaments/wells-fargo-championship-2026";
import { FEATURED_PGA_TOURNAMENT_SLUG } from "@/data/pga/featuredTournament";
import { GENERATED_PGA_TOURNAMENTS } from "@/data/pga/generated/registry";
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";

const LEGACY_PGA_TOURNAMENTS = [
  rbcHeritage2026Tournament,
  wellsFargoChampionship2026Tournament,
] as const satisfies readonly PgaTournamentConfig[];

export const PGA_TOURNAMENTS = dedupeTournamentsBySlug([
  ...LEGACY_PGA_TOURNAMENTS,
  ...GENERATED_PGA_TOURNAMENTS,
]);

export const FEATURED_PGA_TOURNAMENT =
  PGA_TOURNAMENTS.find((tournament) => tournament.slug === FEATURED_PGA_TOURNAMENT_SLUG)
  ?? PGA_TOURNAMENTS.find((tournament) => tournament.featured)
  ?? PGA_TOURNAMENTS[0];

export function getPgaTournamentBySlug(slug: string | undefined) {
  if (!slug) return null;
  return PGA_TOURNAMENTS.find((tournament) => tournament.slug === slug) ?? null;
}

function dedupeTournamentsBySlug(tournaments: readonly PgaTournamentConfig[]) {
  const seen = new Map<string, PgaTournamentConfig>();
  tournaments.forEach((tournament) => {
    if (!seen.has(tournament.slug)) {
      seen.set(tournament.slug, tournament);
    }
  });
  return Array.from(seen.values()) as readonly PgaTournamentConfig[];
}
