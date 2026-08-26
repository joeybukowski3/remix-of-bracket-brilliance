import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getGameById, getTeamById } from "@/data/cfb";
import { getCfbRankDisplay } from "@/lib/cfb/format";
import CollegeFootballMatchupHero from "./CollegeFootballMatchupHero";

const GAME_ID = "401856766"; // TCU @ North Carolina — real Week 1 fixture, neutral site, no US state

/** "#N" for a real rank, "#—" when unavailable — mirrors the component's own honest-rank helper. */
function rankPillText(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "#—" : `#${Math.trunc(value)}`;
}

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

  it("renders each team's real JKB and AP rank as separate honest pills — never fabricated", () => {
    const { away, home } = renderHero();
    for (const team of [away, home]) {
      const jkbText = `JKB ${rankPillText(team.ratings.jkbRank)}`;
      const apText = `AP ${rankPillText(team.ratings.apRank)}`;
      expect(screen.getAllByText(jkbText).length).toBeGreaterThan(0);
      expect(screen.getAllByText(apText).length).toBeGreaterThan(0);
    }
  });

  it("shows a neutral-site indicator for this genuine neutral-site fixture", () => {
    const { game } = renderHero();
    expect(game.neutralSite).toBe(true);
    expect(screen.getAllByText("Neutral Site").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Neutral").length).toBeGreaterThan(0);
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
    expect(container.querySelector(".text-4xl.font-black")).toBeNull();
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
    expect(screen.getAllByText("24").length).toBeGreaterThan(0);
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Final").length).toBeGreaterThan(0);
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderHero();
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});

describe("CollegeFootballMatchupHero — mobile presentation", () => {
  it("renders away on the left and home on the right, each in their own team color", () => {
    const { away, home } = renderHero();
    const mobile = screen.getByTestId("cfb-hero-mobile");
    const panels = mobile.querySelectorAll<HTMLAnchorElement>("a");
    expect(panels.length).toBe(2);
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = away.primaryColor;
    const homeSwatch = document.createElement("div");
    homeSwatch.style.background = home.primaryColor;
    expect(panels[0].style.background).toBe(awaySwatch.style.background);
    expect(panels[1].style.background).toBe(homeSwatch.style.background);
    expect(panels[0].getAttribute("href")).toContain(away.slug);
    expect(panels[1].getAttribute("href")).toContain(home.slug);
  });

  it("shows a single honest CFP > AP > JKB rank pill per team (not two independent JKB/AP pills)", () => {
    const { away, home } = renderHero();
    const mobile = screen.getByTestId("cfb-hero-mobile");
    const awayRank = getCfbRankDisplay(away.ratings);
    const homeRank = getCfbRankDisplay(home.ratings);
    if (awayRank.text) expect(within(mobile).getByTitle(awayRank.label)).toHaveTextContent(awayRank.text);
    if (homeRank.text) expect(within(mobile).getByTitle(homeRank.label)).toHaveTextContent(homeRank.text);
    // Never the desktop's separate "JKB #" / "AP #" pill pair.
    expect(within(mobile).queryByText(/^JKB #/)).not.toBeInTheDocument();
    expect(within(mobile).queryByText(/^AP #/)).not.toBeInTheDocument();
  });

  it("shows large team identity, record, and score once final", () => {
    const game = getGameById(GAME_ID)!;
    const away = getTeamById(game.awayTeamId)!;
    const home = getTeamById(game.homeTeamId)!;
    const finalGame = { ...game, gameStatus: "final" as const, awayScore: 24, homeScore: 17 };
    render(
      <MemoryRouter>
        <CollegeFootballMatchupHero game={finalGame} away={away} home={home} />
      </MemoryRouter>,
    );
    const mobile = screen.getByTestId("cfb-hero-mobile");
    expect(within(mobile).getByText(away.shortName)).toBeInTheDocument();
    expect(within(mobile).getByText(home.shortName)).toBeInTheDocument();
    expect(within(mobile).getByText("24")).toBeInTheDocument();
    expect(within(mobile).getByText("17")).toBeInTheDocument();
    expect(within(mobile).getByText("Final")).toBeInTheDocument();
  });

  it("shows kickoff, venue, and neutral-site context in the compact center column", () => {
    const { game } = renderHero();
    const mobile = screen.getByTestId("cfb-hero-mobile");
    expect(game.neutralSite).toBe(true);
    expect(within(mobile).getByText("Neutral Site")).toBeInTheDocument();
    expect(within(mobile).getByText("Neutral")).toBeInTheDocument();
    expect(mobile.textContent).toContain("Aviva Stadium");
    expect(mobile.textContent).toContain("Dublin");
  });

  it("does not render a score for a scheduled (not yet played) game", () => {
    const { game } = renderHero();
    expect(game.gameStatus).toBe("scheduled");
    const mobile = screen.getByTestId("cfb-hero-mobile");
    expect(mobile.querySelector(".text-2xl.font-black")).toBeNull();
  });

  it("desktop tree is unaffected — still uses the two independent JKB/AP pills", () => {
    const { away, home } = renderHero();
    const desktop = screen.getByTestId("cfb-hero-desktop");
    const jkbText = `JKB ${rankPillText(away.ratings.jkbRank)}`;
    const apText = `AP ${rankPillText(home.ratings.apRank)}`;
    expect(within(desktop).getAllByText(jkbText).length).toBeGreaterThan(0);
    expect(within(desktop).getAllByText(apText).length).toBeGreaterThan(0);
  });
});
