/** Shadow total calibration report: metrics, cohort separation, buckets and the no-premature-claim rule. */
import { describe, expect, it } from "vitest";
import {
  NFL_TOTAL_SHADOW_MODEL_NAME,
  NFL_TOTAL_SHADOW_MODEL_VERSION,
  NFL_TOTAL_SHADOW_ROW_SCHEMA,
  computeShadowTotal,
  type ShadowOutcome,
  type ShadowRow,
} from "./nfl-total-shadow-calibration";
import { buildShadowReport, errorMetrics, pairedSummary, renderShadowReportMarkdown, TOTAL_BUCKETS } from "./nfl-total-shadow-report";

const MEAN = 46;
function row(gameId: string, week: number, raw: number, market: number | null, generatedAt = "2026-09-24T12:00:00.000Z"): ShadowRow {
  return {
    schema_version: NFL_TOTAL_SHADOW_ROW_SCHEMA, shadow_id: `s_${gameId}_${generatedAt}`, mode: "shadow", cohort: week >= 3 ? "prospective" : "retrospective", retrospective_reason: week >= 3 ? null : "test",
    season: 2026, week, game_id: gameId, kickoff_utc: "2026-09-27T17:00:00.000Z", home_team: "a", away_team: "b", neutral_site: false,
    model_name: NFL_TOTAL_SHADOW_MODEL_NAME, model_version: NFL_TOTAL_SHADOW_MODEL_VERSION, base_model_name: "nfl-total-ridge", base_model_version: "jkb-nfl-total-ridge-v1.0.0",
    k: 0.8, formula: "shadowTotal = priorSeasonLeagueMean + 0.8 * (rawJkbTotal - priorSeasonLeagueMean)", prior_season: 2025, prior_season_league_mean: MEAN,
    league_mean_source: { season: 2025, games_counted: 272, regular_season_games_expected: 272, sum_total_points: 0, mean_total_points: MEAN, source_path: "x", source_sha256: "y" },
    raw_jkb_total: raw, shadow_total: computeShadowTotal(raw, MEAN), production_prediction_ids: { home: "h", away: "a" }, production_fitted_model_hash: null, production_prediction_timestamp: generatedAt,
    generated_at: generatedAt, created_at: generatedAt, run_id: "r", pipeline_version: "nfl-total-calibration-shadow-v1", code_revision: null,
    market_at_generation: { available: market !== null, total: market, sportsbook: market === null ? null : "draftkings", provider: "the-odds-api", observed_at: null, observation_id: null, content_hash: null, selection_rule: "latest_observation_at_or_before_generation_time", usage: "evaluation_only_never_a_model_input", books: [] },
    public_exposure: "none",
  } as ShadowRow;
}
const outcome = (gameId: string, total: number, week = 3): ShadowOutcome => ({ schema_version: "jkb-nfl-total-shadow-outcome-v1", outcome_id: `o_${gameId}`, season: 2026, week, game_id: gameId, home_score: total, away_score: 0, final_total: total, graded_at: "2026-09-30T00:00:00.000Z", source: "t" });

describe("error metrics", () => {
  it("computes MAE, RMSE, signed error (pred - actual) and the calibration slope of actual on predicted", () => {
    const m = errorMetrics([40, 44, 50], [45, 44, 47])!;
    expect(m.n).toBe(3);
    expect(m.mae).toBeCloseTo((5 + 0 + 3) / 3, 12);
    expect(m.rmse).toBeCloseTo(Math.sqrt((25 + 0 + 9) / 3), 12);
    expect(m.signedError).toBeCloseTo((-5 + 0 + 3) / 3, 12);
    // OLS slope of actual on pred: pred mean 44.667, actual mean 45.333
    const sxy = (40 - 44.6666667) * (45 - 45.3333333) + (44 - 44.6666667) * (44 - 45.3333333) + (50 - 44.6666667) * (47 - 45.3333333);
    const sxx = (40 - 44.6666667) ** 2 + (44 - 44.6666667) ** 2 + (50 - 44.6666667) ** 2;
    expect(m.calibrationSlope).toBeCloseTo(sxy / sxx, 6);
  });
  it("returns null slope for fewer than 3 games or a constant projection", () => {
    expect(errorMetrics([40, 44], [45, 44])!.calibrationSlope).toBeNull();
    expect(errorMetrics([44, 44, 44], [40, 45, 50])!.calibrationSlope).toBeNull();
    expect(errorMetrics([], [])).toBeNull();
  });
});

