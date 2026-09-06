import { describe, expect, it } from "vitest";
import {
  buildSidesPerformanceRow,
  computeAtsResult,
  computeFavoriteUnderdog,
  computeJkbAtsSide,
  computeSidesBucketRollups,
  computeSidesSummaryMetrics,
  selectCanonicalMarketSpread,
  selectPregameSpreadSnapshot,
  type MarketSpreadObservation,
  type RawSpreadMarketRef,
  type ResolvedSpreadActual,
  type SidesPerformanceRow,
  type SpreadSnapshot,
} from "./nfl-sides-performance";
import { NOT_IMPLEMENTED_COACHING_CONTEXT, type PregameGameContext } from "./nfl-game-context";

const NULL_CONTEXT: PregameGameContext = {
  epa: {
    metric: "off.epaPerPlay",
    window: "prior-season-full",
    home_epa_value: null,
    away_epa_value: null,
    epa_advantage_team: null,
    epa_differential: null,
    source_season: null,
    source_timestamp: null,
    provenance_status: "unavailable",
  },
  ypp: {
    metric: "off.yardsPerPlay",
    window: "prior-season-full",
    home_ypp: null,
    away_ypp: null,
    ypp_advantage_team: null,
    ypp_differential: null,
    source_season: null,
    source_timestamp: null,
    provenance_status: "unavailable",
  },
  trenches: {
    metric: "espn_trench_composite",
    window: "prior_season_through_week_18",
    home_trenches_value: null,
    away_trenches_value: null,
    trenches_advantage_team: null,
    trenches_differential: null,
    source_season: null,
    source_timestamp: null,
    provenance_status: "unavailable",
  },
  coaching: NOT_IMPLEMENTED_COACHING_CONTEXT,
};

function snap(overrides: Partial<SpreadSnapshot> = {}): SpreadSnapshot {
  return {
    gameId: "2025_01_NE_SEA",
    season: 2025,
    week: 1,
    kickoffUtc: "2025-09-08T00:20:00.000Z",
    homeTeam: "sea",
    awayTeam: "ne",
    projectedHomeMargin: 3.5,
    projectedSpreadLine: -3.5,
    projectedSpreadTeam: "sea",
    homePowerNumber: 5.8,
    awayPowerNumber: 4.3,
    homeFieldAdjustment: 2,
    modelVersion: "jkb-power-number-v1.0.0",
    fittedModelHash: null,
    predictionTimestamp: "2025-09-07T12:00:00.000Z",
    predictionId: "pred_home",
    ...overrides,
  };
}

function ref(overrides: Partial<RawSpreadMarketRef> = {}): RawSpreadMarketRef {
  return {
    market_type: "spread",
    purpose: "comparison",
    line: -3,
    observed_at: "2025-09-07T14:00:00.000Z",
    provider: "the-odds-api",
    sportsbook: "draftkings",
    content_hash: "hash-dk",
    market_observation_id: "obs-dk",
    ...overrides,
  };
}

function actual(homePoints: number, awayPoints: number): ResolvedSpreadActual {
  return {
    homePoints,
    awayPoints,
    homeMargin: homePoints - awayPoints,
    gameCompletionStatus: "final",
    resolutionStatus: "resolved",
  };
}

const MARKET: MarketSpreadObservation = {
  marketHomeLine: -3,
  marketImpliedHomeMargin: 3,
  marketTimestamp: "2025-09-07T14:00:00.000Z",
  provider: "the-odds-api",
  sportsbook: "draftkings",
  snapshotRef: "hash-dk",
  marketObservationId: "obs-dk",
  selectionRule: "latest_valid_pregame_comparison_line",
};

describe("selectPregameSpreadSnapshot", () => {
  it("selects the latest-by-predictionTimestamp row", () => {
    const early = snap({ predictionTimestamp: "2025-09-06T00:00:00.000Z", projectedHomeMargin: 1 });
    const late = snap({ predictionTimestamp: "2025-09-07T00:00:00.000Z", projectedHomeMargin: 4 });
    const result = selectPregameSpreadSnapshot([early, late]);
    expect(result.status).toBe("selected");
    if (result.status === "selected") expect(result.snapshot.projectedHomeMargin).toBe(4);
  });

  it("rejects an empty row set", () => {
    expect(selectPregameSpreadSnapshot([])).toEqual({ status: "rejected", reason: "missing" });
  });

  it("rejects a non-live model version", () => {
    expect(selectPregameSpreadSnapshot([snap({ modelVersion: "jkb-power-number-v0.9.0" })])).toEqual({
      status: "rejected",
      reason: "model_version_mismatch",
    });
  });
});

