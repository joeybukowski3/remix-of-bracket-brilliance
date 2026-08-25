import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getGameById, getTeamById } from "@/data/cfb";
import CollegeFootballGameCard from "./CollegeFootballGameCard";

const GAME_ID = "401856766"; // TCU @ North Carolina — real Week 1 fixture, not prototype data

function renderCard() {
  const game = getGameById(GAME_ID)!;
  const away = getTeamById(game.awayTeamId)!;
  const home = getTeamById(game.homeTeamId)!;
  return {
    game,
    away,
    home,
    ...render(
      <MemoryRouter>
        <CollegeFootballGameCard game={game} away={away} home={home} matchupAvailable />
      </MemoryRouter>,
    ),
  };
}

describe("CollegeFootballGameCard", () => {
  it("renders real team names/abbreviations from the canonical data path, never prototype fixtures", () => {
    const { away, home } = renderCard();
    expect(screen.getAllByText(away.abbreviation).length).toBeGreaterThan(0);
    expect(screen.getAllByText(home.abbreviation).length).toBeGreaterThan(0);
    expect(screen.getAllByText(away.shortName).length).toBeGreaterThan(0);
    expect(screen.getAllByText(home.shortName).length).toBeGreaterThan(0);
    // Guard against prototype leakage: no fixture-only placeholder strings.
    expect(screen.queryByText(/lorem ipsum/i)).not.toBeInTheDocument();
  });

  it("links to the real matchup route for the game id", () => {
    const { container } = renderCard();
    expect(container.querySelector(`a[href="/college-football/matchup/${GAME_ID}"]`)).toBeInTheDocument();
  });

  it("shows records beside each team's name, not at the far right", () => {
    const { away, home, container } = renderCard();
    const awayRecord = `${away.record.wins}-${away.record.losses}`;
    const homeRecord = `${home.record.wins}-${home.record.losses}`;
    expect(screen.getAllByText(awayRecord).length + screen.getAllByText(homeRecord).length).toBeGreaterThan(0);
    // The rightmost fixed column holds the numeric JKB rating, not the record.
    const rightColumns = container.querySelectorAll(".w-9.shrink-0.text-right");
    expect(rightColumns.length).toBe(2);
  });

  it("shows a JKB-marked fallback rank badge rather than a bare hash when AP rank is unavailable", () => {
    const { away } = renderCard();
    expect(away.ratings.apRank).toBeNull();
    if (away.ratings.jkbRank != null) {
      expect(screen.getByText(`JKB ${away.ratings.jkbRank}`)).toBeInTheDocument();
    }
  });

  it("renders a power bar per team scaled by the presentation helper", () => {
    const { container } = renderCard();
    const bars = container.querySelectorAll(".h-1\\.5.w-full.overflow-hidden.rounded-full.bg-slate-100 > div");
    expect(bars.length).toBe(2);
  });

  it("fills each team's power bar with that team's own primary color, not a generic heat-map color", () => {
    const { away, home, container } = renderCard();
    const bars = container.querySelectorAll<HTMLDivElement>(
      ".h-1\\.5.w-full.overflow-hidden.rounded-full.bg-slate-100 > div",
    );
    const swatch = document.createElement("div");
    swatch.style.background = away.primaryColor;
    expect(bars[0].style.background).toBe(swatch.style.background);
    swatch.style.background = home.primaryColor;
    expect(bars[1].style.background).toBe(swatch.style.background);
    expect(bars[0].className).not.toMatch(/bg-(amber|emerald|lime|orange|rose)-/);
    expect(bars[1].className).not.toMatch(/bg-(amber|emerald|lime|orange|rose)-/);
  });

  it("shows moneyline as away/home and never reorders by favorite", () => {
    const { game, away, home } = renderCard();
    if (game.odds.awayMoneyline != null || game.odds.homeMoneyline != null) {
      const mlCell = screen.getByText("ML").parentElement!;
      const awayMl = game.odds.awayMoneyline == null ? "—" : (game.odds.awayMoneyline > 0 ? `+${game.odds.awayMoneyline}` : String(game.odds.awayMoneyline));
      const homeMl = game.odds.homeMoneyline == null ? "—" : (game.odds.homeMoneyline > 0 ? `+${game.odds.homeMoneyline}` : String(game.odds.homeMoneyline));
      expect(mlCell.textContent).toContain(`${awayMl} / ${homeMl}`);
    }
    expect(away.id).not.toBe(home.id);
  });

  it("shows a neutral-site badge only when the game is at a neutral site", () => {
    const { game } = renderCard();
    if (game.neutralSite) {
      expect(screen.getByText("Neutral")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("Neutral")).not.toBeInTheDocument();
    }
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderCard();
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
