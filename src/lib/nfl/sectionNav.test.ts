import { describe, expect, it } from "vitest";
import {
  NFL_SECTION_NAV_CATEGORIES,
  NFL_SECTION_NAV_ITEMS,
  getActiveNflSectionCategoryId,
  getActiveNflSectionLabel,
  getUniqueNflSectionNavPaths,
  isNflSectionPathActive,
} from "@/lib/nfl/sectionNav";

const LIVE_NFL_ROUTES = new Set([
  "/nfl",
  "/nfl/power-ratings",
  "/16-0",
  "/nfl/standings",
  "/nfl/schedule",
  "/nfl/team-schedules",
  "/nfl/matchups",
  "/nfl/analytics",
  "/nfl/super-bowl",
  "/nfl/coach-of-year",
  "/nfl/guide",
  "/nfl/guide/regression",
  "/fantasy-football",
]);

describe("NFL section navigation", () => {
  it("contains the major NFL destinations in order", () => {
    expect(NFL_SECTION_NAV_ITEMS.map((item) => item.to)).toEqual([
      "/nfl",
      "/nfl/power-ratings",
      "/16-0",
      "/nfl/standings",
      "/nfl/schedule",
      "/nfl/team-schedules",
      "/nfl/matchups",
      "/nfl/analytics",
      "/nfl/super-bowl",
      "/nfl/coach-of-year",
      "/nfl/guide",
      "/nfl/guide/regression",
      "/fantasy-football",
    ]);
  });

  it("exposes Fantasy Football as its own category, active on nested routes", () => {
    expect(getActiveNflSectionCategoryId("/fantasy-football")).toBe("fantasy");
    expect(isNflSectionPathActive("/fantasy-football", "/fantasy-football")).toBe(true);
    expect(isNflSectionPathActive("/fantasy-football/rankings", "/fantasy-football")).toBe(true);
    expect(isNflSectionPathActive("/nfl", "/fantasy-football")).toBe(false);
  });

  it("names the current destination for the mobile menu trigger", () => {
    expect(getActiveNflSectionLabel("/nfl")).toBe("Weekly Command Center");
    expect(getActiveNflSectionLabel("/nfl/power-ratings")).toBe("Power Ratings");
    expect(getActiveNflSectionLabel("/nfl/standings")).toBe("Standings by Division");
    expect(getActiveNflSectionLabel("/nfl/guide/team/seattle-seahawks")).toBe("2026 Team Guide");
    expect(getActiveNflSectionLabel("/fantasy-football")).toBe("Fantasy Football");
    expect(getActiveNflSectionLabel("/mlb")).toBeNull();
  });

  it("keeps Weekly Matchups in the Season category and active on detail routes", () => {
    expect(getActiveNflSectionCategoryId("/nfl/matchups")).toBe("season");
    expect(getActiveNflSectionCategoryId("/nfl/matchups/dallas-cowboys-at-ny-giants")).toBe("season");
    expect(isNflSectionPathActive("/nfl/matchups/dallas-cowboys-at-ny-giants", "/nfl/matchups")).toBe(true);
    // Prefix matching must not bleed into the sibling schedule route.
    expect(isNflSectionPathActive("/nfl/schedule", "/nfl/matchups")).toBe(false);
    expect(isNflSectionPathActive("/nfl/matchups", "/nfl/schedule")).toBe(false);
  });

  it("marks the 16-0 draft game active for its base route and nested routes", () => {
    expect(getActiveNflSectionCategoryId("/16-0")).toBe("overview");
    expect(isNflSectionPathActive("/16-0", "/16-0")).toBe(true);
    expect(isNflSectionPathActive("/16-0/draft", "/16-0")).toBe(true);
    expect(isNflSectionPathActive("/nfl/standings", "/16-0")).toBe(false);
  });

  it("keeps team dashboards grouped under the 2026 guide", () => {
    expect(isNflSectionPathActive("/nfl/guide/team/seattle-seahawks", "/nfl/guide")).toBe(true);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide")).toBe(false);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide/regression")).toBe(true);
  });

  it("opens the active category for route families", () => {
    expect(getActiveNflSectionCategoryId("/nfl")).toBe("overview");
    expect(getActiveNflSectionCategoryId("/nfl/power-ratings")).toBe("overview");
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

  it("carries no per-category colour theme", () => {
    // Categories used to each own a colour (blue / emerald / violet / amber),
    // which made the sidebar a four-colour card stack where the colour encoded
    // nothing. Grouping is positional now; colour is reserved for state.
    for (const category of NFL_SECTION_NAV_CATEGORIES) {
      expect(category as Record<string, unknown>).not.toHaveProperty("themeId");
    }
  });

  it("gives every category a distinct id and a non-empty label", () => {
    const ids = NFL_SECTION_NAV_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of NFL_SECTION_NAV_CATEGORIES) {
      expect(category.label, category.id).toBeTruthy();
    }
  });
});
