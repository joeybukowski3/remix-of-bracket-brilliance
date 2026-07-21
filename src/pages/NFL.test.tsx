import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import NFL from "@/pages/NFL";
import { NFL_POWER_RATINGS } from "@/data/nflPreseason2026";
import { NFL_2025_TREND_DATASET, type NflTrendRecord } from "@/lib/nfl/teamTrends";
import { sortTrendRowsForNflPage, type NflTrendSortKey } from "@/lib/nfl/teamTrendPresentation";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

function renderNflPage() {
  return render(
    <MemoryRouter>
      <NFL />
    </MemoryRouter>
  );
}

function switchToTrendView() {
  fireEvent.click(screen.getByRole("tab", { name: "2025 Late-Season Trend" }));
}

function trendRowByTeam(teamName: string): HTMLElement {
  const link = screen.getByRole("link", { name: `Open ${teamName} team dashboard` });
  const row = link.closest("tr");
  if (!row) throw new Error(`Missing trend row for ${teamName}`);
  return row;
}

function sortAbbrs(sortKey: NflTrendSortKey, records: readonly NflTrendRecord[] = NFL_2025_TREND_DATASET.records): string[] {
  return sortTrendRowsForNflPage(records, sortKey).map((record) => record.abbr);
}

describe("NFL power ratings page", () => {
  it("keeps the 2026 preseason ratings as the default view", () => {
    renderNflPage();

    expect(screen.getByRole("heading", { name: "2026 Preseason Power Rankings" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "2026 Preseason" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "2025 Late-Season Trend" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.queryByRole("table", { name: /2025 full-season versus final-eight/i })).toBeNull();
  });

  it("preserves representative legacy preseason values unchanged", () => {
    renderNflPage();

    const seattle = screen.getByRole("link", { name: "Open Seattle Seahawks team dashboard" }).closest("tr")!;
    expect(within(seattle).getByText("1")).toBeTruthy();
    expect(within(seattle).getByText("+7.7%")).toBeTruthy();
    expect(within(seattle).getByText("14-3")).toBeTruthy();
    expect(within(seattle).getByText("11.5")).toBeTruthy();
    expect(NFL_POWER_RATINGS.find((team) => team.abbr === "sea")).toMatchObject({
      rank: 1,
      ovrPct: 7.69,
      winTotal: 11.5,
    });
  });

  it("switches to the 2025 late-season trend view", () => {
    renderNflPage();
    switchToTrendView();

    expect(screen.getByRole("heading", { name: "2025 Late-Season Trend" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "2025 Late-Season Trend" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("table", { name: /2025 full-season versus final-eight/i })).toBeTruthy();
  });

  it("renders exactly 32 trend teams in final-eight rank order by default", () => {
    renderNflPage();
    switchToTrendView();

    const rows = screen.getAllByTestId("nfl-trend-row");
    expect(rows).toHaveLength(32);
    expect(within(rows[0]).getByRole("link", { name: "Open Jacksonville Jaguars team dashboard" })).toBeTruthy();
    expect(within(rows[1]).getByRole("link", { name: "Open Seattle Seahawks team dashboard" })).toBeTruthy();
    expect(within(rows[2]).getByRole("link", { name: "Open LA Rams team dashboard" })).toBeTruthy();
  });

  it("shows representative late-season classifications and movement", () => {
    renderNflPage();
    switchToTrendView();

    const jacksonville = trendRowByTeam("Jacksonville Jaguars");
    expect(within(jacksonville).getByText("Strong late-season improvement")).toBeTruthy();
    expect(jacksonville.textContent).toContain("↑ 3");
    expect(jacksonville.textContent).toContain("+19.4");

    const cincinnati = trendRowByTeam("Cincinnati Bengals");
    expect(within(cincinnati).getByText("Strong late-season improvement")).toBeTruthy();
    expect(cincinnati.textContent).toContain("↑ 8");

    const seattle = trendRowByTeam("Seattle Seahawks");
    expect(within(seattle).getByText("Stable late-season profile")).toBeTruthy();
    expect(seattle.textContent).toContain("→ 0");

    const kansasCity = trendRowByTeam("Kansas City Chiefs");
    expect(within(kansasCity).getByText("Strong late-season decline")).toBeTruthy();
    expect(kansasCity.textContent).toContain("↓ 13");
    expect(kansasCity.textContent).toContain("-20.1");
  });

  it("sorts trend rows deterministically without mutating source data", () => {
    const before = JSON.stringify(NFL_2025_TREND_DATASET.records);

    expect(sortAbbrs("ratingChange").slice(0, 4)).toEqual(["jax", "cin", "min", "no"]);
    expect(sortAbbrs("rankChange").slice(0, 3)).toEqual(["min", "chi", "cin"]);
    expect(sortAbbrs("offenseChange")[0]).toBe("ten");
    expect(sortAbbrs("defenseChange")[0]).toBe("min");
    expect(sortAbbrs("ratingChange")).toEqual(sortAbbrs("ratingChange"));
    expect(JSON.stringify(NFL_2025_TREND_DATASET.records)).toBe(before);
  });

  it("sort controls update the rendered trend order", () => {
    renderNflPage();
    switchToTrendView();

    fireEvent.click(screen.getByRole("button", { name: "Rating change" }));
    expect(within(screen.getAllByTestId("nfl-trend-row")[0]).getByRole("link", { name: "Open Jacksonville Jaguars team dashboard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rank change" }));
    expect(within(screen.getAllByTestId("nfl-trend-row")[0]).getByRole("link", { name: "Open Minnesota Vikings team dashboard" })).toBeTruthy();
  });

  it("sorts null values last", () => {
    const records = structuredClone(NFL_2025_TREND_DATASET.records);
    records[0].deltas.rating = null;
    records[0].finalEight.rank = null;

    expect(sortTrendRowsForNflPage(records, "ratingChange").at(-1)?.teamId).toBe(records[0].teamId);
    expect(sortTrendRowsForNflPage(records, "finalRank").at(-1)?.teamId).toBe(records[0].teamId);
  });

  it("shows source metadata, Stage-1 status, and non-projection methodology", () => {
    renderNflPage();
    switchToTrendView();

    expect(screen.getByText("Source season 2025")).toBeTruthy();
    expect(screen.getByText("nfl-power-v0.3.0")).toBeTruthy();
    expect(screen.getByText(/Generated 2026-07-14T12:51:57.553Z/)).toBeTruthy();
    expect(screen.getByText("Validation Stage-1")).toBeTruthy();
    expect(screen.getAllByText(/not a 2026 win projection/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026 projected improvement score/i)).toBeNull();
  });

  it("links trend teams to existing team pages", () => {
    renderNflPage();
    switchToTrendView();

    expect(screen.getByRole("link", { name: "Open Jacksonville Jaguars team dashboard" }).getAttribute("href")).toBe(
      "/nfl/guide/team/jacksonville-jaguars"
    );
  });

  it("uses responsive trend markup without requiring a horizontally scrolling trend table", () => {
    const { container } = renderNflPage();
    switchToTrendView();

    expect(container.querySelector(".nfl-trend-table-wrap")).toBeTruthy();
    expect(container.querySelector(".nfl-pr-scroll .nfl-trend-table")).toBeNull();
    expect(container.textContent).not.toMatch(/Improvement\/Decline/i);
  });
});
