import { describe, expect, it } from "vitest";
import { NFL_SECTION_NAV_ITEMS, isNflSectionPathActive } from "@/lib/nfl/sectionNav";

describe("NFL section navigation", () => {
  it("contains the five major NFL destinations", () => {
    expect(NFL_SECTION_NAV_ITEMS.map((item) => item.to)).toEqual([
      "/nfl",
      "/nfl/standings",
      "/nfl/super-bowl",
      "/nfl/guide",
      "/nfl/guide/regression",
    ]);
  });

  it("keeps team dashboards grouped under the 2026 guide", () => {
    expect(isNflSectionPathActive("/nfl/guide/team/seattle-seahawks", "/nfl/guide")).toBe(true);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide")).toBe(false);
    expect(isNflSectionPathActive("/nfl/guide/regression", "/nfl/guide/regression")).toBe(true);
  });
});
