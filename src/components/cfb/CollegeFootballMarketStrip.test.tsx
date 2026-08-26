import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getGameById } from "@/data/cfb";
import type { CfbGameOdds } from "@/data/cfb/types";
import { formatFavoriteSpread, formatFavoriteSpreadValue, formatMoneyline, formatTotal } from "@/lib/cfb/format";
import CollegeFootballMarketStrip from "./CollegeFootballMarketStrip";

const GAME_ID = "401856766"; // TCU @ North Carolina — real Week 1 fixture

function renderStrip(oddsOverride?: Partial<CfbGameOdds>) {
  const game = getGameById(GAME_ID)!;
  const odds = { ...game.odds, ...oddsOverride };
  const gameWithOdds = { ...game, odds };
  return {
    game: gameWithOdds,
    ...render(
      <CollegeFootballMarketStrip
        odds={odds}
        game={gameWithOdds}
        awayAbbreviation="TCU"
        homeAbbreviation="UNC"
        awayColor="#4d1979"
        homeColor="#4b9cd3"
      />,
    ),
  };
}

describe("CollegeFootballMarketStrip", () => {
  it("renders a mobile block with 3 equal columns: Spread, Total, Moneyline", () => {
    renderStrip();
    const mobile = screen.getByTestId("cfb-market-mobile");
    expect(within(mobile).getByText("Spread")).toBeInTheDocument();
    expect(within(mobile).getByText("Total")).toBeInTheDocument();
    expect(within(mobile).getByText("Moneyline")).toBeInTheDocument();
  });

  it("mobile shows the same current spread/total/moneyline values as desktop", () => {
    const { game } = renderStrip();
    const mobile = screen.getByTestId("cfb-market-mobile");
    const desktop = screen.getByTestId("cfb-market-desktop");
    const spread = formatFavoriteSpread(game, "TCU", "UNC");
    const total = formatTotal(game.odds.currentTotal ?? game.odds.openingTotal);
    const awayMl = formatMoneyline(game.odds.awayMoneyline);
    const homeMl = formatMoneyline(game.odds.homeMoneyline);
    expect(within(mobile).getByText(spread)).toBeInTheDocument();
    expect(within(mobile).getByText(total)).toBeInTheDocument();
    expect(within(mobile).getByText(`${awayMl} / ${homeMl}`)).toBeInTheDocument();
    expect(within(desktop).getByText(spread)).toBeInTheDocument();
  });

  it("mobile moneyline preserves away/home order", () => {
    renderStrip();
    const mobile = screen.getByTestId("cfb-market-mobile");
    expect(within(mobile).getByText("TCU / UNC")).toBeInTheDocument();
  });

  it("shows the Open: spread footnote only when opening and current spreads both exist and differ", () => {
    const { game } = renderStrip({ openingSpread: -3, currentSpread: -6.5 });
    const mobile = screen.getByTestId("cfb-market-mobile");
    const openText = `Open: ${formatFavoriteSpreadValue(game.odds.openingSpread, "TCU", "UNC")}`;
    expect(within(mobile).getByText(openText)).toBeInTheDocument();
  });

  it("omits the Open: footnote when opening and current spreads are equal", () => {
    renderStrip({ openingSpread: -6.5, currentSpread: -6.5 });
    const mobile = screen.getByTestId("cfb-market-mobile");
    expect(within(mobile).queryByText(/^Open:/)).not.toBeInTheDocument();
  });

  it("omits the Open: footnote when either spread is missing", () => {
    renderStrip({ openingSpread: null, currentSpread: -6.5 });
    const mobile = screen.getByTestId("cfb-market-mobile");
    expect(within(mobile).queryByText(/^Open:/)).not.toBeInTheDocument();
  });

  it("shows a no-odds notice on mobile when neither spread exists", () => {
    renderStrip({ openingSpread: null, currentSpread: null });
    const mobile = screen.getByTestId("cfb-market-mobile");
    expect(within(mobile).getByText("No odds currently available.")).toBeInTheDocument();
  });

  it("desktop tree is unaffected — keeps its own icon-bubble treatment", () => {
    renderStrip();
    const desktop = screen.getByTestId("cfb-market-desktop");
    expect(desktop.querySelector(".h-8.w-8.items-center.justify-center.rounded-full")).not.toBeNull();
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderStrip();
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
