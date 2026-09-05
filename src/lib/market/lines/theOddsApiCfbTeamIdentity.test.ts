import { describe, expect, it } from "vitest";
import { resolveTheOddsApiCfbTeamId } from "./theOddsApiCfbTeamIdentity";

describe("resolveTheOddsApiCfbTeamId", () => {
  it("resolves a full '<school> <mascot>' name to the JKB team id", () => {
    expect(resolveTheOddsApiCfbTeamId("Alabama Crimson Tide")).toBe("ala");
    expect(resolveTheOddsApiCfbTeamId("Auburn Tigers")).toBe("aub");
  });

  it("resolves a bare CFBD-style school name through the controlled alias list", () => {
    expect(resolveTheOddsApiCfbTeamId("Alabama")).toBe("ala");
    expect(resolveTheOddsApiCfbTeamId("Ole Miss")).toBe(
      resolveTheOddsApiCfbTeamId("Mississippi"),
    );
  });

  it("fails closed on an unmapped provider name (no fuzzy matching)", () => {
    expect(resolveTheOddsApiCfbTeamId("Football Club of Somewhere")).toBeNull();
    expect(resolveTheOddsApiCfbTeamId("Tigers")).toBeNull();
    expect(resolveTheOddsApiCfbTeamId("")).toBeNull();
    expect(resolveTheOddsApiCfbTeamId(null)).toBeNull();
  });
});
