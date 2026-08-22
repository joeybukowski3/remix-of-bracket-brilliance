import type { FantasyPosition } from "@/lib/fantasy/rankings";

export type FantasyExternalIds = {
  gsis: string;
  pfr: string | null;
  espn: string | null;
};

export type CanonicalPlayerIdentity = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  externalIds: FantasyExternalIds;
};

export type WeekEffectiveTeamAssignment = {
  playerId: string;
  season: number;
  week: number;
  team: string;
};

export type IdentityResolution =
  | { resolved: true; identity: CanonicalPlayerIdentity }
  | { resolved: false; reason: "missing-gsis-id" | "unsupported-position" | "invalid-name" };

const POSITIONS = new Set<FantasyPosition>(["QB", "RB", "WR", "TE"]);
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
}): IdentityResolution {
  const playerId = canonicalPlayerId(source.gsisId);
  if (!playerId) return { resolved: false, reason: "missing-gsis-id" };
  const playerName = String(source.playerName ?? "").trim();
  if (!playerName) return { resolved: false, reason: "invalid-name" };
  const position = String(source.position ?? "").trim().toUpperCase() as FantasyPosition;
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
  assignments: readonly WeekEffectiveTeamAssignment[],
  playerId: string,
  season: number,
  week: number,
): string | null {
  const eligible = assignments
    .filter((row) => row.playerId === playerId && row.season === season && row.week <= week)
    .sort((a, b) => b.week - a.week);
  return eligible.length ? normalizeNflTeamAbbr(eligible[0].team) : null;
}
