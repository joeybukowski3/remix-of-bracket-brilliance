import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupHero from "@/components/nfl/matchups/MatchupHero";
import MatchupJumpNav from "@/components/nfl/matchups/MatchupJumpNav";
import MatchupFutureSection from "@/components/nfl/matchups/MatchupFutureSection";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import {
  MATCHUP_SECTION_SCROLL_MT,
  MATCHUP_STICKY_NAV_TOP,
  NFL_MATCHUP_SECTIONS,
} from "@/lib/nfl/matchupSections";
import { formatMarketFavoriteSpread } from "@/lib/nfl/marketData";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Phase 10 presentation guarantees.
 *
 * These lock in UX fixes that are invisible to the data layer but were real
 * defects: a sticky bar hidden behind the site header, a hero contradicting the
 * section below it, and empty rank chips padding out every unavailable row.
 */

const team = (abbr: string, teamName: string, slug: string) => ({
  abbr,
  teamName,
  slug,
  division: "AFC East",
  record2025: "14-3",
  projectedWins: 11,
  conference: "AFC",
});

const MATCHUP = {
  gameId: "2026_01_NE_SEA",
  week: 1,
  season: 2026,
  kickoffUtc: "2026-09-10T00:20:00.000Z",
  stadium: "Lumen Field",
  spread: null,
  away: team("ne", "New England Patriots", "new-england-patriots"),
  home: team("sea", "Seattle Seahawks", "seattle-seahawks"),
} as unknown as NflMatchup;

const market = (homeSpread: number | null, total: number | null): MarketCurrentGame =>
  ({
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    homeAbbr: "sea",
    awayAbbr: "ne",
    neutralSite: false,
    spread: { home: homeSpread, away: homeSpread == null ? null : -homeSpread },
    moneyline: { home: null, away: null },
    total,
    rawSpreadLine: null,
  }) as MarketCurrentGame;

const renderHero = (m: MarketCurrentGame | null) =>
  render(
    <MemoryRouter>
      <MatchupHero matchup={MATCHUP} market={m} />
    </MemoryRouter>
  );

describe("sticky offsets", () => {
  it("keeps the Jump To bar below the site header rather than at the top edge", () => {
    // The site header is also sticky at top-0 and paints above this bar, so
    // top-0 here left the control invisible on every scrolled mobile view.
    expect(MATCHUP_STICKY_NAV_TOP).not.toBe("top-0");
    render(
      <MemoryRouter>
        <MatchupJumpNav />
      </MemoryRouter>
    );
    const nav = screen.getByRole("navigation", { name: /jump to matchup section/i });
    expect(nav.className).toContain(MATCHUP_STICKY_NAV_TOP);
    expect(nav.className).toContain("sticky");
  });

  it("offsets anchored sections by more than the site header at every breakpoint", () => {
    // scroll-mt-32 = 8rem = 128px clears header (73px) + Jump To bar (~42px).
    // lg:scroll-mt-24 = 6rem = 96px clears the header alone, since Jump To
    // becomes static on desktop. The previous lg:scroll-mt-6 was 24px, which
    // parked every desktop heading behind the header.
    expect(MATCHUP_SECTION_SCROLL_MT).toContain("scroll-mt-32");
    expect(MATCHUP_SECTION_SCROLL_MT).toContain("lg:scroll-mt-24");
    expect(MATCHUP_SECTION_SCROLL_MT).not.toContain("lg:scroll-mt-6");
  });

  it("still offers every canonical anchor", () => {
    render(
      <MemoryRouter>
        <MatchupJumpNav />
      </MemoryRouter>
    );
    for (const section of NFL_MATCHUP_SECTIONS) {
      expect(screen.getByRole("link", { name: section.navLabel })).toHaveAttribute(
        "href",
        `#${section.id}`
      );
    }
  });
});

