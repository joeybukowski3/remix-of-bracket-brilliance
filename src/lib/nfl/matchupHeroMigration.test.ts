import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

/**
 * Architecture guard: every current-OVR consumer migrated in Phase 3 must go
 * through the canonical universal resolver/hook, never independently choose
 * (or silently fall back to) the raw v0.3.1 board's own overall rating.
 */
describe("Phase 3: universal current-OVR sourcing guard", () => {
  it("heroModelRatings.ts builds rating/rank/offense/defense all from the canonical current-rating board type", () => {
    const source = readFileSync(join(ROOT, "src", "lib", "nfl", "heroModelRatings.ts"), "utf8");
    expect(source).toContain("CurrentRatingBoard");
    expect(source).toContain("currentRating2026");
    // OFF/DEF are now blended into the same Current Power Board as OVR (Phase 9
    // live integration) -- this module no longer reads a separate v0.3.1 board.
    expect(source).not.toContain("NflPublicPowerBoard");
  });

  it("NFLMatchupDetail.tsx feeds the hero resolver from the universal hook alone, not an independently-chosen v0.3.1 overall", () => {
    const source = readFileSync(join(ROOT, "src", "pages", "NFLMatchupDetail.tsx"), "utf8");
    expect(source).toContain("useNflCurrentRating2026");
    expect(source).toContain("createHeroModelRatingResolver(currentRating)");
    expect(source).not.toContain("useNflV03PublicPowerRatings");
  });

  it("NflTeamModelTrendPanel.tsx sources current OVR from the universal hook, not useNflV03PublicPowerRatings", () => {
    const source = readFileSync(
      join(ROOT, "src", "components", "nfl", "team-dashboard", "NflTeamModelTrendPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("useNflCurrentRating2026");
    expect(source).not.toContain("useNflV03PublicPowerRatings");
  });

  it("teamModelTrend.ts's current-OVR fields are typed from CurrentRatingBoard, not NflPublicPowerBoard", () => {
    const source = readFileSync(join(ROOT, "src", "lib", "nfl", "teamModelTrend.ts"), "utf8");
    expect(source).toContain("CurrentRatingBoard");
    expect(source).not.toContain("NflPublicPowerBoard");
  });

  it("does not migrate unrelated NFL pages to the universal hook in this phase", () => {
    const untouched = [
      join(ROOT, "src", "pages", "NflV03Review.tsx"),
      join(ROOT, "src", "pages", "TeamPage.tsx"),
    ];
    for (const path of untouched) {
      expect(readFileSync(path, "utf8")).not.toContain("useNflCurrentRating2026");
    }
  });
});
