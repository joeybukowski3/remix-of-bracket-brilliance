import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RECENT_WINDOW_GAMES,
  buildTeamFormFacts,
  type FormGameResult,
  type FormPerformanceRow,
  type FormPlaySums,
  type FormScheduleGame,
  type FormTeamWeekRow,
} from "./nfl-team-form-facts";
import { loadMatchupFormFacts, parseFormPerformanceRows, parseFormTeamWeekRows } from "./nfl-team-form-facts-loader";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* -------------------------------------------------------------------------- */
/* Synthetic fixtures                                                         */
/* -------------------------------------------------------------------------- */

function sums(overrides: Partial<FormPlaySums> = {}): FormPlaySums {
  return {
    offEpa: -10, offPlays: 50, successNum: 20, successDen: 50,
    passEpa: -4, passPlays: 30, passSuccessNum: 12, passSuccessDen: 30,
    rushEpa: -6, rushPlays: 20, rushSuccessNum: 8, rushSuccessDen: 20,
    explosivePass: 2, explosiveRush: 1, sacks: 2,
    ...overrides,
  };
}

function perf(gameId: string, team: string, overrides: Partial<FormPlaySums> = {}): FormPerformanceRow {
  return { gameId, team, all: sums(overrides) };
}

function week(gameId: string, team: string, overrides: Partial<FormTeamWeekRow> = {}): FormTeamWeekRow {
  return {
    gameId, team,
    attempts: 30, carries: 20, sacksSuffered: 2, passingYards: 200, rushingYards: 100,
    passingInterceptions: 1, sackFumblesLost: 0, rushingFumblesLost: 0, receivingFumblesLost: 0,
    ...overrides,
  };
}

function game(week: number, home: string, away: string, kickoffUtc: string, extra: Partial<FormScheduleGame> = {}): FormScheduleGame {
  const gameId = `2026_${String(week).padStart(2, "0")}_${away.toUpperCase()}_${home.toUpperCase()}`;
  return { gameId, season: 2026, week, seasonType: "REG", kickoffUtc, homeAbbr: home, awayAbbr: away, neutralSite: false, ...extra };
}

function result(g: FormScheduleGame, homeScore: number, awayScore: number, final = true): FormGameResult {
  return { gameId: g.gameId, homeAbbr: g.homeAbbr, awayAbbr: g.awayAbbr, homeScore, awayScore, final };
}

function rowsFor(g: FormScheduleGame, teamOverrides: Partial<FormPlaySums> = {}, oppOverrides: Partial<FormPlaySums> = {}) {
  return {
    performance: [perf(g.gameId, g.homeAbbr, teamOverrides), perf(g.gameId, g.awayAbbr, oppOverrides)],
    teamWeek: [week(g.gameId, g.homeAbbr), week(g.gameId, g.awayAbbr)],
  };
}

const KICK = (d: string) => `2026-09-${d}T17:00:00.000Z`;

