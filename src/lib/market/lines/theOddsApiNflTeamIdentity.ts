/**
 * Deterministic mapping from a The Odds API NFL team name to the canonical
 * nflverse team code used by JKB's NFL schedule identity.
 *
 * The Odds API returns full club names ("San Francisco 49ers", "Washington
 * Commanders"). Those are resolved through the reviewed full-name table already
 * maintained for the SportsDataIO boundary, then folded to the canonical
 * nflverse token by {@link normalizeNflTeamAbbr}. There is no fuzzy matching —
 * an unrecognised name returns `null` and the caller reports the game unmatched.
 */

import { normalizeNflTeamAbbr } from "../../nfl/identity/identity";
import { resolveSportsDataIoNflTeamAbbr } from "../providers/sportsDataIoNflTeamIdentity";

export function resolveTheOddsApiNflTeamId(
  teamName: string | null | undefined,
): string | null {
  const abbr = resolveSportsDataIoNflTeamAbbr(teamName);
  if (abbr === null) return null;
  return normalizeNflTeamAbbr(abbr);
}
