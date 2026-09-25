import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MatchupBookSays from "./MatchupBookSays";
import type { NflMatchup } from "@/lib/nfl/matchups";

vi.mock("@/components/nfl/matchups/MatchupMarketProfile", () => ({ default: () => <div>Existing Market Profile</div> }));
vi.mock("@/components/nfl/matchups/MatchupMarketContext", () => ({ default: () => <div>Existing Betting Market Context</div> }));
vi.mock("@/components/nfl/matchups/MatchupBettingSplits", () => ({ default: () => <div>Matchup split markets</div> }));

describe("What the Book Says tabs", () => {
  it("keeps both existing market views and opens Betting Splits for the matchup", () => {
    render(<MatchupBookSays matchup={{ gameId: "2026_03_BUF_MIA" } as NflMatchup} projection={null} />);
    expect(screen.getByRole("tab", { name: "Market Profile" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Existing Market Profile")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Betting Market Context" }));
    expect(screen.getByText("Existing Betting Market Context")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Betting Splits" }));
    expect(screen.getByText("Matchup split markets")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Betting Splits" }).getAttribute("aria-controls")).toBe("splits-panel");
  });
});
