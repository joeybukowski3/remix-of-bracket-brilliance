import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CollegeFootballOddsDisplay from "./CollegeFootballOddsDisplay";

const game = {
  homeTeamId: "home",
  awayTeamId: "away",
  odds: {
    openingSpread: -6.5,
    currentSpread: -7.5,
    awayMoneyline: 240,
    homeMoneyline: -300,
    openingTotal: 50.5,
    currentTotal: 52,
  },
};

describe("CollegeFootballOddsDisplay", () => {
  it("shows the spread relative to the favored team's abbreviation when team abbreviations are provided", () => {
    render(
      <CollegeFootballOddsDisplay
        odds={game.odds}
        game={game}
        awayAbbreviation="UVA"
        homeAbbreviation="TCU"
      />,
    );
    expect(screen.getByText("TCU -7.5")).toBeInTheDocument();
  });

  it("falls back to the raw home-perspective spread when team abbreviations are not provided", () => {
    render(<CollegeFootballOddsDisplay odds={game.odds} />);
    expect(screen.getByText("-7.5")).toBeInTheDocument();
  });

  it("always displays moneyline as away / home, never reordered by favorite", () => {
    render(
      <CollegeFootballOddsDisplay
        odds={game.odds}
        game={game}
        awayAbbreviation="UVA"
        homeAbbreviation="TCU"
      />,
    );
    expect(screen.getByText("+240 / -300")).toBeInTheDocument();
  });

  it("prefers the current total over the opening total", () => {
    render(<CollegeFootballOddsDisplay odds={game.odds} />);
    expect(screen.getByText("52.0")).toBeInTheDocument();
  });

  it("shows an honest em dash instead of a fabricated value when odds are unavailable", () => {
    const noOdds = {
      openingSpread: null,
      currentSpread: null,
      awayMoneyline: null,
      homeMoneyline: null,
      openingTotal: null,
      currentTotal: null,
    };
    render(<CollegeFootballOddsDisplay odds={noOdds} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows PICK for a pick'em spread relative to the favorite format", () => {
    const pickGame = {
      homeTeamId: "home",
      awayTeamId: "away",
      odds: { ...game.odds, currentSpread: 0, openingSpread: 0 },
    };
    render(
      <CollegeFootballOddsDisplay
        odds={pickGame.odds}
        game={pickGame}
        awayAbbreviation="UVA"
        homeAbbreviation="TCU"
      />,
    );
    expect(screen.getByText("PICK")).toBeInTheDocument();
  });
});
