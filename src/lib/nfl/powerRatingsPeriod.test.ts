import { describe, expect, it } from "vitest";
import {
  POWER_RATINGS_PERIODS,
  efficiencyWindowId,
  successPeriodKey,
} from "@/lib/nfl/powerRatingsPeriod";

describe("powerRatingsPeriod", () => {
  it("maps each period to the precomputed efficiency window", () => {
    expect(efficiencyWindowId("2025")).toBe("prior-season-full");
    expect(efficiencyWindowId("2026")).toBe("season-current");
    expect(efficiencyWindowId("last8")).toBe("season-blend");
  });

  it("exposes exactly the three mutually exclusive periods", () => {
    expect([...POWER_RATINGS_PERIODS]).toEqual(["2025", "2026", "last8"]);
  });

  it("maps success periods, and only treats Last 8 as 2025-last8 before any 2026 games", () => {
    expect(successPeriodKey("2025", 0)).toBe("2025-season");
    expect(successPeriodKey("2026", 0)).toBe("2026-season");
    expect(successPeriodKey("last8", 0)).toBe("2025-last8");
    // Once real 2026 games exist the rolling window crosses the boundary and
    // RBSDM can no longer express it — unavailable, never a stale 2025 number.
    expect(successPeriodKey("last8", 3)).toBeNull();
  });
});
