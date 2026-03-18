interface GameResult {
  teamId: string;
  won: boolean;
  date: Date;
}

let cache: { data: Record<string, { wins: number; losses: number }>; at: number } | null = null;
const CACHE_MS = 30 * 60 * 1000; // 30 minutes

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchScoreboardDate(dateStr: string): Promise<GameResult[]> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&limit=200`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return [];
    const data = await resp.json();
    const events: unknown[] = data?.events ?? [];
    const results: GameResult[] = [];
    for (const event of events as Record<string, unknown>[]) {
      const competition = (event.competitions as Record<string, unknown>[])?.[0];
      if (!(competition?.status as Record<string, unknown>)?.type) continue;
      const statusType = (competition.status as Record<string, unknown>).type as Record<string, unknown>;
      if (!statusType.completed) continue;
      const competitors = (competition.competitors as Record<string, unknown>[]) ?? [];
      if (competitors.length !== 2) continue;
      const eventDate = new Date((event.date as string) ?? "");
      for (const c of competitors) {
        const teamId = ((c.team as Record<string, unknown>)?.id as string) ?? "";
        if (!teamId) continue;
        const score = parseInt((c.score as string) ?? "0", 10);
        const otherScore = competitors
          .filter((x) => x !== c)
          .map((x) => parseInt((x.score as string) ?? "0", 10))[0] ?? 0;
        results.push({ teamId, won: score > otherScore, date: eventDate });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return Response.json({ teams: cache.data, fetchedAt: new Date(cache.at).toISOString(), cached: true });
  }

  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(fmtDate(d));
  }

  // Fetch in parallel, up to 28 dates
  const allResults = await Promise.all(dates.map(fetchScoreboardDate));
  const flat: GameResult[] = allResults.flat();

  // Sort by date desc, group by team
  flat.sort((a, b) => b.date.getTime() - a.date.getTime());

  const byTeam = new Map<string, GameResult[]>();
  for (const r of flat) {
    if (!r.teamId) continue;
    if (!byTeam.has(r.teamId)) byTeam.set(r.teamId, []);
    byTeam.get(r.teamId)!.push(r);
  }

  const teams: Record<string, { wins: number; losses: number }> = {};
  for (const [id, games] of byTeam) {
    const last10 = games.slice(0, 10);
    if (last10.length === 0) continue;
    teams[id] = {
      wins: last10.filter((g) => g.won).length,
      losses: last10.filter((g) => !g.won).length,
    };
  }

  cache = { data: teams, at: Date.now() };
  return Response.json({ teams, fetchedAt: new Date().toISOString(), cached: false });
}
