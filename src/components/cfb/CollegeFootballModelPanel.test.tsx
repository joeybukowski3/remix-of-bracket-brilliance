import { render, screen, within } from "@testing-library/react";
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
    const desktop = screen.getByTestId("cfb-model-desktop");
    expect(within(desktop).getByText("Model projections coming soon")).toBeInTheDocument();
    expect(within(desktop).getByText("Coming soon")).toBeInTheDocument();
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
    const desktop = screen.getByTestId("cfb-model-desktop");
    expect(within(desktop).queryByText("Model projections coming soon")).not.toBeInTheDocument();
    expect(within(desktop).getByText("-6.5")).toBeInTheDocument();
  });

  it("never renders NaN or undefined", () => {
    const game = getGameById(GAME_ID)!;
    const { container } = render(<CollegeFootballModelPanel game={game} />);
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});

describe("CollegeFootballModelPanel — mobile presentation", () => {
  it("shows the same honest coming-soon state as desktop when the model is inactive", () => {
    const game = getGameById(GAME_ID)!;
    render(<CollegeFootballModelPanel game={game} />);
    const mobile = screen.getByTestId("cfb-model-mobile");
    expect(within(mobile).getByText("Model projections coming soon")).toBeInTheDocument();
    expect(within(mobile).getByText("Coming soon")).toBeInTheDocument();
    expect(within(mobile).getByText("Projected Spread")).toBeInTheDocument();
    expect(within(mobile).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders the same real model values as desktop once the JKB power line is populated", () => {
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
    const mobile = screen.getByTestId("cfb-model-mobile");
    expect(within(mobile).queryByText("Model projections coming soon")).not.toBeInTheDocument();
    expect(within(mobile).getByText("-6.5")).toBeInTheDocument();
    expect(within(mobile).getByText("5.2")).toBeInTheDocument();
    expect(within(mobile).getByText("1.3")).toBeInTheDocument();
  });

  it("uses the rounded-2xl/slate-300 mobile card language, not the desktop's rounded-sm/rounded-md treatment", () => {
    const game = getGameById(GAME_ID)!;
    render(<CollegeFootballModelPanel game={game} />);
    const mobile = screen.getByTestId("cfb-model-mobile");
    expect(mobile.className).toContain("rounded-2xl");
    expect(mobile.className).toContain("border-slate-300");
  });

  it("never renders NaN or undefined in the mobile block", () => {
    const game = getGameById(GAME_ID)!;
    render(<CollegeFootballModelPanel game={game} />);
    const mobile = screen.getByTestId("cfb-model-mobile");
    const body = mobile.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
