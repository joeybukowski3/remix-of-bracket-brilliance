/**
 * ROS projection authority -- Phase 1 identity crosswalk.
 *
 * Builds a deterministic join from JKB workbook rows (`FANTASY_RANKINGS`) to
 * PAR consensus rows (`Source ID`, a PFR id) to a canonical GSIS player
 * identity, reusing the already-approved consensus name join
 * (`rosPlayerIdentity.ts`) and the already-approved production identity
 * resolver (`weekly/productionIdentity.ts`). No fuzzy/similarity matching is
 * introduced here; every non-exact step is a reviewed, literal alias table.
 */
import { CONSENSUS_NAME_ALIASES, normalizedFantasyPlayerKey } from "@/lib/fantasy/rosPlayerIdentity";
import type { FantasyParSourceRow } from "@/lib/fantasy/parRankings";
import type { FantasyPosition, FantasyRankingRow } from "@/lib/fantasy/rankings";
import {
  resolveProductionProjectionIdentity,
  type ProductionIdentitySourceRow,
} from "@/lib/fantasy/weekly/productionIdentity";

export const ROS_IDENTITY_CROSSWALK_SCHEMA_VERSION = "ros-identity-crosswalk-v1" as const;

/**
 * Priority ladder requested for Phase 1: stable ID > exact crosswalk (exact
 * normalized name+position, team-disambiguated when the roster has more than
 * one same-name/-position candidate) > reviewed alias > unresolved. Reused
 * verbatim from `resolveProductionProjectionIdentity`'s already-approved
 * strategy field, which does not expose team-disambiguation as a separate
 * label -- see that resolver for the exact match precedence.
 */
export type RosIdentityResolutionMethod =
  | "stable-id"
  | "stable-id-off-roster"
  | "exact-name-position"
  | "reviewed-alias"
  | "unresolved-no-par-match"
  | "unresolved-no-gsis-match";

export type RosIdentityCrosswalkRow = {
  overallRank: number;
  player: string;
  position: FantasyPosition;
  team: string | null;
  parMatch: {
    found: boolean;
    sourceId: string | null;
    parPlayer: string | null;
    method: "exact-normalized-name" | "reviewed-alias" | null;
    ambiguous: boolean;
  };
  identity: {
    playerId: string | null;
    gsisId: string | null;
    resolutionMethod: RosIdentityResolutionMethod;
    resolverStrategy: "direct-pfr" | "exact-name-position" | "audited-alias" | "unresolved" | null;
    failureReason: string | null;
    /**
     * Set only for "stable-id-off-roster" rows: the nflverse master
     * player-table status (e.g. "RLS", "RES", "RET") explaining why the
     * player was absent from the Week 1 roster snapshot despite an
     * unambiguous, exact stable-ID (PFR) match confirming their canonical
     * GSIS identity. Never used to justify a name-only or fuzzy match.
     */
    offRosterStatus: string | null;
  };
};

export type RosIdentityCrosswalkCounts = {
  totalRows: number;
  resolved: number;
  unresolved: number;
  ambiguousParMatches: number;
  duplicateCanonicalIds: number;
  duplicateCanonicalIdGroups: Array<{ playerId: string; players: string[] }>;
  resolutionMethodCounts: Record<RosIdentityResolutionMethod, number>;
};

export type RosIdentityCrosswalkResult = {
  rows: RosIdentityCrosswalkRow[];
  counts: RosIdentityCrosswalkCounts;
};

/** Distinct PAR players sharing a normalized name+position key (before alias resolution). Ambiguity is reported, never silently guessed. */
function buildParAmbiguityIndex(parRows: readonly FantasyParSourceRow[]): Map<string, number> {
  const index = new Map<string, Set<string>>();
  for (const row of parRows) {
    const key = normalizedFantasyPlayerKey(row.Position as FantasyPosition, row.Player);
    const set = index.get(key) ?? new Set<string>();
    set.add(row["Source ID"]);
    index.set(key, set);
  }
  const counts = new Map<string, number>();
  for (const [key, ids] of index) counts.set(key, ids.size);
  return counts;
}

