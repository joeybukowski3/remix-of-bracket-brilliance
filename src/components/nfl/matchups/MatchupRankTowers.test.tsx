import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupRankTowers from "@/components/nfl/matchups/MatchupRankTowers";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";

const AWAY = {
  slug: "away-club",
  abbr: "awy",
  teamName: "Away Club",
} as NflMatchupTeam;

const HOME = {
  slug: "home-club",
  abbr: "hme",
  teamName: "Home Club",
} as NflMatchupTeam;

const METRICS: MatchupVisualMetric[] = [
  {
    id: "off.epaPerPlay",
    label: "EPA / Play",
    shortLabel: "EPA / Play",
    categoryId: "offense",
    comparison: "away",
    leader: "away",
    isChartEligible: true,
    away: { value: 0.2, rank: 1, formatted: "+0.20", percentile: 0 },
    home: { value: -0.1, rank: 19, formatted: "-0.10", percentile: 18 / 31 },
    rankGap: 18,
  },
  {
    id: "off.firstDownsPerPlay",
    label: "First Downs / Play",
    shortLabel: "1st Downs / Play",
    categoryId: "offense",
    comparison: "missing",
    leader: null,
    isChartEligible: true,
    away: { value: null, rank: null, formatted: "N/A", percentile: null },
    home: { value: null, rank: null, formatted: "N/A", percentile: null },
    rankGap: null,
  },
];

describe("MatchupRankTowers", () => {
  it("renders the featured geometry and a crest-rank-tower stack for both teams", () => {
    const { container } = render(
      <MatchupRankTowers
        metrics={METRICS}
        away={AWAY}
        home={HOME}
        awayColor="#031635"
        homeColor="#006778"
      />
    );

    const groups = container.querySelectorAll<HTMLElement>("[data-rank-tower-group]");
    const crests = container.querySelectorAll<HTMLElement>(".rank-tower-team-crest");
    const badges = container.querySelectorAll<HTMLElement>("[data-rank-badge]");
    const towers = container.querySelectorAll<HTMLElement>("[data-rank-tower]");

    expect(groups).toHaveLength(METRICS.length);
    expect(container.querySelectorAll(".matchup-unified-chart")).toHaveLength(1);
    expect(container.querySelectorAll(".matchup-rank-towers__card")).toHaveLength(0);
    expect(crests).toHaveLength(METRICS.length * 2);
    expect(crests[0].style.width).toBe("16px");
    expect(crests[0].style.height).toBe("16px");
    expect(badges[0]).toHaveClass("matchup-rank-towers__rank");
    expect(badges[0]).toHaveTextContent("#1");
    expect(towers).toHaveLength(METRICS.length * 2);
    expect(towers[0].querySelector<HTMLElement>(".matchup-rank-towers__bar-fill")?.style.height).toBe("100%");
    expect(groups[0]).toHaveTextContent("+0.20");
    expect(groups[0]).toHaveTextContent("AWY +18");
    expect(groups[0].querySelectorAll('[role="img"]')[0]).toHaveAttribute("aria-label", expect.stringContaining("Away Club — rank 1 of 32 — value +0.20"));
    expect(groups[0].querySelectorAll('[role="img"]')[1]).toHaveAttribute("aria-label", expect.stringContaining("Home Club — rank 19 of 32 — value -0.10"));
  });

  it("renders missing ranks as full-height dashed empty rails", () => {
    const { container } = render(
      <MatchupRankTowers
        metrics={METRICS}
        away={AWAY}
        home={HOME}
        awayColor="#031635"
        homeColor="#006778"
      />
    );

    const missingGroup = container.querySelectorAll("[data-rank-tower-group]")[1];
    const missingTowers = missingGroup.querySelectorAll<HTMLElement>("[data-rank-tower]");

    expect(missingTowers).toHaveLength(2);
    for (const tower of missingTowers) {
      expect(tower).toHaveClass("matchup-unified-chart__missing");
      expect(tower.querySelector(".matchup-rank-towers__bar-fill")).toBeNull();
    }
  });

  it("keeps source ordering and recalculates categories when selection changes", () => {
    const { container, rerender } = render(<MatchupRankTowers metrics={METRICS} away={AWAY} home={HOME} awayColor="#031635" homeColor="#006778" />);
    expect(Array.from(container.querySelectorAll("[data-rank-tower-group] .matchup-unified-chart__caption")).map((node) => node.textContent)).toEqual(["EPA / PlayAWY +18", "1st Downs / Play"]);
    rerender(<MatchupRankTowers metrics={METRICS.slice(1)} away={AWAY} home={HOME} awayColor="#031635" homeColor="#006778" />);
    expect(container.querySelectorAll("[data-rank-tower-group]")).toHaveLength(1);
    expect(container.querySelector("[data-rank-tower-group]")).toHaveTextContent("1st Downs / Play");
  });

  it("places rank 1 above rank 32 and exposes keyboard-accessible details", () => {
    const worst: MatchupVisualMetric = { ...METRICS[0], home: { value: -1, rank: 32, formatted: "-1.00", percentile: 1 } };
    const { container, getByRole } = render(<MatchupRankTowers metrics={[worst]} away={AWAY} home={HOME} awayColor="#031635" homeColor="#006778" />);
    const fills = container.querySelectorAll<HTMLElement>(".matchup-rank-towers__bar-fill");
    expect(fills[0].style.height).toBe("100%");
    expect(fills[1].style.height).toBe("8%");
    const details = getByRole("button", { name: "Details for EPA / Play" });
    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".matchup-unified-chart__viewport")).toHaveAttribute("tabindex", "0");
  });
});
