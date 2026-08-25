/**
 * Re-export shim. The canonical implementation lives in
 * `src/lib/nfl/identity/identity.ts` -- generic gsis-id player identity and
 * NFL team-code normalization, not fantasy-specific. Extracted so
 * `src/lib/nfl/props/**` (NFL yardage props) and this fantasy module consume
 * the exact same implementation instead of duplicating it. Every symbol
 * below keeps its original fantasy name so no existing fantasy import
 * needs to change; see `identity.test.ts` in both this directory and
 * `src/lib/nfl/identity/` for the behavior-preservation proof.
 */
export type {
  NflExternalIds as FantasyExternalIds,
  NflCanonicalPlayerIdentity as CanonicalPlayerIdentity,
  NflWeekEffectiveTeamAssignment as WeekEffectiveTeamAssignment,
  NflIdentityResolution as IdentityResolution,
} from "@/lib/nfl/identity/identity";
export {
  canonicalPlayerId,
  normalizeNflTeamAbbr,
  resolveCanonicalPlayerIdentity,
  resolveWeekEffectiveTeam,
} from "@/lib/nfl/identity/identity";
