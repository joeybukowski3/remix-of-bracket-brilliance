import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NflTeamTrendPanel from "@/components/nfl/team-dashboard/NflTeamTrendPanel";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildNflTeamTrendSummary } from "@/lib/nfl/teamTrendPresentation";
import { getNflTrendRecord, type NflTrendRecord } from "@/lib/nfl/teamTrends";

const GUIDE = getNflSeasonGuide(2026)!;

function teamBySlug(slug: string) {
  const team = GUIDE.teamBySlug.get(slug);
  if (!team) throw new Error(`Missing guide team ${slug}`);
  return team;
}

function renderPanel(slug: string, trendRecord?: NflTrendRecord | null) {
  return render(<NflTeamTrendPanel team={teamBySlug(slug)} trendRecord={trendRecord} />);
}

describe("NflTeamTrendPanel", () => {
  it("resolves all 32 canonical team slugs to one trend record by canonical identity", () => {
    const records = GUIDE.teams.map((team) => getNflTrendRecord(team.abbr));

    expect(records).toHaveLength(32);
    expect(records.every(Boolean)).toBe(true);
    expect(new Set(records.map((record) => record!.teamId)).size).toBe(32);
    expect(new Set(records.map((record) => record!.abbr)).size).toBe(32);
  });

  it("renders Jacksonville as a strong late-season improvement", () => {
    renderPanel("jacksonville-jaguars");

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(within(panel).getByText("Strong late-season improvement")).toBeTruthy();
    expect(within(panel).getByText("Full-season rank")).toBeTruthy();
    expect(within(panel).getByText("#4")).toBeTruthy();
    expect(within(panel).getByText("Final-eight rank")).toBeTruthy();
    expect(within(panel).getByText("#1")).toBeTruthy();
    expect(within(panel).getByText("↑ 3")).toBeTruthy();
    expect(panel.textContent).toContain("Improved 3 spots");
    expect(panel.textContent).toContain("Jacksonville Jaguars moved from #4 over the full 2025 season to #1 over its final eight games.");
  });

  it("renders Cincinnati as a strong late-season improvement", () => {
    renderPanel("cincinnati-bengals");

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(within(panel).getByText("Strong late-season improvement")).toBeTruthy();
    expect(within(panel).getByText("↑ 8")).toBeTruthy();
  });

  it("renders Seattle as a stable late-season profile with unchanged rank", () => {
    renderPanel("seattle-seahawks");

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(within(panel).getByText("Stable late-season profile")).toBeTruthy();
    expect(within(panel).getByText("→ 0")).toBeTruthy();
    expect(panel.textContent).toContain("No rank change");
  });

  it("renders Kansas City as a strong late-season decline", () => {
    renderPanel("kansas-city-chiefs");

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(within(panel).getByText("Strong late-season decline")).toBeTruthy();
    expect(within(panel).getByText("↓ 13")).toBeTruthy();
    expect(panel.textContent).toContain("Declined 13 spots");
  });

  it("displays offense and defense deltas without treating color as the only signal", () => {
    renderPanel("jacksonville-jaguars");

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(within(panel).getByText("Offense movement")).toBeTruthy();
    expect(within(panel).getByText("Defense movement")).toBeTruthy();
    expect(panel.textContent).toMatch(/Improved by .* offense z-score/);
    expect(panel.textContent).toMatch(/Improved by .* defense z-score/);
  });

  it("omits null secondary metrics instead of rendering fabricated zero movement", () => {
    const record = structuredClone(getNflTrendRecord("jax")!);
    record.deltas.netEpa = null;
    record.deltas.pointDiff = null;

    renderPanel("jacksonville-jaguars", record);

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(within(panel).queryByText("Net EPA movement")).toBeNull();
    expect(within(panel).queryByText("Point differential movement")).toBeNull();
    expect(panel.textContent).not.toContain("No net EPA z-score change");
    expect(panel.textContent).not.toContain("No point-differential z-score change");
  });

  it("shows confidence, source metadata, and Stage-1 status", () => {
    renderPanel("seattle-seahawks");

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(within(panel).getByText("high confidence")).toBeTruthy();
    expect(within(panel).getAllByText("Stage-1").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Source season 2025")).toBeTruthy();
    expect(within(panel).getByText("nfl-power-v0.3.0")).toBeTruthy();
    expect(panel.textContent).toContain("Generated 2026-07-14T12:51:57.553Z");
    expect(within(panel).getByText("Validation Stage-1")).toBeTruthy();
  });

  it("keeps deterministic summaries factual and free of roster, coaching, injury, or betting claims", () => {
    const summary = buildNflTeamTrendSummary(getNflTrendRecord("kc")!);

    expect(summary).toContain("Kansas City Chiefs moved from #11 over the full 2025 season to #24 over its final eight games.");
    expect(summary).not.toMatch(/roster|coach|injur|betting advice|future|projected improvement/i);
  });

  it("renders an unavailable state when a trend record is absent", () => {
    renderPanel("seattle-seahawks", null);

    const panel = screen.getByTestId("nfl-team-trend-panel");
    expect(panel.textContent).toContain("Trend data is unavailable for this team.");
    expect(panel.textContent).toContain("No movement values are inferred.");
    expect(panel.textContent).not.toContain("→ 0");
  });

  it("uses reusable responsive markup without horizontal overflow wrappers", () => {
    const { container } = renderPanel("cincinnati-bengals");

    expect(container.querySelector('[data-testid="nfl-team-trend-panel"]')).toBeTruthy();
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });
});
