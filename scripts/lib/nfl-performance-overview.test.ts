import { describe, expect, it } from "vitest";
import {
  buildOverviewPropsSection,
  buildOverviewSidesSection,
  buildOverviewTotalsSection,
} from "./nfl-performance-overview";

describe("buildOverviewTotalsSection", () => {
  it("reports NOT_AVAILABLE with null metrics when no totals artifact exists", () => {
    const section = buildOverviewTotalsSection(null, null);
    expect(section.status).toBe("NOT_AVAILABLE");
    expect(section.graded_games).toBe(0);
    expect(section.mae).toBeNull();
    expect(section.bias).toBeNull();
    expect(section.directional_hit_rate).toBeNull();
  });

  it("reports AVAILABLE with metrics read verbatim from the totals artifact, including zero graded games", () => {
    const section = buildOverviewTotalsSection(
      {
        performanceMeta: { seasons: [2026] },
        summary: { graded_games: 0, game_total_mae: null, mean_signed_error: null, directional_hit_rate: null },
        performanceMetaLatestOutcomeTimestamp: null,
      },
      null,
    );
    expect(section.status).toBe("AVAILABLE");
    expect(section.graded_games).toBe(0);
  });

  it("passes through non-zero metrics unchanged", () => {
    const section = buildOverviewTotalsSection(
      {
        performanceMeta: { seasons: [2026] },
        summary: { graded_games: 12, game_total_mae: 4.2, mean_signed_error: -0.3, directional_hit_rate: 0.6 },
        performanceMetaLatestOutcomeTimestamp: "2026-10-01T00:00:00.000Z",
      },
      "2026-10-01T00:00:00.000Z",
    );
    expect(section).toMatchObject({
      status: "AVAILABLE",
      graded_games: 12,
      mae: 4.2,
      bias: -0.3,
      directional_hit_rate: 0.6,
      latest_grade_timestamp: "2026-10-01T00:00:00.000Z",
    });
  });
});

describe("buildOverviewPropsSection", () => {
  it("reports NOT_AVAILABLE when no props artifact exists", () => {
    const section = buildOverviewPropsSection(null, null);
    expect(section.status).toBe("NOT_AVAILABLE");
    expect(section.passing_n).toBe(0);
  });

  it("passes through market-family counts and metrics unchanged", () => {
    const section = buildOverviewPropsSection(
      {
        performanceMeta: { seasons: [2026] },
        summary: { graded_starter_props: 30, directional_hit_rate: 0.55, projection_mae: 12.1, passing_n: 8, rushing_n: 10, receiving_n: 12 },
      },
      "2026-10-01T00:00:00.000Z",
    );
    expect(section).toMatchObject({
      status: "AVAILABLE",
      graded_props: 30,
      directional_hit_rate: 0.55,
      mae: 12.1,
      passing_n: 8,
      rushing_n: 10,
      receiving_n: 12,
    });
  });
});

describe("buildOverviewSidesSection", () => {
  it("reports AVAILABLE_BUT_NOT_MATERIALIZED without fabricating a metric when no spread summary exists", () => {
    const section = buildOverviewSidesSection(null, null);
    expect(section.status).toBe("AVAILABLE_BUT_NOT_MATERIALIZED");
    expect(section.graded_games).toBe(0);
    expect(section.spread_mae).toBeNull();
    expect(section.market_direction_metric).toBeNull();
    expect(section.winner_accuracy).toBeNull();
  });

  it("thin-summarizes the canonical spread evaluation metrics verbatim, including a zero-n season", () => {
    const section = buildOverviewSidesSection(
      {
        metrics: {
          by_prediction_type: {
            spread: {
              n: 0,
              mae: null,
              market_comparison: { comparable_n: 0, jkb_mae: null, market_mae: null, jkb_minus_market_mae: null },
              winner_accuracy: { accuracy: null, total: 0 },
            },
          },
        },
      },
      null,
    );
    expect(section.status).toBe("AVAILABLE");
    expect(section.graded_games).toBe(0);
    expect(section.market_direction_metric).toEqual({ comparable_n: 0, jkb_mae: null, market_mae: null, jkb_minus_market_mae: null });
  });

  it("passes through non-zero spread metrics unchanged", () => {
    const section = buildOverviewSidesSection(
      {
        metrics: {
          by_prediction_type: {
            spread: {
              n: 40,
              mae: 3.9,
              market_comparison: { comparable_n: 35, jkb_mae: 3.9, market_mae: 4.1, jkb_minus_market_mae: -0.2 },
              winner_accuracy: { accuracy: 0.62, total: 40 },
            },
          },
        },
      },
      "2026-10-01T00:00:00.000Z",
    );
    expect(section).toMatchObject({
      status: "AVAILABLE",
      graded_games: 40,
      spread_mae: 3.9,
      winner_accuracy: 0.62,
      latest_grade_timestamp: "2026-10-01T00:00:00.000Z",
    });
  });
});
