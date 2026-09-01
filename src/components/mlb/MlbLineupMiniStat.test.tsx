/**
 * MlbLineupMiniStat.test.tsx
 * The lineup rates are a goodness read: a better AVG/OBP/SLG or a lower K% is
 * favorable and must render with the shared JKB Heat green fill, not the
 * sanctioned hot/cold red (KS-010). Thresholds are unchanged. Exact derivation
 * from the shared scale is proven in mlbDisplayHelpers.test.ts; here we only
 * check the right tone reaches the DOM.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import MlbLineupMiniStat from "./MlbLineupMiniStat";

function bg(label: string, value: string): string {
  const { container } = render(<MlbLineupMiniStat label={label} value={value} />);
  return (container.firstElementChild as HTMLElement).style.backgroundColor;
}

// JKB Heat: above-average = green (34,197,94), below-average = rose (251,113,133),
// average = slate (148,163,184).
describe("MlbLineupMiniStat — goodness color direction (shared JKB Heat)", () => {
  it("renders a strong AVG with the shared favorable green fill", () => {
    expect(bg("AVG", ".285")).toMatch(/34,\s*197,\s*94/);
  });

  it("renders a weak AVG with the shared unfavorable red fill", () => {
    expect(bg("AVG", ".205")).toMatch(/251,\s*113,\s*133/);
  });

  it("renders a low (favorable) K% green and a high K% red", () => {
    expect(bg("K%", "15%")).toMatch(/34,\s*197,\s*94/);
    expect(bg("K%", "28%")).toMatch(/251,\s*113,\s*133/);
  });

  it("renders a mid-range value with the shared neutral slate fill", () => {
    expect(bg("AVG", ".245")).toMatch(/148,\s*163,\s*184/);
  });
});
