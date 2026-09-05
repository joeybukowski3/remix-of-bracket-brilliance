import { describe, expect, it } from "vitest";
import {
  buildTotalsPerformanceRow,
  computeBucketRollups,
  computeDirectionalResult,
  computeMarketDirection,
  computeMarketOutcome,
  computeSummaryMetrics,
  selectPregameSnapshotPair,
  type MarketTotalObservation,
  type ResolvedTeamTotalActual,
  type TeamTotalSnapshotSide,
  type TotalsPerformanceRow,
} from "./nfl-totals-performance";
import { NOT_IMPLEMENTED_COACHING_CONTEXT, type PregameGameContext } from "./nfl-game-context";

function side(overrides: Partial<TeamTotalSnapshotSide> = {}): TeamTotalSnapshotSide {
  return {
    gameId: "2025_01_NE_SEA",
    season: 2025,
    week: 1,
    kickoffUtc: "2025-09-08T00:20:00.000Z",
    team: "sea",
    opponent: "ne",
    homeAway: "home",
    projectedTeamPoints: 24,
    modelVersion: "jkb-nfl-total-ridge-v1.0.0",
    fittedModelHash: "hash-a",
    predictionTimestamp: "2025-09-07T12:00:00.000Z",
    ...overrides,
  };
}

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

describe("selectPregameSnapshotPair", () => {
  it("pairs home/away rows correctly", () => {
    const home = side({ homeAway: "home", team: "sea", opponent: "ne" });
    const away = side({ homeAway: "away", team: "ne", opponent: "sea" });
    const result = selectPregameSnapshotPair([home], [away]);
    expect(result.status).toBe("selected");
    if (result.status === "selected") {
      expect(result.home.team).toBe("sea");
      expect(result.away.team).toBe("ne");
    }
  });

  it("rejects when the sibling row is missing", () => {
    expect(selectPregameSnapshotPair([], [side()])).toEqual({ status: "rejected", reason: "missing_home" });
    expect(selectPregameSnapshotPair([side()], [])).toEqual({ status: "rejected", reason: "missing_away" });
  });

  it("rejects a model_version mismatch", () => {
    const home = side({ modelVersion: "v1" });
    const away = side({ modelVersion: "v2" });
    expect(selectPregameSnapshotPair([home], [away])).toEqual({ status: "rejected", reason: "model_version_mismatch" });
  });

  it("rejects a fitted_model_hash mismatch", () => {
    const home = side({ fittedModelHash: "hash-a" });
    const away = side({ fittedModelHash: "hash-b" });
    expect(selectPregameSnapshotPair([home], [away])).toEqual({ status: "rejected", reason: "fitted_hash_mismatch" });
  });

  it("rejects when fittedModelHash is null", () => {
    const home = side({ fittedModelHash: null });
    const away = side({ fittedModelHash: null });
    expect(selectPregameSnapshotPair([home], [away])).toEqual({ status: "rejected", reason: "fitted_hash_mismatch" });
  });

  it("selects the latest-by-predictionTimestamp row on each side", () => {
    const earlyHome = side({ predictionTimestamp: "2025-09-06T00:00:00.000Z", projectedTeamPoints: 20 });
    const lateHome = side({ predictionTimestamp: "2025-09-07T00:00:00.000Z", projectedTeamPoints: 24 });
    const away = side({ homeAway: "away", team: "ne" });
    const result = selectPregameSnapshotPair([earlyHome, lateHome], [away]);
    expect(result.status).toBe("selected");
    if (result.status === "selected") {
      expect(result.home.projectedTeamPoints).toBe(24);
      expect(result.home.predictionTimestamp).toBe("2025-09-07T00:00:00.000Z");
    }
  });
});