export function buildRosIdentityCrosswalk(input: {
  rankingRows: readonly FantasyRankingRow[];
  parRows: readonly FantasyParSourceRow[];
  playerRows: readonly ProductionIdentitySourceRow[];
  rosterRows: readonly ProductionIdentitySourceRow[];
}): RosIdentityCrosswalkResult {
  const { rankingRows, parRows, playerRows, rosterRows } = input;
  const ambiguity = buildParAmbiguityIndex(parRows);
  const parByKey = new Map(parRows.map((row) => [normalizedFantasyPlayerKey(row.Position as FantasyPosition, row.Player), row]));
  const methodCounts: Record<RosIdentityResolutionMethod, number> = {
    "stable-id": 0,
    "stable-id-off-roster": 0,
    "exact-name-position": 0,
    "reviewed-alias": 0,
    "unresolved-no-par-match": 0,
    "unresolved-no-gsis-match": 0,
  };

  const rows: RosIdentityCrosswalkRow[] = rankingRows.map((jkb) => {
    const jkbKey = normalizedFantasyPlayerKey(jkb.position, jkb.player);
    const aliasedName = CONSENSUS_NAME_ALIASES[jkbKey];
    const parRow = parByKey.get(aliasedName ? normalizedFantasyPlayerKey(jkb.position, aliasedName) : jkbKey);
    const ambiguous = (ambiguity.get(jkbKey) ?? 0) > 1;

    if (!parRow) {
      // No PAR consensus row exists for this player (a genuine external-source
      // gap, not a JKB naming issue -- confirmed by inspecting the PAR file
      // directly). The canonical GSIS identity is a property of the player,
      // not of the PAR join, so attempt the same approved, non-fuzzy exact
      // name+position resolution directly against the roster/player crosswalk
      // with no PFR id to test (none exists without a PAR row). This can only
      // ever land on "exact-name-position" or "reviewed-alias" (never
      // "stable-id"/"stable-id-off-roster", which require a PFR id to match
      // against) and never guesses from name similarity.
      const directResolution = resolveProductionProjectionIdentity({
        projection: { sourceId: "", playerName: jkb.player, position: jkb.position, team: jkb.team ?? null },
        rosterRows,
        playerRows,
      });
      const directGsis = directResolution.resolved ? directResolution.gsisId || null : null;
      const directPlayerId = directGsis ? `gsis:${directGsis}` : null;

      if (directPlayerId) {
        const method: RosIdentityResolutionMethod =
          directResolution.strategy === "audited-alias" ? "reviewed-alias" : "exact-name-position";
        methodCounts[method] += 1;
        return {
          overallRank: jkb.overallRank,
          player: jkb.player,
          position: jkb.position,
          team: jkb.team ?? null,
          parMatch: { found: false, sourceId: null, parPlayer: null, method: null, ambiguous },
          identity: {
            playerId: directPlayerId,
            gsisId: directGsis,
            resolutionMethod: method,
            resolverStrategy: directResolution.strategy,
            failureReason: null,
            offRosterStatus: null,
          },
        };
      }

      methodCounts["unresolved-no-par-match"] += 1;
      return {
        overallRank: jkb.overallRank,
        player: jkb.player,
        position: jkb.position,
        team: jkb.team ?? null,
        parMatch: { found: false, sourceId: null, parPlayer: null, method: null, ambiguous },
        identity: {
          playerId: null,
          gsisId: null,
          resolutionMethod: "unresolved-no-par-match",
          resolverStrategy: null,
          failureReason: "no PAR consensus row for this workbook name+position (exact or reviewed alias); direct roster/player name+position resolution also failed",
          offRosterStatus: null,
        },
      };
    }

    const parKeyMatchesJkbName = normalizedFantasyPlayerKey(parRow.Position as FantasyPosition, parRow.Player) === jkbKey;
    const parMatchMethod: "exact-normalized-name" | "reviewed-alias" = parKeyMatchesJkbName
      ? "exact-normalized-name"
      : "reviewed-alias";

    const resolution = resolveProductionProjectionIdentity({
      projection: {
        sourceId: parRow["Source ID"],
        playerName: parRow.Player,
        position: parRow.Position as FantasyPosition,
        team: parRow.Team,
      },
      rosterRows,
      playerRows,
    });

    // The resolver may surface a candidate `gsisId` from the historical player
    // table even when it could not confirm an exact current-roster identity
    // (`resolution.resolved === false`); that candidate is not authoritative
    // by itself and must never be published as a resolved canonical id from
    // a name-only match. The one narrow, deterministic exception: the
    // candidate came from an *exact stable-ID* (PFR) match against the
    // nflverse master player table -- i.e. `resolution.player.pfrId` equals
    // the same PFR id already confirmed by the PAR join -- and there is no
    // conflicting same-PFR-id row. That is not a fuzzy or name-only match;
    // it is the identical stable-ID join the roster path itself uses, just
    // unconfirmed by Week-1-active-roster presence (e.g. a released, reserve,
    // or free-agent veteran). Everything else stays unresolved.
    const offRosterStableMatch =
      !resolution.resolved &&
      !resolution.directPfrConflict &&
      resolution.player != null &&
      resolution.player.pfrId === parRow["Source ID"] &&
      Boolean(resolution.player.gsisId);

    const gsis = resolution.resolved
      ? resolution.gsisId || null
      : offRosterStableMatch
        ? resolution.player!.gsisId
        : null;
    const playerId = gsis ? `gsis:${gsis}` : null;

    let resolutionMethod: RosIdentityResolutionMethod;
    if (offRosterStableMatch && playerId) {
      resolutionMethod = "stable-id-off-roster";
    } else if (!resolution.resolved || !playerId) {
      resolutionMethod = "unresolved-no-gsis-match";
    } else if (parMatchMethod === "reviewed-alias") {
      resolutionMethod = "reviewed-alias";
    } else if (resolution.strategy === "direct-pfr") {
      resolutionMethod = "stable-id";
    } else if (resolution.strategy === "audited-alias") {
      resolutionMethod = "reviewed-alias";
    } else {
      resolutionMethod = "exact-name-position";
    }
    methodCounts[resolutionMethod] += 1;

    return {
      overallRank: jkb.overallRank,
      player: jkb.player,
      position: jkb.position,
      team: jkb.team ?? null,
      parMatch: {
        found: true,
        sourceId: parRow["Source ID"],
        parPlayer: parRow.Player,
        method: parMatchMethod,
        ambiguous,
      },
      identity: {
        playerId,
        gsisId: gsis,
        resolutionMethod,
        resolverStrategy: resolution.strategy,
        failureReason: resolutionMethod === "stable-id-off-roster" ? null : resolution.failureReason,
        offRosterStatus: resolutionMethod === "stable-id-off-roster" ? resolution.player!.status ?? null : null,
      },
    };
  });

  const resolved = rows.filter((row) => row.identity.playerId !== null).length;
  const ambiguousParMatches = rows.filter((row) => row.parMatch.ambiguous).length;

  const byPlayerId = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.identity.playerId) continue;
    byPlayerId.set(row.identity.playerId, [...(byPlayerId.get(row.identity.playerId) ?? []), row.player]);
  }
  const duplicateCanonicalIdGroups = [...byPlayerId.entries()]
    .filter(([, players]) => players.length > 1)
    .map(([playerId, players]) => ({ playerId, players }));

  return {
    rows,
    counts: {
      totalRows: rows.length,
      resolved,
      unresolved: rows.length - resolved,
      ambiguousParMatches,
      duplicateCanonicalIds: duplicateCanonicalIdGroups.reduce((sum, group) => sum + group.players.length, 0),
      duplicateCanonicalIdGroups,
      resolutionMethodCounts: methodCounts,
    },
  };
}
