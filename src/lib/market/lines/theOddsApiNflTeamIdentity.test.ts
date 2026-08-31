import { describe, expect, it } from "vitest";
import { resolveTheOddsApiNflTeamId } from "./theOddsApiNflTeamIdentity";

describe("resolveTheOddsApiNflTeamId", () => {
  it("maps full club names deterministically to canonical nflverse codes", () => {
    expect(resolveTheOddsApiNflTeamId("Seattle Seahawks")).toBe("sea");
    expect(resolveTheOddsApiNflTeamId("New England Patriots")).toBe("ne");
    expect(resolveTheOddsApiNflTeamId("San Francisco 49ers")).toBe("sf");
  });

  it("folds relocation / alias codes through the canonical normalizer", () => {
    expect(resolveTheOddsApiNflTeamId("Washington Commanders")).toBe("wsh");
    expect(resolveTheOddsApiNflTeamId("Los Angeles Rams")).toBe("lar");
    expect(resolveTheOddsApiNflTeamId("Jacksonville Jaguars")).toBe("jax");
  });

  it("returns null for an unknown name instead of guessing", () => {
    expect(resolveTheOddsApiNflTeamId("London Monarchs")).toBeNull();
    expect(resolveTheOddsApiNflTeamId("")).toBeNull();
    expect(resolveTheOddsApiNflTeamId(null)).toBeNull();
  });
});
