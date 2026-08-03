import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  LAST5_GAME_COUNT,
  LAST8_GAME_COUNT,
  RBSDM_FIELD_MAP,
  RBSDM_METRIC_DIRECTION,
  RBSDM_METRIC_KEYS,
  buildRbsdmPayload,
  buildRbsdmTeamMap,
  completedGameCounts,
  groupTeamsByWeekRange,
  rankPeriodValues,
  seasonToDateRange,
  toPercent,
  validateRbsdmResponse,
} from "../../../scripts/lib/nfl-rbsdm-success.mjs";
import { buildCompletedGameIndex } from "../../../scripts/lib/nfl-matchup-metrics.mjs";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";

const ROOT = resolve(__dirname, "../../..");
const TEAMS_JSON = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8"));
const TEAM_MAP = buildRbsdmTeamMap(TEAMS_JSON);

// ---------------------------------------------------------------------------
// Fixtures — no test touches the live API.
// ---------------------------------------------------------------------------

function row(code: string, overrides: Record<string, unknown> = {}) {
  return {
    team_abbr: code,
    team_logo_espn: `https://a.espncdn.com/i/teamlogos/nfl/500/${code.toLowerCase()}.png`,
    team_color: "#000000",
    team_color2: "#ffffff",
    off_rush_suc: 0.42,
    off_pass_suc: 0.55,
    off_suc: 0.5,
    def_rush_suc: 0.4,
    def_pass_suc: 0.45,
    def_suc: 0.43,
    ...overrides,
  };
}

const ALL_CODES = [...TEAM_MAP.keys()];
const fullResponse = () => ({ rows: ALL_CODES.map((c) => row(c)) });

describe("team mapping", () => {
  it("maps all 32 RBSDM codes onto canonical abbreviations", () => {
    expect(TEAM_MAP.size).toBe(32);
    expect(TEAM_MAP.get("NE")).toBe("ne");
    expect(TEAM_MAP.get("SEA")).toBe("sea");
    expect(TEAM_MAP.get("LA")).toBe("lar");
    expect(TEAM_MAP.get("WAS")).toBe("wsh");
  });

  it("rejects a teams file that is not exactly 32 teams", () => {
    expect(() => buildRbsdmTeamMap({ teams: TEAMS_JSON.teams.slice(0, 31) })).toThrow(/32/);
  });
});

describe("field mapping", () => {
  it("maps all six analyzer metrics to their RBSDM source fields", () => {
    expect(RBSDM_FIELD_MAP).toEqual({
      "off.successRate": "off_suc",
      "off.passSuccessRate": "off_pass_suc",
      "off.rushSuccessRate": "off_rush_suc",
      "def.successRateAllowed": "def_suc",
      "def.passSuccessRateAllowed": "def_pass_suc",
      "def.rushSuccessRateAllowed": "def_rush_suc",
    });
  });

  it("agrees with the UI catalogue on direction for every metric", () => {
    for (const key of RBSDM_METRIC_KEYS) {
      const uiDef = getMetricDef(key);
      expect(uiDef, `${key} missing from UI catalogue`).not.toBeNull();
      expect(RBSDM_METRIC_DIRECTION[key], key).toBe(uiDef!.direction);
    }
  });

  it("adds no EPA or wEPA fields", () => {
    const fields = Object.values(RBSDM_FIELD_MAP).join(" ");
    expect(fields).not.toMatch(/epa/i);
  });
});

describe("request payload", () => {
  it("builds the confirmed regular-season-only body", () => {
    expect(buildRbsdmPayload({ season: 2025, weekMin: 10, weekMax: 18 })).toEqual({
      season_min: 2025, season_max: 2025, week_min: 10, week_max: 18,
      weeks_post_start: "None", weeks_post_end: "None",
      downs: [1, 2, 3, 4], quarters: [1, 2, 3, 4, 5],
      wp_filter: 0, exclude_turnovers: false,
    });
  });

  it("never requests postseason weeks", () => {
    const payload = buildRbsdmPayload({ season: 2026, weekMin: 1, weekMax: 5 });
    expect(payload.weeks_post_start).toBe("None");
    expect(payload.weeks_post_end).toBe("None");
  });

  it("rejects malformed ranges", () => {
    expect(() => buildRbsdmPayload({ season: 2025, weekMin: 5, weekMax: 3 })).toThrow();
    expect(() => buildRbsdmPayload({ season: 2025, weekMin: 0, weekMax: 5 })).toThrow();
  });
});

