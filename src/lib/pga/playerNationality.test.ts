import { describe, expect, it } from "vitest";
import { countryCodeToFlag, getPgaPlayerNationality } from "@/lib/pga/playerNationality";

describe("PGA player nationality metadata", () => {
  it("resolves a standard name", () => {
    expect(getPgaPlayerNationality("Hideki Matsuyama")).toEqual({ countryCode: "JP", countryName: "Japan" });
  });

  it("normalizes accented names", () => {
    expect(getPgaPlayerNationality("Nicolai Højgaard")?.countryCode).toBe("DK");
  });

  it("normalizes hyphenated names", () => {
    expect(getPgaPlayerNationality("Rasmus Neergaard-Petersen")?.countryCode).toBe("DK");
  });

  it("normalizes suffixes", () => {
    expect(getPgaPlayerNationality("Xander Schauffele Jr.")?.countryCode).toBe("US");
  });

  it("returns null for an unknown player", () => {
    expect(getPgaPlayerNationality("Unknown Golfer")).toBeNull();
  });

  it("creates flags only from valid two-letter country codes", () => {
    expect(countryCodeToFlag("JP")).toBe("🇯🇵");
    expect(countryCodeToFlag("USA")).toBeNull();
    expect(countryCodeToFlag("")) .toBeNull();
  });
});
