/**
 * MlbPolymarketMoneylinePanel.test.tsx
 * Mobile accordion behavior: collapsed by default, expands on click,
 * stays fully expanded at md+ (desktop), and #moneylines deep-links
 * force the mobile accordion open so the target is visible.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbPolymarketMoneylinePanel from "./MlbPolymarketMoneylinePanel";

vi.mock("@/hooks/usePolymarketMlbMoneylines", () => ({
  usePolymarketMlbMoneylines: () => ({
    data: {
      updatedAt: new Date().toISOString(),
      matchedCount: 1,
      totalGames: 1,
      stale: false,
      games: [
        {
          gamePk: 716463,
          gameDate: new Date().toISOString(),
          status: "Scheduled",
          venue: "Yankee Stadium",
          matched: true,
          marketUrl: "https://polymarket.com/event/mlb-tb-nyy",
          away: { abbreviation: "TB", name: "Rays", probablePitcher: null, yesPrice: 0.45, noPrice: 0.55 },
          home: { abbreviation: "NYY", name: "Yankees", probablePitcher: null, yesPrice: 0.55, noPrice: 0.45 },
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/usePitcherRegression", () => ({
  usePitcherRegression: () => ({ data: [] }),
}));

function renderAt(hash = "") {
  return render(
    <MemoryRouter initialEntries={[`/mlb${hash}`]}>
      <MlbPolymarketMoneylinePanel />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear();
});

describe("MlbPolymarketMoneylinePanel — mobile accordion", () => {
  it("renders the header (title, subtitle, freshness, matched count) in the collapsed trigger", () => {
    renderAt();
    expect(screen.getAllByText("Polymarket Moneylines")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Live YES / NO prices for today's games")[0]).toBeInTheDocument();
    expect(screen.getAllByText(/1 of 1 games matched/)[0]).toBeInTheDocument();
  });

  it("is collapsed by default on the mobile accordion path", () => {
    renderAt();
    const trigger = screen.getAllByRole("button")[0];
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("expands on click, revealing the game card", () => {
    renderAt();
    const trigger = screen.getAllByRole("button")[0];
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("preserves external link attributes on the Polymarket market link", () => {
    const { container } = renderAt();
    const links = container.querySelectorAll('a[href="https://polymarket.com/event/mlb-tb-nyy"]');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("#moneylines forces the mobile accordion open and scrolls the panel into view", async () => {
    renderAt("#moneylines");
    await waitFor(() => {
      const trigger = screen.getAllByRole("button")[0];
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("does not force-open or scroll for an unrelated hash", () => {
    renderAt("#schedule");
    const trigger = screen.getAllByRole("button")[0];
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