describe("market direction / outcome / directional result", () => {
  it("computes JKB_OVER / JKB_UNDER / NEUTRAL", () => {
    expect(computeMarketDirection(48, 45)).toBe("JKB_OVER");
    expect(computeMarketDirection(42, 45)).toBe("JKB_UNDER");
    expect(computeMarketDirection(45, 45)).toBe("NEUTRAL");
    expect(computeMarketDirection(45, null)).toBeNull();
  });

  it("computes OVER / UNDER / PUSH", () => {
    expect(computeMarketOutcome(50, 45)).toBe("OVER");
    expect(computeMarketOutcome(40, 45)).toBe("UNDER");
    expect(computeMarketOutcome(45, 45)).toBe("PUSH");
  });

  it("WIN when JKB_OVER and actual OVER", () => {
    expect(computeDirectionalResult("JKB_OVER", "OVER")).toBe("WIN");
  });
  it("LOSS when JKB_OVER and actual UNDER", () => {
    expect(computeDirectionalResult("JKB_OVER", "UNDER")).toBe("LOSS");
  });
  it("WIN when JKB_UNDER and actual UNDER", () => {
    expect(computeDirectionalResult("JKB_UNDER", "UNDER")).toBe("WIN");
  });
  it("LOSS when JKB_UNDER and actual OVER", () => {
    expect(computeDirectionalResult("JKB_UNDER", "OVER")).toBe("LOSS");
  });
  it("PUSH regardless of direction when market outcome is PUSH", () => {
    expect(computeDirectionalResult("JKB_OVER", "PUSH")).toBe("PUSH");
    expect(computeDirectionalResult("JKB_UNDER", "PUSH")).toBe("PUSH");
  });
  it("NEUTRAL when JKB direction is NEUTRAL", () => {
    expect(computeDirectionalResult("NEUTRAL", "OVER")).toBe("NEUTRAL");
  });
  it("null when market data is unavailable", () => {
    expect(computeDirectionalResult(null, null)).toBeNull();
  });
});

function actual(teamPoints: number, opponentPoints: number): ResolvedTeamTotalActual {
  return { teamPoints, opponentPoints, gameCompletionStatus: "final", resolutionStatus: "resolved" };
}

const MARKET: MarketTotalObservation = {
  marketTotal: 45,
  marketTimestamp: "2025-09-07T10:00:00.000Z",
  provider: "the-odds-api",
  sportsbook: "draftkings",
  snapshotRef: "row-id-1",
  selectionRule: "latest_valid_pregame_snapshot",
};

describe("buildTotalsPerformanceRow", () => {
  it("computes projected/actual totals, errors, and market fields correctly", () => {
    const home = side({ homeAway: "home", team: "sea", opponent: "ne", projectedTeamPoints: 24 });
    const away = side({ homeAway: "away", team: "ne", opponent: "sea", projectedTeamPoints: 21 });
    const row = buildTotalsPerformanceRow({
      snapshots: { home, away },
      homeActual: actual(27, 20),
      awayActual: actual(20, 27),
      market: MARKET,
      context: NULL_CONTEXT,
      homePredictionIdRef: "pred_home",
      awayPredictionIdRef: "pred_away",
    });

    expect(row.projected_game_total).toBe(45); // 24 + 21
    expect(row.actual_game_total).toBe(47); // 27 + 20
    expect(row.signed_total_error).toBe(-2); // 45 - 47
    expect(row.absolute_total_error).toBe(2);
    expect(row.squared_total_error).toBe(4);
    expect(row.home_team_signed_error).toBe(-3); // 24 - 27
    expect(row.away_team_signed_error).toBe(1); // 21 - 20
    expect(row.home_team_absolute_error).toBe(3);
    expect(row.away_team_absolute_error).toBe(1);
    expect(row.jkb_minus_market).toBe(0); // 45 - 45
    expect(row.jkb_market_direction).toBe("NEUTRAL");
    expect(row.market_outcome).toBe("OVER"); // 47 > 45
    expect(row.directional_result).toBe("NEUTRAL");
    expect(row.projected_total_bucket).toBe("45-50"); // 45 falls in [45,50)
    expect(row.jkb_market_difference_bucket).toBe("<1");
  });

  it("handles a null market observation", () => {
    const home = side({ homeAway: "home" });
    const away = side({ homeAway: "away", team: "ne" });
    const row = buildTotalsPerformanceRow({
      snapshots: { home, away },
      homeActual: actual(24, 24),
      awayActual: actual(24, 24),
      market: null,
      context: NULL_CONTEXT,
      homePredictionIdRef: "pred_home",
      awayPredictionIdRef: "pred_away",
    });
    expect(row.market_total).toBeNull();
    expect(row.jkb_minus_market).toBeNull();
    expect(row.jkb_market_direction).toBeNull();
    expect(row.market_outcome).toBeNull();
    expect(row.directional_result).toBeNull();
  });
});

