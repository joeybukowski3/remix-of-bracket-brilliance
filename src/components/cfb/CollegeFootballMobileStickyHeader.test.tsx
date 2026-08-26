import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getGameById, getTeamById } from "@/data/cfb";
import { formatCfbKickoffParts } from "@/lib/cfb/schedulePresentation";
import CollegeFootballMobileStickyHeader from "./CollegeFootballMobileStickyHeader";

const GAME_ID = "401856766"; // TCU @ North Carolina — real Week 1 fixture

function renderSticky(visible: boolean) {
  const game = getGameById(GAME_ID)!;
  const away = getTeamById(game.awayTeamId)!;
  const home = getTeamById(game.homeTeamId)!;
  return {
    game,
    away,
    home,
    ...render(<CollegeFootballMobileStickyHeader away={away} home={home} game={game} visible={visible} />),
  };
}

describe("CollegeFootballMobileStickyHeader", () => {
  it("renders away on the left and home on the right, each in their own team color", () => {
    const { away, home, container } = renderSticky(true);
    const panels = container.querySelectorAll<HTMLDivElement>(":scope > div > div");
    expect(panels.length).toBe(3);
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = away.primaryColor;
    const homeSwatch = document.createElement("div");
    homeSwatch.style.background = home.primaryColor;
    expect(panels[0].style.background).toBe(awaySwatch.style.background);
    expect(panels[2].style.background).toBe(homeSwatch.style.background);
    expect(screen.getByText(away.abbreviation)).toBeInTheDocument();
    expect(screen.getByText(home.abbreviation)).toBeInTheDocument();
  });

  it("shows the game date and kickoff time in the dark center panel", () => {
    const { game } = renderSticky(true);
    const kickoff = formatCfbKickoffParts(game.date, game.time);
    expect(screen.getByText(kickoff.date)).toBeInTheDocument();
    if (kickoff.time) {
      expect(screen.getByText(kickoff.time)).toBeInTheDocument();
    }
  });

  it("preserves the existing sticky visibility toggle via translate + aria-hidden", () => {
    const { container: visibleContainer } = renderSticky(true);
    expect(visibleContainer.firstElementChild).toHaveClass("translate-y-0");
    expect(visibleContainer.firstElementChild).toHaveAttribute("aria-hidden", "false");

    const { container: hiddenContainer } = renderSticky(false);
    expect(hiddenContainer.firstElementChild).toHaveClass("-translate-y-full");
    expect(hiddenContainer.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderSticky(true);
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