describe("response validation", () => {
  const opts = { teamMap: TEAM_MAP, requiredTeams: ["ne", "sea"], label: "test" };

  it("accepts a valid 32-team response and maps every field", () => {
    const { byTeam, teamsReturned } = validateRbsdmResponse(fullResponse(), opts);
    expect(teamsReturned).toHaveLength(32);
    const ne = byTeam.get("ne")!;
    expect(Object.keys(ne).sort()).toEqual([...RBSDM_METRIC_KEYS].sort());
    expect(ne["off.successRate"]).toBe(0.5);
    expect(ne["def.rushSuccessRateAllowed"]).toBe(0.4);
  });

  it("rejects an HTML error page", () => {
    expect(() => validateRbsdmResponse("<!doctype html><html>...", opts)).toThrow(/not JSON|HTML/i);
  });

  it("rejects an empty object and a rows-less body", () => {
    expect(() => validateRbsdmResponse({}, opts)).toThrow(/rows is not an array/);
    expect(() => validateRbsdmResponse({ rows: [] }, opts)).toThrow(/zero rows/);
  });

  it("rejects an array body (rows must be wrapped)", () => {
    expect(() => validateRbsdmResponse([row("NE")], opts)).toThrow(/not a JSON object/);
  });

  it("rejects an unknown team code rather than dropping it", () => {
    const bad = { rows: [...ALL_CODES.map((c) => row(c)), row("XXX")] };
    expect(() => validateRbsdmResponse(bad, opts)).toThrow(/unknown RBSDM team code "XXX"/);
  });

  it("rejects duplicate team rows", () => {
    const bad = { rows: [...ALL_CODES.map((c) => row(c)), row("NE")] };
    expect(() => validateRbsdmResponse(bad, opts)).toThrow(/duplicate team row/i);
  });

  it("rejects a missing required team", () => {
    const bad = { rows: ALL_CODES.filter((c) => c !== "SEA").map((c) => row(c)) };
    expect(() => validateRbsdmResponse(bad, opts)).toThrow(/missing required teams sea/);
  });

  it("rejects a malformed numeric value", () => {
    const bad = { rows: ALL_CODES.map((c) => row(c, c === "NE" ? { off_suc: "0.5" } : {})) };
    expect(() => validateRbsdmResponse(bad, opts)).toThrow(/not a finite number/);
    const nan = { rows: ALL_CODES.map((c) => row(c, c === "NE" ? { off_suc: Number.NaN } : {})) };
    expect(() => validateRbsdmResponse(nan, opts)).toThrow(/not a finite number/);
  });

  it("rejects fractions outside the 0-1 range", () => {
    const high = { rows: ALL_CODES.map((c) => row(c, c === "NE" ? { off_suc: 50.5 } : {})) };
    expect(() => validateRbsdmResponse(high, opts)).toThrow(/outside the 0-1 fraction range/);
    const negative = { rows: ALL_CODES.map((c) => row(c, c === "NE" ? { def_suc: -0.1 } : {})) };
    expect(() => validateRbsdmResponse(negative, opts)).toThrow(/outside the 0-1 fraction range/);
  });

  it("accepts an explicit null value without inventing a number", () => {
    const withNull = { rows: ALL_CODES.map((c) => row(c, c === "NE" ? { off_suc: null } : {})) };
    const { byTeam } = validateRbsdmResponse(withNull, opts);
    expect(byTeam.get("ne")!["off.successRate"]).toBeNull();
  });

  it("rejects a row without a team_abbr", () => {
    const bad = { rows: [{ off_suc: 0.5 }] };
    expect(() => validateRbsdmResponse(bad, { ...opts, requiredTeams: [] })).toThrow(/no team_abbr/);
  });
});

// ---------------------------------------------------------------------------
// Week-range grouping
// ---------------------------------------------------------------------------

