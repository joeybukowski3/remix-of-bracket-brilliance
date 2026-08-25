import { describe, expect, it } from "vitest";
import {
  formatCfbGameStatusLabel,
  formatFavoriteSpread,
  formatMoneyline,
  formatNullableNumber,
  formatRank,
  formatRankChange,
  formatSpread,
  formatTotal,
  getCfbMarketFavorite,
  getCfbRankDisplay,
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

  it("derives the market favorite from the spread only, never JKB rating", () => {
    const homeFavored = { homeTeamId: "home", awayTeamId: "away", odds: { openingSpread: -7.5, currentSpread: -7.5, awayMoneyline: null, homeMoneyline: null, openingTotal: null, currentTotal: null } };
    const awayFavored = { homeTeamId: "home", awayTeamId: "away", odds: { openingSpread: 5.5, currentSpread: 5.5, awayMoneyline: null, homeMoneyline: null, openingTotal: null, currentTotal: null } };
    const pickEm = { homeTeamId: "home", awayTeamId: "away", odds: { openingSpread: 0, currentSpread: 0, awayMoneyline: null, homeMoneyline: null, openingTotal: null, currentTotal: null } };
    const noOdds = { homeTeamId: "home", awayTeamId: "away", odds: { openingSpread: null, currentSpread: null, awayMoneyline: null, homeMoneyline: null, openingTotal: null, currentTotal: null } };
    expect(getCfbMarketFavorite(homeFavored)).toBe("home");
    expect(getCfbMarketFavorite(awayFavored)).toBe("away");
    expect(getCfbMarketFavorite(pickEm)).toBe("none");
    expect(getCfbMarketFavorite(noOdds)).toBe("none");
  });

  it("formats the spread relative to the favored team's abbreviation", () => {
    const homeFavored = { homeTeamId: "home", awayTeamId: "away", odds: { openingSpread: -7.5, currentSpread: -7.5, awayMoneyline: null, homeMoneyline: null, openingTotal: null, currentTotal: null } };
    const awayFavored = { homeTeamId: "home", awayTeamId: "away", odds: { openingSpread: 5.5, currentSpread: 5.5, awayMoneyline: null, homeMoneyline: null, openingTotal: null, currentTotal: null } };
    expect(formatFavoriteSpread(homeFavored, "UVA", "TCU")).toBe("TCU -7.5");
    expect(formatFavoriteSpread(awayFavored, "UVA", "TCU")).toBe("UVA -5.5");
  });

  it("prefers official AP rank over JKB rank, marking the JKB fallback clearly", () => {
    expect(getCfbRankDisplay({ apRank: 8, jkbRank: 14 })).toEqual({
      text: "#8",
      label: "AP rank 8",
      source: "ap",
      isOfficial: true,
    });
    expect(getCfbRankDisplay({ apRank: null, jkbRank: 14 })).toEqual({
      text: "JKB 14",
      label: "JKB power rank 14",
      source: "jkb",
      isOfficial: false,
    });
    expect(getCfbRankDisplay({ apRank: null, jkbRank: null })).toEqual({
      text: "",
      label: "",
      source: "none",
      isOfficial: false,
    });
  });

  it("prefers CFP over AP once a committee poll exists", () => {
    expect(getCfbRankDisplay({ cfpRank: 6, apRank: 8, jkbRank: 14 })).toEqual({
      text: "#6",
      label: "CFP rank 6",
      source: "cfp",
      isOfficial: true,
    });
    expect(getCfbRankDisplay({ cfpRank: 6, apRank: null, jkbRank: 14 }).source).toBe("cfp");
  });

  it("falls back to AP when no CFP poll is available (the current in-season state)", () => {
    expect(getCfbRankDisplay({ cfpRank: null, apRank: 8, jkbRank: 14 }).source).toBe("ap");
    expect(getCfbRankDisplay({ apRank: 8, jkbRank: 14 }).source).toBe("ap");
  });

  it("falls back to a clearly labeled JKB rank only when a team is officially unranked", () => {
    const fallback = getCfbRankDisplay({ cfpRank: null, apRank: null, jkbRank: 14 });
    expect(fallback.source).toBe("jkb");
    expect(fallback.isOfficial).toBe(false);
    // A JKB rank must never render as a bare official-looking "#N".
    expect(fallback.text.startsWith("#")).toBe(false);
    expect(fallback.text).toBe("JKB 14");
    expect(fallback.label).not.toMatch(/\bAP\b|\bCFP\b/);
  });

  it("labels each rank source distinctly for assistive technology", () => {
    expect(getCfbRankDisplay({ cfpRank: 1, apRank: 2, jkbRank: 3 }).label).toBe("CFP rank 1");
    expect(getCfbRankDisplay({ apRank: 25, jkbRank: 3 }).label).toBe("AP rank 25");
    expect(getCfbRankDisplay({ apRank: null, jkbRank: 3 }).label).toBe("JKB power rank 3");
  });

  it("treats NaN ranks as unavailable at every tier rather than rendering NaN", () => {
    expect(getCfbRankDisplay({ cfpRank: Number.NaN, apRank: 8, jkbRank: 14 }).source).toBe("ap");
    expect(getCfbRankDisplay({ cfpRank: Number.NaN, apRank: Number.NaN, jkbRank: 14 }).source).toBe("jkb");
    expect(getCfbRankDisplay({ apRank: Number.NaN, jkbRank: Number.NaN }).source).toBe("none");
  });

  it("maps every game status to a stable label", () => {
    expect(formatCfbGameStatusLabel("scheduled")).toBe("Scheduled");
    expect(formatCfbGameStatusLabel("in_progress")).toBe("Live");
    expect(formatCfbGameStatusLabel("final")).toBe("Final");
    expect(formatCfbGameStatusLabel("postponed")).toBe("Postponed");
    expect(formatCfbGameStatusLabel("canceled")).toBe("Canceled");
  });
});
