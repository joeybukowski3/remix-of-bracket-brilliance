import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFlaggedGameViews,
  buildTeamFinalEightWindows,
  calculateActiveAdjustmentTotal,
  calculateWeek18Anomaly,
  findWeek18AnomalyCandidates,
  isAdjustmentActive,
  selectFinalEightWindow,
  sortCompletedRegularSeasonGames,
  validateContextFlag,
  validateContextFlags,
  validateManualAdjustment,
  validateManualAdjustments,
} from "../../../scripts/lib/nfl-v03-window-engine.mjs";

const ROOT = resolve(__dirname, "../../..");
const TEAMS_JSON = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")
);
const CANONICAL_TEAMS = new Set<string>(
  TEAMS_JSON.teams.map((team: { abbr: string }) => team.abbr)
);

type GameOverrides = {
  gameId?: string;
  season?: number;
  week?: number;
  seasonType?: string;
  dateUtc?: string;
  homeAbbr?: string;
  awayAbbr?: string;
  homeScore?: number;
  awayScore?: number;
  final?: boolean;
  status?: string;
};

function game(week: number, overrides: GameOverrides = {}) {
  return {
    gameId: `2025_${String(week).padStart(2, "0")}_MIA_BUF`,
    season: 2025,
    week,
    seasonType: "REG",
    dateUtc: `2025-12-${String(week).padStart(2, "0")}T18:00:00.000Z`,
    homeAbbr: "buf",
    awayAbbr: "mia",
    homeScore: 24,
    awayScore: 17,
    final: true,
    status: "final",
    ...overrides,
  };
}

function readJoinedSeason(season: number) {
  const schedule = JSON.parse(
    readFileSync(join(ROOT, `public/data/nfl/${season}/games.json`), "utf-8")
  ).games;
  const results = JSON.parse(
    readFileSync(join(ROOT, `public/data/nfl/${season}/results.json`), "utf-8")
  ).results;
  const scheduleById = new Map<string, object>(
    schedule.map((entry: { gameId: string }) => [entry.gameId, entry])
  );
  return results.map((result: { gameId: string }) => ({
    ...scheduleById.get(result.gameId),
    ...result,
  }));
}

function marginForTeam(
  result: { homeAbbr: string; awayAbbr: string; homeScore: number; awayScore: number },
  team: string
) {
  return result.homeAbbr === team
    ? result.homeScore - result.awayScore
    : result.awayScore - result.homeScore;
}

