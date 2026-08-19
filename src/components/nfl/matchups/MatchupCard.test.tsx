import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupCard from "@/components/nfl/matchups/MatchupCard";
import { formatMarketFavoriteSpread, type MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * The matchup-list card's spread must come from the published Phase 5 market
 * artifact, not from the schedule's always-null `matchup.spread`.
 *
 * It is the MARKET line. The JKB projected spread never appears here and never
 * substitutes for a missing line, and no other field — moneyline, total, power
 * rating — can manufacture one.
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

function renderCard(m: MarketCurrentGame | null) {
  render(
    <MemoryRouter>
      <MatchupCard matchup={MATCHUP} market={m} />
    </MemoryRouter>
  );
  return screen.getByRole("link", { name: /view matchup breakdown/i });
}

describe("MatchupCard market spread", () => {
  it("shows the published line for a priced game", () => {
    const card = renderCard(market());
    expect(within(card).getByText("SEA −3.5")).toBeInTheDocument();
    expect(within(card).queryByText("N/A")).toBeNull();
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
    expect(within(card).getByText("PK")).toBeInTheDocument();
  });

  it("shows N/A when the source has not priced the game", () => {
    const card = renderCard(market({ spread: { home: null, away: null } }));
    expect(within(card).getByText("N/A")).toBeInTheDocument();
  });

  it("shows N/A when no market record exists at all, and still renders the card", () => {
    const card = renderCard(null);
    expect(within(card).getByText("N/A")).toBeInTheDocument();
    // The card is never hidden just because the game is unpriced.
    expect(within(card).getByText("Seattle Seahawks")).toBeInTheDocument();
  });

  it("keeps the Spread label so an unpriced game still reads as a spread slot", () => {
    const card = renderCard(null);
    expect(within(card).getByText("Spread")).toBeInTheDocument();
  });
});

describe("MatchupCard spread cannot be manufactured", () => {
  it("does not derive a spread from the moneyline", () => {
    const card = renderCard(
      market({ spread: { home: null, away: null }, moneyline: { home: -260, away: 210 } })
    );
    expect(within(card).getByText("N/A")).toBeInTheDocument();
    expect(within(card).queryByText(/−2\.5|−3|SEA −/)).toBeNull();
  });

  it("does not derive a spread from the total", () => {
    const card = renderCard(market({ spread: { home: null, away: null }, total: 51.5 }));
    expect(within(card).getByText("N/A")).toBeInTheDocument();
    expect(within(card).queryByText("51.5")).toBeNull();
  });

  it("does not fall back to the power rating shown on the same card", () => {
    const card = renderCard(market({ spread: { home: null, away: null } }));
    const spreadChip = within(card).getByText("N/A");
    expect(spreadChip.textContent).toBe("N/A");
  });

  it("never labels the market line as the JKB projection", () => {
    const card = renderCard(market());
    const text = card.textContent ?? "";
    for (const banned of [/JKB/i, /projected/i, /model/i, /consensus/i, /closing line/i]) {
      expect(text).not.toMatch(banned);
    }
  });

  it("names no sportsbook", () => {
    const card = renderCard(market());
    const text = card.textContent ?? "";
    for (const book of [/draftkings/i, /fanduel/i, /caesars/i, /bet365/i, /pinnacle/i]) {
      expect(text).not.toMatch(book);
    }
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

describe("MatchupCard uses the shared formatter", () => {
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
      expect(within(card).getByText(formatMarketFavoriteSpread(m))).toBeInTheDocument();
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
