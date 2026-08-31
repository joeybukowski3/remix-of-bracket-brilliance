import { describe, expect, it } from "vitest";
import {
  currentMoneylineLabel,
  currentSpreadLabel,
  formatAge,
  formatMove,
  freshnessLabel,
  modelVsMarketLabel,
  spreadMovementRow,
  totalMovementRow,
} from "@/components/nfl/matchups/bettingLinesPresentation";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { LineMovement } from "@/lib/nfl/bettingLinesView";

const projection = {
  projectedHomeMargin: 4.2,
} as GameProjection;

describe("bettingLinesPresentation", () => {
  it("states the spread from the home side, N/A when unpriced", () => {
    expect(currentSpreadLabel({ homeLine: -3.5, awayLine: 3.5, homePrice: null, awayPrice: null }, "sea")).toBe("SEA −3.5");
    expect(currentSpreadLabel(null, "sea")).toBe("N/A");
  });

  it("picks the favourite side for the moneyline", () => {
    expect(currentMoneylineLabel({ homePrice: -198, awayPrice: 164 }, "sea", "ne")).toBe("SEA −198");
    expect(currentMoneylineLabel({ homePrice: 150, awayPrice: -170 }, "sea", "ne")).toBe("NE −170");
    expect(currentMoneylineLabel(null, "sea", "ne")).toBe("N/A");
  });

  it("describes the model gap toward a team, or Even", () => {
    expect(modelVsMarketLabel(projection, { homeLine: -3.5, awayLine: 3.5, homePrice: null, awayPrice: null }, "sea", "ne")).toBe("SEA +0.7");
    expect(modelVsMarketLabel(projection, { homeLine: -4.2, awayLine: 4.2, homePrice: null, awayPrice: null }, "sea", "ne")).toBe("Even");
    expect(modelVsMarketLabel(null, { homeLine: -3.5, awayLine: 3.5, homePrice: null, awayPrice: null }, "sea", "ne")).toBe("N/A");
  });

  it("formats move and age", () => {
    expect(formatMove(-0.5)).toBe("−0.5");
    expect(formatMove(0)).toBe("0.0");
    expect(formatAge(8 * 60_000)).toBe("8m ago");
    expect(formatAge(3 * 3_600_000)).toBe("3h ago");
    expect(formatAge(2 * 86_400_000)).toBe("2d ago");
    expect(freshnessLabel(null)).toBe("Freshness unknown");
  });

  it("maps movement to rows using only real points", () => {
    const move: LineMovement = {
      firstObserved: -3,
      current: -3.5,
      move: -0.5,
      points: [
        { value: -3, at: "a" },
        { value: -3.5, at: "b" },
      ],
      firstObservedAt: "a",
      lastObservedAt: "b",
    };
    expect(spreadMovementRow(move, "sea")).toMatchObject({
      market: "SEA Spread",
      firstObserved: "−3",
      current: "−3.5",
      move: "−0.5",
      values: [-3, -3.5],
    });
    expect(spreadMovementRow(null, "sea")).toBeNull();
    expect(totalMovementRow(null)).toBeNull();
  });
});
