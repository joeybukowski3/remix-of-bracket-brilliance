import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getGameById } from "@/data/cfb";
import CollegeFootballModelPanel from "./CollegeFootballModelPanel";

const GAME_ID = "401856766"; // TCU @ North Carolina — V2 model output is null in Phase A

describe("CollegeFootballModelPanel", () => {
  it("shows the coming-soon placeholder when the JKB model has not produced output (V2 inactive)", () => {
    const game = getGameById(GAME_ID)!;
    expect(game.model.jkbPowerLine).toBeNull();
    expect(game.model.jkbProjectedSpread).toBeNull();
    render(<CollegeFootballModelPanel game={game} />);
    expect(screen.getByText("Model projections coming soon")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("never fabricates a win probability or projected value while the model is inactive", () => {
    const game = getGameById(GAME_ID)!;
    render(<CollegeFootballModelPanel game={game} />);
    expect(screen.queryByText(/win probability:\s*\d/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/projected spread:\s*[+-]?\d/i)).not.toBeInTheDocument();
  });

  it("renders real model values once the JKB power line is populated", () => {
    const game = getGameById(GAME_ID)!;
    const readyGame = {
      ...game,
      model: {
        ...game.model,
        jkbPowerLine: -6.5,
        neutralPowerDifference: 5.2,
        homeFieldAdjustment: 1.3,
      },
    };
    render(<CollegeFootballModelPanel game={readyGame} />);
    expect(screen.queryByText("Model projections coming soon")).not.toBeInTheDocument();
    expect(screen.getByText("-6.5")).toBeInTheDocument();
  });
});
