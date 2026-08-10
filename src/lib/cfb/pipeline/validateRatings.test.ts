import { describe, expect, it } from "vitest";
import { assertCompleteCfbRatings } from "./validateRatings";

describe("CFB ratings validation", () => {
  it("keeps the mandatory 138-computed-team gate", () => {
    const ratings = Array.from({ length: 138 }, (_, index) => ({
      teamId: `team-${index}`,
      status: index === 137 ? "insufficient-data" as const : "computed" as const,
    }));
    expect(() => assertCompleteCfbRatings(ratings)).toThrow(
      "Expected 138 computed ratings; received 137; insufficient-data teams: team-137",
    );
  });
});
