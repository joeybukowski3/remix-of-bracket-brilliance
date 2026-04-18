import { cadillacChampionship2026PicksTournament } from "@/data/pga/generated/cadillac-championship-2026-picks";
import { zurichClassicOfNewOrleans2026PicksTournament } from "@/data/pga/generated/zurich-classic-of-new-orleans-2026-picks";
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";

export const GENERATED_PGA_TOURNAMENTS = [
  cadillacChampionship2026PicksTournament,
  zurichClassicOfNewOrleans2026PicksTournament,
] as const satisfies readonly PgaTournamentConfig[];
