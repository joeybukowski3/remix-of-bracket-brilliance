import { describe, expect, it } from "vitest";
import { buildStatusAvailability } from "@/lib/fantasy/rosResearch/statusAvailability";

const universe = [
  { playerId: "gsis:00-0000001", playerName: "Active Player", position: "WR" as const },
  { playerId: "gsis:00-0000002", playerName: "Reserve Player", position: "RB" as const },
  { playerId: "gsis:00-0000003", playerName: "Off Roster Released", position: "WR" as const },
  { playerId: "gsis:00-0000004", playerName: "Off Roster Suspended", position: "WR" as const },
  { playerId: "gsis:00-0000005", playerName: "Unmapped Code", position: "TE" as const },
  { playerId: "gsis:00-0000006", playerName: "No Data Anywhere", position: "QB" as const },
];

const currentSeasonRosterRows = [
  { gsisId: "00-0000001", team: "KC", rawStatus: "ACT" },
  { gsisId: "00-0000002", team: "SF", rawStatus: "RES" },
];

const masterTableRows = [
  { gsisId: "00-0000003", team: null, rawStatus: "RLS" },
  { gsisId: "00-0000004", team: null, rawStatus: "SUS" },
  { gsisId: "00-0000005", team: null, rawStatus: "ZZZ" }, // deliberately unmapped code
];

describe("buildStatusAvailability", () => {
  it("prefers the current-season roster snapshot when a player appears there", () => {
    const result = buildStatusAvailability({
      currentSeasonRosterRows,
      currentSeasonAsOf: "2026-08-22",
      masterTableRows,
      masterTableAsOf: "2026-08-21",
      universe,
    });
    const active = result.players.find((p) => p.playerId === "gsis:00-0000001")!;
    expect(active.status).toEqual({ category: "active", rawCode: "ACT", source: "current-season-roster", sourceTeam: "KC", asOf: "2026-08-22" });
  });

  it("falls back to the master player table only when absent from the current-season snapshot", () => {
    const result = buildStatusAvailability({
      currentSeasonRosterRows,
      currentSeasonAsOf: "2026-08-22",
      masterTableRows,
      masterTableAsOf: "2026-08-21",
      universe,
    });
    const released = result.players.find((p) => p.playerId === "gsis:00-0000003")!;
    expect(released.status).toEqual({ category: "released", rawCode: "RLS", source: "master-player-table", sourceTeam: null, asOf: "2026-08-21" });
    const suspended = result.players.find((p) => p.playerId === "gsis:00-0000004")!;
    expect(suspended.status.category).toBe("suspended");
  });

  it("never guesses a category for a raw code not in the literal map -- resolves to unknown", () => {
    const result = buildStatusAvailability({
      currentSeasonRosterRows,
      currentSeasonAsOf: "2026-08-22",
      masterTableRows,
      masterTableAsOf: "2026-08-21",
      universe,
    });
    const unmapped = result.players.find((p) => p.playerId === "gsis:00-0000005")!;
    expect(unmapped.status.category).toBe("unknown");
    expect(unmapped.status.rawCode).toBe("ZZZ"); // raw code preserved even though uncategorized
  });

  it("resolves to unknown/none when a player is in neither source, without fabricating a status", () => {
    const result = buildStatusAvailability({
      currentSeasonRosterRows,
      currentSeasonAsOf: "2026-08-22",
      masterTableRows,
      masterTableAsOf: "2026-08-21",
      universe,
    });
    const missing = result.players.find((p) => p.playerId === "gsis:00-0000006")!;
    expect(missing.status).toEqual({ category: "unknown", rawCode: null, source: "none", sourceTeam: null, asOf: null });
  });

  it("counts totals and per-category/per-source breakdowns correctly", () => {
    const result = buildStatusAvailability({
      currentSeasonRosterRows,
      currentSeasonAsOf: "2026-08-22",
      masterTableRows,
      masterTableAsOf: "2026-08-21",
      universe,
    });
    expect(result.counts.totalPlayers).toBe(6);
    expect(result.counts.byCategory.active).toBe(1);
    expect(result.counts.byCategory.reserve).toBe(1);
    expect(result.counts.byCategory.released).toBe(1);
    expect(result.counts.byCategory.suspended).toBe(1);
    expect(result.counts.byCategory.unknown).toBe(2); // unmapped code + no data anywhere
    expect(result.counts.bySource["current-season-roster"]).toBe(2);
    expect(result.counts.bySource["master-player-table"]).toBe(3);
    expect(result.counts.bySource.none).toBe(1);
  });
});
