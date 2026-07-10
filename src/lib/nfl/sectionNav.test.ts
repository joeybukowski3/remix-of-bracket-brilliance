import { describe, expect, it } from "vitest";
import {
  NFL_SECTION_NAV_CATEGORIES,
  NFL_SECTION_NAV_ITEMS,
  NFL_SECTION_THEMES,
  getActiveNflSectionCategoryId,
  getUniqueNflSectionNavPaths,
  isNflSectionPathActive,
} from "@/lib/nfl/sectionNav";

const LIVE_NFL_ROUTES = new Set([
  "/nfl",
  "/nfl/standings",
  "/nfl/schedule",
  "/nfl/matchups",
  "/nfl/super-bowl",
  "/nfl/coach-of-year",
  "/nfl/guide",
  "/nfl/guide/regression",
]);

describe("NFL section navigation", () => {
  it("contains the major NFL destinations in order", () => {
    expect(NFL_SECTION_NAV_ITEMS.map((item) => item.to)).toEqual([
      "/nfl",
      "/nfl/standings",
      "/nfl/schedule",
      "/nfl/matchups",
      "/nfl/super-bowl",
      "/nfl/coach-of-year",
      "/nfl/guide",
      "/nfl/guide/regression",
    ]);
  });

  it("keeps Weekly Matchups in the Season category and active on detail routes", () => {
    expect(getActiveNflSectionCategoryId("/nfl/matchups")).toBe("season");
    expect(getActiveNflSectionCategoryId("/nfl/matchups/dallas-cowboys-at-ny-giants")).toBe("season");
    expect(isNflSectionPathActive("/nfl/matchups/dallas-cowboys-at-ny-giants", "/nfl/matchups")).toBe(true);
    // Prefix matching must not bleed into the sibling schedule route.
    expect(isNflSectionPathActive("/nfl/schedule", "/nfl/matchups")).toBe(false);
    expect(isNflSectionPathActive("/nfl/matchups", "/nfl/schedule")).toBe(false);
  });

  it("keeps team dashboards grouped under the 2026 guide", () => {
    expect(isNflSectionPathActive("/nfl/guide/team/seattle-seahawks", "/nfl/guide")).toBe(true);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide")).toBe(false);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide/regression")).toBe(true);
  });

  it("opens the active category for route families", () => {
    expect(getActiveNflSectionCategoryId("/nfl")).toBe("overview");
    expect(getActiveNflSectionCategoryId("/nfl/standings")).toBe("season");
    expect(getActiveNflSectionCategoryId("/nfl/guide")).toBe("team-intelligence");
    expect(getActiveNflSectionCategoryId("/nfl/guide/regression")).toBe("team-intelligence");
    expect(getActiveNflSectionCategoryId("/nfl/guide/team/seattle-seahawks")).toBe("team-intelligence");
  });

  it("contains no duplicate clickable paths", () => {
    expect(getUniqueNflSectionNavPaths()).toHaveLength(NFL_SECTION_NAV_ITEMS.length);
  });

  it("only links to live application routes", () => {
    for (const item of NFL_SECTION_NAV_ITEMS) {
      expect(LIVE_NFL_ROUTES.has(item.to), item.to).toBe(true);
    }
  });

  it("keeps future status support in the typed category shape", () => {
    expect(NFL_SECTION_NAV_CATEGORIES.every((category) => category.items.length > 0)).toBe(true);
    expect(NFL_SECTION_NAV_ITEMS.every((item) => item.status == null || ["live", "planned", "beta", "new"].includes(item.status))).toBe(true);
  });

  it("gives every navigation item a meaningful icon instead of an abbreviation marker", () => {
    const abbreviationMarkers = new Set(["PR", "ST", "SC", "SB", "CY", "TG", "FR"]);
    for (const item of NFL_SECTION_NAV_ITEMS) {
      expect(item.icon, item.to).toBeTruthy();
      expect(abbreviationMarkers.has(item.icon), item.to).toBe(false);
      expect(item as Record<string, unknown>).not.toHaveProperty("marker");
    }
  });

  it("gives each category a distinct, resolvable theme identifier", () => {
    const themeIds = NFL_SECTION_NAV_CATEGORIES.map((category) => category.themeId);
    expect(new Set(themeIds).size).toBe(themeIds.length);
    for (const themeId of themeIds) {
      expect(NFL_SECTION_THEMES[themeId]).toBeTruthy();
    }
  });
});