function rowFor(overrides: Partial<TotalsPerformanceRow>): TotalsPerformanceRow {
  const base = buildTotalsPerformanceRow({
    snapshots: { home: side({ homeAway: "home" }), away: side({ homeAway: "away", team: "ne" }) },
    homeActual: actual(24, 20),
    awayActual: actual(20, 24),
    market: MARKET,
    context: NULL_CONTEXT,
    homePredictionIdRef: "pred_home",
    awayPredictionIdRef: "pred_away",
  });
  return { ...base, ...overrides };
}

describe("computeSummaryMetrics", () => {
  it("computes MAE/RMSE/median/bias/correlation/hit-rate", () => {
    const rows = [
      rowFor({ signed_total_error: -2, absolute_total_error: 2, squared_total_error: 4, projected_game_total: 45, actual_game_total: 47, directional_result: "WIN" }),
      rowFor({ signed_total_error: 4, absolute_total_error: 4, squared_total_error: 16, projected_game_total: 50, actual_game_total: 46, directional_result: "LOSS" }),
    ];
    const summary = computeSummaryMetrics(rows);
    expect(summary.graded_games).toBe(2);
    expect(summary.game_total_mae).toBe(3); // (2+4)/2
    expect(summary.game_total_median_absolute_error).toBe(3);
    expect(summary.mean_signed_error).toBe(1); // (-2+4)/2
    expect(summary.directional_wins).toBe(1);
    expect(summary.directional_losses).toBe(1);
    expect(summary.directional_hit_rate).toBe(0.5);
  });

  it("returns nulls/zeros for an empty row set", () => {
    const summary = computeSummaryMetrics([]);
    expect(summary.graded_games).toBe(0);
    expect(summary.game_total_mae).toBeNull();
    expect(summary.directional_hit_rate).toBeNull();
  });
});

describe("computeBucketRollups", () => {
  it("assigns projected-total buckets at the documented boundaries", () => {
    const rows = [
      rowFor({ projected_total_bucket: "<40" }),
      rowFor({ projected_total_bucket: "40-45" }),
      rowFor({ projected_total_bucket: "45-50" }),
      rowFor({ projected_total_bucket: "50+" }),
    ];
    const rollups = computeBucketRollups(rows);
    const keys = rollups.by_projected_total_bucket.map((r) => r.key).sort();
    expect(keys).toEqual(["40-45", "45-50", "50+", "<40"].sort());
  });

  it("assigns JKB-vs-market difference buckets at the documented boundaries", () => {
    const rows = [
      rowFor({ jkb_market_difference_bucket: "<1" }),
      rowFor({ jkb_market_difference_bucket: "1-2" }),
      rowFor({ jkb_market_difference_bucket: "4+" }),
    ];
    const rollups = computeBucketRollups(rows);
    const keys = rollups.by_jkb_market_difference_bucket.map((r) => r.key).sort();
    expect(keys).toEqual(["1-2", "4+", "<1"].sort());
  });

  it("rolls up by week with correct win/loss/push counts and hit rate", () => {
    const rows = [
      rowFor({ week: 1, directional_result: "WIN" }),
      rowFor({ week: 1, directional_result: "LOSS" }),
      rowFor({ week: 2, directional_result: "PUSH" }),
    ];
    const rollups = computeBucketRollups(rows);
    const week1 = rollups.by_week.find((r) => r.key === "1");
    const week2 = rollups.by_week.find((r) => r.key === "2");
    expect(week1).toMatchObject({ n: 2, directional_wins: 1, directional_losses: 1, hit_rate: 0.5 });
    expect(week2).toMatchObject({ n: 1, directional_pushes: 1, hit_rate: null });
  });
});

describe("idempotency", () => {
  it("building the same row twice from the same inputs is deterministic", () => {
    const home = side({ homeAway: "home" });
    const away = side({ homeAway: "away", team: "ne" });
    const build = () =>
      buildTotalsPerformanceRow({
        snapshots: { home, away },
        homeActual: actual(24, 20),
        awayActual: actual(20, 24),
        market: MARKET,
        context: NULL_CONTEXT,
        homePredictionIdRef: "pred_home",
        awayPredictionIdRef: "pred_away",
      });
    expect(build()).toEqual(build());
  });
});
