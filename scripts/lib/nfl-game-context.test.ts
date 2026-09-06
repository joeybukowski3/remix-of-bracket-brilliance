import { describe, expect, it } from "vitest";
import {
  buildEpaContext,
  buildTrenchesContext,
  buildYppContext,
  buildPregameGameContext,
  NOT_IMPLEMENTED_COACHING_CONTEXT,
  type EpaPriorSeasonWindow,
  type MetricsPriorSeasonWindow,
  type TrenchSeasonData,
} from "./nfl-game-context";

const EPA_WINDOW: EpaPriorSeasonWindow = {
  teams: {
    sea: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, totals: { offense: { offEpa: 20, offPlays: 100 } } },
    ne: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, totals: { offense: { offEpa: 10, offPlays: 100 } } },
  },
};

describe("buildEpaContext", () => {
  it("derives per-play EPA and advantage/differential from prior-season-full totals", () => {
    const ctx = buildEpaContext(EPA_WINDOW, "sea", "ne");
    expect(ctx.home_epa_value).toBeCloseTo(0.2);
    expect(ctx.away_epa_value).toBeCloseTo(0.1);
    expect(ctx.epa_differential).toBeCloseTo(0.1);
    expect(ctx.epa_advantage_team).toBe("home");
    expect(ctx.provenance_status).toBe("available");
    expect(ctx.source_season).toBe(2025);
  });

  it("is unavailable, never fabricated, when a team is missing from the window", () => {
    const ctx = buildEpaContext(EPA_WINDOW, "sea", "xxx");
    expect(ctx.away_epa_value).toBeNull();
    expect(ctx.epa_differential).toBeNull();
    expect(ctx.epa_advantage_team).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
  });

  it("is unavailable when the window itself is null (no postgame leakage substitute)", () => {
    const ctx = buildEpaContext(null, "sea", "ne");
    expect(ctx.home_epa_value).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
  });
});

const METRICS_WINDOW: MetricsPriorSeasonWindow = {
  teams: {
    sea: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, metrics: { "off.yardsPerPlay": [5.8, 3] } },
    ne: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, metrics: { "off.yardsPerPlay": [5.1, 20] } },
  },
};

describe("buildYppContext", () => {
  it("reads off.yardsPerPlay from the prior-season-full window", () => {
    const ctx = buildYppContext(METRICS_WINDOW, "sea", "ne");
    expect(ctx.home_ypp).toBe(5.8);
    expect(ctx.away_ypp).toBe(5.1);
    expect(ctx.ypp_differential).toBeCloseTo(0.7);
    expect(ctx.ypp_advantage_team).toBe("home");
    expect(ctx.provenance_status).toBe("available");
  });

  it("never substitutes a postgame value when unavailable", () => {
    const ctx = buildYppContext(null, "sea", "ne");
    expect(ctx.home_ypp).toBeNull();
    expect(ctx.away_ypp).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
  });
});

const TRENCH_SEASON: TrenchSeasonData = {
  throughWeek: 18,
  sourceLastModified: "2026-01-06T15:51:59Z",
  teams: {
    sea: {
      metrics: {
        "off.passBlockWinRate": { valuePct: 65 },
        "off.runBlockWinRate": { valuePct: 70 },
        "def.passRushWinRate": { valuePct: 40 },
        "def.runStopWinRate": { valuePct: 35 },
      },
    },
    ne: {
      metrics: {
        "off.passBlockWinRate": { valuePct: 55 },
        "off.runBlockWinRate": { valuePct: 60 },
        "def.passRushWinRate": { valuePct: 45 },
        "def.runStopWinRate": { valuePct: 30 },
      },
    },
  },
};

describe("buildTrenchesContext", () => {
  it("preserves structured per-team subfields and computes an offensive-line composite differential", () => {
    const ctx = buildTrenchesContext(TRENCH_SEASON, 2025, "sea", "ne");
    expect(ctx.home_trenches_value).toEqual({
      off_pass_block_win_rate: 65,
      off_run_block_win_rate: 70,
      def_pass_rush_win_rate: 40,
      def_run_stop_win_rate: 35,
    });
    expect(ctx.trenches_differential).toBeCloseTo(20); // (65+70) - (55+60)
    expect(ctx.trenches_advantage_team).toBe("home");
    expect(ctx.provenance_status).toBe("available");
    expect(ctx.source_season).toBe(2025);
  });

  it("is unavailable, not backfilled with hindsight, when the season archive doesn't exist", () => {
    const ctx = buildTrenchesContext(null, null, "sea", "ne");
    expect(ctx.home_trenches_value).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
    expect(ctx.source_season).toBeNull();
  });
});

describe("coaching context", () => {
  it("is always the explicit NOT_IMPLEMENTED null contract", () => {
    expect(NOT_IMPLEMENTED_COACHING_CONTEXT).toEqual({
      home_coaching_rating: null,
      away_coaching_rating: null,
      coaching_advantage_team: null,
      coaching_differential: null,
      coaching_context_status: "NOT_IMPLEMENTED",
    });
  });
});

describe("buildPregameGameContext", () => {
  it("assembles all four context families", () => {
    const ctx = buildPregameGameContext({
      epaWindow: EPA_WINDOW,
      yppWindow: METRICS_WINDOW,
      trenchSeasonData: TRENCH_SEASON,
      trenchSeasonKey: 2025,
      homeTeam: "sea",
      awayTeam: "ne",
    });
    expect(ctx.epa.provenance_status).toBe("available");
    expect(ctx.ypp.provenance_status).toBe("available");
    expect(ctx.trenches.provenance_status).toBe("available");
    expect(ctx.coaching.coaching_context_status).toBe("NOT_IMPLEMENTED");
  });
});
