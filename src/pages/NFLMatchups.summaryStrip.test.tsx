import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

/** Reads a committed public/data fixture inside a hoisted vi.mock factory. */
function fixture(path: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf-8"));
}

vi.mock("@/hooks/useNflSeasonData", () => {
  const teams = fixture("public/data/nfl/teams.json").teams;
  const gamesFile = fixture("public/data/nfl/2026/games.json");
  return {
    useNflSeasonData: () => ({
      loading: false,
      error: null,
      data: { teams, games: gamesFile.games, results: [], gamesMeta: gamesFile._meta ?? null, resultsMeta: null },
    }),
  };
});
vi.mock("@/hooks/useNflMatchupMarket", () => ({
  useNflMatchupMarket: () => ({ loading: false, error: null, artifact: fixture("public/data/nfl/matchup-market.json") }),
}));
vi.mock("@/hooks/useNflMatchupProjections", () => ({
  useNflMatchupProjections: () => ({
    loading: false,
    error: null,
    artifact: fixture("public/data/nfl/matchup-projections.json"),
  }),
}));
vi.mock("@/hooks/useNflMatchupTotals", () => ({
  useNflMatchupTotals: () => ({ loading: false, error: null, artifact: fixture("public/data/nfl/team-totals.json") }),
}));
vi.mock("@/hooks/useNflCurrentRating2026", () => ({
  useNflCurrentRating2026: () => ({ loading: false, error: null, data: null }),
}));
vi.mock("@/hooks/useNflMatchupEpa", () => ({ useNflMatchupEpa: () => ({ artifact: null }) }));
vi.mock("@/hooks/useNflMatchupMetrics", () => ({ useNflMatchupMetrics: () => ({ artifact: null }) }));
vi.mock("@/hooks/useNflSuccessRates", () => ({ useNflSuccessRates: () => ({ artifact: null }) }));
vi.mock("@/hooks/useNflTrenchMetrics", () => ({ useNflTrenchMetrics: () => ({ artifact: null }) }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import NFLMatchups from "@/pages/NFLMatchups";
import { formatMarketFavoriteSpread } from "@/lib/nfl/marketData";

const market = fixture("public/data/nfl/matchup-market.json");
const projections = fixture("public/data/nfl/matchup-projections.json");
const OPENER_SLUG = "new-england-patriots-at-seattle-seahawks";

function stripValues(slug: string) {
  const link = document.querySelector(`a[href="/nfl/matchups/${slug}"]`);
  const strip = link?.closest("[data-matrix-game]")?.querySelector("[data-matchup-summary-strip]");
  const read = (key: string) => strip?.querySelector(`[data-summary-field="${key}"] dd`)?.textContent;
  return {
    vegasLine: read("vegas-line"),
    jkbLine: read("jkb-line"),
    vegasTotal: read("vegas-total"),
    jkbTotal: read("jkb-total"),
  };
}

function vegasLines() {
  return Array.from(document.querySelectorAll("[data-summary-field='vegas-line'] dd")).map((n) => n.textContent);
}

describe("NFLMatchups summary strip wiring", () => {
  it("renders one strip per game using that game's own canonical artifact rows", () => {
    render(
      <MemoryRouter initialEntries={["/nfl/matchups?week=1"]}>
        <NFLMatchups />
      </MemoryRouter>
    );
    expect(document.querySelectorAll("[data-matchup-summary-strip]")).toHaveLength(16);

    const id = "2026_01_NE_SEA";
    const values = stripValues(OPENER_SLUG);
    expect(values.vegasLine).toBe(formatMarketFavoriteSpread(market.currentMarket[id]));
    expect(values.jkbLine).toBe(projections.projections[id].formattedJkbSpread);
    expect(values.vegasTotal).toBe(String(market.currentMarket[id].total));
  });

  it("re-resolves values for the newly selected week", () => {
    const first = render(
      <MemoryRouter initialEntries={["/nfl/matchups?week=1"]}>
        <NFLMatchups />
      </MemoryRouter>
    );
    const week1 = vegasLines();
    first.unmount();
    render(
      <MemoryRouter initialEntries={["/nfl/matchups?week=2"]}>
        <NFLMatchups />
      </MemoryRouter>
    );
    const week2 = vegasLines();
    expect(week2.length).toBeGreaterThan(0);
    expect(week2).not.toEqual(week1);
  });
});
