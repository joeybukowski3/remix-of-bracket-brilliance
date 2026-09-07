import { describe, expect, it } from "vitest";
import {
  coachingContextFixture,
  coachingUnavailableFixture,
} from "@/lib/nfl/performance/__fixtures__/coaching";
import {
  applySidesFilters,
  DEFAULT_SIDES_FILTERS,
  nextSidesSort,
  sortSidesRows,
} from "./sidesFilters";
import type { SidesPerformanceRow } from "@/types/nfl/performance";

function row(overrides: Partial<SidesPerformanceRow> = {}): SidesPerformanceRow {
  return {
    season: 2026,
    week: 1,
    game_id: "g1",
    kickoff_time: "2026-09-07T17:00:00.000Z",
    away_team: "aaa",
    home_team: "bbb",
    projected_home_margin: 6,
    projected_spread_line: -6,
    projected_spread_team: "bbb",
    home_power_number: 5,
    away_power_number: 4,
    home_field_adjustment: 2,
    model_version: "jkb-power-number-v1.0.0",
    fitted_model_hash: null,
    prediction_timestamp: "2026-09-04T16:00:00.000Z",
    market_spread: -3,
    market_implied_home_margin: 3,
    market_team_orientation: "home_line",
    market_provider: "the-odds-api/draftkings",
    market_snapshot_timestamp: "2026-09-04T12:00:00.000Z",
    market_snapshot_ref: "ref",
    market_observation_id: "obs",
    jkb_minus_market: 3,
    actual_home_points: 27,
    actual_away_points: 17,
    actual_margin: 10,
    game_completion_status: "final",
    resolution_status: "resolved",
    signed_margin_error: -4,
    absolute_margin_error: 4,
    squared_margin_error: 16,
    jkb_ats_side: "home",
    jkb_supports_team: "bbb",
    projected_winner: "home",
    actual_winner: "home",
    projected_winner_correct: true,
    ats_result: "WIN",
    jkb_market_difference_bucket: "3-4",
    market_spread_bucket: "3-7",
    favorite_underdog: "favorite",
    context: {
      epa: { metric: "off.epaPerPlay", window: "prior-season-full", home_epa_value: null, away_epa_value: null, epa_advantage_team: null, epa_differential: null, source_season: null, source_timestamp: null, provenance_status: "unavailable" },
      ypp: { metric: "off.yardsPerPlay", window: "prior-season-full", home_ypp: null, away_ypp: null, ypp_advantage_team: null, ypp_differential: null, source_season: null, source_timestamp: null, provenance_status: "unavailable" },
      trenches: { metric: "espn_trench_composite", window: "prior_season_through_week_18", home_trenches_value: null, away_trenches_value: null, trenches_advantage_team: null, trenches_differential: null, source_season: null, source_timestamp: null, provenance_status: "unavailable" },
      coaching: coachingContextFixture(),
    },
    provenance: { prediction_id_ref: "p", market_snapshot_ref: "ref", market_observation_id: "obs", outcome_source_state_hash: "h" },
    ...overrides,
  };
}

describe("applySidesFilters", () => {
  it("passes everything through with the default filters", () => {
    const rows = [row(), row({ game_id: "g2", week: 2, ats_result: "LOSS" })];
    expect(applySidesFilters(rows, DEFAULT_SIDES_FILTERS)).toHaveLength(2);
  });

  it("filters by week, result, jkb side and favorite/underdog", () => {
    const rows = [
      row({ game_id: "g1", week: 1, ats_result: "WIN", jkb_ats_side: "home", favorite_underdog: "favorite" }),
      row({ game_id: "g2", week: 2, ats_result: "LOSS", jkb_ats_side: "away", favorite_underdog: "underdog" }),
    ];
    expect(applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, week: 2 }).map((r) => r.game_id)).toEqual(["g2"]);
    expect(applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, result: "WIN" }).map((r) => r.game_id)).toEqual(["g1"]);
    expect(applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, jkbSide: "away" }).map((r) => r.game_id)).toEqual(["g2"]);
    expect(applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, favoriteUnderdog: "underdog" }).map((r) => r.game_id)).toEqual(["g2"]);
  });

  it("excludes rows without available context when a context-advantage filter is set", () => {
    const withCtx = row({
      game_id: "g-ctx",
      context: {
        ...row().context,
        epa: { ...row().context.epa, epa_advantage_team: "home", provenance_status: "available" },
      },
    });
    const rows = [row({ game_id: "g-noctx" }), withCtx];
    expect(applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, epaAdvantage: "home" }).map((r) => r.game_id)).toEqual(["g-ctx"]);
  });
});

