import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MlbHrPropsXExport from "./MlbHrPropsXExport";
import { buildHrArtifact, encodeArtifact } from "../../scripts/lib/mlb-x-selection-artifact.mjs";
import { selectConfirmedHrProps } from "../../scripts/lib/mlb-hr-x-selection-core.mjs";

const snapshot = { ok: true, asOf: "2026-07-12T15:00:00Z", timing: { earliestGameTime: "2026-07-12T17:00:00Z", minutesUntilFirstPitch: 75, phase: "PREFERRED" } };

function renderExport(encoded: string | null) {
  const path = encoded ? `/mlb/hr-props/x-export?d=${encoded}` : "/mlb/hr-props/x-export";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mlb/hr-props/x-export" element={<MlbHrPropsXExport />} />
      </Routes>
    </MemoryRouter>,
  );
}

function batter(player: string, hrScore: number, lineupStatus: string, battingOrder: number, extra: Record<string, unknown> = {}) {
  return { player, team: "NYY", opponent: "BOS", hrScore, hrScoreRank: 100 - hrScore, lineupStatus, battingOrder, playerId: player.length, gameId: 700, ...extra };
}

describe("MlbHrPropsXExport route", () => {
  it("renders exactly the selected confirmed rows, excludes the projected top player, includes backfill", () => {
    // Top by score: A(proj) B(conf) C(proj) D(conf) E(conf) -> B, D, E
    const batters = [
      batter("A", 40, "projected", 1),
      batter("B", 38, "confirmed", 2),
      batter("C", 36, "projected", 3),
      batter("D", 34, "confirmed", 4),
      batter("E", 32, "confirmed", 5),
    ];
    const selection = selectConfirmedHrProps({ batters });
    const artifact = buildHrArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "READY_CONFIRMED_SELECTIONS", selectedRows: selection.selected });
    const { container } = renderExport(encodeArtifact(artifact));

    const rows = container.querySelectorAll("[data-hr-row]");
    expect(rows).toHaveLength(3);
    const players = Array.from(rows).map((r) => r.getAttribute("data-hr-player"));
    expect(players).toEqual(["B", "D", "E"]);
    expect(players).not.toContain("A"); // projected top player absent
    expect(players).not.toContain("C");
  });

  it("renders a smaller table when only one confirmed hitter qualifies", () => {
    const artifact = buildHrArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [{ player: "Solo Confirmed", team: "LAD", opponent: "SF", battingOrder: 2, hrScore: 40, hrOddsYes: "+250", playerId: 1, gameId: 10 }],
    });
    const { container } = renderExport(encodeArtifact(artifact));
    expect(container.querySelectorAll("[data-hr-row]")).toHaveLength(1);
  });

  it("has no site header or MLB sidebar chrome", () => {
    const artifact = buildHrArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "READY_CONFIRMED_SELECTIONS", selectedRows: [batter("B", 38, "confirmed", 2)] });
    const { container, queryByLabelText, queryByRole } = renderExport(encodeArtifact(artifact));
    expect(container.querySelector('[data-x-export="mlb-hr-social"]')).not.toBeNull();
    expect(queryByLabelText("MLB platform navigation")).toBeNull();
    expect(queryByLabelText("MLB sitemap")).toBeNull();
    expect(queryByRole("banner")).toBeNull();
  });

  it("renders a long player name without breaking the row structure", () => {
    const artifact = buildHrArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [{ player: "Vladimir Guerrero Jr. Extra-Long Testing Name", team: "TOR", opponent: "TB", battingOrder: 3, hrScore: 36.5, hrOddsYes: "+350", playerId: 1, gameId: 10 }],
    });
    const { container } = renderExport(encodeArtifact(artifact));
    const row = container.querySelector("[data-hr-row]");
    expect(row?.getAttribute("data-hr-player")).toBe("Vladimir Guerrero Jr. Extra-Long Testing Name");
  });

  it("shows a no-rows message for an empty selection and renders no data rows", () => {
    const artifact = buildHrArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "SKIPPED_NO_CONFIRMED_SELECTIONS", selectedRows: [] });
    const { container, getByTestId } = renderExport(encodeArtifact(artifact));
    expect(container.querySelectorAll("[data-hr-row]")).toHaveLength(0);
    expect(getByTestId("hr-x-export-no-rows")).toBeTruthy();
  });

  it("shows an unavailable message when the artifact param is missing/malformed", () => {
    const { getByTestId } = renderExport(null);
    expect(getByTestId("hr-x-export-unavailable")).toBeTruthy();
  });
});
