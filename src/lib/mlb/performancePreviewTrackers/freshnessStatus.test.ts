import { describe, expect, it } from "vitest";
import { computeFreshnessStatus } from "./freshnessStatus";

const NOW = new Date("2026-08-28T12:00:00Z");

describe("computeFreshnessStatus", () => {
  it("reports fresh when generatedAt is recent", () => {
    const result = computeFreshnessStatus({
      generatedAt: "2026-08-28T00:00:00Z",
      gradedThrough: "2026-08-27",
      hasError: false,
      now: NOW,
    });
    expect(result.level).toBe("fresh");
    expect(result.detail).toContain("Graded through 2026-08-27");
  });

  it("reports stale when generatedAt is older than the freshness threshold", () => {
    const result = computeFreshnessStatus({
      generatedAt: "2026-08-25T00:00:00Z",
      gradedThrough: "2026-08-24",
      hasError: false,
      now: NOW,
    });
    expect(result.level).toBe("stale");
  });

  it("reports error state on fetch failure, distinct from stale", () => {
    const result = computeFreshnessStatus({
      generatedAt: null,
      gradedThrough: null,
      hasError: true,
      errorMessage: "HTTP 500",
      now: NOW,
    });
    expect(result.level).toBe("error");
    expect(result.detail).toBe("HTTP 500");
  });

  it("surfaces a pending-records note without changing the fresh/stale level", () => {
    const result = computeFreshnessStatus({
      generatedAt: "2026-08-28T00:00:00Z",
      gradedThrough: "2026-08-27",
      hasError: false,
      pendingCount: 3,
      now: NOW,
    });
    expect(result.level).toBe("fresh");
    expect(result.detail).toContain("3 pending");
  });
});
