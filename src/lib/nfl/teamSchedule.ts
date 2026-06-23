export type NflScheduleGame = {
  id: string;
  week: number | null;
  date: string;
  opponentAbbr: string;
  opponentName: string;
  homeAway: "home" | "away" | "neutral";
  venue: string | null;
  status: string;
  completed: boolean;
  result: string | null;
  teamScore: number | null;
  opponentScore: number | null;
};

export type NflTeamScheduleResponse = {
  source: "espn";
  season: number;
  team: string;
  updatedAt: string;
  stale?: boolean;
  games: NflScheduleGame[];
};

export const NFL_TEAM_ABBRS = new Set([
  "ari", "atl", "bal", "buf", "car", "chi", "cin", "cle",
  "dal", "den", "det", "gb", "hou", "ind", "jax", "kc",
  "lv", "lac", "lar", "mia", "min", "ne", "no", "nyg",
  "nyj", "phi", "pit", "sf", "sea", "tb", "ten", "wsh",
]);

type EspnTeam = {
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  winner?: boolean;
  score?: string | number;
  team?: EspnTeam;
};

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  week?: { number?: number };
  seasonType?: { type?: number; slug?: string };
  status?: {
    type?: {
      completed?: boolean;
      shortDetail?: string;
      detail?: string;
      description?: string;
    };
  };
  competitions?: Array<{
    neutralSite?: boolean;
    venue?: { fullName?: string };
    competitors?: EspnCompetitor[];
  }>;
};

type EspnSchedulePayload = {
  events?: EspnEvent[];
};

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRegularSeason(event: EspnEvent) {
  const type = event.seasonType?.type;
  const slug = event.seasonType?.slug?.toLowerCase();
  return type == null || type === 2 || slug === "regular-season";
}

export function normalizeNflSchedulePayload(payload: unknown, requestedAbbr: string): NflScheduleGame[] {
  const teamAbbr = requestedAbbr.toLowerCase();
  const events = Array.isArray((payload as EspnSchedulePayload | null)?.events)
    ? (payload as EspnSchedulePayload).events ?? []
    : [];

  return events
    .filter(isRegularSeason)
    .map((event, index): NflScheduleGame | null => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const team = competitors.find(
        (competitor) => competitor.team?.abbreviation?.toLowerCase() === teamAbbr,
      );
      const opponent = competitors.find((competitor) => competitor !== team);

      if (!team || !opponent?.team) return null;

      const completed = Boolean(event.status?.type?.completed);
      const teamScore = asNumber(team.score);
      const opponentScore = asNumber(opponent.score);
      const result = completed && teamScore != null && opponentScore != null
        ? `${teamScore === opponentScore ? "T" : team.winner ? "W" : "L"} ${teamScore}-${opponentScore}`
        : null;
      const status = event.status?.type?.shortDetail
        ?? event.status?.type?.detail
        ?? event.status?.type?.description
        ?? "Scheduled";
      const homeAway = competition?.neutralSite
        ? "neutral"
        : team.homeAway === "away"
          ? "away"
          : "home";

      return {
        id: String(event.id ?? `${teamAbbr}-${event.date ?? index}`),
        week: Number.isFinite(event.week?.number) ? Number(event.week?.number) : null,
        date: event.date ?? "",
        opponentAbbr: opponent.team.abbreviation?.toLowerCase() ?? "",
        opponentName: opponent.team.displayName ?? opponent.team.shortDisplayName ?? "Opponent",
        homeAway,
        venue: competition?.venue?.fullName ?? null,
        status,
        completed,
        result,
        teamScore,
        opponentScore,
      };
    })
    .filter((game): game is NflScheduleGame => Boolean(game))
    .sort((a, b) => {
      if (a.week != null && b.week != null && a.week !== b.week) return a.week - b.week;
      return a.date.localeCompare(b.date);
    });
}
