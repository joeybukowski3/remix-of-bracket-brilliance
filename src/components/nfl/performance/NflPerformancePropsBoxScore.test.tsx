import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NflYardageHistoryArtifact, NflYardagePlayerHistoryGame } from "@/lib/nfl/props/types/yardageHistory";
import type { PropsPerformanceRow } from "@/types/nfl/performance";
import { findPropBoxScore } from "@/lib/nfl/performance/propBoxScore";
import NflPerformancePropsBoxScore from "./NflPerformancePropsBoxScore";

const row = {
  player_id: "gsis:player-1", game_id: "2026_01_AAA_BBB", season: 2026, week: 1,
  market: "passing_yards", actual: 271,
} as PropsPerformanceRow;

const game = {
  gameId: row.game_id, season: row.season, week: row.week, actualYards: 271,
  stat: { completions: 24, attempts: 36, passingTds: 2, interceptions: 1 },
} as NflYardagePlayerHistoryGame;

describe("Props compact box score", () => {
  it("joins only the exact canonical player, market, game, week, and graded yards", () => {
    const history = { season: 2026, players: { "gsis:player-1:passing": { games: [game] } } } as unknown as NflYardageHistoryArtifact;
    expect(findPropBoxScore(row, history)).toBe(game);
    expect(findPropBoxScore({ ...row, actual: 270 }, history)).toBeNull();
    expect(findPropBoxScore({ ...row, game_id: "different" }, history)).toBeNull();
    expect(findPropBoxScore({ ...row, market: "rushing_yards" }, history)).toBeNull();
  });

  it("renders passing completions, attempts, yards, touchdowns, and interceptions", () => {
    render(<NflPerformancePropsBoxScore row={row} game={game} />);
    const table = screen.getByRole("table", { name: "passing box score" });
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["24/36", "271", "2", "1"]);
  });

  it("renders rushing and receiving stat fields for their markets", () => {
    const { rerender } = render(<NflPerformancePropsBoxScore row={{ ...row, market: "rushing_yards" }} game={{ ...game, stat: { rushAttempts: 18, rushTds: 1 } }} />);
    expect(within(screen.getByRole("table", { name: "rushing box score" })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["18", "271", "1"]);
    rerender(<NflPerformancePropsBoxScore row={{ ...row, market: "receiving_yards" }} game={{ ...game, stat: { targets: 9, receptions: 7, recTds: 2 } }} />);
    const receiving = screen.getByRole("table", { name: "receiving box score" });
    expect(within(receiving).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["9", "7", "271", "2"]);
  });

  it("shows graded yards and an honest unavailable state when history has no game", () => {
    render(<NflPerformancePropsBoxScore row={row} game={null} />);
    expect(screen.getByRole("table", { name: "passing box score" })).toHaveTextContent("271");
    expect(screen.getByText("Additional game stats unavailable; graded yards shown.")).toBeInTheDocument();
  });
});
