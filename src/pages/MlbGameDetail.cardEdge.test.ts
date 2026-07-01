import { describe, expect, it } from "vitest";
import { formatCardPmEdgeLabel } from "@/pages/MlbGameDetail";

// PER MODEL AUDIT (Phase 1 correctness fix): formatCardPmEdgeLabel no longer
// renders a fabricated "value edge" percentage derived from treating
// edge.confidence/100 as a win probability. It now reports whether the
// model's pick agrees with the side Polymarket currently favors.
describe("formatCardPmEdgeLabel — collapsed matchup card Polymarket agreement", () => {
  it("renders 'Aligned' when the model pick matches the market favorite", () => {
    expect(formatCardPmEdgeLabel("BAL", { aligned: true })).toBe("Aligned");
  });

  it("renders 'Contrarian' when the model pick differs from the market favorite", () => {
    expect(formatCardPmEdgeLabel("NYM", { aligned: false })).toBe("Contrarian");
  });

  it("renders an em dash when pmAgreement is null (Polymarket data unavailable)", () => {
    expect(formatCardPmEdgeLabel("BAL", null)).toBe("—");
  });

  it("renders an em dash when mlPickAbbr is null (no model pick)", () => {
    expect(formatCardPmEdgeLabel(null, { aligned: true })).toBe("—");
  });

  it("never returns a percentage or numeric edge value", () => {
    const aligned = formatCardPmEdgeLabel("CWS", { aligned: true });
    const contrarian = formatCardPmEdgeLabel("CWS", { aligned: false });
    expect(aligned).not.toMatch(/%/);
    expect(contrarian).not.toMatch(/%/);
    expect(aligned).not.toMatch(/[+-]?\d/);
    expect(contrarian).not.toMatch(/[+-]?\d/);
  });
});
