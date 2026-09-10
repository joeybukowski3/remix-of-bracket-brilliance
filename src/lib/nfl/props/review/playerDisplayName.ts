import { playerSurname } from "@/lib/nfl/playerSurname";

/**
 * Presentation-only last-name extraction for the compact mobile row. Never
 * used for lookups/keys. Delegates to the shared, suffix-aware
 * `playerSurname` helper (handles Jr./Sr./II-V, hyphens and apostrophes).
 */
export function lastNameOf(fullName: string): string {
  return playerSurname(fullName);
}
