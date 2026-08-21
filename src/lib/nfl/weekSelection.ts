import type { NflGameRecord } from "@/lib/nfl/standings";

export const NFL_PRESENTATION_TIME_ZONE = "America/New_York";

export type NflWeekSelection = {
  week: number | null;
  availableWeeks: number[];
  source: "query" | "schedule" | "unavailable";
  invalidQuery: boolean;
};

type ResolveNflWeekSelectionOptions = {
  search?: string | URLSearchParams;
  now?: Date;
};

function easternDateKey(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NFL_PRESENTATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function getAvailableRegularSeasonWeeks(games: NflGameRecord[]): number[] {
  return [...new Set(
    games
      .filter((game) => game.seasonType === "REG" && Number.isInteger(game.week) && game.week > 0)
      .map((game) => game.week)
  )].sort((a, b) => a - b);
}

function getScheduleDefaultWeek(games: NflGameRecord[], availableWeeks: number[], now: Date): number | null {
  if (availableWeeks.length === 0) return null;

  const lastDateByWeek = new Map<number, string>();
  for (const game of games) {
    if (game.seasonType !== "REG" || !availableWeeks.includes(game.week) || !game.dateUtc) continue;
    const dateKey = easternDateKey(new Date(game.dateUtc));
    if (!dateKey) continue;
    const current = lastDateByWeek.get(game.week);
    if (!current || dateKey > current) lastDateByWeek.set(game.week, dateKey);
  }

  const datedWeeks = availableWeeks
    .flatMap((week) => {
      const lastDate = lastDateByWeek.get(week);
      return lastDate ? [{ week, lastDate }] : [];
    })
    .sort((a, b) => a.lastDate.localeCompare(b.lastDate) || a.week - b.week);
  const today = easternDateKey(now);

  if (!today || datedWeeks.length === 0) return availableWeeks[0];
  return datedWeeks.find(({ lastDate }) => lastDate >= today)?.week ?? datedWeeks.at(-1)!.week;
}

export function resolveNflWeekSelection(
  games: NflGameRecord[],
  { search = "", now = new Date() }: ResolveNflWeekSelectionOptions = {}
): NflWeekSelection {
  const availableWeeks = getAvailableRegularSeasonWeeks(games);
  if (availableWeeks.length === 0) {
    return { week: null, availableWeeks, source: "unavailable", invalidQuery: false };
  }

  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const hasWeekQuery = params.has("week");
  const rawWeek = params.get("week");
  const parsedWeek = rawWeek && /^\d+$/.test(rawWeek) ? Number(rawWeek) : null;
  if (parsedWeek !== null && availableWeeks.includes(parsedWeek)) {
    return { week: parsedWeek, availableWeeks, source: "query", invalidQuery: false };
  }

  return {
    week: getScheduleDefaultWeek(games, availableWeeks, now),
    availableWeeks,
    source: "schedule",
    invalidQuery: hasWeekQuery,
  };
}
