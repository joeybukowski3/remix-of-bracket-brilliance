import { describe, expect, it } from "vitest";
import {
  countryCodeToFlag,
  countryCodeToFlagEmojiUrl,
  getPgaPlayerNationality,
  normalizePgaPlayerNationalityKey,
} from "@/lib/pga/playerNationality";

describe("PGA player nationality metadata", () => {
  it("resolves the required player country codes", () => {
    expect(getPgaPlayerNationality("Xander Schauffele")?.countryCode).toBe("US");
    expect(getPgaPlayerNationality("Si Woo Kim")?.countryCode).toBe("KR");
    expect(getPgaPlayerNationality("Hideki Matsuyama")?.countryCode).toBe("JP");
    expect(getPgaPlayerNationality("Nicolai Hojgaard")?.countryCode).toBe("DK");
    expect(getPgaPlayerNationality("Sudarshan Yellamaraju")?.countryCode).toBe("CA");
  });

  it("normalizes accented names and special Latin characters", () => {
    expect(getPgaPlayerNationality("Nicolai Højgaard")?.countryCode).toBe("DK");
  });

  it("normalizes hyphenated names", () => {
    expect(getPgaPlayerNationality("Rasmus Neergaard-Petersen")?.countryCode).toBe("DK");
  });

  it("normalizes apostrophes", () => {
    expect(normalizePgaPlayerNationalityKey("Patrick O'Connor")).toBe("patrickoconnor");
  });

  it("normalizes suffixes", () => {
    expect(getPgaPlayerNationality("Xander Schauffele Jr.")?.countryCode).toBe("US");
  });

  it("returns null for an unknown player", () => {
    expect(getPgaPlayerNationality("Unknown Golfer")).toBeNull();
  });

  it("creates Unicode flags only from valid two-letter country codes", () => {
    expect(countryCodeToFlag("US")).toBe("🇺🇸");
    expect(countryCodeToFlag("KR")).toBe("🇰🇷");
    expect(countryCodeToFlag("JP")).toBe("🇯🇵");
    expect(countryCodeToFlag("DK")).toBe("🇩🇰");
    expect(countryCodeToFlag("CA")).toBe("🇨🇦");
    expect(countryCodeToFlag("USA")).toBeNull();
    expect(countryCodeToFlag("")).toBeNull();
  });

  it("creates Twemoji asset URLs so Windows does not show raw letter codes", () => {
    expect(countryCodeToFlagEmojiUrl("US")).toContain("/1f1fa-1f1f8.svg");
    expect(countryCodeToFlagEmojiUrl("KR")).toContain("/1f1f0-1f1f7.svg");
    expect(countryCodeToFlagEmojiUrl("JP")).toContain("/1f1ef-1f1f5.svg");
    expect(countryCodeToFlagEmojiUrl("DK")).toContain("/1f1e9-1f1f0.svg");
    expect(countryCodeToFlagEmojiUrl("CA")).toContain("/1f1e8-1f1e6.svg");
    expect(countryCodeToFlagEmojiUrl("USA")).toBeNull();
  });
});
