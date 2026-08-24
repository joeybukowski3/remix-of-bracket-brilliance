import { describe, expect, it } from "vitest";
import {
  getDefaultFantasyRankingMode,
  HAS_CANONICAL_WEEKLY_FANTASY_RANKINGS,
} from "@/lib/fantasy/rankingModes";

describe("fantasy ranking mode authority", () => {
  it("defaults the primary Fantasy entry point to Weekly while keeping ROS explicit", () => {
    expect(HAS_CANONICAL_WEEKLY_FANTASY_RANKINGS).toBe(true);
    expect(getDefaultFantasyRankingMode()).toBe("weekly");
  });
});
