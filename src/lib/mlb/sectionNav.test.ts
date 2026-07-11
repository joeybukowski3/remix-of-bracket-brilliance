import { describe, expect, it } from "vitest";
import { isMlbNavItemActive, MLB_NAV_ITEMS, MLB_NAV_SECTIONS } from "./sectionNav";

function itemById(id: string) {
  const item = MLB_NAV_ITEMS.find((entry) => entry.id === id);
  if (!item) throw new Error(`missing nav item ${id}`);
  return item;
}

describe("isMlbNavItemActive", () => {
  it("matches a plain (no-hash) item on exact pathname regardless of hash", () => {
    const hrProps = itemById("hr-props");
    expect(isMlbNavItemActive("/mlb/hr-props", "", hrProps)).toBe(true);
    expect(isMlbNavItemActive("/mlb/hr-props", "#overdue", hrProps)).toBe(true);
  });

  it("does not match a different pathname", () => {
    const hrProps = itemById("hr-props");
    expect(isMlbNavItemActive("/mlb/strikeout-props", "", hrProps)).toBe(false);
  });

  it("requires exact hash equality for hash-bearing items", () => {
    const moneylines = itemById("moneyline-edges");
    expect(isMlbNavItemActive("/mlb", "#moneylines", moneylines)).toBe(true);
    expect(isMlbNavItemActive("/mlb", "#pitcher-regression", moneylines)).toBe(false);
    expect(isMlbNavItemActive("/mlb", "", moneylines)).toBe(false);
  });

  it("does not mark any hash-scoped item active on the bare /mlb home state", () => {
    const gameMatchups = itemById("game-matchups");
    const moneylines = itemById("moneyline-edges");
    expect(isMlbNavItemActive("/mlb", "", gameMatchups)).toBe(false);
    expect(isMlbNavItemActive("/mlb", "", moneylines)).toBe(false);
  });

  it("Game Matchups stays active for any #game-<id> hash via activeHashPrefixes", () => {
    const gameMatchups = itemById("game-matchups");
    expect(isMlbNavItemActive("/mlb", "#game-716463", gameMatchups)).toBe(true);
    expect(isMlbNavItemActive("/mlb", "#game-1", gameMatchups)).toBe(true);
    expect(isMlbNavItemActive("/mlb", "#schedule", gameMatchups)).toBe(true);
  });

  it("Game Matchups does not activate on an unrelated hash", () => {
    const gameMatchups = itemById("game-matchups");
    expect(isMlbNavItemActive("/mlb", "#moneylines", gameMatchups)).toBe(false);
  });

  it("HR Props sub-anchors (Overdue Batters, Biggest Mismatches) require both pathname and exact hash", () => {
    const overdue = itemById("overdue-batters");
    const mismatches = itemById("biggest-mismatches");
    expect(isMlbNavItemActive("/mlb/hr-props", "#overdue", overdue)).toBe(true);
    expect(isMlbNavItemActive("/mlb/hr-props", "#mismatches", overdue)).toBe(false);
    expect(isMlbNavItemActive("/mlb/hr-props", "#mismatches", mismatches)).toBe(true);
    expect(isMlbNavItemActive("/mlb/strikeout-props", "#overdue", overdue)).toBe(false);
  });

  it("the Prop Optimizer utility CTA is active on /mlb/props", () => {
    const propOptimizer = itemById("prop-optimizer");
    expect(propOptimizer.href).toBe("/mlb/props");
    expect(isMlbNavItemActive("/mlb/props", "", propOptimizer)).toBe(true);
  });
});

describe("MLB_NAV_SECTIONS", () => {
  it("has no duplicate item ids across sections (single source of truth, no accidental dupes)", () => {
    const ids = MLB_NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves the main/Tables/Utilities grouping used by the sidebar", () => {
    expect(MLB_NAV_SECTIONS.map((section) => section.label)).toEqual([null, "Tables", "Utilities"]);
  });
});
