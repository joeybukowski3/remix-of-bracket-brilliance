import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  computeFieldCoverage,
  prepareTournamentModel,
} from "../../../scripts/generate-pga-best-bets.mjs";
import PgaFieldCoverageNote from "@/components/pga/PgaFieldCoverageNote";

const field = (players: string[]) => ({
  tournament: "Rocket Classic",
  validated: true,
  source: "pga-tour-official-field",
  alternatesExcluded: true,
  players,
});

const model = (players: string[]) => ({
  tournamentName: "Rocket Classic",
  rows: players.map((player, index) => ({ player, rank: index + 1 })),
});

/** 141 entrants, 126 modeled -- the live Rocket Classic shape. */
function rocketClassic() {
  const modeled = Array.from({ length: 126 }, (_, i) => `Modeled Player ${i + 1}`);
  const unmodeled = Array.from({ length: 15 }, (_, i) => `Unmodeled Player ${i + 1}`);
  return { modeled, unmodeled, all: [...modeled, ...unmodeled] };
}

describe("computeFieldCoverage", () => {
  it("measures coverage against the OFFICIAL field size, not the model row count", () => {
    // The defect: dividing by tournamentData.rows.length asked "what share of
    // my rows are in the field?" -- ~100% by construction -- so the gate could
    // never see entrants missing from the model.
    const { modeled, all } = rocketClassic();
    const coverage = computeFieldCoverage(model(modeled), field(all));

    expect(coverage.fieldCount).toBe(141);
    expect(coverage.modeledCount).toBe(126);
    expect(coverage.unmodeledCount).toBe(15);
    expect(coverage.coveragePct).toBeCloseTo(89.4, 1);
  });

  it("names every unmodeled entrant, sorted", () => {
    const coverage = computeFieldCoverage(model(["Zed Zulu"]), field(["Zed Zulu", "Mo Mike", "Al Alpha"]));

    expect(coverage.unmodeledPlayers).toEqual(["Al Alpha", "Mo Mike"]);
    expect(coverage.reason).toMatch(/no current statistics/i);
  });

  it("reports full coverage when every entrant is modeled", () => {
    const coverage = computeFieldCoverage(model(["A", "B"]), field(["A", "B"]));

    expect(coverage.coveragePct).toBe(100);
    expect(coverage.unmodeledPlayers).toEqual([]);
  });

  it("keeps counts internally consistent", () => {
    const { modeled, all } = rocketClassic();
    const coverage = computeFieldCoverage(model(modeled), field(all));

    expect(coverage.fieldCount - coverage.modeledCount).toBe(coverage.unmodeledPlayers.length);
  });

  it("handles an empty field without dividing by zero", () => {
    const coverage = computeFieldCoverage(model([]), field([]));
    expect(coverage.coveragePct).toBe(0);
    expect(coverage.unmodeledPlayers).toEqual([]);
  });
});

describe("prepareTournamentModel coverage gate", () => {
  it("passes the live Rocket Classic shape at 89.4% and exposes coverage", () => {
    const { modeled, all } = rocketClassic();
    const result = prepareTournamentModel(model(modeled), field(all));

    expect(result.reason).toBeNull();
    expect(result.model.rows).toHaveLength(126);
    expect(result.coverage.coveragePct).toBeCloseTo(89.4, 1);
  });

  it("preserves the existing 70% minimum threshold", () => {
    // 7 of 10 modeled = exactly 70%, which must still pass.
    const modeled = Array.from({ length: 7 }, (_, i) => `M${i}`);
    const all = [...modeled, "X1", "X2", "X3"];
    expect(prepareTournamentModel(model(modeled), field(all)).reason).toBeNull();
  });

  it("blocks generation below the threshold and names the missing entrants", () => {
    const modeled = ["M1", "M2", "M3", "M4", "M5", "M6"];
    const all = [...modeled, "Missing A", "Missing B", "Missing C", "Missing D"];
    const result = prepareTournamentModel(model(modeled), field(all));

    expect(result.model).toBeNull();
    expect(result.reason).toMatch(/60%/);
    expect(result.reason).toMatch(/Missing A/);
  });

  it("still rejects a model with no rows", () => {
    expect(prepareTournamentModel({ tournamentName: "X", rows: [] }, field(["A"])).reason).toMatch(
      /no rows/,
    );
  });
});

describe("PgaFieldCoverageNote", () => {
  const coverage = {
    fieldCount: 141,
    modeledCount: 126,
    unmodeledCount: 15,
    coveragePct: 89.4,
    unmodeledPlayers: ["Aaron Wise", "Webb Simpson"],
    reason: "no current statistics available for these official entrants",
  };

  it("states the coverage sentence concisely", () => {
    render(<PgaFieldCoverageNote coverage={coverage} />);
    expect(
      screen.getByText(/126 of 141 official entrants have current statistics; 15 are not modeled this week/),
    ).toBeInTheDocument();
  });

  it("puts names behind a disclosure rather than inline", () => {
    const { container } = render(<PgaFieldCoverageNote coverage={coverage} />);
    expect(container.querySelector("details")).not.toBeNull();
    expect(screen.getByText(/Aaron Wise, Webb Simpson/)).toBeInTheDocument();
  });

  it("exposes no internal keys, timestamps or schedule ids", () => {
    const { container } = render(
      <PgaFieldCoverageNote
        coverage={{ ...coverage, checkedAt: "2026-07-27T13:28:07.993Z", localScheduleId: "rocket-classic-2026" } as never}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/checkedAt|localScheduleId|2026-07-27T/);
  });

  it("renders nothing for a legacy artifact with no coverage data", () => {
    const { container } = render(<PgaFieldCoverageNote coverage={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when coverage is complete", () => {
    const { container } = render(
      <PgaFieldCoverageNote
        coverage={{ fieldCount: 141, modeledCount: 141, unmodeledCount: 0, coveragePct: 100, unmodeledPlayers: [] }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
