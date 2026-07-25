/**
 * Focused tests for the handedness HR frequency expanded-detail tile.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HandednessHrFrequencyTile } from "@/pages/MlbHrProps";

describe("HandednessHrFrequencyTile", () => {
  it("renders LHP label and ratio", () => {
    render(
      <HandednessHrFrequencyTile
        row={{
          pitcherHand: "L",
          splitHandLabel: "LHP",
          splitStatus: "ok",
          splitAbPerHr: 30.0,
          splitHomeRuns: 4,
          splitAtBats: 120,
        }}
      />,
    );
    expect(screen.getByText("HR FREQUENCY VS LHP")).toBeInTheDocument();
    expect(screen.getByText("1 HR / 30.0 AB")).toBeInTheDocument();
    expect(screen.getByText("4 HR in 120 AB")).toBeInTheDocument();
  });

  it("renders RHP label and ratio", () => {
    render(
      <HandednessHrFrequencyTile
        row={{
          pitcherHand: "R",
          splitHandLabel: "RHP",
          splitStatus: "ok",
          splitAbPerHr: 18.7,
          splitHomeRuns: 6,
          splitAtBats: 112,
        }}
      />,
    );
    expect(screen.getByText("HR FREQUENCY VS RHP")).toBeInTheDocument();
    expect(screen.getByText("1 HR / 18.7 AB")).toBeInTheDocument();
    expect(screen.getByText("6 HR in 112 AB")).toBeInTheDocument();
  });

  it("renders zero-HR state", () => {
    render(
      <HandednessHrFrequencyTile
        row={{
          pitcherHand: "R",
          splitHandLabel: "RHP",
          splitStatus: "zero_hr",
          splitAbPerHr: null,
          splitHomeRuns: 0,
          splitAtBats: 45,
        }}
      />,
    );
    expect(screen.getByText("0 HR in 45 AB")).toBeInTheDocument();
  });

  it("renders split unavailable", () => {
    render(
      <HandednessHrFrequencyTile
        row={{
          pitcherHand: "L",
          splitHandLabel: "LHP",
          splitStatus: "split_unavailable",
          splitAbPerHr: null,
          splitHomeRuns: null,
          splitAtBats: null,
        }}
      />,
    );
    expect(screen.getByText("Split unavailable")).toBeInTheDocument();
  });

  it("renders pitcher hand unavailable", () => {
    render(
      <HandednessHrFrequencyTile
        row={{
          pitcherHand: "",
          splitHandLabel: null,
          splitStatus: "pitcher_hand_unavailable",
          splitAbPerHr: null,
          splitHomeRuns: null,
          splitAtBats: null,
        }}
      />,
    );
    expect(screen.getByText("Pitcher hand unavailable")).toBeInTheDocument();
  });
});
