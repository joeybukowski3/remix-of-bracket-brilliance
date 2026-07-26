/**
 * Focused tests for expanded Batter vs Pitcher season + matchup stats panel.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BvpExpandedSeasonMatchupStats } from "@/pages/MlbBatterVsPitcher";
import type { PitcherVsBatterRow } from "@/pages/MlbHrProps";
import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";

function baseRow(overrides: Partial<PitcherVsBatterRow> = {}): PitcherVsBatterRow {
  return {
    rank: 1,
    gameKey: "NYY@BOS",
    gameId: 1,
    player: "Aaron Judge",
    playerId: 592450,
    team: "NYY",
    opposingPitcher: "Cristopher Sánchez",
    opposingPitcherId: 650911,
    park: "Fenway",
    parkFactor: 1.05,
    hrScore: 70,
    opposingPitcherHrVs: 55,
    opposingPitcherHitsVs: 60,
    opposingPitcherKVs: 50,
    hrTargetScore: 65,
    bestMatchupScore: 68,
    strikeoutMatchupScore: 50,
    batterPowerScore: 72,
    pitcherVulnerabilityScore: 58,
    contextScore: 50,
    barrelRate: 18,
    hardHitRate: 52,
    xba: 0.32,
    kRate: 22,
    whiffRate: 28,
    atBats: 120,
    bbRate: 12,
    iso: 0.28,
    exitVelo: 94,
    last7HR: 2,
    last30HR: 8,
    pitcherBarrelRate: null,
    pitcherHardHitRate: null,
    pitcherKRate: null,
    pitcherFlyBallRate: null,
    windBlowingOut: false,
    angleTags: [],
    ...overrides,
  };
}

function bvpEntry(overrides: Partial<BvpHistoryEntry> = {}): BvpHistoryEntry {
  return {
    key: "592450|650911",
    batterId: 592450,
    pitcherId: 650911,
    batter: "Aaron Judge",
    pitcher: "Cristopher Sánchez",
    status: "available",
    career: { pa: 12, h: 4, avg: 0.333, hr: 2 },
    last5y: { pa: 12, h: 4, avg: 0.333, hr: 2 },
    ...overrides,
  };
}

describe("BvpExpandedSeasonMatchupStats", () => {
  it("always renders the season row when season data exists", () => {
    render(
      <BvpExpandedSeasonMatchupStats row={baseRow()} bvpEntry={undefined} bvpLoading={false} />,
    );
    expect(screen.getByTestId("bvp-season-stats-row")).toBeInTheDocument();
    expect(screen.getAllByText("2026 Season").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("xBA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HH%").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the BvP pitcher row when ABs/PA exist", () => {
    render(
      <BvpExpandedSeasonMatchupStats row={baseRow()} bvpEntry={bvpEntry()} bvpLoading={false} />,
    );
    expect(screen.getByTestId("bvp-pitcher-stats-row")).toBeInTheDocument();
    expect(screen.getAllByText(/vs Cristopher Sánchez/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("PA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HR").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a single No ABs note and no empty BvP row when status is no_matchups", () => {
    render(
      <BvpExpandedSeasonMatchupStats
        row={baseRow()}
        bvpEntry={bvpEntry({ status: "no_matchups", career: null, last5y: null })}
        bvpLoading={false}
      />,
    );
    expect(screen.getByTestId("bvp-no-abs-note")).toHaveTextContent("No ABs vs this pitcher.");
    expect(screen.queryByTestId("bvp-pitcher-stats-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bvp-pitcher-stats-card")).not.toBeInTheDocument();
    // Season row still present
    expect(screen.getByTestId("bvp-season-stats-row")).toBeInTheDocument();
  });

  it("does not fabricate unsupported BvP metrics (no OBP/SLG/OPS/K%/BB%)", () => {
    render(
      <BvpExpandedSeasonMatchupStats row={baseRow()} bvpEntry={bvpEntry()} bvpLoading={false} />,
    );
    const pitcherRow = screen.getByTestId("bvp-pitcher-stats-row");
    expect(pitcherRow).not.toHaveTextContent("OBP");
    expect(pitcherRow).not.toHaveTextContent("SLG");
    expect(pitcherRow).not.toHaveTextContent("OPS");
    expect(pitcherRow).not.toHaveTextContent("K%");
    expect(pitcherRow).not.toHaveTextContent("BB%");
  });

  it("hides missing season metrics cleanly", () => {
    render(
      <BvpExpandedSeasonMatchupStats
        row={baseRow({
          xba: null,
          hardHitRate: null,
          barrelRate: null,
          kRate: null,
          bbRate: null,
          iso: null,
          exitVelo: null,
          last7HR: null,
          last30HR: null,
          atBats: null,
        })}
        bvpEntry={bvpEntry()}
        bvpLoading={false}
      />,
    );
    // No season strip when all season metrics missing
    expect(screen.queryByTestId("bvp-season-stats-row")).not.toBeInTheDocument();
    // BvP row still shows
    expect(screen.getByTestId("bvp-pitcher-stats-row")).toBeInTheDocument();
  });

  it("mobile stack container is min-width constrained to avoid page overflow", () => {
    const { container } = render(
      <BvpExpandedSeasonMatchupStats row={baseRow()} bvpEntry={bvpEntry()} bvpLoading={false} />,
    );
    const root = container.querySelector('[data-testid="bvp-expanded-season-matchup-stats"]');
    expect(root?.className).toMatch(/min-w-0|overflow-x-hidden/);
    const mobile = screen.getByTestId("bvp-expanded-stats-mobile");
    expect(mobile.className).toMatch(/min-w-0|grid/);
  });
});
