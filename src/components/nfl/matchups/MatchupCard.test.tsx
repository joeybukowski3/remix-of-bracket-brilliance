import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupCard from "@/components/nfl/matchups/MatchupCard";
import { formatMarketFavoriteSpread, type MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * The matchup-list card shows the MARKET spread from the published market
 * artifact and, deliberately since the 2026-08-19 Power Number integration,
 * the JKB projected spread and the Model-vs-Market difference alongside it —
 * never a value manufactured from the moneyline, total or power rating also
 * on the card.
 *
 * The market line still names no sportsbook and still never claims to be a
 * consensus or an independently verified closing line — that provenance
 * constraint is unchanged by adding the JKB column beside it.
 */

const team = (abbr: string, teamName: string, slug: string) => ({
  abbr,
  teamName,
  slug,
  division: "AFC East",
  conference: "AFC",
  powerRank: 5,
  overallPct: 6.8,
});

const MATCHUP = {
  gameId: "2026_01_NE_SEA",
  slug: "new-england-patriots-at-seattle-seahawks",
  week: 1,
  season: 2026,
  kickoffUtc: "2026-09-10T00:20:00.000Z",
  stadium: "Lumen Field",
  spread: null,
  away: team("ne", "New England Patriots", "new-england-patriots"),
  home: team("sea", "Seattle Seahawks", "seattle-seahawks"),
} as unknown as NflMatchup;

/** `spread.home` is sportsbook notation: the negative side is the favourite. */
const market = (overrides: Partial<MarketCurrentGame> = {}): MarketCurrentGame =>
  ({
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    homeAbbr: "sea",
    awayAbbr: "ne",
    neutralSite: false,
    spread: { home: -3.5, away: 3.5 },
    moneyline: { home: -198, away: 164 },
    total: 44.5,
    rawSpreadLine: -3.5,
    ...overrides,
  }) as MarketCurrentGame;

const projection = (overrides: Partial<GameProjection> = {}): GameProjection => ({
  gameId: "2026_01_NE_SEA",
  week: 1,
  kickoff: "2026-09-10T00:20:00.000Z",
  awayTeam: "ne",
  homeTeam: "sea",
  homeCurrentOVR: 55.65,
  awayCurrentOVR: 44.35,
  leagueAverageOVR: 50,
  homePowerNumber: 1.356,
  awayPowerNumber: -1.356,
  neutralSite: false,
  homeFieldAdvantage: 2,
  neutralProjectedMargin: 1.3586,
  projectedHomeMargin: 3.3586,
  formattedJkbSpread: "SEA −3.4",
  ...overrides,
});

function renderCard(m: MarketCurrentGame | null, p: GameProjection | null = null) {
  render(
    <MemoryRouter>
      <MatchupCard matchup={MATCHUP} market={m} projection={p} />
    </MemoryRouter>
  );
  return screen.getByRole("link", { name: /view matchup breakdown/i });
}

describe("MatchupCard market spread", () => {
  it("shows the published line for a priced game", () => {
    const card = renderCard(market());
    expect(within(card).getByText("SEA −3.5")).toBeInTheDocument();
  });

  it("names the home team when the home side is favoured", () => {
    const card = renderCard(market({ spread: { home: -6.5, away: 6.5 } }));
    expect(within(card).getByText("SEA −6.5")).toBeInTheDocument();
  });

  it("names the away team when the away side is favoured", () => {
    const card = renderCard(market({ spread: { home: 2, away: -2 } }));
    expect(within(card).getByText("NE −2")).toBeInTheDocument();
  });

  it("renders a genuine pick'em as PK", () => {
    const card = renderCard(market({ spread: { home: 0, away: 0 } }));
    expect(within(card).getAllByText("PK").length).toBeGreaterThan(0);
  });

  it("shows N/A when the source has not priced the game", () => {
    const card = renderCard(market({ spread: { home: null, away: null } }));
    expect(within(card).getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("shows N/A when no market record exists at all, and still renders the card", () => {
    const card = renderCard(null);
    expect(within(card).getAllByText("N/A").length).toBeGreaterThan(0);
    // The card is never hidden just because the game is unpriced.
    expect(within(card).getByText("Seattle Seahawks")).toBeInTheDocument();
  });

  it("keeps the JKB / Market / Diff labels so an unpriced game still reads as a spread slot", () => {
    const card = renderCard(null);
    expect(within(card).getByText("JKB")).toBeInTheDocument();
    expect(within(card).getByText("Market")).toBeInTheDocument();
    expect(within(card).getByText("Diff")).toBeInTheDocument();
  });
});

describe("MatchupCard market spread cannot be manufactured", () => {
  it("does not derive the market spread from the moneyline", () => {
    const card = renderCard(
      market({ spread: { home: null, away: null }, moneyline: { home: -260, away: 210 } })
    );
    expect(within(card).queryByText(/−2\.5|−3|SEA −/)).toBeNull();
  });

  it("does not derive the market spread from the total", () => {
    const card = renderCard(market({ spread: { home: null, away: null }, total: 51.5 }));
    expect(within(card).queryByText("51.5")).toBeNull();
  });

  it("does not fall back to the power rating shown on the same card", () => {
    const card = renderCard(market({ spread: { home: null, away: null } }));
    expect(within(card).getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("names no sportsbook", () => {
    const card = renderCard(market(), projection());
    const text = card.textContent ?? "";
    for (const book of [/draftkings/i, /fanduel/i, /caesars/i, /bet365/i, /pinnacle/i]) {
      expect(text).not.toMatch(book);
    }
  });

  it("never claims the market line is a consensus or an independently verified closing line", () => {
    const card = renderCard(market(), projection());
    const text = card.textContent ?? "";
    expect(text).not.toMatch(/consensus/i);
    expect(text).not.toMatch(/closing line/i);
  });
});

describe("MatchupCard JKB projected spread (deliberate, since 2026-08-19)", () => {
  it("renders the JKB projected spread when a projection is supplied", () => {
    const card = renderCard(market(), projection());
    expect(within(card).getByText("SEA −3.4")).toBeInTheDocument();
  });

  it("shows N/A for JKB, never a fabricated projection, when none is supplied", () => {
    const card = renderCard(market(), null);
    const jkbLabel = within(card).getByText("JKB");
    const jkbValue = jkbLabel.parentElement?.querySelector("div:nth-child(2)");
    expect(jkbValue?.textContent).toBe("N/A");
  });

  it("shows a team-oriented Diff, never a bare signed number", () => {
    // JKB SEA -3.4 (home margin +3.4) vs Market SEA -3.5 (home margin +3.5)
    // -> model is 0.1 lower on home than market -> leans away (NE) by 0.1.
    const card = renderCard(market(), projection());
    expect(within(card).getByText("NE +0.1")).toBeInTheDocument();
  });

  it("shows Diff as N/A when there is no market line to compare against", () => {
    const card = renderCard(market({ spread: { home: null, away: null } }), projection());
    const diffLabel = within(card).getByText("Diff");
    const diffValue = diffLabel.parentElement?.querySelector("div:nth-child(2)");
    expect(diffValue?.textContent).toBe("N/A");
  });
});

describe("MatchupCard universal OVR (never the legacy guide powerRank/overallPct)", () => {
  it("renders the awayOvr/homeOvr prop, not the guide team's powerRank/overallPct", () => {
    render(
      <MemoryRouter>
        <MatchupCard
          matchup={MATCHUP}
          market={null}
          awayOvr={{ rating: 68.4, rank: 3 }}
          homeOvr={{ rating: 74.5, rank: 2 }}
        />
      </MemoryRouter>
    );
    // MATCHUP fixture teams have powerRank: 5, overallPct: 6.8 -- neither
    // value (nor the old "+6.8%" formatting) should appear anywhere.
    expect(screen.getByText("#3 · 68.4")).toBeInTheDocument();
    expect(screen.getByText("#2 · 74.5")).toBeInTheDocument();
    expect(screen.queryByText("#5")).not.toBeInTheDocument();
    expect(screen.queryByText(/\+6\.8%/)).not.toBeInTheDocument();
  });

  it("renders NR (not a fabricated rank) when a team has no universal rating", () => {
    render(
      <MemoryRouter>
        <MatchupCard matchup={MATCHUP} market={null} />
      </MemoryRouter>
    );
    expect(screen.getAllByText("NR").length).toBe(2);
  });
});

describe("MatchupCard uses the shared formatters", () => {
  it("renders exactly what formatMarketFavoriteSpread returns", () => {
    // The same helper the hero and Model Analysis use, so one line is never
    // stated two different ways across the site.
    for (const home of [-3.5, -6.5, 2, 0, null]) {
      const m = market({ spread: { home, away: home == null ? null : -home } });
      const { unmount } = render(
        <MemoryRouter>
          <MatchupCard matchup={MATCHUP} market={m} />
        </MemoryRouter>
      );
      const card = screen.getByRole("link", { name: /view matchup breakdown/i });
      const marketLabel = within(card).getByText("Market");
      const marketValue = marketLabel.parentElement?.querySelector("div:nth-child(2)");
      expect(marketValue?.textContent).toBe(formatMarketFavoriteSpread(m));
      unmount();
    }
  });

  it("agrees with the hero on the validated NE/SEA orientation", () => {
    // Relationship, not a hard-coded live price: whichever side the source
    // favours is the side the card names.
    const m = market();
    const favouredIsHome = (m.spread.home ?? 0) < 0;
    const card = renderCard(m);
    const expected = favouredIsHome ? "SEA" : "NE";
    expect(within(card).getByText(new RegExp(`^${expected} −`))).toBeInTheDocument();
  });
});