describe("nfl-power-v0.3.0 final-eight window selection", () => {
  it("selects exactly the final eight completed regular-season games", () => {
    const games = Array.from({ length: 10 }, (_, index) => game(index + 1)).reverse();
    const window = selectFinalEightWindow("buf", games);

    expect(window.windowSize).toBe(8);
    expect(window.shortWindow).toBe(false);
    expect(window.windowGames.map((entry: { week: number }) => entry.week)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(window.firstKickoff).toBe("2025-12-03T18:00:00.000Z");
    expect(window.lastKickoff).toBe("2025-12-10T18:00:00.000Z");
    expect(window.orderingMethod).toContain("dateUtc ascending");
  });

  it("uses kickoff order before week and uses week as the deterministic tiebreaker", () => {
    const sameKickoff = "2025-12-20T18:00:00.000Z";
    const games = [
      game(17, { gameId: "week-17", dateUtc: sameKickoff }),
      game(16, { gameId: "week-16", dateUtc: sameKickoff }),
      game(18, { gameId: "week-18", dateUtc: "2025-12-19T18:00:00.000Z" }),
    ];

    expect(
      sortCompletedRegularSeasonGames(games).map((entry: { gameId: string }) => entry.gameId)
    ).toEqual(["week-18", "week-16", "week-17"]);
  });

  it("handles a bye without padding the selected window", () => {
    const games = [1, 2, 3, 4, 6, 7, 8, 9].map((week) => game(week));
    const window = selectFinalEightWindow("buf", games);

    expect(window.windowGames.map((entry: { week: number }) => entry.week)).toEqual([
      1, 2, 3, 4, 6, 7, 8, 9,
    ]);
    expect(window.windowSize).toBe(8);
  });

  it("places a rescheduled game by its actual kickoff rather than its week", () => {
    const games = [
      game(4, { gameId: "rescheduled-week-4", dateUtc: "2025-12-30T18:00:00.000Z" }),
      game(9, { gameId: "week-9", dateUtc: "2025-12-09T18:00:00.000Z" }),
    ];

    expect(
      sortCompletedRegularSeasonGames(games).map((entry: { gameId: string }) => entry.gameId)
    ).toEqual(["week-9", "rescheduled-week-4"]);
  });

  it("excludes playoffs, non-finals, and cancelled games with explicit counts", () => {
    const games = [
      game(18),
      game(19, { gameId: "wild-card", seasonType: "WC" }),
      game(17, { gameId: "scheduled", final: false, status: "scheduled" }),
      game(16, { gameId: "cancelled", final: false, status: "cancelled" }),
    ];
    const window = selectFinalEightWindow("buf", games);

    expect(window.windowGames.map((entry: { gameId: string }) => entry.gameId)).toEqual([
      "2025_18_MIA_BUF",
    ]);
    expect(window.excludedPostseasonCount).toBe(1);
    expect(window.excludedNonFinalCount).toBe(2);
  });

  it("returns every available game and shortWindow without padding", () => {
    const window = selectFinalEightWindow("buf", [game(1), game(3), game(7)]);

    expect(window.windowSize).toBe(3);
    expect(window.shortWindow).toBe(true);
    expect(window.windowGames).toHaveLength(3);
  });

  it("fails explicitly for invalid week or kickoff data", () => {
    expect(() => selectFinalEightWindow("buf", [game(1, { week: 0 })])).toThrow(
      /invalid week/
    );
    expect(() =>
      selectFinalEightWindow("buf", [game(1, { dateUtc: "not-a-date" })])
    ).toThrow(/invalid dateUtc/);
  });

  it("does not mutate inputs and repeated calls are deterministic", () => {
    const games = Object.freeze([
      Object.freeze(game(2)),
      Object.freeze(game(1)),
    ]);
    const snapshot = JSON.stringify(games);

    const first = selectFinalEightWindow("buf", games);
    expect(selectFinalEightWindow("buf", games)).toEqual(first);
    expect(JSON.stringify(games)).toBe(snapshot);
  });
});

describe("nfl-power-v0.3.0 historical final-eight windows", () => {
  it("gives 2022 Buffalo and Cincinnati eight-game windows despite 16-game seasons", () => {
    const games = readJoinedSeason(2022);
    expect(selectFinalEightWindow("buf", games).windowSize).toBe(8);
    expect(selectFinalEightWindow("cin", games).windowSize).toBe(8);
  });

  it("keeps tie games as valid completed games", () => {
    const games = [
      game(1, { gameId: "tie", homeScore: 20, awayScore: 20 }),
      game(2),
    ];
    expect(
      sortCompletedRegularSeasonGames(games).map((entry: { gameId: string }) => entry.gameId)
    ).toContain("tie");
  });

  it("matches the 2025 Jacksonville +19.1 point-differential spot check", () => {
    const window = selectFinalEightWindow("jax", readJoinedSeason(2025));
    const average =
      window.windowGames.reduce(
        (sum: number, result: Parameters<typeof marginForTeam>[0]) =>
          sum + marginForTeam(result, "jax"),
        0
      ) / window.windowSize;

    expect(average).toBeCloseTo(19.1, 1);
  });

  it("builds valid windows for all 32 teams in every completed repository season", () => {
    for (const season of [2022, 2023, 2024, 2025]) {
      const windows = buildTeamFinalEightWindows(readJoinedSeason(season), CANONICAL_TEAMS);
      expect(windows, String(season)).toHaveLength(32);
      expect(
        windows.every(
          (window: { windowSize: number; shortWindow: boolean }) =>
            window.windowSize === 8 && window.shortWindow === false
        ),
        String(season)
      ).toBe(true);
    }
  });
});

describe("nfl-power-v0.3.0 Week 18 anomaly screening", () => {
  const games2024 = readJoinedSeason(2024);
  const candidates2024 = findWeek18AnomalyCandidates(games2024, CANONICAL_TEAMS);

  it.each([
    ["kc", -38],
    ["den", 38],
    ["min", -22],
  ])("reproduces the 2024 %s %i review candidate", (team, actualMargin) => {
    expect(candidates2024).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ team, actualMargin, week: 18, candidate: true }),
      ])
    );
  });

  it("uses prior games only and never leaks Week 18 into its baseline", () => {
    const prior = [
      game(16, { gameId: "prior-a", homeScore: 20, awayScore: 10 }),
      game(17, { gameId: "prior-b", homeScore: 30, awayScore: 20 }),
    ];
    const week18 = game(18, {
      gameId: "week-18",
      dateUtc: "2026-01-04T18:00:00.000Z",
      homeScore: 0,
      awayScore: 30,
    });
    const result = calculateWeek18Anomaly("buf", week18, [...prior, week18]);

    expect(result.priorGameIds).toEqual(["prior-a", "prior-b"]);
    expect(result.priorMeanMargin).toBe(10);
    expect(result.actualMargin).toBe(-30);
  });

  it("handles a zero-variance prior baseline without NaN or Infinity", () => {
    const prior = [
      game(16, { gameId: "prior-a", homeScore: 24, awayScore: 17 }),
      game(17, { gameId: "prior-b", homeScore: 21, awayScore: 14 }),
    ];
    const result = calculateWeek18Anomaly(
      "buf",
      game(18, {
        gameId: "week-18",
        dateUtc: "2026-01-04T18:00:00.000Z",
        homeScore: 10,
        awayScore: 17,
      }),
      prior
    );

    expect(result.priorStandardDeviation).toBe(0);
    expect(result.zScore).toBeNull();
    expect(result.candidate).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it("returns review metadata, never an automatically confirmed manual flag", () => {
    const candidate = candidates2024.find(
      (entry: { team: string }) => entry.team === "kc"
    )!;

    expect(candidate).not.toHaveProperty("flag");
    expect(candidate).not.toHaveProperty("origin");
    expect(validateContextFlag(candidate, CANONICAL_TEAMS).valid).toBe(false);
  });
});

