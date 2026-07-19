/**
 * MlbGameDetail.modelEdgeAccordions.test.tsx
 * Mobile "Today's Top Model Edges" accordion group: 5 preview sections
 * (HR, K, Batter vs Pitcher, ML Edges, Pitcher Regression), collapsed by
 * default, independently expandable, row order matches source data, and
 * desktop keeps its unchanged 2-card grid.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeSchedule } from "./MlbGameDetail";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";

// HomeSchedule is a large, heavy tree (renders the whole /mlb dashboard).
// The default 5s test timeout is comfortably enough in isolation but can
// be tight under full-suite CPU contention -- give every test here more
// headroom rather than tuning each one individually.
vi.setConfig({ testTimeout: 20000 });

vi.mock("@/hooks/useMlbPropsData", () => ({
  useMlbPropsData: () => ({
    dashboard: { generatedAt: "2026-07-19T09:00:00Z" },
    batters: [
      { player: "Hunter Goodman", team: "COL", opposingPitcher: "Eury Pérez", hrScore: 74.9, barrelRate: 12, atBats: 200, hrOddsYes: "+320", hrOddsBook: "DraftKings" },
      { player: "Randal Grichuk", team: "CWS", opposingPitcher: "Trey Gibson", hrScore: 60.1, barrelRate: 10, atBats: 210, hrOddsYes: null, hrOddsBook: null },
    ],
    batterVsPitcherRows: [
      { player: "Mookie Betts", position: "RF", team: "LAD", opposingPitcher: "Zack Wheeler", bestMatchupScore: 88.4 },
      { player: "Freddie Freeman", position: "1B", team: "LAD", opposingPitcher: "Zack Wheeler", bestMatchupScore: 55.2 },
    ],
    strikeoutRows: [
      { pitcher: "Cristopher Sánchez", team: "PHI", opponent: "PIT", kMatchupScore: 83.8, kLine: 6.5, kOddsOver: "-125", kOddsUnder: "+105", kOddsBook: "FanDuel" },
      { pitcher: "Tarik Skubal", team: "DET", opponent: "NYY", kMatchupScore: 74.3, kLine: 7.5, kOddsOver: null, kOddsUnder: null, kOddsBook: null },
    ],
    strikeoutDetailRows: [],
    pitchers: [],
    games: [],
    pendingGames: [],
    propDate: "2026-07-19",
    nextRunAt: null,
    loading: false,
  }),
}));

vi.mock("@/hooks/usePolymarketMlbMoneylines", () => ({
  usePolymarketMlbMoneylines: () => ({ data: null, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/usePitcherRegression", () => ({
  usePitcherRegression: () => ({ data: [] }),
}));

const REGRESSION_DATA: PitcherRegressionData[] = [
  {
    pitcherId: 1,
    name: "Gerrit Cole",
    team: "NYY",
    era: 3.1,
    xfip: 3.6,
    xera: 3.5,
    siera: null,
    kbb: 22.4,
    strandRate: 78,
    hrfb: 9.2,
    babip: 0.29,
    regressionScore: 6.4,
    regressionTier: "strong_positive",
    summary: "Overperforming — regression likely.",
  },
  {
    pitcherId: 2,
    name: "Shane Bieber",
    team: "CLE",
    era: 2.5,
    xfip: 3.9,
    xera: 3.8,
    siera: null,
    kbb: 18.1,
    strandRate: 85,
    hrfb: 6.5,
    babip: 0.25,
    regressionScore: -5.1,
    regressionTier: "strong_negative",
    summary: "Underperforming — improvement likely.",
  },
];

function renderHomeSchedule() {
  return render(
    <MemoryRouter initialEntries={["/mlb"]}>
      <HomeSchedule
        games={[]}
        detailPreviews={{}}
        onOpenGame={() => {}}
        pitcherRegressionData={REGRESSION_DATA}
        regressionLoading={false}
        mlbOdds={null}
      />
    </MemoryRouter>,
  );
}

const ACCORDION_TITLES = ["Top HR Props", "Top K Props", "Batter vs Pitcher", "Top ML Edges", "Pitcher Regression Analysis"];

afterEach(() => {
  cleanup();
});

// The mobile "Today's Top Model Edges" preview cards intentionally reuse
// the same underlying batter/pitcher data that also appears elsewhere on
// the page (the Social Media Tables HR tab, the always-visible full
// Pitcher Regression table below) -- that's correct, pre-existing reuse,
// not a bug. Row-order assertions must be scoped to this one accordion's
// own content panel (via its aria-controls target) rather than matching
// player names anywhere on the page.
function getPanelFor(title: string) {
  const trigger = screen.getAllByRole("button", { name: new RegExp(title) })[0];
  const panelId = trigger.getAttribute("aria-controls");
  if (!panelId) throw new Error(`No aria-controls found on trigger for "${title}"`);
  const panel = document.getElementById(panelId);
  if (!panel) throw new Error(`No panel element found for id "${panelId}"`);
  return within(panel);
}

describe("Today's Top Model Edges — mobile accordion group", () => {
  it("renders all 5 preview sections, collapsed by default", () => {
    renderHomeSchedule();
    for (const title of ACCORDION_TITLES) {
      const trigger = screen.getAllByRole("button", { name: new RegExp(title) })[0];
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("expands a section independently and keeps others closed", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderHomeSchedule();
    const hrTrigger = screen.getAllByRole("button", { name: /Top HR Props/ })[0];
    fireEvent.click(hrTrigger);
    expect(hrTrigger).toHaveAttribute("aria-expanded", "true");
    const kTrigger = screen.getAllByRole("button", { name: /Top K Props/ })[0];
    expect(kTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("allows multiple sections to stay open simultaneously", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderHomeSchedule();
    const hrTrigger = screen.getAllByRole("button", { name: /Top HR Props/ })[0];
    const kTrigger = screen.getAllByRole("button", { name: /Top K Props/ })[0];
    fireEvent.click(hrTrigger);
    fireEvent.click(kTrigger);
    expect(hrTrigger).toHaveAttribute("aria-expanded", "true");
    expect(kTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("HR preview rows render in the same order as the source data", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderHomeSchedule();
    fireEvent.click(screen.getAllByRole("button", { name: /Top HR Props/ })[0]);
    const panel = getPanelFor("Top HR Props");
    const names = panel.getAllByText(/Hunter Goodman|Randal Grichuk/).map((el) => el.textContent);
    expect(names).toEqual(["Hunter Goodman", "Randal Grichuk"]);
  });

  it("Batter vs Pitcher preview rows are sorted by bestMatchupScore descending", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderHomeSchedule();
    fireEvent.click(screen.getAllByRole("button", { name: /Batter vs Pitcher/ })[0]);
    const panel = getPanelFor("Batter vs Pitcher");
    const names = panel.getAllByText(/Mookie Betts|Freddie Freeman/).map((el) => el.textContent);
    expect(names).toEqual(["Mookie Betts", "Freddie Freeman"]);
  });

  it("Pitcher Regression preview rows match the full table's |score| descending sort", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderHomeSchedule();
    fireEvent.click(screen.getAllByRole("button", { name: /Pitcher Regression Analysis/ })[0]);
    const panel = getPanelFor("Pitcher Regression Analysis");
    const names = panel.getAllByText(/Gerrit Cole|Shane Bieber/).map((el) => el.textContent);
    expect(names).toEqual(["Gerrit Cole", "Shane Bieber"]);
  });

  it("shows a clean fallback when there are no ML edges yet", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderHomeSchedule();
    fireEvent.click(screen.getAllByRole("button", { name: /Top ML Edges/ })[0]);
    expect(screen.getByText(/No model edges available yet/)).toBeInTheDocument();
  });

  it("each section's View Full Model link resolves to the correct destination", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderHomeSchedule();
    for (const title of ACCORDION_TITLES) {
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(title) })[0]);
    }
    expect(screen.getAllByRole("link", { name: /View Full Model/ }).find((l) => l.getAttribute("href") === "/mlb/hr-props")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /View Full Model/ }).find((l) => l.getAttribute("href") === "/mlb/strikeout-props")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /View Full Model/ }).find((l) => l.getAttribute("href") === "/mlb/batter-vs-pitcher")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /View Full Model/ }).find((l) => l.getAttribute("href") === "#moneylines")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /View Full Model/ }).find((l) => l.getAttribute("href") === "#pitcher-regression")).toBeTruthy();
  });

  it("mobile accordion group and desktop 2-card grid both render with the correct responsive classes", () => {
    const { container } = renderHomeSchedule();
    const mobileGroup = container.querySelector('[id="props"] > div.md\\:hidden');
    const desktopGrid = container.querySelector('[id="props"] > div.hidden.md\\:grid');
    expect(mobileGroup).toBeTruthy();
    expect(desktopGrid).toBeTruthy();
  });

  it("gives each of the 5 accordion icons a distinct, restrained category tint", () => {
    renderHomeSchedule();
    const expectedTints: Record<string, string> = {
      "Top HR Props": "bg-amber-100",
      "Top K Props": "bg-emerald-100",
      "Batter vs Pitcher": "bg-purple-100",
      "Top ML Edges": "bg-blue-100",
      "Pitcher Regression Analysis": "bg-indigo-100",
    };
    for (const [title, tintClass] of Object.entries(expectedTints)) {
      const trigger = screen.getAllByRole("button", { name: new RegExp(title) })[0];
      const icon = trigger.querySelector("svg")?.parentElement;
      expect(icon?.className, `${title} icon tint`).toMatch(new RegExp(tintClass));
      expect(icon?.className, `${title} icon no longer neutral`).not.toMatch(/bg-slate-100/);
    }
  });
});