describe("selectCanonicalMarketSpread", () => {
  it("prefers the highest-priority sportsbook", () => {
    const refs = [
      ref({ sportsbook: "betrivers", line: -2, market_observation_id: "obs-br" }),
      ref({ sportsbook: "draftkings", line: -3, market_observation_id: "obs-dk" }),
    ];
    const observation = selectCanonicalMarketSpread(refs, "2025-09-08T00:20:00.000Z");
    expect(observation?.sportsbook).toBe("draftkings");
    expect(observation?.marketHomeLine).toBe(-3);
    expect(observation?.marketImpliedHomeMargin).toBe(3);
  });

  it("takes the latest-by-observed_at row for the chosen book", () => {
    const refs = [
      ref({ observed_at: "2025-09-05T14:00:00.000Z", line: -2 }),
      ref({ observed_at: "2025-09-07T14:00:00.000Z", line: -3.5 }),
    ];
    const observation = selectCanonicalMarketSpread(refs, "2025-09-08T00:20:00.000Z");
    expect(observation?.marketHomeLine).toBe(-3.5);
  });

  it("never selects a line observed at or after kickoff", () => {
    const refs = [ref({ observed_at: "2025-09-08T01:00:00.000Z", line: -10 })];
    expect(selectCanonicalMarketSpread(refs, "2025-09-08T00:20:00.000Z")).toBeNull();
  });

  it("ignores non-comparison and non-spread refs", () => {
    const refs = [
      ref({ purpose: "available_at_prediction" as unknown as string, line: -9 }),
      ref({ market_type: "total", line: 44 }),
    ];
    expect(selectCanonicalMarketSpread(refs, "2025-09-08T00:20:00.000Z")).toBeNull();
  });
});

describe("orientation / ATS grading", () => {
  it("computeJkbAtsSide: home when JKB projects home better than the market implies", () => {
    expect(computeJkbAtsSide(6, 3)).toBe("home");
    expect(computeJkbAtsSide(1, 3)).toBe("away");
    expect(computeJkbAtsSide(3, 3)).toBe("pick");
    expect(computeJkbAtsSide(3, null)).toBeNull();
  });

  it("computeAtsResult: home side wins when the home team covers", () => {
    // market home line -3 -> home covers if actual home margin > 3
    expect(computeAtsResult("home", 7, -3)).toBe("WIN");
    expect(computeAtsResult("home", 1, -3)).toBe("LOSS");
    expect(computeAtsResult("away", 1, -3)).toBe("WIN");
    expect(computeAtsResult("home", 3, -3)).toBe("PUSH");
    expect(computeAtsResult("pick", 7, -3)).toBe("NEUTRAL");
    expect(computeAtsResult("home", null, -3)).toBeNull();
  });

  it("computeFavoriteUnderdog: classifies the backed team by its own line", () => {
    expect(computeFavoriteUnderdog("home", -3)).toBe("favorite");
    expect(computeFavoriteUnderdog("away", -3)).toBe("underdog");
    expect(computeFavoriteUnderdog("away", 3)).toBe("favorite");
    expect(computeFavoriteUnderdog("pick", -3)).toBeNull();
    expect(computeFavoriteUnderdog("home", null)).toBeNull();
  });
});

describe("buildSidesPerformanceRow", () => {
  it("computes margins, errors, orientation and buckets correctly", () => {
    const row = buildSidesPerformanceRow({
      snapshot: snap({ projectedHomeMargin: 6 }),
      actual: actual(27, 17), // home margin +10
      market: MARKET, // implied home margin +3
      context: NULL_CONTEXT,
      outcomeSourceStateHash: "state-hash",
    });
    expect(row.actual_margin).toBe(10);
    expect(row.signed_margin_error).toBe(-4); // 6 - 10
    expect(row.absolute_margin_error).toBe(4);
    expect(row.squared_margin_error).toBe(16);
    expect(row.jkb_minus_market).toBe(3); // 6 - 3
    expect(row.jkb_ats_side).toBe("home"); // 6 > 3
    expect(row.jkb_supports_team).toBe("sea");
    expect(row.ats_result).toBe("WIN"); // home covered -3 (won by 10)
    expect(row.projected_winner).toBe("home");
    expect(row.actual_winner).toBe("home");
    expect(row.projected_winner_correct).toBe(true);
    expect(row.favorite_underdog).toBe("favorite");
    expect(row.jkb_market_difference_bucket).toBe("3-4");
    expect(row.market_spread_bucket).toBe("3-7");
    expect(row.market_team_orientation).toBe("home_line");
  });

  it("handles a null market observation (no ATS grade, no direction)", () => {
    const row = buildSidesPerformanceRow({
      snapshot: snap(),
      actual: actual(20, 24),
      market: null,
      context: NULL_CONTEXT,
      outcomeSourceStateHash: null,
    });
    expect(row.market_spread).toBeNull();
    expect(row.jkb_minus_market).toBeNull();
    expect(row.jkb_ats_side).toBeNull();
    expect(row.ats_result).toBeNull();
    expect(row.favorite_underdog).toBeNull();
    // winner direction still resolves without a market
    expect(row.actual_winner).toBe("away");
    expect(row.projected_winner).toBe("home");
    expect(row.projected_winner_correct).toBe(false);
  });

  it("keeps the coaching context as the NOT_IMPLEMENTED null contract", () => {
    const row = buildSidesPerformanceRow({
      snapshot: snap(),
      actual: actual(21, 20),
      market: MARKET,
      context: NULL_CONTEXT,
      outcomeSourceStateHash: null,
    });
    expect(row.context.coaching.coaching_context_status).toBe("NOT_IMPLEMENTED");
    expect(row.context.coaching.home_coaching_rating).toBeNull();
  });
});

