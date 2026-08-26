import { describe, expect, it } from "vitest";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { getFantasyProsAdp } from "@/lib/fantasy/adpPlayerIdentity";

describe("FantasyPros ADP identity bridge", () => {
  it("resolves without fabricating an identity for players absent from the export", () => {
    const resolved = FANTASY_RANKINGS.rows.filter((row) => getFantasyProsAdp(row));
    // The FantasyPros export covers roughly the top of the board; a real,
    // sizeable remainder of deep JKB rows legitimately has no ADP.
    expect(resolved.length).toBeGreaterThan(190);
    expect(resolved.length).toBeLessThan(FANTASY_RANKINGS.rows.length);
  });

  it("never assigns the same FantasyPros row to two different JKB rows", () => {
    const seen = new Map<string, string>();
    for (const row of FANTASY_RANKINGS.rows) {
      const adp = getFantasyProsAdp(row);
      if (!adp) continue;
      const sourceKey = `${adp.position}:${adp.player}`;
      const prior = seen.get(sourceKey);
      expect(prior, `${sourceKey} claimed by both ${prior} and ${row.player}`).toBeUndefined();
      seen.set(sourceKey, row.player);
    }
  });

  it("uses reviewed aliases without fuzzy matching", () => {
    const mahomes = FANTASY_RANKINGS.rows.find((row) => row.player === "Patrick Mahomes")!;
    expect(getFantasyProsAdp(mahomes)).toMatchObject({ player: "Patrick Mahomes II", position: "QB" });

    const cook = FANTASY_RANKINGS.rows.find((row) => row.player === "James Cook")!;
    expect(getFantasyProsAdp(cook)).toMatchObject({ player: "James Cook III", position: "RB" });
  });

  it("resolves every ADP value as a finite positive number", () => {
    for (const row of FANTASY_RANKINGS.rows) {
      const adp = getFantasyProsAdp(row);
      if (!adp) continue;
      expect(Number.isFinite(adp.adp)).toBe(true);
      expect(adp.adp).toBeGreaterThan(0);
    }
  });

  it("leaves a genuinely absent player unresolved rather than guessing", () => {
    const pearsall = FANTASY_RANKINGS.rows.find((row) => row.player === "Ricky Pearsall")!;
    expect(getFantasyProsAdp(pearsall)).toBeUndefined();
  });
});
