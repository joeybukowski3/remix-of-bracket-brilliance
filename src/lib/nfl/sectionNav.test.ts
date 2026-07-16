import { describe, expect, it } from "vitest";
import { NFL_SECTION_NAV_ITEMS, isNflSectionPathActive } from "@/lib/nfl/sectionNav";

describe("NFL section navigation", () => {
  it("contains the eight major NFL destinations, guide home first", () => {
    expect(NFL_SECTION_NAV_ITEMS.map((item) => item.to)).toEqual([
      "/nfl",
      "/nfl/guide",
      "/nfl-guide/",
      "/nfl/power-ratings",
      "/nfl/standings",
      "/nfl/super-bowl",
      "/nfl/coach-of-year",
      "/nfl/guide/regression",
    ]);
  });

  it("has unique targets and unique short labels", () => {
    expect(new Set(NFL_SECTION_NAV_ITEMS.map((item) => item.to)).size).toBe(NFL_SECTION_NAV_ITEMS.length);
    expect(new Set(NFL_SECTION_NAV_ITEMS.map((item) => item.shortLabel)).size).toBe(
      NFL_SECTION_NAV_ITEMS.length,
    );
  });

  it("keeps team dashboards grouped under the full guide, not the guide home", () => {
    expect(isNflSectionPathActive("/nfl/guide/team/seattle-seahawks", "/nfl/guide")).toBe(true);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide")).toBe(false);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide/regression")).toBe(true);
    expect(isNflSectionPathActive("/nfl/guide/team/seattle-seahawks", "/nfl")).toBe(false);
  });

  it("treats /nfl-guide and /nfl-guide/ as the same active destination", () => {
    expect(isNflSectionPathActive("/nfl-guide", "/nfl-guide/")).toBe(true);
    expect(isNflSectionPathActive("/nfl-guide/", "/nfl-guide/")).toBe(true);
  });

  it("only marks the guide home active on an exact /nfl match", () => {
    expect(isNflSectionPathActive("/nfl", "/nfl")).toBe(true);
    expect(isNflSectionPathActive("/nfl/power-ratings", "/nfl")).toBe(false);
  });
});