function rowFor(overrides: Partial<SidesPerformanceRow>): SidesPerformanceRow {
  const base = buildSidesPerformanceRow({
    snapshot: snap({ projectedHomeMargin: 6 }),
    actual: actual(27, 17),
    market: MARKET,
    context: NULL_CONTEXT,
    outcomeSourceStateHash: null,
  });
  return { ...base, ...overrides };
}

describe("computeSidesSummaryMetrics", () => {
  it("computes MAE/RMSE/median/bias/correlation/hit-rate/winner accuracy", () => {
    const rows = [
      rowFor({ signed_margin_error: -4, absolute_margin_error: 4, projected_home_margin: 6, actual_margin: 10, ats_result: "WIN", projected_winner_correct: true, market_implied_home_margin: 3 }),
      rowFor({ signed_margin_error: 2, absolute_margin_error: 2, projected_home_margin: 0, actual_margin: -2, ats_result: "LOSS", projected_winner_correct: false, market_implied_home_margin: 1 }),
    ];
    const summary = computeSidesSummaryMetrics(rows);
    expect(summary.graded_games).toBe(2);
    expect(summary.margin_mae).toBe(3); // (4+2)/2
    expect(summary.margin_median_absolute_error).toBe(3);
    expect(summary.mean_signed_error).toBe(-1); // (-4+2)/2
    expect(summary.directional_wins).toBe(1);
    expect(summary.directional_losses).toBe(1);
    expect(summary.ats_directional_hit_rate).toBe(0.5);
    expect(summary.winner_accuracy).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
    expect(summary.market_comparison.comparable_n).toBe(2);
  });

  it("returns nulls/zeros for an empty row set", () => {
    const summary = computeSidesSummaryMetrics([]);
    expect(summary.graded_games).toBe(0);
    expect(summary.margin_mae).toBeNull();
    expect(summary.ats_directional_hit_rate).toBeNull();
    expect(summary.winner_accuracy.accuracy).toBeNull();
    expect(summary.market_comparison.comparable_n).toBe(0);
  });
});

describe("computeSidesBucketRollups", () => {
  it("rolls up by week and by JKB-vs-market difference bucket", () => {
    const rows = [
      rowFor({ week: 1, ats_result: "WIN", jkb_market_difference_bucket: "<1" }),
      rowFor({ week: 1, ats_result: "LOSS", jkb_market_difference_bucket: "1-2" }),
      rowFor({ week: 2, ats_result: "PUSH", jkb_market_difference_bucket: "4+" }),
    ];
    const rollups = computeSidesBucketRollups(rows);
    expect(rollups.by_week.find((r) => r.key === "1")).toMatchObject({ n: 2, directional_wins: 1, directional_losses: 1, hit_rate: 0.5 });
    expect(rollups.by_week.find((r) => r.key === "2")).toMatchObject({ n: 1, directional_pushes: 1, hit_rate: null });
    expect(rollups.by_jkb_market_difference_bucket.map((r) => r.key).sort()).toEqual(["1-2", "4+", "<1"].sort());
  });

  it("rolls up by favorite/underdog and JKB ATS side", () => {
    const rows = [
      rowFor({ favorite_underdog: "favorite", jkb_ats_side: "home" }),
      rowFor({ favorite_underdog: "underdog", jkb_ats_side: "away" }),
    ];
    const rollups = computeSidesBucketRollups(rows);
    expect(rollups.by_favorite_underdog.map((r) => r.key).sort()).toEqual(["favorite", "underdog"]);
    expect(rollups.by_jkb_ats_side.map((r) => r.key).sort()).toEqual(["away", "home"]);
  });
});

describe("determinism", () => {
  it("building the same row twice from the same inputs is deterministic", () => {
    const build = () =>
      buildSidesPerformanceRow({
        snapshot: snap(),
        actual: actual(24, 20),
        market: MARKET,
        context: NULL_CONTEXT,
        outcomeSourceStateHash: "h",
      });
    expect(build()).toEqual(build());
  });
});
