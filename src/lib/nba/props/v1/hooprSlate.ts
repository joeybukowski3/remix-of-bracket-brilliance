/**
 * The V1 slate from hoopR's 2026-27 schedule: the next Eastern game date that still has games to play, with every
 * regular-season game on that date whose tipoff is after `now`. Games already finished, in progress or past tipoff are
 * never included, and a team code that is not an NBA franchise skips the game and is reported.
 */
import { canonicalTeamCode } from "../canonical";

export interface HooprScheduleRow {
  id: number | string;
  /** Tipoff as a UTC instant, for example "2026-10-23T23:00Z". */
  date: string;
  /** Eastern calendar date. */
  game_date: string;
  season: number;
  season_type: number;
  status_type_state: string | null;
  status_type_completed: boolean | null;
  home_abbreviation: string | null;
  away_abbreviation: string | null;
}

export interface HooprSlate {
  slate: { season: "2026-27"; games: Array<{ gameKey: string; tipoffUtc: string }> };
  date: string | null;
  skipped: Array<{ id: string; reason: string }>;
}

const toIsoSeconds = (instant: string): string | null => {
  const ms = Date.parse(instant);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
};

export function buildHooprSlate(rows: readonly HooprScheduleRow[], now: Date, maxGames = 30): HooprSlate {
  const skipped: HooprSlate["skipped"] = [];
  const upcoming = rows
    .filter((r) => r.season === 2027 && r.season_type === 2 && r.status_type_state === "pre" && r.status_type_completed !== true)
    .flatMap((r) => {
      const tipoffUtc = toIsoSeconds(r.date);
      const away = canonicalTeamCode(r.away_abbreviation ?? "");
      const home = canonicalTeamCode(r.home_abbreviation ?? "");
      if (tipoffUtc === null || away === null || home === null || away === home) {
        skipped.push({ id: String(r.id), reason: "tipoff or team code is not usable" });
        return [];
      }
      return Date.parse(tipoffUtc) > now.getTime() ? [{ gameKey: `${r.game_date}|${away}@${home}`, tipoffUtc, date: r.game_date }] : [];
    })
    .sort((a, b) => a.tipoffUtc.localeCompare(b.tipoffUtc) || a.gameKey.localeCompare(b.gameKey));
  const date = upcoming[0]?.date ?? null;
  const games = upcoming.filter((g) => g.date === date).slice(0, maxGames).map(({ gameKey, tipoffUtc }) => ({ gameKey, tipoffUtc }));
  return { slate: { season: "2026-27", games }, date, skipped };
}
