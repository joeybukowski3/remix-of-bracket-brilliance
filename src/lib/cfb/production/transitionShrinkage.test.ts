import { describe, expect, it } from "vitest";
import { CFB_TEAM_METADATA } from "@/data/cfb/teamMetadata";
import { CFB_V1_CONFIG } from "./config";
import { applyTransitionFallbackShrinkage } from "./transitionShrinkage";

describe("CFB v1 transition fallback shrinkage", () => {
  it("shrinks every prior-FCS standardized value exactly 50% toward FBS average zero", () => {
    expect(applyTransitionFallbackShrinkage("prior-fcs-fallback", 2.4)).toBe(1.2);
    expect(applyTransitionFallbackShrinkage("prior-fcs-fallback", -1.6)).toBe(-0.8);
  });

  it("does not shrink standard FBS prior performance", () => {
    expect(applyTransitionFallbackShrinkage("prior-fbs-opponent-adjusted", 2.4)).toBe(2.4);
    expect(applyTransitionFallbackShrinkage("prior-fbs-raw", -1.6)).toBe(-1.6);
  });

  it("is generic and contains no team-specific exceptions", () => {
    const serialized = JSON.stringify(CFB_V1_CONFIG);
    expect(CFB_V1_CONFIG.transitionFallback.priorPerformanceWeight).toBe(0.5);
    for (const team of CFB_TEAM_METADATA) expect(serialized).not.toContain(`"${team.id}"`);
  });
});
