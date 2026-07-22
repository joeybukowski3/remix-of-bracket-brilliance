/**
 * Focused coverage for the team-logo treatment on the Best Home Run Bets
 * cards. Mirrors the K Prop treatment (MlbStrikeoutProps' BestBetCard), so
 * these assertions deliberately check the SAME container classes and logo
 * sizes rather than HR-specific ones -- a divergence there is the regression
 * this file exists to catch.
 *
 * MlbTeamLogo is intentionally NOT mocked: its real fallback behavior for an
 * unsupported abbreviation is part of what's under test.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

const batters: HrDashboardBatter[] = [];
vi.mock("@/hooks/useMlbPropsData", () => ({
  useMlbPropsData: () => ({ batters, loading: false }),
}));

// Imported after the mock so the component picks it up.
const { default: MlbHrBestBets } = await import("@/components/mlb/MlbHrBestBets");

function batter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: "NYY@BOS", player: "Test Hitter", team: "NYY", opponent: "BOS",
    opposingPitcher: "Test Pitcher", opposingPitcherId: 1, pitcherHand: "R",
    ballpark: "Test Park", parkFactor: 1.1, atBats: 100, barrelRate: 15,
    hardHitRate: 48, exitVelo: 91, iso: 0.22, hrFBRatio: 18, pullRate: 44,
    xba: 0.26, kRate: 22, bbRate: 9, whiffRate: 25, last7HR: 2, last30HR: 6,
    opposingPitcherHrVs: 68, opposingPitcherHitsVs: 55, opposingPitcherKVs: 40,
    weatherBoost: 3, hrScore: 72, hrScoreRank: 4, bats: "R",
    hrOddsYes: "+375", hrOddsNo: "-500", hrOddsBook: "draftkings",
    confidenceLevel: "high", angleTags: [],
    ...overrides,
  };
}

function renderWith(rows: HrDashboardBatter[]) {
  batters.length = 0;
  batters.push(...rows);
  return render(<MlbHrBestBets />);
}

/** Every logo image or initials-fallback badge currently on screen. */
function logoNodes(container: HTMLElement) {
  return [
    ...container.querySelectorAll('img[alt$="logo"]'),
    ...container.querySelectorAll("div.rounded-full.font-black"),
  ];
}

describe("Best Home Run Bets team logos", () => {
  it("renders the hitter's team logo, not the opponent's", () => {
    const { container } = renderWith([batter({ team: "NYY", opponent: "BOS" })]);
    const logos = container.querySelectorAll('img[alt="NYY logo"]');
    expect(logos.length).toBeGreaterThan(0);
    expect(container.querySelector('img[alt="BOS logo"]')).toBeNull();
  });

  it("shows a logo on the featured card and on the full list card", () => {
    // One qualifying model play appears both as the featured compact card and
    // in the Top Model Plays list, so both surfaces render from one fixture.
    const { container } = renderWith([batter()]);
    expect(container.querySelectorAll('img[alt="NYY logo"]').length).toBeGreaterThanOrEqual(2);
  });

  it("covers longshot cards too", () => {
    const { container } = renderWith([batter({ hrOddsYes: "+450", team: "LAD" })]);
    expect(screen.getAllByText("Longshot").length).toBeGreaterThan(0);
    expect(container.querySelectorAll('img[alt="LAD logo"]').length).toBeGreaterThanOrEqual(2);
  });

  it("uses the same container treatment and logo sizes as the K Prop cards", () => {
    const { container } = renderWith([batter()]);
    const containers = container.querySelectorAll("div.rounded-2xl.border.bg-slate-50.shadow-inner");
    expect(containers.length).toBeGreaterThanOrEqual(2);

    const sizes = [...container.querySelectorAll('img[alt="NYY logo"]')].map(
      (el) => (el as HTMLElement).style.width,
    );
    // 54px in the compact featured card, 64px in the full list card -- the
    // exact pair BestBetCard uses.
    expect(sizes).toContain("54px");
    expect(sizes).toContain("64px");
  });

  it("keeps every existing field on the card", () => {
    renderWith([batter()]);
    expect(screen.getAllByText("Top Model Play").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/NYY vs BOS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Test Hitter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+375").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/HR Score/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rank #/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vs Test Pitcher/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Barrel 15\.0%/).length).toBeGreaterThan(0);
  });

  it("falls back to an initials badge for an unsupported abbreviation instead of a broken image", () => {
    const { container } = renderWith([batter({ team: "ZZZ" })]);
    expect(container.querySelector('img[alt="ZZZ logo"]')).toBeNull();
    // Real MlbTeamLogo fallback: a colored circle carrying the first 2 chars.
    expect(screen.getAllByText("ZZ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Test Hitter").length).toBeGreaterThan(0);
  });

  it("omits the logo container cleanly when the team is blank, without crashing", () => {
    const { container } = renderWith([batter({ team: "  " })]);
    expect(logoNodes(container)).toHaveLength(0);
    expect(container.querySelectorAll("div.rounded-2xl.border.bg-slate-50.shadow-inner")).toHaveLength(0);
    // The card itself still renders in full.
    expect(screen.getAllByText("Test Hitter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+375").length).toBeGreaterThan(0);
  });

  it("keeps the player name and HR score in separate non-overlapping columns", () => {
    const { container } = renderWith([batter()]);
    const card = container.querySelector("article");
    expect(card).not.toBeNull();
    const scoreCol = within(card as HTMLElement).getAllByText("HR Score")[0].parentElement;
    // The score column is a shrink-0 sibling of the min-w-0 text column, which
    // is what stops a long player name from pushing it out of alignment.
    expect(scoreCol?.className).toContain("shrink-0");
    expect(card?.querySelector("div.min-w-0")).not.toBeNull();
  });
});