describe("buildTeamFormFacts -- sample selection and leakage", () => {
  const w1 = game(1, "aaa", "bbb", KICK("06"));
  const w2 = game(2, "ccc", "aaa", KICK("13"));
  const w3 = game(3, "aaa", "ddd", KICK("20")); // the matchup
  const w4 = game(4, "eee", "aaa", KICK("27")); // future
  const games = [w1, w2, w3, w4];
  const results = [result(w1, 20, 10), result(w2, 17, 24), result(w3, 3, 45), result(w4, 0, 70)];
  const cache = [w1, w2, w3, w4].map((g) => rowsFor(g));
  const performance = cache.flatMap((c) => c.performance);
  const teamWeek = cache.flatMap((c) => c.teamWeek);
  const matchup = { gameId: w3.gameId, season: 2026, week: 3, kickoffUtc: w3.kickoffUtc };

  it("counts only completed games strictly before the matchup kickoff -- never the matchup game or a later game, even when the cache holds their rows", () => {
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results, performance, teamWeek });
    expect(facts.seasonToDate.gameIds).toEqual([w1.gameId, w2.gameId]);
    expect(facts.seasonToDate.games).toBe(2);
    expect(facts.seasonToDate.points).toMatchObject({ scored: 44, allowed: 27 });
    expect(facts.recentWindow.facts.gameIds).not.toContain(w3.gameId);
    expect(facts.recentWindow.facts.gameIds).not.toContain(w4.gameId);
    expect(facts.recentGame?.gameId).toBe(w2.gameId);
  });

  it("orients scores to the team (home/away) and derives W/L", () => {
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results, performance, teamWeek });
    expect(facts.recentGame).toMatchObject({ week: 2, opponent: "ccc", homeAway: "away", outcome: "W", pointsScored: 24, pointsAllowed: 17 });
    expect(facts.seasonToDate).toMatchObject({ wins: 2, losses: 0, ties: 0, record: "2-0" });
    const opponent = buildTeamFormFacts({ team: "ccc", matchup: { ...matchup, gameId: "x", kickoffUtc: w3.kickoffUtc }, games, results, performance, teamWeek });
    expect(opponent.recentGame).toMatchObject({ homeAway: "home", outcome: "L", pointsScored: 17, pointsAllowed: 24 });
  });

  it("reports the ACTUAL early-season window sample instead of pretending three games exist", () => {
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results, performance, teamWeek });
    expect(facts.recentWindow.requestedGames).toBe(RECENT_WINDOW_GAMES);
    expect(facts.recentWindow.games).toBe(2);
    expect(facts.recentWindow.facts.games).toBe(2);
  });

  it("uses exactly the most recent three completed games once more than three exist", () => {
    const ws = [1, 2, 3, 4, 5].map((n) => game(n, n % 2 ? "aaa" : "zzz", n % 2 ? "yyy" : "aaa", ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04"][n - 1] + "T17:00:00.000Z"));
    const target = game(6, "aaa", "qqq", "2026-10-11T17:00:00.000Z");
    const all = [...ws, target];
    const rs = ws.map((g) => result(g, 10, 20));
    const rows = ws.map((g) => rowsFor(g));
    const facts = buildTeamFormFacts({
      team: "aaa",
      matchup: { gameId: target.gameId, season: 2026, week: 6, kickoffUtc: target.kickoffUtc },
      games: all,
      results: rs,
      performance: rows.flatMap((r) => r.performance),
      teamWeek: rows.flatMap((r) => r.teamWeek),
    });
    expect(facts.seasonToDate.games).toBe(5);
    expect(facts.recentWindow.games).toBe(3);
    expect(facts.recentWindow.facts.gameIds).toEqual(ws.slice(2).map((g) => g.gameId));
    expect(facts.recentGame?.gameId).toBe(ws[4].gameId);
  });

  it("returns games=0 with every block null (not zeros) for a team's first game", () => {
    const facts = buildTeamFormFacts({ team: "aaa", matchup: { gameId: w1.gameId, season: 2026, week: 1, kickoffUtc: w1.kickoffUtc }, games, results, performance, teamWeek });
    expect(facts.seasonToDate).toMatchObject({ games: 0, record: "0-0", points: null, efficiency: null, yardage: null, turnovers: null });
    expect(facts.recentGame).toBeNull();
    expect(facts.recentWindow.games).toBe(0);
  });

  it("excludes prior games without a final result and lists them", () => {
    const pending = results.map((r) => (r.gameId === w2.gameId ? { ...r, final: false } : r));
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results: pending, performance, teamWeek });
    expect(facts.seasonToDate.gameIds).toEqual([w1.gameId]);
    expect(facts.incompletePriorGameIds).toEqual([w2.gameId]);
  });

  it("counts a tie as neither a win nor a loss", () => {
    const tied = results.map((r) => (r.gameId === w2.gameId ? { ...r, homeScore: 20, awayScore: 20 } : r));
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results: tied, performance, teamWeek });
    expect(facts.seasonToDate).toMatchObject({ wins: 1, losses: 0, ties: 1, record: "1-0-1" });
    expect(facts.recentGame?.outcome).toBe("T");
  });
});

