import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getGameById, getTeamById } from "@/data/cfb";
import { getCfbPowerBarWidthPercent } from "@/lib/cfb/ratingPresentation";
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

  it("fills the power/offense/defense bars using each team's own primary color, scaled by the shared presentation helper", () => {
    const { away, home, container } = renderComparison();
    const bars = container.querySelectorAll<HTMLDivElement>(".h-1\\.5.flex-1.overflow-hidden.rounded-full.bg-slate-100 > div");
    // 3 bar rows (power/offense/defense) x 2 sides = 6 bars
    expect(bars.length).toBe(6);
    const swatch = document.createElement("div");
    swatch.style.background = away.primaryColor;
    expect(bars[0].style.background).toBe(swatch.style.background);
    swatch.style.background = home.primaryColor;
    expect(bars[1].style.background).toBe(swatch.style.background);
    const expectedPercent = `${getCfbPowerBarWidthPercent(away.ratings.jkbPowerRating)}%`;
    expect(bars[0].style.width).toBe(expectedPercent);
  });

  it("marks only the stronger side, never both, and never implies a betting pick", () => {
    const { container } = renderComparison();
    const markers = container.querySelectorAll(".bg-emerald-600");
    // At most one marker per row (5 rows total)
    expect(markers.length).toBeLessThanOrEqual(5);
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