function season(seasonYear: number, perTeamWeeks: Record<string, number[]>) {
  const games: unknown[] = [];
  const results: unknown[] = [];
  for (const [team, weeks] of Object.entries(perTeamWeeks)) {
    for (const week of weeks) {
      const gameId = `${seasonYear}_${String(week).padStart(2, "0")}_${team.toUpperCase()}_OPP`;
      games.push({ gameId, season: seasonYear, week, seasonType: "REG", dateUtc: `${seasonYear}-09-${String(week).padStart(2, "0")}T17:00:00.000Z` });
      results.push({ gameId, seasonType: "REG", final: true, homeAbbr: team, awayAbbr: "opp", homeScore: 20, awayScore: 10 });
    }
  }
  return { season: seasonYear, games, results };
}

/**
 * buildCompletedGameIndex correctly indexes both sides of every game, so the
 * synthetic "opp" placeholder appears too. Scope the index to the teams under
 * test so assertions stay about the grouping logic.
 */
function scoped(index: Map<string, unknown[]>, teams: string[]) {
  return new Map(teams.filter((t) => index.has(t)).map((t) => [t, index.get(t)!]));
}

describe("last-8 / last-5 range grouping", () => {
  it("groups teams by the week range reproducing their own final N games", () => {
    // ne has a week-14 bye so its final 8 start at week 10; sea's start at 11.
    const index = buildCompletedGameIndex([
      season(2025, {
        ne: [10, 11, 12, 13, 15, 16, 17, 18],
        sea: [11, 12, 13, 14, 15, 16, 17, 18],
      }),
    ]);
    const { groups } = groupTeamsByWeekRange(scoped(index, ["ne", "sea"]), { season: 2025, gameCount: LAST8_GAME_COUNT });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ weekMin: 10, weekMax: 18, teams: ["ne"] });
    expect(groups[1]).toMatchObject({ weekMin: 11, weekMax: 18, teams: ["sea"] });
    expect(groups[0].gameIdsByTeam.ne).toHaveLength(8);
    expect(groups[0].gameIdsByTeam.ne).not.toContain("2025_14_NE_OPP");
  });

  it("assigns every team to exactly one range", () => {
    const index = buildCompletedGameIndex([
      season(2025, {
        ne: [10, 11, 12, 13, 15, 16, 17, 18],
        sea: [11, 12, 13, 14, 15, 16, 17, 18],
        kc: [11, 12, 13, 14, 15, 16, 17, 18],
      }),
    ]);
    const { groups } = groupTeamsByWeekRange(scoped(index, ["ne", "sea", "kc"]), { season: 2025, gameCount: LAST8_GAME_COUNT });
    const assigned = groups.flatMap((g) => g.teams);
    expect(assigned.sort()).toEqual(["kc", "ne", "sea"]);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("skips teams without enough completed games instead of shortening the window", () => {
    const index = buildCompletedGameIndex([season(2025, { ne: [16, 17, 18] })]);
    const { groups, skipped } = groupTeamsByWeekRange(scoped(index, ["ne"]), { season: 2025, gameCount: LAST8_GAME_COUNT });
    expect(groups).toHaveLength(0);
    expect(skipped).toEqual([{ team: "ne", completed: 3, required: 8 }]);
  });

  it("excludes non-final games from the window", () => {
    const base = season(2025, { ne: [11, 12, 13, 14, 15, 16, 17, 18] });
    // Mark week 18 as not final (postponed).
    (base.results as { gameId: string; final: boolean }[]).find((r) => r.gameId.includes("_18_"))!.final = false;
    const index = buildCompletedGameIndex([base]);
    const { groups } = groupTeamsByWeekRange(index, { season: 2025, gameCount: LAST8_GAME_COUNT });
    expect(groups).toHaveLength(0); // only 7 completed
  });

  it("never includes postseason games", () => {
    const base = season(2025, { ne: [11, 12, 13, 14, 15, 16, 17, 18] });
    base.games.push({ gameId: "2025_19_NE_OPP", season: 2025, week: 19, seasonType: "POST", dateUtc: "2026-01-11T17:00:00.000Z" });
    base.results.push({ gameId: "2025_19_NE_OPP", seasonType: "POST", final: true, homeAbbr: "ne", awayAbbr: "opp", homeScore: 30, awayScore: 20 });
    const index = buildCompletedGameIndex([base]);
    const { groups } = groupTeamsByWeekRange(index, { season: 2025, gameCount: LAST8_GAME_COUNT });
    expect(groups[0].gameIdsByTeam.ne).not.toContain("2025_19_NE_OPP");
    expect(groups[0].weekMax).toBe(18);
  });

  it("groups a 2026 last-5 window with a bye correctly", () => {
    const index = buildCompletedGameIndex([
      season(2026, { ne: [1, 2, 3, 4, 5, 7, 8, 9], sea: [1, 2, 3, 4, 5, 6, 7, 8] }),
    ]);
    const { groups } = groupTeamsByWeekRange(index, { season: 2026, gameCount: LAST5_GAME_COUNT });
    const ne = groups.find((g) => g.teams.includes("ne"))!;
    const sea = groups.find((g) => g.teams.includes("sea"))!;
    // ne: last five completed are weeks 4,5,7,8,9 -> range 4-9 (bye week 6 absent)
    expect([ne.weekMin, ne.weekMax]).toEqual([4, 9]);
    expect(ne.gameIdsByTeam.ne).toHaveLength(5);
    expect(sea.gameIdsByTeam.sea).toHaveLength(5);
  });
});

