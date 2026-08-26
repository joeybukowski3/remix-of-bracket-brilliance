import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getGameById, getTeamById } from "@/data/cfb";
import { getCfbRankDisplay } from "@/lib/cfb/format";
import CollegeFootballMatchupHero from "./CollegeFootballMatchupHero";

const GAME_ID = "401856766"; // TCU @ North Carolina — real Week 1 fixture, neutral site, no US state

function renderHero() {
  const game = getGameById(GAME_ID)!;
  const away = getTeamById(game.awayTeamId)!;
  const home = getTeamById(game.homeTeamId)!;
  return {
    game,
    away,
    home,
    ...render(
      <MemoryRouter>
        <CollegeFootballMatchupHero game={game} away={away} home={home} />
      </MemoryRouter>,
    ),
  };
}

describe("CollegeFootballMatchupHero", () => {
  it("renders both teams' real names and records from the canonical data path", () => {
    const { away, home } = renderHero();
    expect(screen.getAllByText(away.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(home.name).length).toBeGreaterThan(0);
    const awayRecord = `${away.record.wins}-${away.record.losses}`;
    const homeRecord = `${home.record.wins}-${home.record.losses}`;
    expect(screen.getAllByText(awayRecord).length + screen.getAllByText(homeRecord).length).toBeGreaterThan(0);
  });

  it("renders each team's official/JKB rank badge honestly, matching the shared rank-priority helper", () => {
    const { away, home } = renderHero();
    for (const team of [away, home]) {
      const expected = getCfbRankDisplay(team.ratings);
      if (expected.text === "") continue;
      expect(screen.getAllByText(expected.text).length).toBeGreaterThan(0);
      if (expected.isOfficial) {
        expect(expected.text.startsWith("#")).toBe(true);
      } else {
        expect(expected.text).toMatch(/^JKB \d+$/);
      }
    }
  });

  it("shows a neutral-site indicator for this genuine neutral-site fixture", () => {
    const { game } = renderHero();
    expect(game.neutralSite).toBe(true);
    expect(screen.getByText("Neutral Site")).toBeInTheDocument();
    expect(screen.getByText("Neutral")).toBeInTheDocument();
  });

  it("renders the verified venue and city without fabricating a state for an international venue", () => {
    const { game, container } = renderHero();
    expect(game.venue).toBe("Aviva Stadium");
    expect(game.venueCity).toBe("Dublin");
    expect(game.venueState).toBeNull();
    expect(container.textContent).toContain("Aviva Stadium");
    expect(container.textContent).toContain("Dublin");
  });

  it("does not render a score for a scheduled (not yet played) game", () => {
    const { game, container } = renderHero();
    expect(game.gameStatus).toBe("scheduled");
    expect(container.querySelector(".text-2xl.font-black")).toBeNull();
  });

  it("renders the real final score once a game reaches final status", () => {
    const game = getGameById(GAME_ID)!;
    const away = getTeamById(game.awayTeamId)!;
    const home = getTeamById(game.homeTeamId)!;
    const finalGame = { ...game, gameStatus: "final" as const, awayScore: 24, homeScore: 17 };
    render(
      <MemoryRouter>
        <CollegeFootballMatchupHero game={finalGame} away={away} home={home} />
      </MemoryRouter>,
    );
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderHero();
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
