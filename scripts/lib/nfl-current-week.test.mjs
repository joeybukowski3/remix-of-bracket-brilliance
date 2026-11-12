import { describe, expect, it } from "vitest";
import { resolveNflWeekSelection } from "../../src/lib/nfl/weekSelection";
import {
  OVERDUE_GRACE_MS,
  resolveCurrentWeekDetailed,
  formatCurrentWeekOutput,
} from "./nfl-current-week.mjs";

// All instants are UTC; the helper never converts through a local zone, so DST
// cannot shift a turnover. ET offsets below: EDT = UTC-4 (through Nov 1 2026
// 06:00Z), EST = UTC-5 afterwards.
const game = (week, dateUtc, status, id = `${week}-${dateUtc}`) => ({ gameId: id, season: 2026, seasonType: "REG", week, dateUtc, status });
const at = (iso) => new Date(iso);

// Mirrors the real Nov 11 2026 production failure: Week 9 played Nov 5-9 but
// 14 of 15 games stayed "scheduled" because the results refresh never landed.
const STALE_WEEK_9 = [
  game(8, "2026-11-01T18:00:00Z", "final", "w8a"),
  game(8, "2026-11-03T01:15:00Z", "final", "w8b"),
  game(9, "2026-11-06T01:15:00Z", "final", "w9-thu"),
  game(9, "2026-11-08T18:00:00Z", "scheduled", "w9-sun-early"),
  game(9, "2026-11-08T21:25:00Z", "scheduled", "w9-sun-late"),
  game(9, "2026-11-09T01:20:00Z", "scheduled", "w9-snf"),
  game(9, "2026-11-10T01:15:00Z", "scheduled", "w9-mnf"),
  game(10, "2026-11-13T01:15:00Z", "scheduled", "w10-thu"),
  game(10, "2026-11-15T18:00:00Z", "scheduled", "w10-sun"),
];

describe("resolveCurrentWeekDetailed", () => {
  it("uses the earliest scheduled week and reports source=status when nothing is overdue", () => {
    const result = resolveCurrentWeekDetailed(STALE_WEEK_9, { now: at("2026-11-08T15:00:00Z") });
    expect(result).toMatchObject({ week: 9, source: "status", statusWeek: 9, overdueGames: [] });
  });

  it("keeps the week while the last game of the slate is still inside the grace window", () => {
    // MNF kickoff 2026-11-10T01:15Z (Mon 8:15 PM ET) + 12h grace = 13:15Z (Tue 8:15 AM ET).
    const result = resolveCurrentWeekDetailed(STALE_WEEK_9, { now: at("2026-11-10T11:00:00Z") });
    expect(result.week).toBe(9);
    expect(result.source).toBe("status");
    expect(result.overdueGames.map((g) => g.gameId)).toEqual(["w9-sun-early", "w9-sun-late", "w9-snf"]);
  });

  it("falls back to the next pending week when every scheduled game of the pinned week is overdue (Nov 11 incident)", () => {
    const result = resolveCurrentWeekDetailed(STALE_WEEK_9, { now: at("2026-11-11T21:30:00Z") });
    expect(result).toMatchObject({ week: 10, source: "calendar-fallback", statusWeek: 9 });
    expect(result.overdueGames.map((g) => g.gameId)).toEqual(["w9-sun-early", "w9-sun-late", "w9-snf", "w9-mnf"]);
    expect(result.overdueGames[0].hoursOverdue).toBeGreaterThan(48);
    expect(result.reason).toMatch(/overdue/i);
  });

  it("flips at kickoff + grace exactly (Monday-to-Tuesday turnover)", () => {
    const flipMs = Date.parse("2026-11-10T01:15:00Z") + OVERDUE_GRACE_MS;
    expect(resolveCurrentWeekDetailed(STALE_WEEK_9, { now: new Date(flipMs - 1) }).week).toBe(9);
    expect(resolveCurrentWeekDetailed(STALE_WEEK_9, { now: new Date(flipMs) }).week).toBe(10);
  });

  it("does not let one overdue game hold or release a week that still has an upcoming game", () => {
    const games = [game(9, "2026-11-08T18:00:00Z", "scheduled", "old"), game(9, "2026-11-12T01:15:00Z", "scheduled", "mnf-moved"), game(10, "2026-11-15T18:00:00Z", "scheduled")];
    const result = resolveCurrentWeekDetailed(games, { now: at("2026-11-11T12:00:00Z") });
    expect(result.week).toBe(9);
    expect(result.source).toBe("status");
    expect(result.overdueGames.map((g) => g.gameId)).toEqual(["old"]);
  });

  it("treats a postponed game with a future kickoff as pending (week stays put)", () => {
    const games = [game(9, "2026-11-14T18:00:00Z", "scheduled", "postponed-to-sat"), game(10, "2026-11-15T18:00:00Z", "scheduled")];
    expect(resolveCurrentWeekDetailed(games, { now: at("2026-11-11T12:00:00Z") }).week).toBe(9);
  });

  it("is unaffected by bye weeks (a week still resolves when fewer than 16 games exist)", () => {
    const games = [game(6, "2026-10-18T17:00:00Z", "scheduled", "only-game-in-bye-week")];
    expect(resolveCurrentWeekDetailed(games, { now: at("2026-10-14T12:00:00Z") })).toMatchObject({ week: 6, source: "status" });
  });

  it("returns unavailable (never a stale week) when every scheduled game is overdue", () => {
    const result = resolveCurrentWeekDetailed([game(18, "2027-01-03T18:00:00Z", "scheduled")], { now: at("2027-02-01T12:00:00Z") });
    expect(result).toMatchObject({ week: null, source: "unavailable" });
    expect(result.reason).toMatch(/overdue/i);
  });

  it("returns unavailable for an empty or fully final schedule", () => {
    expect(resolveCurrentWeekDetailed([], { now: at("2026-11-11T12:00:00Z") })).toMatchObject({ week: null, source: "unavailable" });
    expect(resolveCurrentWeekDetailed([game(1, "2026-09-10T00:20:00Z", "final")], { now: at("2026-11-11T12:00:00Z") })).toMatchObject({ week: null, source: "unavailable" });
  });

  it("ignores games without a kickoff time for overdue purposes (cannot prove staleness)", () => {
    const games = [{ gameId: "x", week: 4, status: "scheduled" }, game(5, "2026-10-04T17:00:00Z", "scheduled")];
    expect(resolveCurrentWeekDetailed(games, { now: at("2026-12-01T12:00:00Z") })).toMatchObject({ week: 4, source: "status" });
  });

  it("is stable across the Nov 1 2026 DST change", () => {
    const games = [
      game(8, "2026-11-01T18:00:00Z", "scheduled", "sun-1pm-est"), // 1:00 PM EST (after fall back)
      game(8, "2026-11-02T01:15:00Z", "scheduled", "mnf"),
      game(9, "2026-11-06T01:15:00Z", "scheduled"),
    ];
    expect(resolveCurrentWeekDetailed(games, { now: at("2026-11-02T10:00:00Z") }).week).toBe(8);
    expect(resolveCurrentWeekDetailed(games, { now: at("2026-11-02T14:00:00Z") }).week).toBe(9);
  });
});