describe("season-to-date range", () => {
  it("spans week 1 through the last completed week", () => {
    const index = buildCompletedGameIndex([season(2026, { ne: [1, 2, 3], sea: [1, 2, 3, 4] })]);
    const range = seasonToDateRange(scoped(index, ["ne", "sea"]), 2026)!;
    expect(range).toMatchObject({ season: 2026, weekMin: 1, weekMax: 4 });
    expect(range.teams.sort()).toEqual(["ne", "sea"]);
  });

  it("returns null when no completed games exist", () => {
    const index = buildCompletedGameIndex([season(2025, { ne: [1] })]);
    expect(seasonToDateRange(index, 2026)).toBeNull();
  });

  it("records unequal game counts per team", () => {
    const index = buildCompletedGameIndex([season(2026, { ne: [1, 2, 3], sea: [1, 2, 3, 4] })]);
    expect(completedGameCounts(scoped(index, ["ne", "sea"]), 2026)).toEqual({ ne: 3, sea: 4 });
  });
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

describe("period ranking", () => {
  it("ranks offensive success rate highest-first", () => {
    expect(rankPeriodValues({ a: 0.5, b: 0.42, c: 0.55 }, "higher-is-better")).toEqual({ c: 1, a: 2, b: 3 });
  });

  it("ranks defensive success rate allowed lowest-first", () => {
    expect(rankPeriodValues({ a: 0.5, b: 0.42, c: 0.55 }, "lower-is-better")).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("uses competition ranking for ties", () => {
    expect(rankPeriodValues({ a: 0.5, b: 0.45, c: 0.45, d: 0.4 }, "higher-is-better")).toEqual({ a: 1, b: 2, c: 2, d: 4 });
  });

  it("ranks on unrounded fractions, not display percentages", () => {
    // Both display as 45.1% but differ in the source float.
    const ranks = rankPeriodValues({ a: 0.45149, b: 0.45051 }, "higher-is-better");
    expect(toPercent(0.45149)).toBe(toPercent(0.45051));
    expect(ranks).toEqual({ a: 1, b: 2 });
  });

  it("excludes null values from ranking", () => {
    const ranks = rankPeriodValues({ a: 0.5, b: null, c: 0.4 } as never, "higher-is-better");
    expect(ranks).toEqual({ a: 1, c: 2 });
  });

  it("returns no ranks when nothing has a value", () => {
    expect(rankPeriodValues({ a: null } as never, "higher-is-better")).toEqual({});
  });
});

describe("percentage formatting", () => {
  it("converts fractions to one-decimal percentages", () => {
    expect(toPercent(0.5049900199600799)).toBe(50.5);
    expect(toPercent(0.34)).toBe(34);
    expect(toPercent(0.4585)).toBe(45.9);
  });

  it("returns null for missing values rather than zero", () => {
    expect(toPercent(null)).toBeNull();
    expect(toPercent(Number.NaN)).toBeNull();
  });
});
