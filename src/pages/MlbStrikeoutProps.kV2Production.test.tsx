import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import { buildKPropBestBets } from "@/lib/mlb/kPropBestBets";
import { getProjectionEdgeInfo, sortByAbsoluteProjectionEdge, sortByProjectedKs } from "@/lib/mlb/kPropValueSorting";

/**
 * Website-side consistency for the resolved production projection.
 *
 * The projection is resolved at generation time and serialized as
 * `projectedKs`, so these assert the page publishes THAT value everywhere --
 * Proj K cell, edge, OVER/UNDER direction, both sorting modes, best-bet
 * cards, mobile and desktop -- and never the stored legacy number that sits
 * next to it.
 *
 * Same jsdom caveat as the sibling page tests: desktop table and mobile card
 * list both render (no CSS media queries), so single-match queries can match
 * twice; tests use getAllBy* deliberately.
 */

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
    useMlbStrikeoutPropDetails: () => ({ loading: false, fileUnavailable: false, detailsByKey: new Map(), detailsDate: "2026-07-24" }),
  };
});

const SLATE = "2026-07-24";

const baseRow: PitcherStrikeoutTeamRow = {
  rank: 1,
  gameKey: "BAL@CHC",
  pitcher: "Dean Kremer",
  team: "BAL",
  opponent: "CHC",
  park: "Wrigley Field",
  parkFactor: 1.0,
  pitcherKRate: 22,
  pitcherWhiffRate: 28,
  pitcherKVs: 60,
  opponentTeamKRate: 24,
  opponentTeamWhiffRate: 30,
  opponentTeamXba: 0.24,
  pitcherKSkillScore: 65,
  opponentTeamStrikeoutScore: 58,
  strikeoutMatchupScore: 62,
  whyItRanksWell: "Strong K matchup",
  projectedIP: 5.5,
  projectedK9: 8.2,
  kLine: 5.5,
  kOddsOver: "-110",
  kOddsUnder: "-110",
  kOddsBook: "dk",
  workloadConfidenceGrade: "A",
  workloadConfidenceScore: 0.9,
  workloadFlags: [],
  publicRecommendationEligible: true,
};

/**
 * A row as the generation step writes it: `projectedKs` already resolved to
 * V2, with the untouched legacy number preserved beside it. The two are
 * deliberately on opposite sides of the line so any surface still reading
 * legacy shows the wrong direction, not just a slightly different number.
 */
const v2Row: PitcherStrikeoutTeamRow = {
  ...baseRow,
  projectedKs: 6.4,
  effectiveProjectedKs: 6.4,
  legacyProjectedKs: 5.0,
  v2ProjectedKs: 6.4,
  projectionSource: "v2",
  projectionFallbackReason: null,
  v2Confidence: "high",
  v2ModelVersion: "mlb-k-projection-v2-shadow",
};

/** V2 refused (low confidence); the legacy projection is the published value. */
const fallbackRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 2,
  pitcher: "Framber Valdez",
  team: "HOU",
  opponent: "TEX",
  gameKey: "HOU@TEX",
  kLine: 7.0,
  projectedKs: 4.0,
  effectiveProjectedKs: 4.0,
  legacyProjectedKs: 4.0,
  v2ProjectedKs: 9.1,
  projectionSource: "legacy-fallback",
  projectionFallbackReason: "low-v2-confidence",
  v2Confidence: "low",
  v2ModelVersion: "mlb-k-projection-v2-shadow",
};

/** V2 promoted, and the resolved number is the largest projection on the board. */
const highKsRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 3,
  pitcher: "Zac Gallen",
  team: "AZ",
  opponent: "SD",
  gameKey: "AZ@SD",
  kLine: 8.8,
  projectedKs: 9.0,
  effectiveProjectedKs: 9.0,
  legacyProjectedKs: 3.0,
  v2ProjectedKs: 9.0,
  projectionSource: "v2",
  projectionFallbackReason: null,
  v2Confidence: "medium",
  v2ModelVersion: "mlb-k-projection-v2-shadow",
};

const dashboardFixture = { date: SLATE, generatedAt: `${SLATE}T12:00:00.000Z`, games: [], pitchers: [], batters: [] };

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [],
      loading: false,
      strikeoutDetailRows: rows,
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
  }));
}

async function renderPage(rows: PitcherStrikeoutTeamRow[]) {
  mockPropsData(rows);
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter>
      <MlbStrikeoutProps />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
});

