import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NflMarketValueSection from "@/components/nfl/team-dashboard/NflMarketValueSection";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";

/**
 * The Super Bowl "Market rank gap" on the team dashboard compares the market rank with the canonical
 * Current OVR rank. It previously used the guide's frozen 2025-preseason powerRank, which disagreed with
 * the Super Bowl Odds page (canonical rank) for the same team.
 */
const GUIDE = getNflSeasonGuide(2026)!;
const sea = GUIDE.teamBySlug.get("seattle-seahawks")!;

function mockMarket(marketRank: number) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ updatedAt: "2026-09-24T00:00:00Z", teams: [{ team: "Seattle Seahawks", abbr: "sea", marketId: "m", marketSlug: "s", price: 0.1, probability: 10, marketRank }] }),
  })));
}

afterEach(() => vi.unstubAllGlobals());

describe("NflMarketValueSection rank gap", () => {
  it("uses the canonical Current OVR rank, not the stale guide powerRank", async () => {
    mockMarket(9);
    expect(sea.powerRank).not.toBe(2); // the fixture only proves anything if the guide rank differs from the live rank
    render(<NflMarketValueSection team={sea} currentPowerRank={2} />);
    await waitFor(() => expect(screen.getByText("10.0%")).toBeTruthy());
    expect(screen.getByText("+7 spots")).toBeTruthy(); // 9 - 2, not 9 - guide rank
  });

  it("shows no gap (never a stale one) when the canonical rank is unavailable", async () => {
    mockMarket(9);
    render(<NflMarketValueSection team={sea} currentPowerRank={null} />);
    await waitFor(() => expect(screen.getByText("10.0%")).toBeTruthy());
    expect(screen.queryByText(/spots/)).toBeNull();
  });
});
