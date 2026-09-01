/**
 * MlbStrikeoutProps.phase9c.test.tsx
 *
 * Phase 9C — inline prop-board table migration onto the shared
 * `DenseTableScroller` + `stickyDenseHeader` / `frozenDenseColumn` helpers.
 * Asserts the desktop strikeout board now scrolls inside an accessible,
 * keyboard-reachable region, that its sticky header and frozen identity
 * columns keep the documented `TABLE_LAYER` z-index ladder, and that the
 * column set / row order / labels are unchanged. Mirrors the mocking pattern
 * in MlbStrikeoutProps.sorting.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/components/mlb/MlbTeamLogo", () => ({ default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span> }));
vi.mock("@/hooks/useMlbStrikeoutPropDetails", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMlbStrikeoutPropDetails")>("@/hooks/useMlbStrikeoutPropDetails");
  return {
    ...actual,
    useMlbStrikeoutPropDetails: () => ({ loading: false, fileUnavailable: false, detailsByKey: new Map(), detailsDate: "2026-07-09" }),
  };
});

const baseRow: PitcherStrikeoutTeamRow = {
  rank: 1, gameKey: "BAL@CHC", pitcher: "Dean Kremer", team: "BAL", opponent: "CHC",
  park: "Wrigley Field", parkFactor: 1.0, pitcherKRate: 22, pitcherWhiffRate: 28, pitcherKVs: 60,
  opponentTeamKRate: 24, opponentTeamWhiffRate: 30, opponentTeamXba: 0.24, pitcherKSkillScore: 65,
  opponentTeamStrikeoutScore: 58, strikeoutMatchupScore: 70, whyItRanksWell: "Strong K matchup",
  projectedIP: 5.5, projectedK9: 8.2, projectedKs: 5.0, kLine: 6.5, kOddsOver: "-110", kOddsUnder: "-110",
};
const secondRow: PitcherStrikeoutTeamRow = {
  ...baseRow, rank: 2, pitcher: "Zac Gallen", team: "AZ", opponent: "SD", gameKey: "AZ@SD", strikeoutMatchupScore: 55,
};

const dashboardFixture = { date: "2026-07-09", generatedAt: "2026-07-09T12:00:00.000Z", games: [], pitchers: [], batters: [] };

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture, games: [], loading: false, strikeoutDetailRows: rows,
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
  }));
}

async function renderPage() {
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter>
      <MlbStrikeoutProps />
    </MemoryRouter>,
  );
}

const SLOW = 15000;

describe("Phase 9C — strikeout prop board shared scroller", () => {
  it("wraps the desktop board in an accessible, keyboard-reachable scroll region", async () => {
    vi.resetModules();
    mockPropsData([baseRow, secondRow]);
    await renderPage();

    const region = await screen.findByRole("region", { name: "Strikeout prop board" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-x-auto");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  }, SLOW);

  it("keeps the sticky header and frozen identity columns on the shared TABLE_LAYER ladder", async () => {
    vi.resetModules();
    mockPropsData([baseRow, secondRow]);
    await renderPage();

    const region = await screen.findByRole("region", { name: "Strikeout prop board" });
    const table = within(region).getByRole("table");

    const thead = table.querySelector("thead");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("top-0");
    expect(thead?.className).toContain("z-20");

    const headerCells = Array.from(table.querySelectorAll("thead th"));
    const rankHeader = headerCells.find((th) => th.className.includes("left-0"));
    const pitcherHeader = headerCells.find((th) => th.className.includes("left-8"));
    expect(rankHeader?.className).toContain("z-30");
    expect(pitcherHeader?.className).toContain("z-30");

    const firstBodyRow = table.querySelector("tbody tr");
    const bodyCells = Array.from(firstBodyRow?.querySelectorAll("td") ?? []);
    expect(bodyCells[0]?.className).toContain("left-0");
    expect(bodyCells[0]?.className).toContain("z-10");
    expect(bodyCells[1]?.className).toContain("left-8");
    expect(bodyCells[1]?.className).toContain("z-10");
  }, SLOW);

  it("preserves the core column labels and default (rank) row order", async () => {
    vi.resetModules();
    mockPropsData([baseRow, secondRow]);
    await renderPage();

    const region = await screen.findByRole("region", { name: "Strikeout prop board" });
    const headerText = region.querySelector("thead")?.textContent ?? "";
    for (const label of ["K Line", "Proj K", "Edge", "K Score"]) {
      expect(headerText).toContain(label);
    }

    const names = Array.from(region.querySelectorAll("tbody tr"))
      .map((tr) => tr.textContent ?? "")
      .filter((t) => t.includes("Dean Kremer") || t.includes("Zac Gallen"));
    expect(names[0]).toContain("Dean Kremer");
    expect(names[1]).toContain("Zac Gallen");
  }, SLOW);
});