describe("Proj K, edge and direction use the resolved projection", () => {
  it("renders the resolved projection in the Proj K cell, not the legacy number", async () => {
    await renderPage([v2Row]);
    expect(screen.getAllByText("6.4").length).toBeGreaterThan(0);
    expect(screen.queryByText("5.0")).toBeNull();
  });

  it("derives edge and OVER/UNDER direction from the resolved projection", async () => {
    await renderPage([v2Row]);
    // legacy 5.0 vs a 5.5 line would read "-0.5 UNDER"
    expect(screen.getAllByText("+0.9 OVER").length).toBeGreaterThan(0);
    expect(screen.queryByText("-0.5 UNDER")).toBeNull();
  });

  it("keeps the public column named Proj K", async () => {
    await renderPage([v2Row]);
    expect(screen.getAllByRole("button", { name: /Proj K/ }).length).toBeGreaterThan(0);
  });

  it("shows the legacy projection when V2 was refused", async () => {
    await renderPage([fallbackRow]);
    expect(screen.getAllByText("4.0").length).toBeGreaterThan(0);
    // the unused V2 number never reaches a public cell
    expect(screen.queryByText("9.1")).toBeNull();
    expect(screen.getAllByText("-3.0 UNDER").length).toBeGreaterThan(0);
  });

  it("renders without crashing when V2 is missing entirely", async () => {
    const noV2: PitcherStrikeoutTeamRow = {
      ...baseRow,
      projectedKs: 5.0,
      effectiveProjectedKs: 5.0,
      legacyProjectedKs: 5.0,
      v2ProjectedKs: null,
      projectionSource: "legacy-fallback",
      projectionFallbackReason: "missing-v2-artifact",
      v2Confidence: null,
    };
    await renderPage([noV2]);
    expect(screen.getAllByText("5.0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-0.5 UNDER").length).toBeGreaterThan(0);
  });

  it("renders mobile and desktop rows from the same resolved value", async () => {
    const { container } = await renderPage([v2Row]);
    // jsdom renders both layouts; every rendered edge label must agree.
    const edges = within(container).getAllByText(/^[+-]\d+\.\d (OVER|UNDER)$/);
    const labels = new Set(edges.map((node) => node.textContent?.trim()));
    expect(labels).toEqual(new Set(["+0.9 OVER"]));
  });
});

describe("sorting uses the resolved projection", () => {
  const rows = [fallbackRow, v2Row, highKsRow];

  it("orders Most Strikeouts by the resolved value", () => {
    expect(sortByProjectedKs(rows).map((row) => row.pitcher)).toEqual([
      "Zac Gallen", // 9.0
      "Dean Kremer", // 6.4 resolved (legacy 5.0)
      "Framber Valdez", // 4.0
    ]);
  });

  it("orders Best Value by the resolved absolute edge", () => {
    expect(sortByAbsoluteProjectionEdge(rows).map((row) => row.pitcher)).toEqual([
      "Framber Valdez", // |4.0 - 7.0| = 3.0
      "Dean Kremer", // |6.4 - 5.5| = 0.9
      "Zac Gallen", // |9.0 - 8.8| = 0.2
    ]);
  });

  it("would order differently if either sort still read the legacy number", () => {
    const asLegacy = rows.map((row) => ({ ...row, projectedKs: row.legacyProjectedKs ?? null }));
    expect(sortByProjectedKs(asLegacy).map((row) => row.pitcher)).not.toEqual(
      sortByProjectedKs(rows).map((row) => row.pitcher),
    );
  });
});

describe("best-bet cards agree with the table", () => {
  it("builds cards from the resolved projection and edge", () => {
    const { overs, unders } = buildKPropBestBets([v2Row, fallbackRow, highKsRow], 3);
    const kremer = overs.find((bet) => bet.pitcher === "Dean Kremer");
    expect(kremer?.projectedKs).toBe(6.4);
    expect(kremer?.projectionEdge).toBeCloseTo(0.9, 5);
    const valdez = unders.find((bet) => bet.pitcher === "Framber Valdez");
    expect(valdez?.projectedKs).toBe(4.0);
    expect(valdez?.projectionEdge).toBeCloseTo(-3.0, 5);
  });

  it("never derives a card projection from IP x K/9 when projectedKs is absent", () => {
    // 5.5 IP x 8.2 K/9 / 9 = 5.0, which is what the old fallback produced --
    // a number the Proj K cell would never show for this row.
    const withoutProjection = { ...v2Row, projectedKs: null, effectiveProjectedKs: null };
    const { overs, unders } = buildKPropBestBets([withoutProjection], 3);
    expect(overs).toHaveLength(0);
    expect(unders).toHaveLength(0);
  });

  it("matches getProjectionEdgeInfo for every card it emits", () => {
    const rows = [v2Row, fallbackRow, highKsRow];
    const { overs, unders } = buildKPropBestBets(rows, 3);
    for (const bet of [...overs, ...unders]) {
      const row = rows.find((candidate) => candidate.pitcher === bet.pitcher);
      const info = getProjectionEdgeInfo(row!);
      expect(bet.projectedKs).toBe(info.projectedKs);
      expect(bet.line).toBe(info.kLine);
      expect(bet.projectionEdge).toBeCloseTo(info.projectionEdge!, 5);
      expect(bet.side).toBe(info.direction);
    }
  });
});
