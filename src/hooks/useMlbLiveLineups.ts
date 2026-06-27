import { useEffect, useState } from "react";

export type LiveLineupEntry = {
  battingOrder: number | null;
  lineupStatus: "confirmed" | "projected" | "unknown";
  source: "mlb-live-boxscore";
};

type LineupMap = Record<string, LiveLineupEntry>;

function normalizeOrder(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const order = n >= 100 ? Math.round(n / 100) : n;
  return order >= 1 && order <= 9 ? order : null;
}

function addTeamLineup(map: LineupMap, team: string, teamBox: any) {
  const battingOrder: number[] = Array.isArray(teamBox?.battingOrder) ? teamBox.battingOrder : [];
  const players = teamBox?.players && typeof teamBox.players === "object" ? teamBox.players : {};
  battingOrder.forEach((personId, index) => {
    const player = players[`ID${personId}`] ?? players[String(personId)] ?? {};
    const name = player?.person?.fullName;
    const order = normalizeOrder(player?.battingOrder) ?? index + 1;
    const entry: LiveLineupEntry = { battingOrder: order, lineupStatus: "confirmed", source: "mlb-live-boxscore" };
    map[String(personId)] = entry;
    if (name) map[`${name}|${team}`] = entry;
  });
}

export function useMlbLiveLineups(date: string | null | undefined) {
  const [lineups, setLineups] = useState<LineupMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    let active = true;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const [scheduleResponse, teamsResponse] = await Promise.all([
          fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, { signal: controller.signal }),
          fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1", { signal: controller.signal }),
        ]);
        if (!scheduleResponse.ok) throw new Error(`Schedule HTTP ${scheduleResponse.status}`);
        const schedule = await scheduleResponse.json();
        const teams = teamsResponse.ok ? await teamsResponse.json() : { teams: [] };
        const abbreviationById = new Map<number, string>((teams?.teams ?? []).map((team: any) => [team.id, team.abbreviation]));
        const games = schedule?.dates?.[0]?.games ?? [];
        const result: LineupMap = {};

        await Promise.all(games.map(async (game: any) => {
          try {
            const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`, { signal: controller.signal });
            if (!response.ok) return;
            const boxscore = await response.json();
            const awayTeam = abbreviationById.get(game?.teams?.away?.team?.id) ?? game?.teams?.away?.team?.abbreviation ?? "";
            const homeTeam = abbreviationById.get(game?.teams?.home?.team?.id) ?? game?.teams?.home?.team?.abbreviation ?? "";
            addTeamLineup(result, awayTeam, boxscore?.teams?.away);
            addTeamLineup(result, homeTeam, boxscore?.teams?.home);
          } catch {
            // One unavailable game must not block the rest of the slate.
          }
        }));

        if (active) setLineups(result);
      } catch {
        if (active) setLineups({});
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const interval = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [date]);

  return { lineups, loading };
}
