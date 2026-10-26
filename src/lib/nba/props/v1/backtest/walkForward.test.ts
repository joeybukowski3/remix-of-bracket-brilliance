import { describe, expect, it } from "vitest";
import { CANONICAL_TEAM_CODES } from "../../canonical";
import { DEFAULT_BASELINE_PARAMS } from "../../projection";
import type { ImportedPlayerGame } from "../playerGameImport";
import { expandingLeagueRates, MIN_FORM_GAMES, walkForward } from "./walkForward";

const TEAMS = CANONICAL_TEAM_CODES.slice(0, 4);
const SLOTS = 6;
const DAYS = 24;

/** A small invented league: two games every other day, six players a side, deterministic noise. Not real data. */
function league(over: (row: ImportedPlayerGame) => ImportedPlayerGame = (r) => r): ImportedPlayerGame[] {
  let seed = 12345;
  const noise = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const rows: ImportedPlayerGame[] = [];
  for (let day = 0; day < DAYS; day += 1) {
    const date = new Date(Date.UTC(2025, 10, 1) + day * 2 * 86_400_000).toISOString().slice(0, 10);
    const pairs: Array<[string, string]> = day % 2 === 0 ? [[TEAMS[0], TEAMS[1]], [TEAMS[2], TEAMS[3]]] : [[TEAMS[0], TEAMS[2]], [TEAMS[1], TEAMS[3]]];
    for (const [home, away] of pairs) {
      const gameId = `g-${date}-${home}-${away}`;
      for (const [team, opponent, isHome] of [[home, away, true], [away, home, false]] as const) {
        for (let slot = 1; slot <= SLOTS; slot += 1) {
          const minutes = Math.round(36 - slot * 4 + noise() * 6);
          rows.push(over({ season: "2025-26", seasonType: "regular", gameId, gameDate: date, team, opponent, isHome, playerId: `${team}-${slot}`, playerName: `Demo ${team} ${slot}`, minutes, pts: Math.round(minutes * (0.6 - slot * 0.05) + noise() * 4), reb: Math.round(minutes * 0.15 + noise() * 2), ast: Math.round(minutes * 0.08 + noise() * 2) }));
        }
      }
    }
  }
  return rows;
}

const opts = { targetSeasons: ["2025-26"] };

