import { describe, expect, it } from "vitest";
import {
  formatMoneyline,
  formatNullableNumber,
  formatRank,
  formatRankChange,
  formatSpread,
  formatTotal,
  getTeamPerspectiveSpread,
} from "./format";

describe("CFB format helpers", () => {
  it("renders null/undefined/NaN as em dash, not fake zeros", () => {
    expect(formatNullableNumber(null)).toBe("—");
    expect(formatNullableNumber(undefined)).toBe("—");
    expect(formatNullableNumber(Number.NaN)).toBe("—");
    expect(formatRank(null)).toBe("—");
    expect(formatSpread(null)).toBe("—");
    expect(formatTotal(null)).toBe("—");
    expect(formatMoneyline(null)).toBe("—");
  });

  it("formats real zero values correctly", () => {
    expect(formatNullableNumber(0)).toBe("0.0");
    expect(formatSpread(0)).toBe("PICK");
  });

  it("hides rank movement when previous rank is unavailable", () => {
    expect(formatRankChange(null, 7)).toEqual({ text: "", direction: "none" });
    expect(formatRankChange(10, 7)).toEqual({ text: "↑3", direction: "up" });
    expect(formatRankChange(5, 8)).toEqual({ text: "↓3", direction: "down" });
  });

  it("formats favorite, underdog, pick'em, and missing spreads", () => {
    expect(formatSpread(-7.5)).toBe("-7.5");
    expect(formatSpread(7.5)).toBe("+7.5");
    expect(formatSpread(0)).toBe("PICK");
    expect(formatSpread(null)).toBe("—");
  });

  it("returns the existing spread from each team's perspective", () => {
    const game = {
      awayTeamId: "away",
      homeTeamId: "home",
      odds: {
        openingSpread: -6.5,
        currentSpread: -7.5,
        awayMoneyline: null,
        homeMoneyline: null,
        openingTotal: null,
        currentTotal: null,
      },
    };
    expect(getTeamPerspectiveSpread(game, "home")).toBe(-7.5);
    expect(getTeamPerspectiveSpread(game, "away")).toBe(7.5);
  });

  it("never fabricates a missing spread or falls back to JKB Power", () => {
    const game = {
      awayTeamId: "away",
      homeTeamId: "home",
      odds: {
        openingSpread: null,
        currentSpread: null,
        awayMoneyline: null,
        homeMoneyline: null,
        openingTotal: null,
        currentTotal: null,
      },
      model: { jkbPowerLine: -12.5 },
    };
    expect(getTeamPerspectiveSpread(game, "home")).toBeNull();
    expect(formatSpread(getTeamPerspectiveSpread(game, "home"))).toBe("—");
  });
});
