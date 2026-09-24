import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { normalizedFantasyPlayerKey } from "@/lib/fantasy/rosPlayerIdentity";
import { SLEEPER_NAME_ALIASES } from "@/lib/fantasy/draftPreview/identity";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";

export type SleeperUser = { user_id: string; username: string; display_name?: string };
export type SleeperLeague = { league_id: string; name: string; roster_positions: string[]; scoring_settings?: Record<string, number>; season: string };
export type SleeperRoster = { roster_id: number; owner_id: string | null; players: string[]; starters: string[]; reserve?: string[]; taxi?: string[]; settings?: { wins?: number; losses?: number; ties?: number } };
export type SleeperLeagueUser = { user_id: string; display_name?: string; metadata?: { team_name?: string } };
export type SleeperPlayer = { player_id: string; full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null; gsis_id?: string | null; status?: string; injury_status?: string | null };
export type SleeperTeam = { league: SleeperLeague; roster: SleeperRoster | null; users: SleeperLeagueUser[] };

const BASE = "https://api.sleeper.app/v1";
async function getJson<T>(path: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(`${BASE}${path}`);
  if (response.status === 404) throw new Error("Sleeper username was not found.");
  if (!response.ok) throw new Error(`Sleeper is unavailable (HTTP ${response.status}). Try again.`);
  return response.json() as Promise<T>;
}

export async function loadSleeperTeams(username: string, season: number, fetcher: typeof fetch = fetch): Promise<{ user: SleeperUser; teams: SleeperTeam[]; players: Record<string, SleeperPlayer> }> {
  const user = await getJson<SleeperUser>(`/user/${encodeURIComponent(username.trim())}`, fetcher);
  if (!user?.user_id) throw new Error("Sleeper username was not found.");
  const leagues = await getJson<SleeperLeague[]>(`/user/${encodeURIComponent(user.user_id)}/leagues/nfl/${season}`, fetcher);
  if (!Array.isArray(leagues)) throw new Error("Sleeper returned an invalid league list.");
  if (leagues.length === 0) return { user, teams: [], players: {} };
  const [teams, players] = await Promise.all([
    Promise.all(leagues.map(async (league): Promise<SleeperTeam> => {
      const [rosters, users] = await Promise.all([
        getJson<SleeperRoster[]>(`/league/${encodeURIComponent(league.league_id)}/rosters`, fetcher),
        getJson<SleeperLeagueUser[]>(`/league/${encodeURIComponent(league.league_id)}/users`, fetcher),
      ]);
      return { league, roster: findOwnedRoster(rosters, user.user_id), users };
    })),
    getJson<Record<string, SleeperPlayer>>("/players/nfl", fetcher),
  ]);
  return { user, teams, players };
}

export function findOwnedRoster(rosters: readonly SleeperRoster[], userId: string): SleeperRoster | null {
  return rosters.find((roster) => roster.owner_id === userId) ?? null;
}

export function normalizeSleeperRoster(roster: SleeperRoster, slots: readonly string[]): SleeperRoster {
  const players = [...new Set([...(roster.players ?? []), ...(roster.starters ?? []), ...(roster.reserve ?? []), ...(roster.taxi ?? [])]
    .filter((id): id is string => typeof id === "string" && id.length > 0 && id !== "0"))];
  const starters = slots.map((_, index) => roster.starters?.[index] ?? "0");
  return { ...roster, players, starters };
}

export type PlayerMatch = { sleeperId: string; sleeper: SleeperPlayer | null; jkb: WeeklyFantasyProjectionProductionRow | null; method: "gsis" | "name-team" | "unmatched" };
export function mapSleeperPlayers(ids: readonly string[], players: Record<string, SleeperPlayer>, projections: readonly WeeklyFantasyProjectionProductionRow[]): PlayerMatch[] {
  const byGsis = new Map(projections.map((row) => [row.playerId, row]));
  const byName = new Map<string, WeeklyFantasyProjectionProductionRow[]>();
  for (const row of projections) {
    const key = `${normalizedFantasyPlayerKey(row.position, row.playerName)}:${normalizeNflTeamAbbr(row.team) ?? ""}`;
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return ids.map((sleeperId) => {
    const sleeper = players[sleeperId] ?? null;
    const gsis = sleeper?.gsis_id ? byGsis.get(`gsis:${sleeper.gsis_id}`) : undefined;
    if (gsis && gsis.position === sleeper?.position) return { sleeperId, sleeper, jkb: gsis, method: "gsis" as const };
    const position = sleeper?.position;
    if (position === "QB" || position === "RB" || position === "WR" || position === "TE") {
      const name = sleeper?.full_name || `${sleeper?.first_name ?? ""} ${sleeper?.last_name ?? ""}`.trim();
      const rawKey = normalizedFantasyPlayerKey(position, name);
      const canonicalName = SLEEPER_NAME_ALIASES[rawKey] ?? name;
      const key = `${normalizedFantasyPlayerKey(position, canonicalName)}:${normalizeNflTeamAbbr(sleeper?.team) ?? ""}`;
      const candidates = byName.get(key) ?? [];
      if (candidates.length === 1) return { sleeperId, sleeper, jkb: candidates[0], method: "name-team" as const };
    }
    return { sleeperId, sleeper, jkb: null, method: "unmatched" as const };
  });
}
