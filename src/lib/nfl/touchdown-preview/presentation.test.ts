import { describe, expect, it } from "vitest";
import type { TouchdownPosition, TouchdownPreviewPlayer, TouchdownWindowMetrics } from "./types";
import {
  DEFAULT_TOUCHDOWN_SORT,
  OPPONENT_POSITION_TD_ALLOWED_LABEL,
  buildTouchdownBoardHeat,
  formatTouchdownMatchupLabel,
  nextTouchdownSort,
  sortTouchdownPlayers,
  touchdownBoardPercentile,
  touchdownMatchupKey,
  type TouchdownSortKey,
} from "./presentation";

describe("board sort surface", () => {
  it("no longer exposes a market-implied board sort key", () => {
    const boardKeys: TouchdownSortKey[] = [
      "player", "opponent", "score", "anytimeTd", "tdPerGame", "tdLast5",
      "teamUsage", "oppTdVsPosSeason", "oppTdVsPosLast5",
    ];
    expect(boardKeys as string[]).not.toContain("marketImplied");
    // Cycling any real board key stays well-defined without the removed control.
    expect(nextTouchdownSort(DEFAULT_TOUCHDOWN_SORT, "anytimeTd")).toEqual({ key: "anytimeTd", direction: "desc" });
  });
});

describe("touchdownMatchupKey", () => {
  it("is stable regardless of which team is passed first (NE @ SEA)", () => {
    expect(touchdownMatchupKey("ne", "sea")).toBe(touchdownMatchupKey("sea", "ne"));
  });

  it("is stable regardless of which team is passed first for another matchup", () => {
    expect(touchdownMatchupKey("buf", "mia")).toBe(touchdownMatchupKey("mia", "buf"));
  });

  it("normalizes casing and known team aliases through the shared identity normalizer", () => {
    expect(touchdownMatchupKey("NE", "SEA")).toBe(touchdownMatchupKey("ne", "sea"));
    expect(touchdownMatchupKey("LA", "SF")).toBe(touchdownMatchupKey("LAR", "sf"));
    expect(touchdownMatchupKey("WAS", "dal")).toBe(touchdownMatchupKey("wsh", "dal"));
  });

  it("produces the expected canonical key", () => {
    expect(touchdownMatchupKey("sea", "ne")).toBe("ne@sea");
  });
});

describe("formatTouchdownMatchupLabel", () => {
  it("renders a spaced label from the canonical key", () => {
    expect(formatTouchdownMatchupLabel("ne@sea")).toBe("ne @ sea");
  });
});

describe("buildTouchdownBoardHeat", () => {
  const mk = (position: TouchdownPosition, tdPerGame: number, tdLast5PerGame: number, teamUsageShare: number): TouchdownPreviewPlayer => {
    const metrics = { tdPerGame, tdLast5PerGame, teamUsageShare } as unknown as TouchdownWindowMetrics;
    return { position, windows: { "2025": metrics, "2026": metrics, last8: metrics } } as unknown as TouchdownPreviewPlayer;
  };

  it("grades a raw value against the full pool, not the player's position", () => {
    const heat = buildTouchdownBoardHeat(
      [mk("WR", 1, 1, 0.2), mk("RB", 1, 1, 0.2), mk("TE", 3, 3, 0.5)],
      "2025",
    );
    // Bottom of a 3-value pool -> 0th percentile; top -> above 0.
    expect(touchdownBoardPercentile(1, heat.tdPerGame)).toBe(0);
    expect(touchdownBoardPercentile(3, heat.tdPerGame)).toBeGreaterThan(0);
  });

  it("maps identical raw values to an identical percentile across positions", () => {
    const heat = buildTouchdownBoardHeat(
      [mk("WR", 2, 2, 0.3), mk("RB", 2, 2, 0.1), mk("QB", 0.5, 0.5, 0.05)],
      "2025",
    );
    const wr = touchdownBoardPercentile(2, heat.tdPerGame);
    const rb = touchdownBoardPercentile(2, heat.tdPerGame);
    expect(wr).toBe(rb);
    expect(wr).toBeGreaterThan(0);
  });

  it("returns null for a value outside the pool or a missing value", () => {
    const heat = buildTouchdownBoardHeat([mk("WR", 1, 1, 0.2), mk("RB", 2, 2, 0.3)], "2025");
    expect(touchdownBoardPercentile(9, heat.tdPerGame)).toBeNull();
    expect(touchdownBoardPercentile(null, heat.tdPerGame)).toBeNull();
  });
});

describe("Opponent column sorting", () => {
  const row = (playerName: string, team: string, opponent: string): TouchdownPreviewPlayer => {
    const metrics = { jkbTdScore: 50 } as unknown as TouchdownWindowMetrics;
    return { playerName, team, opponent, windows: { "2025": metrics, "2026": metrics, last8: metrics } } as unknown as TouchdownPreviewPlayer;
  };

  it("first click on Opponent sorts ascending, like the Player/text columns", () => {
    expect(nextTouchdownSort(DEFAULT_TOUCHDOWN_SORT, "opponent")).toEqual({ key: "opponent", direction: "asc" });
  });

  it("orders by row.opponent (A–Z), never by the player's own team", () => {
    const rows = [
      row("Zeb", "was", "buf"), // team sorts last, opponent sorts first
      row("Amy", "buf", "was"), // team sorts first, opponent sorts last
      row("Moe", "phi", "nyg"),
    ];
    const sorted = sortTouchdownPlayers(rows, "2025", { key: "opponent", direction: "asc" });
    expect(sorted.map((r) => r.opponent)).toEqual(["buf", "nyg", "was"]);
    expect(sorted.map((r) => r.playerName)).toEqual(["Zeb", "Moe", "Amy"]);
  });
});

describe("OPPONENT_POSITION_TD_ALLOWED_LABEL", () => {
  it("labels the QB metric as rushing TD allowance, not a generic TD label", () => {
    expect(OPPONENT_POSITION_TD_ALLOWED_LABEL.QB).toBe("QB Rush TD Allowed");
  });

  it("gives every position a distinct, non-ambiguous label", () => {
    const labels = Object.values(OPPONENT_POSITION_TD_ALLOWED_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label).not.toBe("TD");
  });
});
