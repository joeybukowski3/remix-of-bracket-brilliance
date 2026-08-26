import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getGameById, getTeamById } from "@/data/cfb";
import { getCfbSharedBarSplit } from "@/lib/cfb/ratingPresentation";
import CollegeFootballPowerComparison from "./CollegeFootballPowerComparison";

const GAME_ID = "401856766"; // TCU @ North Carolina — real Week 1 fixture

function renderComparison() {
  const game = getGameById(GAME_ID)!;
  const away = getTeamById(game.awayTeamId)!;
  const home = getTeamById(game.homeTeamId)!;
  return {
    away,
    home,
    ...render(<CollegeFootballPowerComparison away={away} home={home} />),
  };
}

describe("CollegeFootballPowerComparison", () => {
  it("renders JKB Power, Offense, Defense, and SOS rows from real ratings", () => {
    renderComparison();
    expect(screen.getByText("Power")).toBeInTheDocument();
    expect(screen.getByText("Offense")).toBeInTheDocument();
    expect(screen.getByText("Defense")).toBeInTheDocument();
    expect(screen.getByText("SOS Played")).toBeInTheDocument();
    expect(screen.getByText("SOS Remaining")).toBeInTheDocument();
  });

  it("fills each unified power/offense/defense bar with both teams' own primary colors, sharing width by raw-value ratio (not clamped display widths)", () => {
    const { away, home, container } = renderComparison();
    const tracks = container.querySelectorAll<HTMLDivElement>(".h-3.overflow-hidden.rounded-full.bg-slate-100");
    // 3 bar rows (power/offense/defense), one shared track each.
    expect(tracks.length).toBe(3);
    const powerSegments = tracks[0].querySelectorAll<HTMLDivElement>(":scope > div");
    expect(powerSegments.length).toBe(2);
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = away.primaryColor;
    const homeSwatch = document.createElement("div");
    homeSwatch.style.background = home.primaryColor;
    expect(powerSegments[0].style.background).toBe(awaySwatch.style.background);
    expect(powerSegments[1].style.background).toBe(homeSwatch.style.background);

    const { awayShare, homeShare } = getCfbSharedBarSplit(away.ratings.jkbPowerRating, home.ratings.jkbPowerRating);
    expect(powerSegments[0].style.width).toBe(`${awayShare}%`);
    expect(powerSegments[1].style.width).toBe(`${homeShare}%`);
  });

  it("computes the shared bar split from raw values, not from independently clamped display widths (regression: UNC 45.1 vs TCU 78.5 offense case)", () => {
    // Two ratings that clamp-compress very differently (one near the 40-point
    // floor) previously produced an ~12/88 split from a real ~36/64 gap.
    const { awayShare, homeShare } = getCfbSharedBarSplit(45.1, 78.5);
    expect(awayShare).toBeCloseTo((45.1 / 123.6) * 100, 5);
    expect(homeShare).toBeCloseTo((78.5 / 123.6) * 100, 5);
    // Must stay well clear of the old distorted ~11.7/88.3 result.
    expect(awayShare).toBeGreaterThan(30);
  });

  it("marks only the stronger side, in that team's own color, never a generic green and never both sides on one row", () => {
    const { away, home, container } = renderComparison();
    const markers = container.querySelectorAll('[data-testid="stronger-badge"]');
    // At most one marker per row (5 rows total)
    expect(markers.length).toBeLessThanOrEqual(5);
    expect(markers.length).toBeGreaterThan(0);
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = away.primaryColor;
    const homeSwatch = document.createElement("div");
    homeSwatch.style.background = home.primaryColor;
    for (const marker of Array.from(markers)) {
      const bg = (marker as HTMLElement).style.background;
      expect([awaySwatch.style.background, homeSwatch.style.background]).toContain(bg);
    }
    expect(screen.getByText(/not a betting recommendation/i)).toBeInTheDocument();
  });

  it("never renders a fabricated win probability or edge percentage", () => {
    renderComparison();
    expect(screen.queryByText(/win probability/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderComparison();
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
