/**
 * Canonical NFL player-identity and team-code resolution. This is generic
 * gsis-id-based identity infrastructure -- not fantasy scoring, not a
 * fantasy business type -- so it lives outside `src/lib/fantasy/**`.
 *
 * Extracted verbatim (no behavior change) from the original
 * `src/lib/fantasy/weekly/identity.ts`, which now re-exports these exact
 * symbols so every existing fantasy import keeps working unchanged. NFL
 * props (`src/lib/nfl/props/**`) imports directly from here instead of
 * through the fantasy namespace. See `identity.test.ts` (this directory)
 * and `src/lib/fantasy/weekly/identity.test.ts` (unchanged, still passing
 * against the re-export) for the behavior this preserves.
 */

/** The four offensive skill positions this identity layer resolves. */
export type NflPosition = "QB" | "RB" | "WR" | "TE";

export type NflExternalIds = {
  gsis: string;
  pfr: string | null;
  espn: string | null;
};

export type NflCanonicalPlayerIdentity = {
  playerId: string;
  playerName: string;
  position: NflPosition;
  externalIds: NflExternalIds;
};

export type NflWeekEffectiveTeamAssignment = {
  playerId: string;
  season: number;
  week: number;
  team: string;
};

export type NflIdentityResolution =
  | { resolved: true; identity: NflCanonicalPlayerIdentity }
  | { resolved: false; reason: "missing-gsis-id" | "unsupported-position" | "invalid-name" };

const POSITIONS = new Set<NflPosition>(["QB", "RB", "WR", "TE"]);
const TEAM_ALIASES: Readonly<Record<string, string>> = {
  JAC: "jax",
  JAX: "jax",
  LA: "lar",
  LAR: "lar",
  WAS: "wsh",
  WSH: "wsh",
  // nflverse's weekly-rosters release switched the Cardinals' team code from
  // "ARI" to "AZ" (observed in the 2026-08-22 refresh); the schedule source
  // (public/data/nfl/2026/games.json) still uses "ari". Exact, reviewed
  // alias -- no fuzzy matching.
  AZ: "ari",
  ARI: "ari",
};

export function normalizeNflTeamAbbr(value: string | null | undefined): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code) return null;
  return TEAM_ALIASES[code] ?? code.toLowerCase();
}

export function canonicalPlayerId(gsisId: string | null | undefined): string | null {
  const id = String(gsisId ?? "").trim();
  return id ? `gsis:${id}` : null;
}

export function resolveCanonicalPlayerIdentity(source: {
  gsisId?: string | null;
  pfrId?: string | null;
  espnId?: string | number | null;
  playerName?: string | null;
  position?: string | null;
}): NflIdentityResolution {
  const playerId = canonicalPlayerId(source.gsisId);
  if (!playerId) return { resolved: false, reason: "missing-gsis-id" };
  const playerName = String(source.playerName ?? "").trim();
  if (!playerName) return { resolved: false, reason: "invalid-name" };
  const position = String(source.position ?? "").trim().toUpperCase() as NflPosition;
  if (!POSITIONS.has(position)) return { resolved: false, reason: "unsupported-position" };

  return {
    resolved: true,
    identity: {
      playerId,
      playerName,
      position,
      externalIds: {
        gsis: String(source.gsisId).trim(),
        pfr: String(source.pfrId ?? "").trim() || null,
        espn: String(source.espnId ?? "").trim() || null,
      },
    },
  };
}

/** Latest assignment at or before the requested week; future rows are never considered. */
export function resolveWeekEffectiveTeam(
  assignments: readonly NflWeekEffectiveTeamAssignment[],
  playerId: string,
  season: number,
  week: number,
): string | null {
  const eligible = assignments
    .filter((row) => row.playerId === playerId && row.season === season && row.week <= week)
    .sort((a, b) => b.week - a.week);
  return eligible.length ? normalizeNflTeamAbbr(eligible[0].team) : null;
}