describe("walkForward", () => {
  const rows = league();
  const result = walkForward(rows, opts);

  it("leaves out the first game of every player, which has nothing to project from, and counts it", () => {
    expect(result.withoutHistory).toBe(TEAMS.length * SLOTS);
    expect(result.rows).toHaveLength(rows.length - result.withoutHistory);
    expect(result.targets).toBe(rows.length);
  });

  it("scores each row with v0 and the three naive baselines, and carries the actual result apart from the predictions", () => {
    const row = result.rows[0];
    expect(Object.keys(row.predictions).sort()).toEqual(["naive_l10", "naive_l5", "naive_season_to_date", "v0"]);
    expect(row.actual).toEqual({ minutes: expect.any(Number), pts: expect.any(Number), reb: expect.any(Number), ast: expect.any(Number) });
    expect(JSON.stringify(row.predictions)).not.toContain(`"actual"`);
  });

  it("never lets a game see itself, its own day or anything later: predictions are unchanged when later games are deleted", () => {
    const cutoff = rows[Math.floor(rows.length * 0.6)].gameDate;
    const truncated = walkForward(rows.filter((r) => r.gameDate <= cutoff), opts);
    const key = (r: { gameId: string; playerId: string }) => `${r.gameId}|${r.playerId}`;
    const full = new Map(result.rows.map((r) => [key(r), r]));
    expect(truncated.rows.length).toBeGreaterThan(50);
    for (const row of truncated.rows) {
      const same = full.get(key(row));
      expect(same?.predictions, key(row)).toEqual(row.predictions);
      expect(same?.teamRestDays).toBe(row.teamRestDays);
    }
  });

  it("is unchanged when the box scores of later games are rewritten", () => {
    const cutoff = rows[Math.floor(rows.length * 0.5)].gameDate;
    const rewritten = walkForward(league((r) => (r.gameDate > cutoff ? { ...r, minutes: r.minutes + 17, pts: r.pts + 40, reb: r.reb + 9, ast: r.ast + 9 } : r)), opts);
    const earlier = (rs: typeof result.rows) => rs.filter((r) => r.gameDate <= cutoff).map((r) => [r.gameId, r.playerId, r.predictions, r.expectedAbsMargin, r.opponentDefense]);
    expect(earlier(rewritten.rows)).toEqual(earlier(result.rows));
  });

  it("does respond to earlier information, so the leakage checks are not vacuous", () => {
    const dates = [...new Set(rows.map((r) => r.gameDate))].sort();
    const changed = walkForward(league((r) => (r.gameDate < dates[4] ? { ...r, pts: r.pts + 30 } : r)), opts);
    const later = result.rows.findIndex((r) => r.gameDate === dates[5]);
    expect(changed.rows[later].predictions.v0.pts).not.toBe(result.rows[later].predictions.v0.pts);
  });

  it("fills pregame rest from earlier game dates only", () => {
    const first = result.rows.find((r) => r.team === TEAMS[0]);
    expect(first?.teamRestDays).toBe(2);
    expect(new Set(result.rows.map((r) => r.teamRestDays))).toEqual(new Set([2]));
  });

  it("uses team form only after enough earlier games, and reports it null before", () => {
    const early = result.rows.filter((r) => r.expectedAbsMargin === null);
    const late = result.rows.filter((r) => r.expectedAbsMargin !== null);
    expect(MIN_FORM_GAMES).toBe(5);
    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(early.length);
    expect(Math.max(...early.map((r) => Date.parse(r.gameDate)))).toBeLessThan(Math.min(...late.map((r) => Date.parse(r.gameDate))) + 1);
  });

  it("measures the final margin from the player rows, as a diagnostic", () => {
    const row = result.rows[result.rows.length - 1];
    const inGame = rows.filter((r) => r.gameId === row.gameId);
    const byTeam = new Map<string, number>();
    for (const r of inGame) byTeam.set(r.team, (byTeam.get(r.team) ?? 0) + r.pts);
    const [a, b] = [...byTeam.values()];
    expect(row.marginAbs).toBe(Math.abs(a - b));
  });

  it("scores only the requested season and only regular-season games, using other games as history", () => {
    const mixed = [...rows, ...rows.slice(0, 10).map((r) => ({ ...r, season: "2026-27" as const, gameDate: "2026-10-20", gameId: `${r.gameId}-b` })), ...rows.slice(0, 5).map((r) => ({ ...r, seasonType: "playoffs" as const, gameDate: "2026-04-20", gameId: `${r.gameId}-p` }))];
    const forward = walkForward(mixed, { targetSeasons: ["2026-27"] });
    expect(forward.targets).toBe(10);
    expect(forward.rows.every((r) => r.season === "2026-27")).toBe(true);
    expect(forward.withoutHistory).toBe(0);
  });

  it("applies alternative v0 parameters to v0 only", () => {
    const variant = walkForward(rows, { ...opts, params: { ...DEFAULT_BASELINE_PARAMS, minutesShrinkGames: 0 } });
    const pick = (rs: typeof result.rows) => rs[5].predictions;
    expect(pick(variant.rows).v0.minutes).not.toBe(pick(result.rows).v0.minutes);
    expect(pick(variant.rows).naive_l5).toEqual(pick(result.rows).naive_l5);
  });
});

describe("expandingLeagueRates", () => {
  const rows = league();
  const priors = expandingLeagueRates(rows);

  it("has no rates before any minutes exist, and uses only earlier dates afterwards", () => {
    expect(priors(rows[0].gameDate)).toBeNull();
    const second = [...new Set(rows.map((r) => r.gameDate))].sort()[1];
    const first = rows.filter((r) => r.gameDate < second);
    const minutes = first.reduce((s, r) => s + r.minutes, 0);
    expect(priors(second)?.leagueRate.pts).toBeCloseTo(first.reduce((s, r) => s + r.pts, 0) / minutes, 12);
  });

  it("ignores preseason games", () => {
    const withPre = expandingLeagueRates([...rows, { ...rows[0], seasonType: "preseason", gameDate: "2025-10-01", pts: 999 }]);
    expect(withPre(rows[0].gameDate)).toBeNull();
  });
});
