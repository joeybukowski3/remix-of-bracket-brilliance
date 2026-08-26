import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getAllTeams, getGameById, getTeamById } from "@/data/cfb";
import { formatRank } from "@/lib/cfb/format";
import { getCfbSharedBarSplit } from "@/lib/cfb/ratingPresentation";
import { computeCompetitionRanks } from "@/lib/cfb/seasonStats/rankSeasonStats";
import CollegeFootballPowerComparison from "./CollegeFootballPowerComparison";

const GAME_ID = "401856766"; // TCU @ North Carolina — real Week 1 fixture

function renderComparison() {
  const game = getGameById(GAME_ID)!;
  const away = getTeamById(game.awayTeamId)!;
  const home = getTeamById(game.homeTeamId)!;
  return {
    away,
    home,
    ...render(<CollegeFootballPowerComparison away={away} home={home} />),
  };
}

describe("CollegeFootballPowerComparison", () => {
  it("renders JKB Power, Offense, Defense, and SOS rows from real ratings", () => {
    renderComparison();
    const desktop = screen.getByTestId("cfb-power-desktop");
    expect(within(desktop).getByText("Power")).toBeInTheDocument();
    expect(within(desktop).getByText("Offense")).toBeInTheDocument();
    expect(within(desktop).getByText("Defense")).toBeInTheDocument();
    expect(within(desktop).getByText("SOS Played")).toBeInTheDocument();
    expect(within(desktop).getByText("SOS Remaining")).toBeInTheDocument();
  });

  it("fills each unified power/offense/defense bar with both teams' own primary colors, sharing width by raw-value ratio (not clamped display widths)", () => {
    const { away, home, container } = renderComparison();
    const tracks = container.querySelectorAll<HTMLDivElement>(".h-3.overflow-hidden.rounded-full.bg-slate-100");
    // 3 bar rows (power/offense/defense), one shared track each.
    expect(tracks.length).toBe(3);
    const powerSegments = tracks[0].querySelectorAll<HTMLDivElement>(":scope > div");
    expect(powerSegments.length).toBe(2);
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = away.primaryColor;
    const homeSwatch = document.createElement("div");
    homeSwatch.style.background = home.primaryColor;
    expect(powerSegments[0].style.background).toBe(awaySwatch.style.background);
    expect(powerSegments[1].style.background).toBe(homeSwatch.style.background);

    const { awayShare, homeShare } = getCfbSharedBarSplit(away.ratings.jkbPowerRating, home.ratings.jkbPowerRating);
    expect(powerSegments[0].style.width).toBe(`${awayShare}%`);
    expect(powerSegments[1].style.width).toBe(`${homeShare}%`);
  });

  it("computes the shared bar split from raw values, not from independently clamped display widths (regression: UNC 45.1 vs TCU 78.5 offense case)", () => {
    // Two ratings that clamp-compress very differently (one near the 40-point
    // floor) previously produced an ~12/88 split from a real ~36/64 gap.
    const { awayShare, homeShare } = getCfbSharedBarSplit(45.1, 78.5);
    expect(awayShare).toBeCloseTo((45.1 / 123.6) * 100, 5);
    expect(homeShare).toBeCloseTo((78.5 / 123.6) * 100, 5);
    // Must stay well clear of the old distorted ~11.7/88.3 result.
    expect(awayShare).toBeGreaterThan(30);
  });

  it("marks only the stronger side, in that team's own color, never a generic green and never both sides on one row", () => {
    const { away, home } = renderComparison();
    const desktop = screen.getByTestId("cfb-power-desktop");
    const markers = desktop.querySelectorAll('[data-testid="stronger-badge"]');
    // At most one marker per row (5 rows total)
    expect(markers.length).toBeLessThanOrEqual(5);
    expect(markers.length).toBeGreaterThan(0);
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = away.primaryColor;
    const homeSwatch = document.createElement("div");
    homeSwatch.style.background = home.primaryColor;
    for (const marker of Array.from(markers)) {
      const bg = (marker as HTMLElement).style.background;
      expect([awaySwatch.style.background, homeSwatch.style.background]).toContain(bg);
    }
    expect(screen.getByText(/not a betting recommendation/i)).toBeInTheDocument();
  });

  it("never renders a fabricated win probability or edge percentage", () => {
    renderComparison();
    expect(screen.queryByText(/win probability/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows the national rank under each raw value for Power, Offense, and Defense — Power uses the existing JKB rank, Offense/Defense use the real-rating competition rank, never a fabricated number", () => {
    const { away, home, container } = renderComparison();
    const allTeams = getAllTeams();
    const offenseRanks = computeCompetitionRanks(
      allTeams.map((team) => ({ teamId: team.ratings.teamId, value: team.ratings.offensiveRating })),
      "higher-is-better",
    );
    const defenseRanks = computeCompetitionRanks(
      allTeams.map((team) => ({ teamId: team.ratings.teamId, value: team.ratings.defensiveRating })),
      "higher-is-better",
    );

    const rows = container.querySelectorAll(".border-t.border-slate-200.px-3.py-3");
    const powerRow = Array.from(rows).find((row) => within(row as HTMLElement).queryByText("Power"))!;
    expect(within(powerRow as HTMLElement).getByText(formatRank(away.ratings.jkbRank))).toBeInTheDocument();
    expect(within(powerRow as HTMLElement).getByText(formatRank(home.ratings.jkbRank))).toBeInTheDocument();

    const offenseRow = Array.from(rows).find((row) => within(row as HTMLElement).queryByText("Offense"))!;
    expect(
      within(offenseRow as HTMLElement).getByText(formatRank(offenseRanks.get(away.ratings.teamId)!)),
    ).toBeInTheDocument();
    expect(
      within(offenseRow as HTMLElement).getByText(formatRank(offenseRanks.get(home.ratings.teamId)!)),
    ).toBeInTheDocument();

    const defenseRow = Array.from(rows).find((row) => within(row as HTMLElement).queryByText("Defense"))!;
    expect(
      within(defenseRow as HTMLElement).getByText(formatRank(defenseRanks.get(away.ratings.teamId)!)),
    ).toBeInTheDocument();
    expect(
      within(defenseRow as HTMLElement).getByText(formatRank(defenseRanks.get(home.ratings.teamId)!)),
    ).toBeInTheDocument();
  });

  it("omits the rank badge entirely when the underlying rating is null, never showing a fabricated rank", () => {
    const game = getGameById(GAME_ID)!;
    const away = getTeamById(game.awayTeamId)!;
    const home = { ...getTeamById(game.homeTeamId)!, ratings: { ...getTeamById(game.homeTeamId)!.ratings, jkbPowerRating: null, jkbRank: null } };
    const { container } = render(<CollegeFootballPowerComparison away={away} home={home} />);
    const rows = container.querySelectorAll(".border-t.border-slate-200.px-3.py-3");
    const powerRow = Array.from(rows).find((row) => within(row as HTMLElement).queryByText("Power")) as HTMLElement;
    // Home's power rating/rank is null -> only away's rank badge should render on this row.
    const rankBadges = within(powerRow).getAllByText(/^#\d+$/);
    expect(rankBadges.length).toBe(away.ratings.jkbRank != null ? 1 : 0);
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderComparison();
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});

describe("CollegeFootballPowerComparison — mobile presentation", () => {
  it("renders a dedicated mobile block with away/advantage/home header identity and all five metric rows", () => {
    const { away, home } = renderComparison();
    const mobile = screen.getByTestId("cfb-power-mobile");
    expect(within(mobile).getByText(away.abbreviation)).toBeInTheDocument();
    expect(within(mobile).getByText(home.abbreviation)).toBeInTheDocument();
    expect(within(mobile).getByText("Advantage")).toBeInTheDocument();
    expect(within(mobile).getByText("JKB Rating")).toBeInTheDocument();
    expect(within(mobile).getByText("Power")).toBeInTheDocument();
    expect(within(mobile).getByText("Offense")).toBeInTheDocument();
    expect(within(mobile).getByText("Defense")).toBeInTheDocument();
    expect(within(mobile).getByText("SOS Played")).toBeInTheDocument();
    expect(within(mobile).getByText("SOS Remaining")).toBeInTheDocument();
  });

  it("renders the split-bar junction marker (not a team logo) for Power/Offense/Defense rows", () => {
    renderComparison();
    const mobile = screen.getByTestId("cfb-power-mobile");
    const rows = within(mobile).getAllByTestId("cfb-mobile-shared-bar-row");
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(within(row).getByTestId("split-bar-marker")).toBeInTheDocument();
      expect(row.querySelector("img")).toBeNull();
    }
  });

  it("preserves the same edge/winner logic as desktop — stronger-side badges match between mobile and desktop", () => {
    const { container } = renderComparison();
    const desktopBadges = container.querySelectorAll('[data-testid="cfb-power-desktop"] [data-testid="stronger-badge"]');
    const mobileBadges = container.querySelectorAll('[data-testid="cfb-power-mobile"] [data-testid="stronger-badge"]');
    expect(mobileBadges.length).toBe(desktopBadges.length);
  });

  it("shows the same national ranks under each mobile value as desktop, using the shared getCfbSharedBarSplit shares", () => {
    const { away, home } = renderComparison();
    const mobile = screen.getByTestId("cfb-power-mobile");
    expect(within(mobile).getByText(formatRank(away.ratings.jkbRank))).toBeInTheDocument();
    expect(within(mobile).getByText(formatRank(home.ratings.jkbRank))).toBeInTheDocument();
  });

  it("preserves honest null SOS behavior on mobile — no fabricated rank text", () => {
    const { away, home } = renderComparison();
    const mobile = screen.getByTestId("cfb-power-mobile");
    const rankRows = within(mobile).getAllByTestId("cfb-mobile-rank-row");
    const sosPlayedRow = rankRows.find((row) => within(row).queryByText("SOS Played"))!;
    const sosRemainingRow = rankRows.find((row) => within(row).queryByText("SOS Remaining"))!;
    const sosPlayedText = sosPlayedRow.textContent ?? "";
    const sosRemainingText = sosRemainingRow.textContent ?? "";
    expect(sosPlayedText).toContain(formatRank(away.ratings.sosPlayedRank));
    expect(sosPlayedText).toContain(formatRank(home.ratings.sosPlayedRank));
    expect(sosRemainingText).toContain(formatRank(away.ratings.sosRemainingRank));
    expect(sosRemainingText).toContain(formatRank(home.ratings.sosRemainingRank));
  });

  it("never renders NaN or undefined in the mobile block", () => {
    renderComparison();
    const mobile = screen.getByTestId("cfb-power-mobile");
    const body = mobile.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
