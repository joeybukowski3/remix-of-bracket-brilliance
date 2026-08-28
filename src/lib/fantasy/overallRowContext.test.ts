import { describe, expect, it } from "vitest";
import { FANTASY_PAR_ROWS } from "@/lib/fantasy/parRankings";
import { buildOverallRowContext, getOverallRowContext } from "@/lib/fantasy/overallRowContext";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";

describe("ADP overlay on the Overall row context", () => {
  it("populates ADP for a resolved player without touching the raw ranking row", () => {
    const gibbs = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs.adp).toBeUndefined();
    expect(getOverallRowContext(gibbs.overallRank).adp).toBe(1.3);
  });

  it("leaves ADP undefined for a player absent from the FantasyPros export", () => {
    const pearsall = FANTASY_RANKINGS.rows.find((row) => row.player === "Ricky Pearsall")!;
    expect(getOverallRowContext(pearsall.overallRank).adp).toBeUndefined();
  });

  it("never derives ADP from the workbook mock-draft round/pick", () => {
    const context = buildOverallRowContext(FANTASY_PAR_ROWS, FANTASY_RANKINGS.rows);
    for (const row of FANTASY_RANKINGS.rows) {
      const adp = context.get(row.overallRank)?.adp;
      if (adp == null) continue;
      expect(adp).not.toBe(row.draftRound);
      expect(adp).not.toBe(row.roundPick);
    }
  });
});
