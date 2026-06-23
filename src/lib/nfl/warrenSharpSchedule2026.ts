import rawSchedule from "../../data/nflWarrenSharpSchedule2026.json";

export type WarrenSharpHomeAway = "home" | "away" | null;

export type WarrenSharpWeeklyRestEdge = {
  week: number;
  bye: boolean;
  opponent: string | null;
  homeAway: WarrenSharpHomeAway;
  restEdgeDays: number;
};

export type WarrenSharpScheduleProfile = {
  team: string;
  abbr: string;
  sourcePages: {
    strengthOfSchedule: number;
    weeklySchedule: number;
    timingSummary: number;
  };
  strengthOfSchedule: {
    easiestFirstRank: number;
    hardestFirstRank: number;
    rankDirection: string;
  };
  netRestDays: number;
  opponentsWithExtraPrep: number;
  opponentsWithShortPrep: number;
  prepDifference: number;
  gamesWithRestDisadvantage: number;
  gamesWithRestAdvantage: number;
  restGameDifference: number;
  shortWeekRoadGames: number;
  gamesAfterRoadSnfOrMnf: number;
  negatedByeWeeks: number;
  netRestEdgeRank: number;
  prepRank: number;
  restRank: number;
  shortWeekRoadGamesRank: number;
  gamesAfterRoadSnfOrMnfRank: number;
  negatedByeRank: number;
  weeklyRestEdges: WarrenSharpWeeklyRestEdge[];
};

type CompactTeam = {
  t: string;
  p: [number, number, number];
  s: [number, number];
  n: number;
  x: [number, number, number];
  g: [number, number, number];
  q: [number, number, number];
  r: [number, number, number, number, number, number];
  w: Array<[string | null, number]>;
};

type RawSchedule = {
  source: {
    title: string;
    file: string;
    season: number;
    extractionMethod: string;
    rankNotes: {
      strengthOfSchedule: string;
      timingRanks: string;
    };
  };
  teams: Record<string, CompactTeam>;
};

const schedule = rawSchedule as unknown as RawSchedule;
const profileCache = new Map<string, WarrenSharpScheduleProfile>();

export const WARREN_SHARP_SCHEDULE_SOURCE = Object.freeze({
  title: schedule.source.title,
  season: schedule.source.season,
  strengthOfSchedulePage: 11,
});

export const WARREN_SHARP_SCHEDULE_TEAM_ABBRS = Object.freeze(
  Object.keys(schedule.teams),
);

export function getWarrenSharpScheduleProfile(
  abbr: string,
): WarrenSharpScheduleProfile | null {
  const normalized = abbr.trim().toLowerCase();
  const cached = profileCache.get(normalized);
  if (cached) return cached;

  const raw = schedule.teams[normalized];
  if (!raw) return null;

  const profile: WarrenSharpScheduleProfile = {
    team: raw.t,
    abbr: normalized,
    sourcePages: {
      strengthOfSchedule: raw.p[0],
      weeklySchedule: raw.p[1],
      timingSummary: raw.p[2],
    },
    strengthOfSchedule: {
      easiestFirstRank: raw.s[0],
      hardestFirstRank: raw.s[1],
      rankDirection: "1=easiest, 32=hardest in source chart",
    },
    netRestDays: raw.n,
    opponentsWithExtraPrep: raw.x[0],
    opponentsWithShortPrep: raw.x[1],
    prepDifference: raw.x[2],
    gamesWithRestDisadvantage: raw.g[0],
    gamesWithRestAdvantage: raw.g[1],
    restGameDifference: raw.g[2],
    shortWeekRoadGames: raw.q[0],
    gamesAfterRoadSnfOrMnf: raw.q[1],
    negatedByeWeeks: raw.q[2],
    netRestEdgeRank: raw.r[0],
    prepRank: raw.r[1],
    restRank: raw.r[2],
    shortWeekRoadGamesRank: raw.r[3],
    gamesAfterRoadSnfOrMnfRank: raw.r[4],
    negatedByeRank: raw.r[5],
    weeklyRestEdges: raw.w.map(([opponent, restEdgeDays], index) => ({
      week: index + 1,
      bye: opponent == null,
      opponent,
      homeAway: null,
      restEdgeDays,
    })),
  };

  profileCache.set(normalized, profile);
  return profile;
}

export function getWarrenSharpRestEdgeForGame(
  profile: WarrenSharpScheduleProfile | null,
  week: number | null,
  opponentAbbr: string,
): WarrenSharpWeeklyRestEdge | null {
  if (!profile || week == null || !Number.isFinite(week)) return null;
  const normalizedOpponent = opponentAbbr.trim().toLowerCase();
  const edge = profile.weeklyRestEdges.find((entry) => entry.week === week);
  if (!edge || edge.bye || edge.opponent !== normalizedOpponent) return null;
  return edge;
}
