import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getAllTeams } from "@/data/cfb";
import CollegeFootballRankingsTable from "./CollegeFootballRankingsTable";

function teamFixture(apRank: number | null) {
  const team = getAllTeams()[0];
  return {
    ...team,
    ratings: {
      ...team.ratings,
      jkbRank: 99,
      jkbPowerRating: 98.6,
      apRank,
      offensiveRating: 95,
      defensiveRating: 85,
      sosPlayedRank: 1,
      sosRemainingRank: 114,
    },
  };
}

function renderTable(apRank: number | null) {
  return render(
    <MemoryRouter>
      <CollegeFootballRankingsTable teams={[teamFixture(apRank)]} />
    </MemoryRouter>,
  );
}

describe("CollegeFootballRankingsTable presentation", () => {
  it("renders JKB Power, offense, defense, and both SOS heatmap classes", () => {
    const { container } = renderTable(1);
    const cells = container.querySelector("tbody tr")?.children;
    expect(cells?.[5].querySelector("span")).toHaveClass("bg-amber-200", "text-amber-950");
    expect(cells?.[6].querySelector("span")).toHaveClass("bg-amber-200", "text-amber-950");
    expect(cells?.[7].querySelector("span")).toHaveClass("bg-emerald-200", "text-emerald-950");
    expect(cells?.[8]).toHaveClass("bg-rose-100/80", "text-rose-900");
    expect(cells?.[9]).toHaveClass("bg-emerald-100/80", "text-emerald-900");
  });

  it("renders ranked and unranked AP states", () => {
    const ranked = renderTable(1);
    expect(screen.getByText("AP #1")).toBeInTheDocument();
    ranked.unmount();
    renderTable(null);
    expect(screen.getByText("AP —")).toBeInTheDocument();
  });

  it("keeps separate responsive desktop and mobile presentations", () => {
    const { container } = renderTable(null);
    expect(container.querySelector("table")).toHaveClass("hidden", "md:table");
    expect(container.querySelector("ul")).toHaveClass("md:hidden");
  });
});
