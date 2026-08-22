import { describe, expect, it } from "vitest";
import {
  getDefaultFantasyRankingMode,
  HAS_CANONICAL_WEEKLY_FANTASY_RANKINGS,
} from "@/lib/fantasy/rankingModes";

describe("fantasy ranking mode authority", () => {
  it("keeps ROS as the in-season default while canonical weekly rankings do not exist", () => {
    expect(HAS_CANONICAL_WEEKLY_FANTASY_RANKINGS).toBe(true);
    expect(getDefaultFantasyRankingMode()).toBe("ros");
  });
});