describe("sortSidesRows / nextSidesSort", () => {
  it("sorts by absolute margin error descending", () => {
    const rows = [row({ game_id: "small", absolute_margin_error: 1 }), row({ game_id: "big", absolute_margin_error: 9 })];
    const sorted = sortSidesRows(rows, { key: "absolute_margin_error", direction: "desc" });
    expect(sorted.map((r) => r.game_id)).toEqual(["big", "small"]);
  });

  it("cycles a sort key through desc -> asc -> off", () => {
    const first = nextSidesSort(null, "week", "asc");
    expect(first).toEqual({ key: "week", direction: "asc" });
    expect(nextSidesSort(first, "week", "asc")).toEqual({ key: "week", direction: "desc" });
    expect(nextSidesSort({ key: "week", direction: "desc" }, "week", "asc")).toBeNull();
  });
});

describe("applySidesFilters -- coaching (analysis context only)", () => {
  const homeAdvantage = row({ game_id: "home-adv" });
  const awayAdvantage = row({
    game_id: "away-adv",
    jkb_ats_side: "home",
    context: {
      ...row().context,
      coaching: coachingContextFixture({
        home_coaching_rating: 48,
        away_coaching_rating: 61,
        coaching_differential: -13,
        coaching_advantage_team: "away",
      }),
    },
  });
  const evenAdvantage = row({
    game_id: "even-adv",
    context: {
      ...row().context,
      coaching: coachingContextFixture({
        home_coaching_rating: 52,
        away_coaching_rating: 51,
        coaching_differential: 1,
        coaching_advantage_team: "even",
      }),
    },
  });
  const unavailable = row({
    game_id: "no-coaching",
    context: { ...row().context, coaching: coachingUnavailableFixture() },
  });
  const rows = [homeAdvantage, awayAdvantage, evenAdvantage, unavailable];

  it("filters to home coaching advantage", () => {
    const result = applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, coachingAdvantage: "home" });
    expect(result.map((r) => r.game_id)).toEqual(["home-adv"]);
  });

  it("filters to away coaching advantage", () => {
    const result = applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, coachingAdvantage: "away" });
    expect(result.map((r) => r.game_id)).toEqual(["away-adv"]);
  });

  it("filters to even coaching advantage", () => {
    const result = applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, coachingAdvantage: "even" });
    expect(result.map((r) => r.game_id)).toEqual(["even-adv"]);
  });

  it("excludes rows with no coaching source from every non-'all' coaching filter", () => {
    for (const value of ["home", "away", "even"] as const) {
      const result = applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, coachingAdvantage: value });
      expect(result.map((r) => r.game_id)).not.toContain("no-coaching");
    }
    expect(applySidesFilters(rows, DEFAULT_SIDES_FILTERS)).toHaveLength(4);
  });

  it("segments JKB side against coaching advantage without implying causality", () => {
    const agree = applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, coachingAgreement: "agree" });
    expect(agree.map((r) => r.game_id)).toEqual(["home-adv"]);

    const disagree = applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, coachingAgreement: "disagree" });
    expect(disagree.map((r) => r.game_id)).toEqual(["away-adv"]);

    const even = applySidesFilters(rows, { ...DEFAULT_SIDES_FILTERS, coachingAgreement: "even" });
    expect(even.map((r) => r.game_id)).toEqual(["even-adv"]);
  });
});
