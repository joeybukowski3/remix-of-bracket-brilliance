import { describe, expect, it } from "vitest";
import { shadowAvailable, shadowUnavailable } from "./shadowAvailability";

describe("shadowAvailable", () => {
  it("returns a null reason -- ambiguity is not allowed on the available path", () => {
    expect(shadowAvailable()).toEqual({ shadow_status: "available", shadow_unavailable_reason: null });
  });
});

describe("shadowUnavailable", () => {
  it("always carries an explicit, non-null reason", () => {
    for (const reason of ["missing_shadow_artifact", "invalid_shadow_artifact", "missing_team_opportunity", "missing_team_row", "allocation_failure", "other"] as const) {
      const result = shadowUnavailable(reason);
      expect(result.shadow_status).toBe("unavailable");
      expect(result.shadow_unavailable_reason).toBe(reason);
    }
  });
});
