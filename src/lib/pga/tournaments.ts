import { rbcHeritage2026Tournament } from "@/data/pga/tournaments/rbc-heritage-2026";
import { wellsFargoChampionship2026Tournament } from "@/data/pga/tournaments/wells-fargo-championship-2026";
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";

export const PGA_TOURNAMENTS = [
  rbcHeritage2026Tournament,
  wellsFargoChampionship2026Tournament,
] as const satisfies readonly PgaTournamentConfig[];

export const FEATURED_PGA_TOURNAMENT =
  PGA_TOURNAMENTS.find((tournament) => tournament.featured) ?? PGA_TOURNAMENTS[0];

export function getPgaTournamentBySlug(slug: string | undefined) {
  if (!slug) return null;
  return PGA_TOURNAMENTS.find((tournament) => tournament.slug === slug) ?? null;
}
