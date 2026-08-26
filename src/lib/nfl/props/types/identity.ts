/**
 * NFL props consumes the canonical shared identity module directly --
 * `src/lib/nfl/identity/identity.ts` -- not through the fantasy namespace.
 * (Originally this file re-exported from `@/lib/fantasy/weekly/identity`;
 * that dependency direction was corrected by extracting the generic
 * identity logic into `src/lib/nfl/identity/**`, which the fantasy module
 * now itself re-exports from. See that module's header comment.)
 */
export type {
  NflPosition as NflPropPosition,
  NflCanonicalPlayerIdentity as NflPropCanonicalPlayerIdentity,
  NflExternalIds as NflPropExternalIds,
  NflIdentityResolution as NflPropIdentityResolution,
} from "@/lib/nfl/identity/identity";
export {
  canonicalPlayerId as nflPropCanonicalPlayerId,
  normalizeNflTeamAbbr as normalizeNflPropTeamAbbr,
  resolveCanonicalPlayerIdentity as resolveNflPropPlayerIdentity,
} from "@/lib/nfl/identity/identity";
