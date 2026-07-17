import { describe, expect, it } from "vitest";
import { getMlbNavIconColorClass, isMlbNavItemActive, MLB_NAV_ITEMS, MLB_NAV_SECTIONS } from "./sectionNav";

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

  it("Moneyline Edges links to /mlb#ml-edges-social (the ML Edges social-table tab), not the older #moneylines panel", () => {
    const moneylines = itemById("moneyline-edges");
    expect(moneylines.href).toBe("/mlb#ml-edges-social");
    expect(isMlbNavItemActive("/mlb", "#ml-edges-social", moneylines)).toBe(true);
    expect(isMlbNavItemActive("/mlb", "#pitcher-regression", moneylines)).toBe(false);
    expect(isMlbNavItemActive("/mlb", "#moneylines", moneylines)).toBe(false);
    expect(isMlbNavItemActive("/mlb", "", moneylines)).toBe(false);
  });

  it("does not mark any hash-scoped item active on the bare /mlb home state", () => {
    const gameMatchups = itemById("game-matchups");
    const moneylines = itemById("moneyline-edges");
    expect(isMlbNavItemActive("/mlb", "", gameMatchups)).toBe(false);
    expect(isMlbNavItemActive("/mlb", "", moneylines)).toBe(false);
  });

  it("Social Media Tables links to /mlb#social-tables and requires exact hash equality", () => {
    const socialTables = itemById("social-tables");
    expect(socialTables.href).toBe("/mlb#social-tables");
    expect(isMlbNavItemActive("/mlb", "#social-tables", socialTables)).toBe(true);
    expect(isMlbNavItemActive("/mlb", "#ml-edges-social", socialTables)).toBe(false);
    expect(isMlbNavItemActive("/mlb", "", socialTables)).toBe(false);
    expect(isMlbNavItemActive("/mlb/hr-props", "#social-tables", socialTables)).toBe(false);
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

  it("the Props Hub item is active on /mlb/props", () => {
    const propsHub = itemById("props-hub");
    expect(propsHub.href).toBe("/mlb/props");
    expect(isMlbNavItemActive("/mlb/props", "", propsHub)).toBe(true);
  });
});

describe("MLB_NAV_SECTIONS", () => {
  it("has no duplicate item ids across sections (single source of truth, no accidental dupes)", () => {
    const ids = MLB_NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not expose retired navigation labels", () => {
    expect(MLB_NAV_ITEMS.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["K Props", "Hit Props", "Prop Optimizer"]),
    );
  });

  it("uses the approved sidebar groups and item order", () => {
    expect(MLB_NAV_SECTIONS.map((section) => section.label)).toEqual(["Main", "Models & Specials"]);
    expect(MLB_NAV_SECTIONS[0].items.map(({ label, href }) => [label, href])).toEqual([
      ["Game Matchups", "/mlb#schedule"],
      ["HR Props", "/mlb/hr-props"],
      ["Strikeout Props", "/mlb/strikeout-props"],
      ["Batter vs Pitcher", "/mlb/batter-vs-pitcher"],
      ["Props Hub", "/mlb/props"],
      ["Power Rankings", "/mlb/power-rankings"],
    ]);
    expect(MLB_NAV_SECTIONS[1].items.map(({ label, href }) => [label, href])).toEqual([
      ["Moneyline Edges", "/mlb#ml-edges-social"],
      ["Social Media Tables", "/mlb#social-tables"],
      ["Vulnerable Pitchers", "/mlb/vulnerable-pitchers"],
      ["Overdue Batters", "/mlb/hr-props#overdue"],
      ["Biggest Mismatches", "/mlb/hr-props#mismatches"],
      ["Sin City", "/mlb/sin-city"],
      ["Numerology", "/mlb/numerology"],
    ]);
  });
});

describe("getMlbNavIconColorClass", () => {
  it("gives every icon actually used in MLB_NAV_SECTIONS a real (non-fallback) color", () => {
    for (const item of MLB_NAV_ITEMS) {
      expect(getMlbNavIconColorClass(item.icon)).not.toBe("text-slate-500");
    }
  });

  it("is coordinated: the same icon always resolves to the same color, everywhere it's used", () => {
    // Flame appears on both hr-props and overdue-batters; Swords on both
    // batter-vs-pitcher and biggest-mismatches; BarChart3 on both
    // power-rankings and pitcher-regression -- confirms the mapping is
    // keyed by icon component, not accidentally duplicated per item.
    const hrProps = itemById("hr-props");
    const overdueBatters = itemById("overdue-batters");
    expect(hrProps.icon).toBe(overdueBatters.icon);
    expect(getMlbNavIconColorClass(hrProps.icon)).toBe(getMlbNavIconColorClass(overdueBatters.icon));

    const batterVsPitcher = itemById("batter-vs-pitcher");
    const biggestMismatches = itemById("biggest-mismatches");
    expect(batterVsPitcher.icon).toBe(biggestMismatches.icon);
    expect(getMlbNavIconColorClass(batterVsPitcher.icon)).toBe(getMlbNavIconColorClass(biggestMismatches.icon));

    const powerRankings = itemById("power-rankings");
    const pitcherRegression = itemById("pitcher-regression");
    expect(powerRankings.icon).toBe(pitcherRegression.icon);
    expect(getMlbNavIconColorClass(powerRankings.icon)).toBe(getMlbNavIconColorClass(pitcherRegression.icon));
  });

  it("gives every distinct icon a distinct color, so the sidebar is not visually monochrome", () => {
    const distinctIcons = Array.from(new Set(MLB_NAV_ITEMS.map((item) => item.icon)));
    const colors = distinctIcons.map((icon) => getMlbNavIconColorClass(icon));
    expect(new Set(colors).size).toBe(distinctIcons.length);
  });
});