const MANUAL_CONTEXT_FLAG = {
  gameId: "2024_18_KC_DEN",
  team: "kc",
  flag: "rested-starters",
  origin: "manual",
  enteredBy: "reviewer",
  date: "2025-02-01",
  note: "Confirmed after source review.",
  source: "https://example.com/report",
};

describe("nfl-power-v0.3.0 context-flag validation", () => {
  it("accepts valid manual and screen flags", () => {
    expect(validateContextFlag(MANUAL_CONTEXT_FLAG, CANONICAL_TEAMS)).toMatchObject({
      valid: true,
      errors: [],
    });
    expect(
      validateContextFlag(
        {
          ...MANUAL_CONTEXT_FLAG,
          flag: "week18-anomaly",
          origin: "screen",
          source: null,
        },
        CANONICAL_TEAMS
      )
    ).toMatchObject({ valid: true, errors: [] });
  });

  it("requires a source for manual flags", () => {
    const { source: _source, ...missingSource } = MANUAL_CONTEXT_FLAG;
    expect(validateContextFlag(missingSource).errors).toContain("source is required");
  });

  it("rejects invalid flags and origins explicitly", () => {
    expect(
      validateContextFlag({ ...MANUAL_CONTEXT_FLAG, flag: "made-up" }).errors.join(" ")
    ).toMatch(/invalid context flag/);
    expect(
      validateContextFlag({ ...MANUAL_CONTEXT_FLAG, origin: "provider" }).errors.join(" ")
    ).toMatch(/invalid context flag origin/);
  });

  it("rejects invalid dates and unknown canonical teams", () => {
    expect(
      validateContextFlag({ ...MANUAL_CONTEXT_FLAG, date: "not-a-date" }).errors
    ).toContain("date must be a valid date");
    expect(
      validateContextFlag({ ...MANUAL_CONTEXT_FLAG, team: "zzz" }, CANONICAL_TEAMS).errors.join(
        " "
      )
    ).toMatch(/unknown team abbreviation/);
  });

  it("rejects string confirmed values without coercion", () => {
    const result = validateContextFlag({ ...MANUAL_CONTEXT_FLAG, confirmed: "true" });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("confirmed must be a boolean");
    expect(result.normalizedEntry).toBeNull();
  });

  it("validates collections deterministically without mutating inputs", () => {
    const entries = Object.freeze([Object.freeze({ ...MANUAL_CONTEXT_FLAG })]);
    const first = validateContextFlags(entries, CANONICAL_TEAMS);

    expect(first.valid).toBe(true);
    expect(validateContextFlags(entries, CANONICAL_TEAMS)).toEqual(first);
    expect(entries[0]).toEqual(MANUAL_CONTEXT_FLAG);
  });
});