describe("hero market agreement", () => {
  it("shows the published line instead of a blanket N/A", () => {
    renderHero(market(-3.5, 44.5));
    const hero = document.getElementById("overview") as HTMLElement;
    expect(within(hero).getByText("SEA −3.5")).toBeInTheDocument();
    expect(within(hero).getByText("44.5")).toBeInTheDocument();
  });

  it("states the line exactly as the market and model sections state it", () => {
    const m = market(-3.5, 44.5);
    renderHero(m);
    const hero = document.getElementById("overview") as HTMLElement;
    expect(within(hero).getByText(formatMarketFavoriteSpread(m))).toBeInTheDocument();
  });

  it("names the away team when the away side is favoured", () => {
    renderHero(market(2.5, 41));
    const hero = document.getElementById("overview") as HTMLElement;
    expect(within(hero).getByText("NE −2.5")).toBeInTheDocument();
  });

  it("renders a genuine pick'em as PK", () => {
    expect(formatMarketFavoriteSpread(market(0, 44))).toBe("PK");
  });

  it("falls back to N/A only when the game truly has no line", () => {
    renderHero(market(null, null));
    const hero = document.getElementById("overview") as HTMLElement;
    expect(within(hero).getAllByText("N/A").length).toBeGreaterThanOrEqual(2);
  });

  it("leads each rating with its value, not its rank chip", () => {
    renderHero(market(-3.5, 44.5));
    const hero = document.getElementById("overview") as HTMLElement;
    const ovr = within(hero).getAllByText("OVR")[0].closest("div") as HTMLElement;
    const text = (ovr.textContent ?? "").replace(/\s+/g, "");
    // Label, then value, then rank — a rank chip printed above the number made
    // rank read as the headline statistic.
    expect(text.indexOf("OVR")).toBeLessThan(text.indexOf("N/A"));
  });

  it("still shows no projected spread, win probability or pick in the hero", () => {
    renderHero(market(-3.5, 44.5));
    const hero = document.getElementById("overview") as HTMLElement;
    const text = hero.textContent ?? "";
    for (const banned of [/projected spread/i, /win probability/i, /model edge/i, /best bet/i]) {
      expect(text).not.toMatch(banned);
    }
  });
});

describe("rank chips", () => {
  it("renders nothing at all when a metric has no rank", () => {
    const { container } = render(<MatchupRankBadge rank={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the rank and its tier when one exists", () => {
    render(<MatchupRankBadge rank={3} />);
    expect(screen.getByText("#3")).toBeInTheDocument();
    // Tier is announced, never carried by colour alone.
    expect(screen.getByText(/League rank 3 of 32/)).toBeInTheDocument();
  });

  it("marks a context-only rank as descriptive rather than a quality tier", () => {
    render(<MatchupRankBadge rank={22} neutral />);
    expect(screen.getByText(/descriptive only/i)).toBeInTheDocument();
  });
});

describe("Game Trends placeholder", () => {
  const renderTrends = () =>
    render(
      <MemoryRouter>
        <MatchupFutureSection
          id="game-trends"
          message="Additional matchup trends will be added here."
        />
      </MemoryRouter>
    );

  it("keeps the stable anchor and heading the Jump To nav depends on", () => {
    renderTrends();
    const section = document.getElementById("game-trends");
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByRole("heading", { name: /game trends/i })).toBeInTheDocument();
  });

  it("says only that trends are coming, with no data and no scope list", () => {
    renderTrends();
    const section = document.getElementById("game-trends") as HTMLElement;
    expect(within(section).getByText("Additional matchup trends will be added here.")).toBeInTheDocument();
    // No fabricated example data, definitions or marketing treatment.
    const text = section.textContent ?? "";
    for (const banned of [/coming soon/i, /planned for/i, /\bATS\b/, /over\/under/i, /streak/i, /\d/]) {
      expect(text).not.toMatch(banned);
    }
  });

  it("offers no collapse control, which would be noise for a single line", () => {
    renderTrends();
    const section = document.getElementById("game-trends") as HTMLElement;
    expect(within(section).queryByRole("button", { name: /hide|show/i })).toBeNull();
  });

  it("renders no dashed placeholder box or empty card", () => {
    renderTrends();
    const section = document.getElementById("game-trends") as HTMLElement;
    expect(section.querySelector("[class*='border-dashed']")).toBeNull();
  });
});
