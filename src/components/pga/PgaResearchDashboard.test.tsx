import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PgaResearchDashboard from "@/components/pga/PgaResearchDashboard";
import { PGA_TOURNAMENTS } from "@/lib/pga/tournaments";
import type { PgaHubBoardContext, PgaPlayerInput } from "@/lib/pga/pgaTypes";

vi.mock("@/hooks/usePgaDashboardUniversePlayers", () => ({
  usePgaDashboardUniversePlayers: () => ({ players: [], status: "ready", errorMessage: "" }),
}));

const player: PgaPlayerInput = {
  id: "sample-golfer",
  player: "Sample Golfer",
  courseHistoryRounds: 8,
  courseHistoryScore: 1.25,
  avgFinish: 14,
  cutsLastFive: "4/5",
  recentFinishes: ["T8", "T12"],
  statRanks: {
    trendRank: 4,
    sgApproachRank: 3,
    par4Rank: 5,
    drivingAccuracyRank: 7,
    bogeyAvoidanceRank: 9,
    sgAroundGreenRank: 11,
    birdie125150Rank: 13,
    sgPuttingRank: 15,
    birdieUnder125Rank: 17,
  },
};

const boardContext: PgaHubBoardContext = {
  eyebrow: "PGA research",
  headline: "Research board",
  intro: "Compare the active field.",
  statCards: [],
  contextTitle: "Context",
  contextBody: "Current tournament context.",
  contextBullets: [],
  leaderboardTitle: "Rankings",
  leaderboardBody: "Current model rankings.",
};

describe("PgaResearchDashboard table framework", () => {
  it("preserves PGA section identity while using shared sticky and frozen layers", () => {
    const { container } = render(
      <MemoryRouter>
        <PgaResearchDashboard
          tournament={PGA_TOURNAMENTS[0]}
          boardContext={boardContext}
          currentFieldPlayers={[player]}
          currentFieldStatus="ready"
          currentFieldErrorMessage=""
          modelPath="/pga/model"
          picksPath="/pga/picks"
        />
      </MemoryRouter>,
    );

    expect(container.querySelector(".pga-picks-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live PGA trend table" })).toHaveClass("pga-section-title");

    const scroller = screen.getByRole("region", { name: "Live PGA trend rankings" });
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller.className).toContain("overflow-auto");
    expect(scroller.querySelector("thead")?.className).toContain("z-20");
    expect(screen.getByRole("columnheader", { name: /Fav/ }).className).toContain("z-30");
    expect(screen.getByRole("cell", { name: /Sample Golfer/ }).className).toContain("z-10");
    expect(screen.getByText("Sample Golfer")).toBeInTheDocument();
  });
});
