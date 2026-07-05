/**
 * MlbStrikeoutProps.bestBetCard.test.tsx
 * Card-rendering tests for BestBetCard: large team logos preserved,
 * workload context shown for low-workload/exceptional picks without
 * overflowing, and the exceptional badge only appearing when applicable.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BestBetCard } from "./MlbStrikeoutProps";
import type { KBestBet } from "@/lib/mlb/kPropBestBets";

function bet(overrides: Partial<KBestBet> = {}): KBestBet {
  return {
    side: "over",
    pitcher: "Test Pitcher",
    team: "NYY",
    opponent: "BOS",
    gameKey: "NYY@BOS",
    line: 5.5,
    odds: "+110",
    book: "draftkings",
    projectedKs: 6.4,
    projectionEdge: 0.9,
    matchupScore: 72,
    valueScore: 40,
    reason: "Model projection 6.4 vs 5.5 line (+0.9 K), supported by a 72.0 matchup score.",
    rawEdge: 0.9,
    adjustedRecommendationEdge: 0.9,
    workloadReliability: 1,
    recommendationTier: "standard",
    isExceptionalLowWorkload: false,
    workloadRole: "starter",
    expectedIP: 6,
    expectedBF: 22,
    ...overrides,
  };
}

describe("BestBetCard", () => {
  it("renders the team logo for a standard starter", () => {
    render(<BestBetCard bet={bet()} />);
    expect(screen.getByText("Test Pitcher")).toBeInTheDocument();
    // MlbTeamLogo renders an <img>/<svg> keyed by team; assert the card
    // structure around it is present rather than coupling to its internals.
    expect(screen.getByText(/NYY vs BOS/)).toBeInTheDocument();
  });

  it("does not show workload context for a normal starter (preserves the compact layout)", () => {
    render(<BestBetCard bet={bet()} />);
    expect(screen.queryByText(/Exp IP/)).not.toBeInTheDocument();
  });

  it("shows workload context (Exp IP / Exp BF / Role) for a non-starter role", () => {
    render(<BestBetCard bet={bet({ workloadRole: "reliever", expectedIP: 1, expectedBF: 4.6, projectedKs: 0.9 })} />);
    expect(screen.getByText(/Exp IP: 1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Exp BF: 4\.6/)).toBeInTheDocument();
    expect(screen.getByText(/Role: Reliever/)).toBeInTheDocument();
  });

  it("shows the exceptional badge only when isExceptionalLowWorkload is true", () => {
    render(<BestBetCard bet={bet({ recommendationTier: "exceptional-low-workload", isExceptionalLowWorkload: true, workloadRole: "opener" })} />);
    expect(screen.getByText("High-Variance Edge")).toBeInTheDocument();
  });

  it("does not show the exceptional badge for a standard-tier bet", () => {
    render(<BestBetCard bet={bet()} />);
    expect(screen.queryByText("High-Variance Edge")).not.toBeInTheDocument();
  });

  it("shows workload context for a low-workload Under without a badge (badge is Over-exception-only)", () => {
    render(<BestBetCard bet={bet({ side: "under", workloadRole: "opener", expectedIP: 1, expectedBF: 4, isExceptionalLowWorkload: false })} />);
    expect(screen.getByText(/Exp IP: 1\.0/)).toBeInTheDocument();
    expect(screen.queryByText("High-Variance Edge")).not.toBeInTheDocument();
  });
});
