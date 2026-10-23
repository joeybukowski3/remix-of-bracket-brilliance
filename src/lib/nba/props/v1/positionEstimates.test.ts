import { describe, expect, it } from "vitest";
import { fixturePositionsFile } from "../__fixtures__/v1Fixtures";
import { buildEstimateSet, dvpLabelFor, estimateKey, parsePositionEstimates, POSITION_ESTIMATES_SCHEMA } from "./positionEstimates";

const file = (over: Record<string, unknown> = {}, players: unknown[] = [{ playerId: "p1", name: "Demo One", team: "BOS", primary: "PG", secondary: ["SG"], role: "starter" }]) => ({
  schemaVersion: POSITION_ESTIMATES_SCHEMA,
  season: "2026-27",
  asOfUtc: "2026-10-22T00:00:00Z",
  sourceNote: "invented depth chart for tests",
  players,
  overrides: [],
  ...over,
});

describe("parsePositionEstimates", () => {
  it("returns one estimate per player, always marked estimated, never verified", () => {
    const [estimate] = parsePositionEstimates(file());
    expect(estimate).toMatchObject({ season: "2026-27", playerId: "p1", team: "BOS", primary: "PG", secondary: ["SG"], role: "starter", status: "estimated", basis: "projected-depth-chart", overridden: false });
    expect(estimate.sourceNote).toBe("invented depth chart for tests");
  });

  it("labels bench players by rotation role, and orders secondaries PG..C", () => {
    const [e] = parsePositionEstimates(file({}, [{ playerId: "p2", name: "Demo Two", team: "BOS", primary: "SF", secondary: ["C", "PG"], role: "bench" }]));
    expect(e.basis).toBe("rotation-role");
    expect(e.secondary).toEqual(["PG", "C"]);
  });

  it("canonicalizes team aliases", () => {
    expect(parsePositionEstimates(file({}, [{ playerId: "p1", name: "Demo One", team: "PHO", primary: "C", role: "starter" }]))[0].team).toBe("PHX");
  });

  it("applies a manual override over the depth chart and flags it with its reason", () => {
    const [e] = parsePositionEstimates(file({ overrides: [{ playerId: "p1", primary: "SF", secondary: ["PF"], reason: "plays the wing next to two bigs" }] }));
    expect(e).toMatchObject({ primary: "SF", secondary: ["PF"], overridden: true, overrideReason: "plays the wing next to two bigs", basis: "manual-override", status: "estimated" });
  });

  it.each([
    ["an override without a reason", file({ overrides: [{ playerId: "p1", primary: "SF", reason: "" }] })],
    ["an override for an unknown player", file({ overrides: [{ playerId: "zz", primary: "SF", reason: "no such player here" }] })],
    ["two overrides for one player", file({ overrides: [{ playerId: "p1", primary: "SF", reason: "first reason" }, { playerId: "p1", primary: "PF", reason: "second reason" }] })],
    ["a duplicate player", file({}, [{ playerId: "p1", name: "A", team: "BOS", primary: "PG", role: "starter" }, { playerId: "p1", name: "B", team: "BOS", primary: "SG", role: "bench" }])],
    ["an unknown team", file({}, [{ playerId: "p1", name: "A", team: "XXX", primary: "PG", role: "starter" }])],
    ["a primary also listed as secondary", file({}, [{ playerId: "p1", name: "A", team: "BOS", primary: "PG", secondary: ["PG"], role: "starter" }])],
    ["a repeated secondary", file({}, [{ playerId: "p1", name: "A", team: "BOS", primary: "PG", secondary: ["SG", "SG"], role: "starter" }])],
    ["a generic position", file({}, [{ playerId: "p1", name: "A", team: "BOS", primary: "G", role: "starter" }])],
    ["a missing source note", file({ sourceNote: "" })],
    ["a file with no players", file({}, [])],
    ["an unsupported season", file({ season: "2024-25" })],
    ["a non-UTC as-of time", file({ asOfUtc: "2026-10-22" })],
  ])("rejects the whole file for %s", (_name, raw) => {
    expect(() => parsePositionEstimates(raw)).toThrow();
  });
});

describe("buildEstimateSet and season isolation", () => {
  const set = buildEstimateSet([fixturePositionsFile("2025-26", ["MIA-8"]), fixturePositionsFile("2026-27")]);

  it("keys every estimate by season and player", () => {
    expect(set.get(estimateKey("2026-27", "BOS-1"))?.primary).toBe("PG");
    expect(set.get(estimateKey("2025-26", "BOS-3"))?.primary).toBe("SF");
  });

  it("never applies a 2026-27 position to a 2025-26 game: a player missing from the 2025-26 file has no 2025-26 position", () => {
    expect(dvpLabelFor(set, "2026-27", "MIA-8")).toBe("C");
    expect(dvpLabelFor(set, "2025-26", "MIA-8")).toBeNull();
    expect(dvpLabelFor(set, "2025-26", "DEN-9")).toBeNull();
  });

  it("keeps each season's own team and as-of date", () => {
    expect(set.get(estimateKey("2025-26", "BOS-1"))?.asOfUtc).toBe("2026-04-10T00:00:00Z");
    expect(set.get(estimateKey("2026-27", "BOS-1"))?.asOfUtc).toBe("2026-10-22T00:00:00Z");
  });

  it("refuses two files for one season", () => {
    expect(() => buildEstimateSet([file(), file()])).toThrow(/two position files for 2026-27/);
  });
});