describe("agreement with the site's calendar rule (resolveNflWeekSelection)", () => {
  // With every status stale ("scheduled") the fallback must land on the same
  // week the website's own calendar resolver shows, at midday ET (outside the
  // intentional <=12h grace window between last kickoff and ET midnight).
  const slate = [];
  const kickoffs = { 1: "2026-09-10T00:20:00Z", 2: "2026-09-17T00:15:00Z", 3: "2026-09-24T00:15:00Z", 4: "2026-10-01T00:15:00Z" };
  for (const [week, iso] of Object.entries(kickoffs)) {
    slate.push(game(Number(week), iso, "scheduled", `${week}-thu`));
    slate.push(game(Number(week), new Date(Date.parse(iso) + 4 * 86400e3).toISOString(), "scheduled", `${week}-mon`));
  }
  it.each([
    "2026-09-11T16:00:00Z", "2026-09-14T16:00:00Z", "2026-09-15T16:00:00Z", "2026-09-18T16:00:00Z",
    "2026-09-22T16:00:00Z", "2026-09-26T16:00:00Z", "2026-09-30T16:00:00Z", "2026-10-03T16:00:00Z",
  ])("matches at %s", (iso) => {
    const now = at(iso);
    const site = resolveNflWeekSelection(slate, { now }).week;
    expect(resolveCurrentWeekDetailed(slate, { now }).week).toBe(site);
  });
});

describe("formatCurrentWeekOutput", () => {
  it("emits GITHUB_OUTPUT key=value lines with provenance", () => {
    const result = resolveCurrentWeekDetailed(STALE_WEEK_9, { now: at("2026-11-11T21:30:00Z") });
    const lines = formatCurrentWeekOutput(2026, result);
    expect(lines).toEqual(expect.arrayContaining(["season=2026", "week=10", "week_source=calendar-fallback", "status_week=9", "overdue_games=4"]));
    expect(lines.slice(0, 2)).toEqual(["season=2026", "week=10"]);
  });
});
