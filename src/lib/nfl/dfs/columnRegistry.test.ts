import { describe, expect, it } from "vitest";
import {
  applyDfsColumnVisibility,
  DFS_COLUMN_REGISTRY,
  dfsColumnForSortKey,
  dfsColumnsForView,
  dfsDefaultHiddenIds,
  dfsOptionalColumnsForView,
  isDfsColumnId,
  sanitizeHiddenIds,
} from "@/lib/nfl/dfs/columnRegistry";

describe("dfsColumnsForView", () => {
  it("starts every view with the mandatory Player and Team/Opp columns", () => {
    for (const view of ["VALUE", "QB", "DST"] as const) {
      const [first, second] = dfsColumnsForView(view);
      expect(first.id).toBe("player");
      expect(second.id).toBe("teamOpp");
      expect(first.mandatory && second.mandatory).toBe(true);
    }
  });

  it("gives the offense views the Fantasy PPG columns and no JKB Week Rank column", () => {
    const ids: string[] = dfsColumnsForView("VALUE").map((column) => column.id);
    expect(ids).toContain("fantasyPpg");
    expect(ids).toContain("fantasyPpgL5");
    expect(ids).not.toContain("dstRank");
    // JKB Week Rank has no column id at all — it is presentation-removed.
    expect(ids).not.toContain("weeklyRank");
  });

  it("gives the DST view its matchup columns and drops offense-only columns", () => {
    const ids = dfsColumnsForView("DST").map((column) => column.id);
    expect(ids).toEqual(["player", "teamOpp", "salary", "dkPosRank", "dstRank", "dstScore", "epa", "success", "trenches"]);
  });

  it("keeps DK Pos RK ahead of the JKB metric block for the offense view", () => {
    const ids = dfsColumnsForView("QB").map((column) => column.id);
    expect(ids.indexOf("dkPosRank")).toBeLessThan(ids.indexOf("jkbSlateRank"));
    expect(ids.indexOf("pts1k")).toBeLessThan(ids.indexOf("fantasyPpg"));
    expect(ids.indexOf("fantasyPpgL5")).toBeLessThan(ids.indexOf("matchup"));
  });
});

describe("registry invariants", () => {
  it("has a unique id per column and a sortKey for every sortable column", () => {
    const ids = DFS_COLUMN_REGISTRY.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const column of DFS_COLUMN_REGISTRY) {
      if (column.sortable) expect(column.sortKey).not.toBeNull();
    }
  });

  it("resolves a column from its sort key", () => {
    expect(dfsColumnForSortKey("fantasyPpg")?.label).toBe("Fantasy PPG");
    expect(dfsColumnForSortKey("dkPosRank")?.id).toBe("dkPosRank");
  });
});

describe("visibility helpers", () => {
  it("recognizes real column ids only", () => {
    expect(isDfsColumnId("salary")).toBe(true);
    expect(isDfsColumnId("weeklyRank")).toBe(false);
  });

  it("lists only hideable (non-mandatory) columns for the dropdown", () => {
    const optional = dfsOptionalColumnsForView("VALUE").map((column) => column.id);
    expect(optional).not.toContain("player");
    expect(optional).not.toContain("teamOpp");
    expect(optional).toContain("salary");
    expect(optional).toContain("fantasyPpg");
  });

  it("desktop default hides nothing; mobile default hides the non-lean columns", () => {
    expect(dfsDefaultHiddenIds("desktop")).toEqual([]);
    const mobileHidden = dfsDefaultHiddenIds("mobile");
    expect(mobileHidden).toContain("dkPosRank");
    expect(mobileHidden).toContain("fantasyPpg");
    expect(mobileHidden).toContain("salary");
    expect(mobileHidden).not.toContain("matchup");
  });

  it("sanitizes a saved hidden set: drops unknown ids and mandatory columns", () => {
    expect(sanitizeHiddenIds(["salary", "player", "teamOpp", "bogus"]).sort()).toEqual(["salary"]);
  });

  it("applies a hidden set while always keeping mandatory columns", () => {
    const visible = applyDfsColumnVisibility("VALUE", new Set(["salary", "player"])).map((column) => column.id);
    expect(visible).not.toContain("salary");
    expect(visible).toContain("player");
    expect(visible).toContain("teamOpp");
  });
});
