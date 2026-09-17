import { describe, expect, it } from "vitest";
import { resolveGrokResearchConfig, ticksToUsd } from "./nfl-grok-research-config";

describe("resolveGrokResearchConfig", () => {
  it("returns a bounded 'initial' config using grok-4.6 with reasoning_effort low", () => {
    const config = resolveGrokResearchConfig("initial");
    expect(config.model).toBe("grok-4.6");
    expect(config.reasoningEffort).toBe("low");
    expect(config.maxTurns).toBeGreaterThanOrEqual(3);
    expect(config.maxTurns).toBeLessThanOrEqual(5);
    expect(config.maxOutputTokens).not.toBeNull();
    expect(config.requestTimeoutMs).toBeGreaterThan(0);
  });

  it("returns a distinct bounded config for 'probe'", () => {
    const config = resolveGrokResearchConfig("probe");
    expect(config.mode).toBe("probe");
    expect(config.maxTurns).toBeLessThanOrEqual(3);
  });

  it("reserves an 'update' config shape without WU3 implementing its behavior", () => {
    const config = resolveGrokResearchConfig("update");
    expect(config.mode).toBe("update");
  });

  it("applies overrides without mutating the base config for other modes", () => {
    const overridden = resolveGrokResearchConfig("initial", { maxTurns: 1 });
    expect(overridden.maxTurns).toBe(1);
    const base = resolveGrokResearchConfig("initial");
    expect(base.maxTurns).not.toBe(1);
  });

  it("throws on an unknown mode", () => {
    // @ts-expect-error -- deliberately invalid mode for the runtime guard
    expect(() => resolveGrokResearchConfig("bogus")).toThrow(/Unknown Grok research mode/);
  });
});

describe("ticksToUsd", () => {
  it("converts cost_in_usd_ticks to a dollar amount using the documented 1e10 divisor", () => {
    expect(ticksToUsd(10_000_000_000)).toBe(1);
    expect(ticksToUsd(375020000)).toBeCloseTo(0.037502, 6);
  });
});
