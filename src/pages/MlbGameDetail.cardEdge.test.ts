import { describe, expect, it } from "vitest";
import { formatCardPmEdgeLabel } from "@/pages/MlbGameDetail";

describe("formatCardPmEdgeLabel — collapsed matchup card Polymarket edge", () => {
  it("renders a positive edge with a leading +", () => {
    expect(formatCardPmEdgeLabel("BAL", { edge: 4.2, isEven: false })).toBe("+4.2%");
  });

  it("renders a negative edge with -", () => {
    expect(formatCardPmEdgeLabel("NYM", { edge: -2.1, isEven: false })).toBe("-2.1%");
  });

  it("renders exactly even as 0.0%", () => {
    expect(formatCardPmEdgeLabel("PHI", { edge: 0, isEven: true })).toBe("0.0%");
  });

  it("renders an em dash when pmEdge is null (Polymarket data unavailable)", () => {
    expect(formatCardPmEdgeLabel("BAL", null)).toBe("—");
  });

  it("renders an em dash when mlPickAbbr is null (no model pick)", () => {
    expect(formatCardPmEdgeLabel(null, { edge: 3.5, isEven: false })).toBe("—");
  });

  it("the model-selected team receives the corresponding edge — no extra text appended", () => {
    const result = formatCardPmEdgeLabel("CWS", { edge: 1.5, isEven: false });
    expect(result).toBe("+1.5%");
    expect(result).not.toContain("Polymarket");
    expect(result).not.toContain("Value");
    expect(result).not.toContain("Edge");
    expect(result).not.toContain("CWS");
  });
});
