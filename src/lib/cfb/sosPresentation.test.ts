import { describe, expect, it } from "vitest";
import { getSosRemainingBand } from "./sosPresentation";

describe("getSosRemainingBand", () => {
  it.each([
    [1, "strong-difficult"],
    [25, "strong-difficult"],
    [26, "moderate-difficult"],
    [50, "moderate-difficult"],
    [51, "neutral"],
    [88, "neutral"],
    [89, "moderate-easy"],
    [113, "moderate-easy"],
    [114, "strong-easy"],
    [138, "strong-easy"],
    [null, "unavailable"],
  ])("maps rank %s to %s", (rank, expected) => {
    expect(getSosRemainingBand(rank)).toBe(expected);
  });
});