describe("buildTeamFormFacts -- missing data is explicit, never zero", () => {
  const w1 = game(1, "aaa", "bbb", KICK("06"));
  const w2 = game(2, "ccc", "aaa", KICK("13"));
  const target = game(3, "aaa", "ddd", KICK("20"));
  const games = [w1, w2, target];
  const results = [result(w1, 20, 10), result(w2, 17, 24)];
  const matchup = { gameId: target.gameId, season: 2026, week: 3, kickoffUtc: target.kickoffUtc };

  it("nulls efficiency for the whole scope when one game lacks a performance row, but keeps points", () => {
    const rows = [w1, w2].map((g) => rowsFor(g));
    const performance = rows.flatMap((r) => r.performance).filter((r) => !(r.gameId === w2.gameId && r.team === "aaa"));
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results, performance, teamWeek: rows.flatMap((r) => r.teamWeek) });
    expect(facts.seasonToDate.efficiency).toBeNull();
    expect(facts.seasonToDate.points).not.toBeNull();
    expect(facts.seasonToDate.yardage).not.toBeNull();
    expect(facts.recentGame?.facts.efficiency).toBeNull();
    // w1 alone is complete, so a window that excluded w2 would still be available -- the null above is per-scope, not global.
    expect(buildTeamFormFacts({ team: "aaa", matchup: { ...matchup, gameId: w2.gameId, kickoffUtc: w2.kickoffUtc }, games, results, performance, teamWeek: rows.flatMap((r) => r.teamWeek) }).seasonToDate.efficiency).not.toBeNull();
  });

  it("nulls yardage and turnovers when the team-week rows are absent", () => {
    const rows = [w1, w2].map((g) => rowsFor(g));
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results, performance: rows.flatMap((r) => r.performance), teamWeek: [] });
    expect(facts.seasonToDate.yardage).toBeNull();
    expect(facts.seasonToDate.turnovers).toBeNull();
    expect(facts.seasonToDate.efficiency).not.toBeNull();
  });

  it("returns null rates (not NaN or 0) when a denominator is zero", () => {
    const rows = [w1, w2].map((g) => rowsFor(g, { rushPlays: 0, rushEpa: 0, rushSuccessDen: 0, rushSuccessNum: 0 }, { rushPlays: 0, rushEpa: 0, rushSuccessDen: 0, rushSuccessNum: 0 }));
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results, performance: rows.flatMap((r) => r.performance), teamWeek: rows.flatMap((r) => r.teamWeek) });
    expect(facts.seasonToDate.efficiency?.offense.epaPerRush).toBeNull();
    expect(facts.seasonToDate.efficiency?.offense.rushSuccessRate).toBeNull();
    expect(facts.seasonToDate.efficiency?.offense.explosiveRushRate).toBeNull();
  });
});