const QB_ADJUSTMENT = {
  team: "buf",
  component: "qb",
  value: 0.5,
  author: "reviewer",
  date: "2025-07-01",
  rationale: "Documented preseason availability change.",
  sourceRef: "source-1",
  reviewBy: "2025-09-01",
  expires: "in-season-activation",
  status: "active",
};

describe("nfl-power-v0.3.0 manual adjustments", () => {
  it("accepts valid QB and coaching adjustments", () => {
    expect(validateManualAdjustment(QB_ADJUSTMENT, CANONICAL_TEAMS).valid).toBe(true);
    expect(
      validateManualAdjustment({ ...QB_ADJUSTMENT, component: "coaching", value: -0.25 }).valid
    ).toBe(true);
  });

  it("rejects QB and coaching values above their component bounds", () => {
    expect(validateManualAdjustment({ ...QB_ADJUSTMENT, value: 0.751 }).errors.join(" ")).toMatch(
      /<= 0.75/
    );
    expect(
      validateManualAdjustment({ ...QB_ADJUSTMENT, component: "coaching", value: -0.251 }).errors.join(
        " "
      )
    ).toMatch(/<= 0.25/);
  });

  it("hard-fails a combined active team total above 1.0 without clipping", () => {
    const result = validateManualAdjustments([
      { ...QB_ADJUSTMENT, value: 0.75 },
      { ...QB_ADJUSTMENT, component: "coaching", value: 0.25, sourceRef: "source-2" },
      { ...QB_ADJUSTMENT, component: "coaching", value: 0.01, sourceRef: "source-3" },
    ]);

    expect(result.valid).toBe(false);
    expect(result.activeTotals.buf).toBeCloseTo(1.01);
    expect(result.errors.join(" ")).toMatch(/exceeds the absolute 1.0 bound/);
  });

  it("rejects missing rationale and sourceRef", () => {
    expect(validateManualAdjustment({ ...QB_ADJUSTMENT, rationale: "" }).errors).toContain(
      "rationale is required"
    );
    expect(validateManualAdjustment({ ...QB_ADJUSTMENT, sourceRef: "" }).errors).toContain(
      "sourceRef is required"
    );
  });

  it("rejects invalid component, status, and string numeric values", () => {
    expect(
      validateManualAdjustment({ ...QB_ADJUSTMENT, component: "owner" }).errors.join(" ")
    ).toMatch(/invalid adjustment component/);
    expect(
      validateManualAdjustment({ ...QB_ADJUSTMENT, status: "pending" }).errors.join(" ")
    ).toMatch(/invalid adjustment status/);
    expect(
      validateManualAdjustment({ ...QB_ADJUSTMENT, value: "0.5" }).errors.join(" ")
    ).toMatch(/finite number/);
  });

  it("applies in-season-activation expiration mode", () => {
    expect(isAdjustmentActive(QB_ADJUSTMENT, { inSeasonActive: false })).toBe(true);
    expect(isAdjustmentActive(QB_ADJUSTMENT, { inSeasonActive: true })).toBe(false);
  });

  it("does not count expired or superseded entries toward the active total", () => {
    const entries = [
      QB_ADJUSTMENT,
      { ...QB_ADJUSTMENT, component: "coaching", value: 0.2, status: "expired" },
      { ...QB_ADJUSTMENT, value: -0.4, status: "superseded" },
    ];

    expect(calculateActiveAdjustmentTotal("buf", entries)).toBe(0.5);
    expect(validateManualAdjustments(entries).activeTotals).toEqual({ buf: 0.5 });
  });

  it("is deterministic and does not mutate adjustment entries", () => {
    const entries = Object.freeze([Object.freeze({ ...QB_ADJUSTMENT })]);
    const snapshot = JSON.stringify(entries);
    const first = validateManualAdjustments(entries, { canonicalTeams: CANONICAL_TEAMS });

    expect(validateManualAdjustments(entries, { canonicalTeams: CANONICAL_TEAMS })).toEqual(first);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});

describe("nfl-power-v0.3.0 flagged-game alternate view", () => {
  const coreWindow = [game(17, { gameId: "core-17" }), game(18, { gameId: "core-18" })];

  function expectCanonicalUnchanged(
    views: ReturnType<typeof buildFlaggedGameViews>,
    snapshot: string
  ) {
    expect(JSON.stringify(views.coreWindowGames)).toBe(snapshot);
    expect(JSON.stringify(views.canonical.games)).toBe(snapshot);
    expect(JSON.stringify(coreWindow)).toBe(snapshot);
  }

  it("does not exclude a manual flag when confirmed is omitted", () => {
    const snapshot = JSON.stringify(coreWindow);
    const views = buildFlaggedGameViews(coreWindow, [
      { ...MANUAL_CONTEXT_FLAG, gameId: "core-18" },
    ]);

    expect(views.flaggedGames).toHaveLength(1);
    expect(views.alternateGames.map((entry: { gameId: string }) => entry.gameId)).toEqual([
      "core-17",
      "core-18",
    ]);
    expect(views.alternateExcludingConfirmedFlags.excludedGameIds).toEqual([]);
    expectCanonicalUnchanged(views, snapshot);
  });

  it("does not exclude a manual flag when confirmed is false", () => {
    const snapshot = JSON.stringify(coreWindow);
    const views = buildFlaggedGameViews(coreWindow, [
      { ...MANUAL_CONTEXT_FLAG, gameId: "core-18", confirmed: false },
    ]);

    expect(views.flaggedGames).toHaveLength(1);
    expect(views.alternateGames.map((entry: { gameId: string }) => entry.gameId)).toEqual([
      "core-17",
      "core-18",
    ]);
    expect(views.alternateExcludingConfirmedFlags.excludedGameIds).toEqual([]);
    expectCanonicalUnchanged(views, snapshot);
  });

  it.each([null, "true", 1])(
    "fails closed when a manual flag carries non-boolean confirmed=%s",
    (confirmed) => {
      const snapshot = JSON.stringify(coreWindow);
      const views = buildFlaggedGameViews(coreWindow, [
        { ...MANUAL_CONTEXT_FLAG, gameId: "core-18", confirmed },
      ]);

      expect(views.flaggedGames).toHaveLength(1);
      expect(views.alternateGames.map((entry: { gameId: string }) => entry.gameId)).toEqual([
        "core-17",
        "core-18",
      ]);
      expect(views.alternateExcludingConfirmedFlags.excludedGameIds).toEqual([]);
      expectCanonicalUnchanged(views, snapshot);
    }
  );

  it("does not exclude a screen flag even when confirmed is true", () => {
    const snapshot = JSON.stringify(coreWindow);
    const views = buildFlaggedGameViews(coreWindow, [
      {
        ...MANUAL_CONTEXT_FLAG,
        gameId: "core-18",
        origin: "screen",
        flag: "week18-anomaly",
        source: null,
        confirmed: true,
      },
    ]);

    expect(views.flaggedGames).toHaveLength(1);
    expect(views.alternateGames.map((entry: { gameId: string }) => entry.gameId)).toEqual([
      "core-17",
      "core-18",
    ]);
    expect(views.alternateExcludingConfirmedFlags.excludedGameIds).toEqual([]);
    expectCanonicalUnchanged(views, snapshot);
  });

  it("excludes a confirmed manual flag only from the review alternate", () => {
    const snapshot = JSON.stringify(coreWindow);
    const views = buildFlaggedGameViews(coreWindow, [
      { ...MANUAL_CONTEXT_FLAG, gameId: "core-18", confirmed: true },
    ]);

    expect(views.flaggedGames).toHaveLength(1);
    expect(views.alternateGames.map((entry: { gameId: string }) => entry.gameId)).toEqual([
      "core-17",
    ]);
    expect(views.coreWindowGames.map((entry: { gameId: string }) => entry.gameId)).toEqual([
      "core-17",
      "core-18",
    ]);
    expectCanonicalUnchanged(views, snapshot);
  });

  it("labels the canonical and alternate views without replacing canonical results", () => {
    const snapshot = JSON.stringify(coreWindow);
    const views = buildFlaggedGameViews(coreWindow, [
      { ...MANUAL_CONTEXT_FLAG, gameId: "core-18", confirmed: true },
    ]);

    expect(views.canonical.label).toBe("canonical");
    expect(views.alternateExcludingConfirmedFlags).toMatchObject({
      label: "alternateExcludingConfirmedFlags",
      canonical: false,
      excludedGameIds: ["core-18"],
    });
    expect(views.canonical.games).toHaveLength(2);
    expectCanonicalUnchanged(views, snapshot);
  });
});