describe("total buckets", () => {
  it("assign the boundary values to the documented half-open ranges", () => {
    const bucketOf = (t: number) => TOTAL_BUCKETS.find((b) => b.test(t))!.key;
    expect(bucketOf(39.99)).toBe("under_40"); expect(bucketOf(40)).toBe("40_to_44_5"); expect(bucketOf(44.99)).toBe("40_to_44_5");
    expect(bucketOf(45)).toBe("45_to_49_5"); expect(bucketOf(49.99)).toBe("45_to_49_5"); expect(bucketOf(50)).toBe("50_plus");
  });
});

describe("paired differences", () => {
  it("diff = |shadow error| - |production error|; negative favours the shadow total; counts sign", () => {
    const s = pairedSummary([-1, -0.5, 2, 0]);
    expect(s.n).toBe(4); expect(s.meanAbsErrorDiff).toBeCloseTo(0.125, 12); expect(s.shadowBetter).toBe(2); expect(s.shadowWorse).toBe(1); expect(s.tied).toBe(1);
    expect(s.ci95Low).not.toBeNull();
    expect(pairedSummary([]).meanAbsErrorDiff).toBeNull();
  });
});

describe("report cohorts and the no-premature-claim rule", () => {
  const rows = [row("g1", 3, 40, 42), row("g2", 3, 50, 47), row("g3", 4, 46, null), row("r1", 1, 30, 40), row("r2", 2, 60, 50)];
  const outcomes = [outcome("g1", 44, 3), outcome("g2", 49, 3), outcome("g3", 46, 4), outcome("r1", 41, 1), outcome("r2", 51, 2)];

  it("the prospective score contains only Week 3+ rows; Weeks 1-2 are reported separately as retrospective reference", () => {
    const rep = buildShadowReport({ rows, outcomes });
    expect(rep.prospective.gamesGraded).toBe(3);
    expect(rep.prospective.perGame.map((g) => g.game_id).sort()).toEqual(["g1", "g2", "g3"]);
    expect(rep.retrospectiveReference.gamesGraded).toBe(2);
    expect(rep.retrospectiveReference.perGame.map((g) => g.game_id).sort()).toEqual(["r1", "r2"]);
    // production MAE on prospective games: |40-44|,|50-49|,|46-46| = (4+1+0)/3
    expect(rep.prospective.production!.mae).toBeCloseTo(5 / 3, 12);
    const sh = (r: number, a: number) => Math.abs(computeShadowTotal(r, MEAN) - a);
    expect(rep.prospective.shadow!.mae).toBeCloseTo((sh(40, 44) + sh(50, 49) + sh(46, 46)) / 3, 12);
    // market metrics only on games that had a market at generation
    expect(rep.prospective.marketGames).toBe(2);
    expect(rep.prospective.marketAtGeneration!.mae).toBeCloseTo((Math.abs(42 - 44) + Math.abs(47 - 49)) / 2, 12);
  });

  it("states that no comparison can be claimed until the review threshold, and never emits a superiority verdict", () => {
    const rep = buildShadowReport({ rows, outcomes });
    expect(rep.status).toBe("INSUFFICIENT_SAMPLE_DESCRIPTIVE_ONLY");
    expect(rep.statement).toMatch(/no claim/i);
    const md = renderShadowReportMarkdown(rep);
    expect(md).toMatch(/NOT part of the validation score/);
    expect(md).not.toMatch(/shadow (is|was) better|outperform/i);
    expect(buildShadowReport({ rows: [], outcomes: [] }).status).toBe("NO_PROSPECTIVE_GRADED_GAMES");
  });

  it("uses only the latest pregame snapshot per game and the closing market only as a labelled reference", () => {
    const twice = [row("g1", 3, 40, 42, "2026-09-22T12:00:00.000Z"), row("g1", 3, 45, 43, "2026-09-24T12:00:00.000Z")];
    const rep = buildShadowReport({ rows: twice, outcomes: [outcome("g1", 46, 3)], closingMarket: () => 47.5 });
    expect(rep.prospective.gamesGraded).toBe(1);
    expect(rep.prospective.perGame[0].raw_jkb_total).toBe(45);
    expect(rep.prospective.marketClosingReference!.n).toBe(1);
    expect(rep.prospective.marketAtGeneration!.mae).toBe(3);
  });

  it("games without a result are pending, not scored", () => {
    const rep = buildShadowReport({ rows: [row("g1", 3, 40, 42), row("g9", 3, 41, 42)], outcomes: [outcome("g1", 44, 3)] });
    expect(rep.prospective.gamesGraded).toBe(1); expect(rep.prospective.gamesAwaitingResult).toBe(1);
  });
});
