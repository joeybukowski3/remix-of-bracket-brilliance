/**
 * MlbTeamMiniCard.test.tsx
 * A better win/loss record is favorable — it must render with the shared JKB
 * Heat favorable (green) fill, not the sanctioned hot/cold red (KS-010).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MlbTeamMiniCard from "./MlbTeamMiniCard";
import type { MlbTeamContext } from "@/lib/mlb/mlbTypes";

const baseContext: MlbTeamContext = {
  seasonRecord: "50-30",
  lastFiveRecord: "4-1",
  homeRecord: "30-15",
  awayRecord: "20-15",
  seriesRecord: "1-0",
  seasonWrcPlus: null,
  seasonWrcPlusRank: null,
  recentWrcPlus: null,
  recentWrcPlusRank: null,
  vsLhpWrcPlus: null,
  vsLhpWrcPlusRank: null,
  vsRhpWrcPlus: null,
  vsRhpWrcPlusRank: null,
};

const worseContext: MlbTeamContext = {
  ...baseContext,
  seasonRecord: "40-40",
  lastFiveRecord: "1-4",
  homeRecord: "18-22",
  awayRecord: "22-18",
};

const team = { abbreviation: "NYY", name: "Yankees", record: "50-30" } as never;

describe("MlbTeamMiniCard — favorable record color", () => {
  it("gives a better record the shared JKB Heat green fill and no red", () => {
    const { container } = render(
      <MlbTeamMiniCard team={team} context={baseContext} venueMode="home" comparisonContext={worseContext} />,
    );
    const season = screen.getByText("50-30", { selector: "dd" }) as HTMLElement;
    expect(season.style.backgroundColor).toMatch(/34,\s*197,\s*94/);
    expect(container.innerHTML).not.toMatch(/251,\s*113,\s*133/);
  });
});