describe("buildTeamFormFacts -- metric definitions", () => {
  const w1 = game(1, "aaa", "bbb", KICK("06"));
  const target = game(2, "ccc", "aaa", KICK("13"));
  const matchup = { gameId: target.gameId, season: 2026, week: 2, kickoffUtc: target.kickoffUtc };

  it("sums numerators and denominators once (never averages per-game rates) and reads defense from the opponent's row", () => {
    const w0 = game(0, "aaa", "bbb", KICK("01"), { gameId: "2026_00_BBB_AAA" });
    const games = [w0, w1, target];
    const results = [result(w0, 10, 0), result(w1, 10, 0)];
    const performance = [
      perf(w0.gameId, "aaa", { offEpa: -5, offPlays: 10, successNum: 5, successDen: 10 }),
      perf(w0.gameId, "bbb", { offEpa: 8, offPlays: 20, successNum: 12, successDen: 20 }),
      perf(w1.gameId, "aaa", { offEpa: 5, offPlays: 90, successNum: 45, successDen: 90 }),
      perf(w1.gameId, "bbb", { offEpa: 1, offPlays: 30, successNum: 3, successDen: 30 }),
    ];
    const facts = buildTeamFormFacts({ team: "aaa", matchup: { ...matchup, week: 2 }, games, results, performance, teamWeek: [] });
    const eff = facts.seasonToDate.efficiency!;
    expect(eff.offense.epaPerPlay).toBeCloseTo(0 / 100, 12); // (-5 + 5) / (10 + 90); averaging -0.5 and 0.0556 would give a different value
    expect(eff.offense.successRate).toBeCloseTo(50 / 100, 12);
    expect(eff.defense.epaPerPlay).toBeCloseTo(9 / 50, 12);
    expect(eff.defense.successRate).toBeCloseTo(15 / 50, 12);
  });

  it("defines yards/play as gross yards over attempts + carries + sacks, and turnovers as INT + all lost fumbles, with takeaways from the opponent", () => {
    const games = [w1, target];
    const results = [result(w1, 10, 3)];
    const teamWeek = [
      week(w1.gameId, "aaa", { attempts: 20, carries: 25, sacksSuffered: 5, passingYards: 150, rushingYards: 100, passingInterceptions: 2, sackFumblesLost: 1, rushingFumblesLost: 1, receivingFumblesLost: 1 }),
      week(w1.gameId, "bbb", { attempts: 40, carries: 10, sacksSuffered: 0, passingYards: 300, rushingYards: 50, passingInterceptions: 1, sackFumblesLost: 0, rushingFumblesLost: 0, receivingFumblesLost: 0 }),
    ];
    const facts = buildTeamFormFacts({ team: "aaa", matchup, games, results, performance: [], teamWeek });
    expect(facts.seasonToDate.yardage?.offense).toEqual({ grossYards: 250, passYards: 150, rushYards: 100, plays: 50, yardsPerPlay: 5 });
    expect(facts.seasonToDate.yardage?.defense).toMatchObject({ grossYards: 350, plays: 50, yardsPerPlay: 7 });
    expect(facts.seasonToDate.turnovers).toEqual({ committed: 5, takeaways: 1, margin: -4, committedPerGame: 5, takeawaysPerGame: 1 });
    expect(facts.seasonToDate.efficiency).toBeNull();
  });
});

