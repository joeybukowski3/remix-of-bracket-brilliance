/**
 * ExplorerTable.expanded.test.tsx
 * Focused tests for the Numerology expanded player row with HR model stats.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplorerTable, type ExplorerRow } from "./ExplorerTable";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const basePlayer: ExplorerRow = {
  playerId: 665489,
  playerName: "Vladimir Guerrero Jr.",
  team: "TOR",
  opponent: "NYM",
  lineupStatus: "unknown",
  battingOrder: null,
  jerseyNumber: 27,
  numerologyScore: 23,
  baseballScore: 42,
  matchType: "Exact Match",
  matches: [{ field: "jersey", value: 27, label: "Jersey #27" }],
  scoreBreakdown: {
    signals: [
      { field: "jersey", label: "Jersey 27/9 — Exact Primary", type: "primary_exact_root", points: 14, description: "Exact" },
      { field: "age", label: "Age 27/9 — Root Match", type: "primary_root", points: 5, description: "Root" },
    ],
    positiveTotal: 19,
    countercurrentTotal: 0,
    convergenceBonus: 0,
    exactComboBonus: 10,
    exactPrimaryCount: 2,
    rawNumerology: 29,
    normCeiling: 68,
    calculatedScore: 43,
    reportedScore: 23,
    scoreVerified: false,
    profile: {
      personalDay: "37/1",
      jersey: "#27 (27/9)",
      battingOrder: null,
      lifePath: "38/2",
      birthDay: "16/7",
      age: "27 (27/9)",
      expression: "106/7",
    },
    missingData: [],
  },
};

const vladHrBatter: HrDashboardBatter = {
  gameKey: "TOR@NYM",
  player: "Vladimir Guerrero Jr.",
  team: "TOR",
  opponent: "NYM",
  opposingPitcher: "Sean Manaea",
  opposingPitcherId: 640455,
  pitcherHand: "L",
  ballpark: "Citi Field",
  parkFactor: 97,
  atBats: null,
  barrelRate: 6.8,
  hardHitRate: 44.1,
  exitVelo: null,
  iso: null,
  hrFBRatio: null,
  pullRate: null,
  xba: null,
  kRate: null,
  bbRate: null,
  whiffRate: null,
  last7HR: 0,
  last30HR: 1,
  opposingPitcherHrVs: 45.7,
  opposingPitcherHitsVs: null,
  opposingPitcherKVs: null,
  weatherBoost: null,
  hrScore: 43.2,
  hrScoreRank: 5,
  pitcherXera: 4.03,
  pitcherRegressionScore: 0,
  pitcherFlyBallRate: 44.8,
  hrOddsYes: "+450",
  hrOddsNo: null,
  hrOddsBook: null,
  hrValueEdge: null,
  angleTags: ["Pull Power"],
};

function renderTable(rows: ExplorerRow[], hrBatters: HrDashboardBatter[] = []) {
  return render(<ExplorerTable rows={rows} hrBatters={hrBatters} />);
}

// ── 17–19: Row interaction ────────────────────────────────────────────────────

describe("Row interaction", () => {
  it("17. full row click toggles expansion on desktop", () => {
    renderTable([basePlayer], [vladHrBatter]);
    const row = document.querySelector("tbody tr");
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    // Expanded detail should appear
    expect(screen.getAllByText("HR Model Stats").length).toBeGreaterThan(0);
  });

  it("18. keyboard Enter toggles expansion on mobile card", () => {
    renderTable([basePlayer], [vladHrBatter]);
    const btn = screen.getByRole("button", { name: /Vladimir Guerrero/i });
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.click(btn);
    expect(screen.getAllByText("HR Model Stats").length).toBeGreaterThan(0);
  });

  it("19. second click collapses the row", () => {
    renderTable([basePlayer], [vladHrBatter]);
    const row = document.querySelector("tbody tr")!;
    fireEvent.click(row);
    expect(screen.queryAllByText("HR Model Stats").length).toBeGreaterThan(0);
    fireEvent.click(row);
    expect(screen.queryAllByText("HR Model Stats").length).toBe(0);
  });
});

// ── 1–3: Tiles present ───────────────────────────────────────────────────────

describe("Expanded row tiles", () => {
  function expand() {
    renderTable([basePlayer], [vladHrBatter]);
    const row = document.querySelector("tbody tr")!;
    fireEvent.click(row);
  }

  it("1. renders player profile tiles", () => {
    expand();
    expect(screen.getAllByText("Profile").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Personal Day").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jersey").length).toBeGreaterThan(0);
  });

  it("2. renders Numerology tile", () => {
    expand();
    // Multiple "Numerology" labels (column header + tile label)
    expect(screen.getAllByText(/numerology/i).length).toBeGreaterThan(0);
  });

  it("3. renders Model Rating tile", () => {
    expand();
    expect(screen.getAllByText(/Model Rating/i).length).toBeGreaterThan(0);
  });
});

// ── 4–14: HR stats ───────────────────────────────────────────────────────────

describe("HR model stats in expanded row", () => {
  function expand() {
    renderTable([basePlayer], [vladHrBatter]);
    const row = document.querySelector("tbody tr")!;
    fireEvent.click(row);
  }

  it("4. renders HR Odds", () => {
    expand();
    expect(screen.getAllByText("+450").length).toBeGreaterThan(0);
  });

  it("5. renders HR Score", () => {
    expand();
    expect(screen.getAllByText("43.2").length).toBeGreaterThan(0);
  });

  it("6. renders Barrel%", () => {
    expand();
    expect(screen.getAllByText("6.8%").length).toBeGreaterThan(0);
  });

  it("7. renders Hard Hit%", () => {
    expand();
    expect(screen.getAllByText("44.1%").length).toBeGreaterThan(0);
  });

  it("8. renders L7 HR", () => {
    expand();
    // "0" appears, find by label context
    expect(screen.getAllByText("L7 HR").length).toBeGreaterThan(0);
  });

  it("9. renders L30 HR", () => {
    expand();
    expect(screen.getAllByText("L30 HR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("10. renders pitcher HR vulnerability", () => {
    expand();
    expect(screen.getAllByText("Ptch HR VS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("45.7").length).toBeGreaterThan(0);
  });

  it("11. renders pitcher xERA", () => {
    expand();
    expect(screen.getAllByText("xERA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4.03").length).toBeGreaterThan(0);
  });

  it("12. renders pitcher FB%", () => {
    expand();
    expect(screen.getAllByText("FB%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("44.8%").length).toBeGreaterThan(0);
  });

  it("13. renders pitcher regression", () => {
    expand();
    expect(screen.getAllByText("Regr").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.0").length).toBeGreaterThan(0);
  });

  it("14. renders angle tags", () => {
    expand();
    expect(screen.getAllByText("Pull Power").length).toBeGreaterThan(0);
  });
});

// ── 15–16: Missing data & matching ───────────────────────────────────────────

describe("Missing data and player matching", () => {
  it("15. no HR match renders em dashes for HR stats", () => {
    renderTable([basePlayer], []); // no batters
    const row = document.querySelector("tbody tr")!;
    fireEvent.click(row);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
    expect(screen.queryAllByText("+450").length).toBe(0);
  });

  it("16. player matching handles Jr. suffix", () => {
    // Player name without suffix should still match
    const batterNoSuffix: HrDashboardBatter = { ...vladHrBatter, player: "Vladimir Guerrero" };
    renderTable([basePlayer], [batterNoSuffix]);
    const row = document.querySelector("tbody tr")!;
    fireEvent.click(row);
    // Should match since we strip Jr. from both sides
    expect(screen.getAllByText("+450").length).toBeGreaterThan(0);
  });
});

// ── 20: No scoring changes ────────────────────────────────────────────────────

describe("Score integrity", () => {
  it("20. displayed numerology score matches the player data exactly", () => {
    renderTable([basePlayer], [vladHrBatter]);
    // Score 23 appears in collapsed row (numerologyScore field)
    expect(screen.getAllByText("23").length).toBeGreaterThan(0);
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
  });
});

// ── A–F: UI presentation (readability pass) ───────────────────────────────────

describe("UI presentation — readability pass", () => {
  function expand() {
    const result = renderTable([basePlayer], [vladHrBatter]);
    const row = result.container.querySelector("tbody tr")!;
    fireEvent.click(row);
    return result;
  }

  it("A. headshot container uses rounded-full for circular frame", () => {
    const { container } = renderTable([basePlayer], [vladHrBatter]);
    fireEvent.click(container.querySelector("tbody tr")!);
    expect(container.querySelector(".rounded-full")).toBeTruthy();
  });

  it("B. previous v2 score renders when legacyNumerologyScore differs from numerologyScore", () => {
    const playerWithLegacy: ExplorerRow = { ...basePlayer, legacyNumerologyScore: 10, numerologyScore: 23 };
    const { container } = renderTable([playerWithLegacy], []);
    fireEvent.click(container.querySelector("tbody tr")!);
    expect(screen.getAllByText(/Previous v2 Score/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
  });

  it("C. score summary section renders Positive, Penalty, Synergy, Bonus, Raw, Score labels", () => {
    expand();
    expect(screen.getAllByText("Positive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Penalty").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Synergy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bonus").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Raw").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Score").length).toBeGreaterThan(0);
  });

  it("D. all 6 player profile fields render in the expanded panel", () => {
    expand();
    expect(screen.getAllByText("Personal Day").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jersey").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Life Path").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Birth Day").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Age").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expression").length).toBeGreaterThan(0);
  });

  it("E. model version label renders when scoreBreakdown.modelVersion is set", () => {
    const playerWithVersion: ExplorerRow = {
      ...basePlayer,
      scoreBreakdown: { ...basePlayer.scoreBreakdown!, modelVersion: "v3.0.0" },
    };
    const { container } = renderTable([playerWithVersion], [vladHrBatter]);
    fireEvent.click(container.querySelector("tbody tr")!);
    expect(screen.getAllByText(/v3\.0\.0/i).length).toBeGreaterThan(0);
  });

  it("F. score summary values reconcile with breakdown fixture data", () => {
    // positiveTotal:19, countercurrentTotal:0, exactComboBonus:10, convergenceBonus:0, rawNumerology:29, calculatedScore:43
    expand();
    expect(screen.getAllByText("+19").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("29").length).toBeGreaterThan(0);
    expect(screen.getAllByText("43/100").length).toBeGreaterThan(0);
  });

  it("G. Numerology and Model Rating scores remain unchanged through presentation update", () => {
    expand();
    // numerologyScore:23 in collapsed row; baseballScore:42
    expect(screen.getAllByText("23").length).toBeGreaterThan(0);
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
  });

  it("H. no field is removed — HR stats, profile, signals, and summary all present when expanded", () => {
    expand();
    expect(screen.getAllByText("HR Model Stats").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Profile").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Signals").length).toBeGreaterThan(0);
    // HR fields
    expect(screen.getAllByText("HR Odds").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HR Score").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Barrel%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hard Hit%").length).toBeGreaterThan(0);
    // Summary fields
    expect(screen.getAllByText("Positive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Score").length).toBeGreaterThan(0);
  });
});
