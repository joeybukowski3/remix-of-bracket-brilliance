import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countryCodeToFlag,
  countryCodeToFlagEmojiUrl,
  getPgaPlayerNationality,
  getPgaPlayerNationalityKeys,
  normalizePgaPlayerNationalityKey,
} from "@/lib/pga/playerNationality";

type ModeledPlayer = { player: string };
type CurrentField = { players: string[] };

// Keep this empty unless a golfer's nationality genuinely cannot be resolved.
// Every entry must include a specific research reason rather than a generic exemption.
const UNRESOLVED_NATIONALITY_ALLOWLIST: Record<string, string> = {};

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8")) as T;
}

function findUnexpectedUnmapped(players: string[]): string[] {
  return players
    .filter((player) => !getPgaPlayerNationality(player))
    .filter((player) => !UNRESOLVED_NATIONALITY_ALLOWLIST[normalizePgaPlayerNationalityKey(player)])
    .sort((left, right) => left.localeCompare(right));
}

describe("PGA player nationality metadata", () => {
  it("covers every currently modeled golfer", () => {
    const modeledPlayers = loadJson<ModeledPlayer[]>("public/data/pga/player-stats-raw.json")
      .map(({ player }) => player);
    const unmapped = findUnexpectedUnmapped(modeledPlayers);

    expect(modeledPlayers).toHaveLength(166);
    expect(unmapped, `Unmapped modeled PGA players:\n${unmapped.join("\n")}`).toEqual([]);
  });

  it("covers every player in the current official field", () => {
    const currentField = loadJson<CurrentField>("public/data/pga/current-field.json");
    const unmapped = findUnexpectedUnmapped(currentField.players);

    expect(currentField.players).toHaveLength(147);
    expect(unmapped, `Unmapped official-field PGA players:\n${unmapped.join("\n")}`).toEqual([]);
  });

  it("does not contain duplicate normalized nationality keys", () => {
    const keys = getPgaPlayerNationalityKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves the required players and countries", () => {
    expect(getPgaPlayerNationality("Jacob Bridgeman")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Russell Henley")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Cameron Young")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Jake Knapp")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Chris Gotterup")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Akshay Bhatia")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Ryan Gerard")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Xander Schauffele")).toEqual({ countryCode: "US", countryName: "United States" });
    expect(getPgaPlayerNationality("Si Woo Kim")).toEqual({ countryCode: "KR", countryName: "South Korea" });
    expect(getPgaPlayerNationality("Hideki Matsuyama")).toEqual({ countryCode: "JP", countryName: "Japan" });
    expect(getPgaPlayerNationality("Nicolai Højgaard")).toEqual({ countryCode: "DK", countryName: "Denmark" });
    expect(getPgaPlayerNationality("Sudarshan Yellamaraju")).toEqual({ countryCode: "CA", countryName: "Canada" });
  });

  it("preserves name normalization behavior", () => {
    expect(getPgaPlayerNationality("Nicolai Hojgaard")?.countryCode).toBe("DK");
    expect(getPgaPlayerNationality("Rasmus Neergaard-Petersen")?.countryCode).toBe("DK");
    expect(normalizePgaPlayerNationalityKey("Patrick O'Connor")).toBe("patrickoconnor");
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

  it("keeps Twemoji asset URL rendering unchanged", () => {
    expect(countryCodeToFlagEmojiUrl("US")).toContain("/1f1fa-1f1f8.svg");
    expect(countryCodeToFlagEmojiUrl("KR")).toContain("/1f1f0-1f1f7.svg");
    expect(countryCodeToFlagEmojiUrl("JP")).toContain("/1f1ef-1f1f5.svg");
    expect(countryCodeToFlagEmojiUrl("DK")).toContain("/1f1e9-1f1f0.svg");
    expect(countryCodeToFlagEmojiUrl("CA")).toContain("/1f1e8-1f1e6.svg");
    expect(countryCodeToFlagEmojiUrl("USA")).toBeNull();
  });
});
