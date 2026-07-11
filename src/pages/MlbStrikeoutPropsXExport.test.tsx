import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MlbStrikeoutPropsXExport from "./MlbStrikeoutPropsXExport";
import { buildKArtifact, encodeArtifact } from "../../scripts/lib/mlb-x-selection-artifact.mjs";
import { selectConfirmedKRows } from "../../scripts/lib/mlb-k-x-selection-core.mjs";

const snapshot = { ok: true, asOf: "2026-07-12T15:00:00Z", timing: { earliestGameTime: "2026-07-12T17:00:00Z", minutesUntilFirstPitch: 75, phase: "PREFERRED" } };

function renderExport(encoded: string | null) {
  const path = encoded ? `/mlb/strikeout-props/x-export?d=${encoded}` : "/mlb/strikeout-props/x-export";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mlb/strikeout-props/x-export" element={<MlbStrikeoutPropsXExport />} />
      </Routes>
    </MemoryRouter>,
  );
}

function kRow(overrides: Record<string, unknown>) {
  return {
    pitcher: "Pitcher",
    team: "DET",
    opponent: "PHI",
    status: "VALID",
    kLine: 6.5,
    direction: "over",
    oddsOver: "-115",
    oddsUnder: "-105",
    projectedKs: 8.2,
    projectionEdge: 1.7,
    isCurrentStarter: true,
    gameStarted: false,
    opposingLineupConfirmed: true,
    pitcherId: 1,
    gameId: 10,
    ...overrides,
  };
}

describe("MlbStrikeoutPropsXExport route", () => {
  it("renders only current-starter rows, excludes the replaced starter, preserves absolute-edge order", () => {
    const rows = [
      kRow({ pitcher: "current-low", pitcherId: 1, projectionEdge: 1.0 }),
      kRow({ pitcher: "replaced", pitcherId: 2, isCurrentStarter: false, projectionEdge: 3.5 }),
      kRow({ pitcher: "current-high", pitcherId: 3, projectionEdge: 2.4 }),
    ];
    const selection = selectConfirmedKRows({ rows });
    const artifact = buildKArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "READY_CONFIRMED_SELECTIONS", selectedRows: selection.selected });
    const { container } = renderExport(encodeArtifact(artifact));

    const rendered = container.querySelectorAll("[data-k-row]");
    const pitchers = Array.from(rendered).map((r) => r.getAttribute("data-k-pitcher"));
    expect(pitchers).toEqual(["current-high", "current-low"]); // edge order, replaced excluded
    expect(pitchers).not.toContain("replaced");
  });

  it("displays the correct side and side-specific odds for OVER and UNDER", () => {
    const rows = [
      kRow({ pitcher: "Over Guy", pitcherId: 1, gameId: 10, direction: "over", oddsOver: "-120", oddsUnder: "+100", projectionEdge: 1.2 }),
      kRow({ pitcher: "Under Guy", pitcherId: 2, gameId: 11, direction: "under", oddsOver: "-110", oddsUnder: "-130", projectionEdge: -2.0 }),
    ];
    const selection = selectConfirmedKRows({ rows });
    const artifact = buildKArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "READY_CONFIRMED_SELECTIONS", selectedRows: selection.selected });
    const { container } = renderExport(encodeArtifact(artifact));

    const byPitcher = new Map(
      Array.from(container.querySelectorAll("[data-k-row]")).map((r) => [r.getAttribute("data-k-pitcher"), r]),
    );
    expect(byPitcher.get("Over Guy")?.getAttribute("data-k-side")).toBe("OVER");
    expect(byPitcher.get("Over Guy")?.getAttribute("data-k-odds")).toBe("-120");
    expect(byPitcher.get("Under Guy")?.getAttribute("data-k-side")).toBe("UNDER");
    expect(byPitcher.get("Under Guy")?.getAttribute("data-k-odds")).toBe("-130"); // side-correct under price
  });

  it("renders a single row safely and shows no chrome", () => {
    const selection = selectConfirmedKRows({ rows: [kRow({ pitcher: "Solo" })] });
    const artifact = buildKArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "READY_CONFIRMED_SELECTIONS", selectedRows: selection.selected });
    const { container, queryByLabelText } = renderExport(encodeArtifact(artifact));
    expect(container.querySelectorAll("[data-k-row]")).toHaveLength(1);
    expect(queryByLabelText("MLB platform navigation")).toBeNull();
    expect(container.querySelector('[data-x-export="mlb-k-social"]')).not.toBeNull();
  });

  it("shows a no-rows message for an empty selection", () => {
    const artifact = buildKArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "SKIPPED_NO_CONFIRMED_SELECTIONS", selectedRows: [] });
    const { container, getByTestId } = renderExport(encodeArtifact(artifact));
    expect(container.querySelectorAll("[data-k-row]")).toHaveLength(0);
    expect(getByTestId("k-x-export-no-rows")).toBeTruthy();
  });
});
