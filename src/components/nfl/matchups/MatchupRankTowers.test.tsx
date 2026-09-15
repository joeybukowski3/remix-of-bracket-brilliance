import { render } from "@testing-library/react";
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
    expect(groups[0].style.width).toBe("104px");
    expect(crests).toHaveLength(METRICS.length * 2);
    expect(crests[0].style.width).toBe("18px");
    expect(crests[0].style.height).toBe("18px");
    expect(badges[0]).toHaveClass("h-[19px]", "text-[10px]", "font-extrabold");
    expect(towers).toHaveLength(METRICS.length * 2);
    expect(towers[0].style.height).toBe("172px");
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
      expect(tower.style.height).toBe("172px");
      expect(tower).toHaveClass("border-dashed", "bg-slate-50/70");
    }
  });
});