describe("independence", () => {
  it("carries no JKB conclusion or composite field anywhere in the output", () => {
    const w1 = game(1, "aaa", "bbb", KICK("06"));
    const target = game(2, "ccc", "aaa", KICK("13"));
    const rows = rowsFor(w1);
    const facts = buildTeamFormFacts({
      team: "aaa",
      matchup: { gameId: target.gameId, season: 2026, week: 2, kickoffUtc: target.kickoffUtc },
      games: [w1, target],
      results: [result(w1, 10, 3)],
      performance: rows.performance,
      teamWeek: rows.teamWeek,
    });
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          walk(v);
        }
      }
    };
    walk(facts);
    const forbidden = /spread|projected|power|ovr|rating|matchupscore|tdscore|coach|edge|advantage|moneyline|winprob|pick/i;
    expect(keys.filter((k) => forbidden.test(k))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Real committed data: 2026 Week 3 LAC @ BUF                                 */
/* -------------------------------------------------------------------------- */

describe("real 2026 data -- LAC going into 2026_03_LAC_BUF", () => {
  const loaded = loadMatchupFormFacts({ root: ROOT, season: 2026, gameId: "2026_03_LAC_BUF" });
  if (loaded.status !== "ok") throw new Error(`fixture load failed: ${loaded.reason}`);
  const lac = loaded.away;
  const bills = loaded.home;

  it("resolves the matchup and orients teams", () => {
    expect(lac.team).toBe("lac");
    expect(bills.team).toBe("buf");
    expect(lac.asOfWeek).toBe(3);
    expect(lac.matchupGameId).toBe("2026_03_LAC_BUF");
  });

  it("season to date: games, record, scoring", () => {
    expect(lac.seasonToDate.gameIds).toEqual(["2026_01_ARI_LAC", "2026_02_LV_LAC"]);
    expect(lac.seasonToDate).toMatchObject({ games: 2, wins: 0, losses: 2, ties: 0, record: "0-2" });
    expect(lac.seasonToDate.points).toEqual({ scored: 28, allowed: 52, scoredPerGame: 14, allowedPerGame: 26 });
    expect(lac.incompletePriorGameIds).toEqual([]);
  });

  it("recent game (Week 2 vs LV): result, EPA, pass/rush EPA, success rates -- reconciled to raw performance_team_game values", () => {
    const g = lac.recentGame!;
    expect(g).toMatchObject({ gameId: "2026_02_LV_LAC", week: 2, opponent: "lv", homeAway: "home", outcome: "L", pointsScored: 14, pointsAllowed: 26 });
    const off = g.facts.efficiency!.offense;
    // Raw row: all_offEpa=-20.186833115634524 / all_offPlays=67; pass -0.0692255 over 34 dropbacks; rush -0.5403989 over 33 rushes.
    expect(off.epaPlays).toBe(67);
    expect(off.epaPerPlay).toBeCloseTo(-20.186833115634524 / 67, 9);
    expect(off.epaPerPlay).toBeCloseTo(-0.30129601665126154, 9);
    expect(off.dropbacks).toBe(34);
    expect(off.epaPerPass).toBeCloseTo(-0.06922554143896291, 9);
    expect(off.rushes).toBe(33);
    expect(off.epaPerRush).toBeCloseTo(-0.5403989305063572, 9);
    expect(off.successRate).toBeCloseTo(27 / 67, 9);
    expect(off.passSuccessRate).toBeCloseTo(12 / 34, 9);
    expect(off.rushSuccessRate).toBeCloseTo(15 / 33, 9);
    expect(off.explosivePasses).toBe(4);
    expect(off.explosiveRushes).toBe(3);
    expect(off.sacks).toBe(3);
    // Defense = LV's offense in the same game.
    expect(g.facts.efficiency!.defense.epaPerPlay).toBeCloseTo(-0.09795744536951088, 9);
    expect(g.facts.efficiency!.defense.sacks).toBe(2);
  });

  it("recent game: yards/play and turnovers from stats_team_week", () => {
    const g = lac.recentGame!.facts;
    // Raw: LAC 192 pass + 127 rush yards on 27 attempts + 32 carries + 3 sacks = 62 plays.
    expect(g.yardage!.offense).toMatchObject({ passYards: 192, rushYards: 127, grossYards: 319, plays: 62 });
    expect(g.yardage!.offense.yardsPerPlay).toBeCloseTo(319 / 62, 12);
    // LV: 253 pass + 57 rush on 29 + 29 + 2 = 60 plays.
    expect(g.yardage!.defense).toMatchObject({ grossYards: 310, plays: 60 });
    // LAC: 2 interceptions + 1 rushing fumble lost; LV committed 1 interception.
    expect(g.turnovers).toEqual({ committed: 3, takeaways: 1, margin: -2, committedPerGame: 3, takeawaysPerGame: 1 });
  });

  it("season to date sums both games once", () => {
    const eff = lac.seasonToDate.efficiency!;
    expect(eff.offense.epaPlays).toBe(55 + 67);
    expect(eff.offense.epaPerPlay).toBeCloseTo((-9.172669976891502 + -20.186833115634524) / (55 + 67), 9);
    expect(lac.seasonToDate.turnovers).toMatchObject({ committed: 5, takeaways: 1, margin: -4, committedPerGame: 2.5 });
    expect(lac.seasonToDate.yardage!.offense.plays).toBe(51 + 62);
  });

  it("recent window equals the season sample early in the year and says so", () => {
    expect(lac.recentWindow).toMatchObject({ requestedGames: 3, games: 2 });
    expect(lac.recentWindow.facts.gameIds).toEqual(lac.seasonToDate.gameIds);
    expect(lac.recentWindow.facts.record).toBe("0-2");
  });

  it("does not include the matchup game or any later game for either team", () => {
    for (const team of [lac, bills]) {
      expect(team.seasonToDate.gameIds).not.toContain("2026_03_LAC_BUF");
      expect(team.seasonToDate.games).toBeLessThanOrEqual(2);
    }
  });

  it("reconciles to the existing matchup-epa / matchup-metrics artifacts when they cover the same games", () => {
    const epa = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/matchup-epa.json"), "utf8")).windows["season-current"].teams.lac;
    const metrics = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/matchup-metrics.json"), "utf8")).windows["season-current"].teams.lac;
    const sameGames = JSON.stringify([...epa.gameIds].sort()) === JSON.stringify([...lac.seasonToDate.gameIds].sort()) && JSON.stringify([...metrics.gameIds].sort()) === JSON.stringify([...lac.seasonToDate.gameIds].sort());
    if (!sameGames) return; // the artifacts have advanced past this matchup's as-of point; the raw-row assertions above still hold.
    const off = lac.seasonToDate.efficiency!.offense;
    const def = lac.seasonToDate.efficiency!.defense;
    expect(off.epaPerPlay).toBeCloseTo(epa.metrics["off.epaPerPlay"][0], 2);
    expect(off.epaPerPass).toBeCloseTo(epa.metrics["off.epaPerPass"][0], 2);
    expect(off.epaPerRush).toBeCloseTo(epa.metrics["off.epaPerRush"][0], 2);
    expect(def.epaPerPlay).toBeCloseTo(epa.metrics["def.epaPerPlayAllowed"][0], 2);
    expect(lac.seasonToDate.yardage!.offense.yardsPerPlay).toBeCloseTo(metrics.metrics["off.yardsPerPlay"][0], 2);
    expect(lac.seasonToDate.turnovers!.committedPerGame).toBeCloseTo(metrics.metrics["off.turnoversPerGame"][0], 2);
    expect(lac.seasonToDate.turnovers!.takeawaysPerGame).toBeCloseTo(metrics.metrics["def.takeawaysPerGame"][0], 2);
    expect(lac.seasonToDate.points!.scoredPerGame).toBeCloseTo(metrics.metrics["off.pointsPerGame"][0], 2);
    expect(lac.seasonToDate.points!.allowedPerGame).toBeCloseTo(metrics.metrics["def.pointsAllowedPerGame"][0], 2);
  });

  it("returns an error for an unknown game", () => {
    expect(loadMatchupFormFacts({ root: ROOT, season: 2026, gameId: "2026_99_XXX_YYY" })).toEqual({ status: "error", reason: "unknown_game" });
  });
});

describe("cache cross-checks on every committed 2026 team-game row", () => {
  const perfRows = parseFormPerformanceRows(readFileSync(join(ROOT, "data/nfl/nflverse/performance-team-game/performance_team_game_2026.csv"), "utf8"));
  const rawWeek = readFileSync(join(ROOT, "data/nfl/nflverse/stats-team-week-current/stats_team_week_2026.csv"), "utf8");
  const weekRows = parseFormTeamWeekRows(rawWeek);

  it("PBP sacks equal official sacks_suffered for every team-game (two sources agree)", () => {
    const officialByKey = new Map(weekRows.map((r) => [`${r.gameId}|${r.team}`, r.sacksSuffered] as const));
    const mismatches = perfRows.filter((r) => officialByKey.has(`${r.gameId}|${r.team}`) && officialByKey.get(`${r.gameId}|${r.team}`) !== r.all.sacks);
    expect(mismatches.map((r) => `${r.gameId}|${r.team}`)).toEqual([]);
  });

  it("offensive turnovers never exceed the official total, and any excess is a fumble outside the offensive categories (special teams)", () => {
    const raw = rawWeek.split(/\r?\n/).filter(Boolean);
    const header = raw[0].split(",");
    const idx = (name: string) => header.indexOf(name);
    // Every column read here precedes any quoted comma-bearing field, so a plain split is safe.
    const bad: string[] = [];
    for (const line of raw.slice(1)) {
      const c = line.split(",");
      const num = (name: string) => Number(c[idx(name)] || 0);
      const committed = num("passing_interceptions") + num("sack_fumbles_lost") + num("rushing_fumbles_lost") + num("receiving_fumbles_lost");
      const official = num("passing_interceptions") + num("fumbles_lost_total");
      const offensiveFumbles = num("sack_fumbles") + num("rushing_fumbles") + num("receiving_fumbles");
      const excess = official - committed;
      // excess > 0 is only legitimate when the team also recorded a fumble that no offensive category owns (a punt/kick-return fumble).
      if (excess < 0 || (excess > 0 && num("fumbles_total") <= offensiveFumbles)) bad.push(`${c[idx("game_id")]}|${c[idx("team")]}: offensive ${committed} vs official ${official}`);
    }
    expect(bad).toEqual([]);
  });
});
