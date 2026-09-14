import { describe, expect, it } from "vitest";
import { checkContextFreshness } from "./nfl-snapshot-context-freshness";

describe("checkContextFreshness", () => {
  it("is fresh when the current context's generatedAt is strictly newer than the previous snapshot's", () => {
    const result = checkContextFreshness("2026-09-09T10:30:00.000Z", "2026-09-10T10:30:00.000Z");
    expect(result.status).toBe("fresh");
  });

  it("flags an identical generatedAt as stale/reused -- the exact prior context, no evidence of a fresh read", () => {
    const result = checkContextFreshness("2026-09-09T10:30:00.000Z", "2026-09-09T10:30:00.000Z");
    expect(result.status).toBe("stale_or_reused");
    expect(result.reason).toMatch(/not strictly newer/);
  });

  it("flags a current generatedAt earlier than the previous snapshot's as stale/reused", () => {
    const result = checkContextFreshness("2026-09-10T10:30:00.000Z", "2026-09-09T10:30:00.000Z");
    expect(result.status).toBe("stale_or_reused");
  });

  it("never rejects based on VALUES being unchanged -- this function only ever receives timestamps, proving it cannot see market/context content", () => {
    // Structural guarantee: the function signature only accepts two ISO strings, so it is
    // impossible for it to compare market/context VALUES -- only provenance timestamps.
    const result = checkContextFreshness("2026-09-09T10:30:00.000Z", "2026-09-09T10:30:00.001Z");
    expect(result.status).toBe("fresh");
  });

  it("treats a missing previous timestamp (e.g. an initial/bootstrap snapshot) as nothing-to-be-stale-against", () => {
    const result = checkContextFreshness(null, "2026-09-10T10:30:00.000Z");
    expect(result.status).toBe("fresh");
  });

  it("returns 'unknown' when the current timestamp is missing or unparseable", () => {
    expect(checkContextFreshness("2026-09-09T10:30:00.000Z", null).status).toBe("unknown");
    expect(checkContextFreshness("2026-09-09T10:30:00.000Z", "not-a-date").status).toBe("unknown");
  });
});
