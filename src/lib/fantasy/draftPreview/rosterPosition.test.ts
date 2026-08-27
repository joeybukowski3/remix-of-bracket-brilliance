import { describe, expect, it } from "vitest";
import { computeDisplayTeam, computeRosterPosition } from "@/lib/fantasy/draftPreview/rosterPosition";
import { DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK } from "@/lib/fantasy/draftPreview/identityCorrections";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";

describe("identity audit artifact", () => {
  it("has at least one corrected row and every entry is classified B, C or D", () => {
    expect(DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK.size).toBeGreaterThan(0);
    for (const correction of DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK.values()) {
      expect(["B", "C", "D"]).toContain(correction.classification);
    }
  });

  it("never rewrites the raw Sleeper source artifact -- the source team/position stay exactly as supplied", () => {
    const before = JSON.stringify(SLEEPER_DRAFT_BOARD_2026);
    for (const correction of DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK.values()) {
      const sourceRow = SLEEPER_DRAFT_BOARD_2026.find((row) => row.sleeperRank === correction.sleeperRank);
      expect(sourceRow?.team).toBe(correction.sourceTeam);
      expect(sourceRow?.sourcePosition).toBe(correction.sourcePosition);
    }
    expect(JSON.stringify(SLEEPER_DRAFT_BOARD_2026)).toBe(before);
  });
});

describe("computeDisplayTeam (known corrected row: Jadarian Price, Sleeper Rank 67)", () => {
  it("displays the canonical team while a raw source lookup would still show the stale one", () => {
    const sourceRow = SLEEPER_DRAFT_BOARD_2026.find((row) => row.player === "Jadarian Price")!;
    expect(sourceRow.team).toBe("WAS"); // raw Sleeper source preserved
    expect(computeDisplayTeam(sourceRow.sleeperRank, sourceRow.team)).toBe("SEA"); // corrected display
  });
});

describe("computeRosterPosition / computeDisplayTeam (known team+position conflict: Sleeper Rank 155)", () => {
  it("corrects both display team and roster position when both were confirmed wrong", () => {
    const sourceRow = SLEEPER_DRAFT_BOARD_2026.find((row) => row.sleeperRank === 155)!;
    expect(sourceRow.sourcePosition).toBe("K"); // raw source preserved
    expect(computeRosterPosition(155, sourceRow.sourcePosition)).toBe("WR"); // corrected display
    expect(computeDisplayTeam(155, sourceRow.team)).not.toBe(sourceRow.team);
  });
});

describe("computeRosterPosition / computeDisplayTeam (confirmed duplicate group: Jalen Milroe)", () => {
  it("corrects the RETAINED lowest-rank row's display to the group's canonical identity (SEA/QB), via the duplicate-group table, not the B/C/D correction table", () => {
    const milroeRows = SLEEPER_DRAFT_BOARD_2026.filter((row) => row.player === "Jalen Milroe");
    expect(milroeRows).toHaveLength(2);
    const retained = milroeRows.find((row) => row.sleeperRank === 60)!;
    // Not in the B/C/D per-row correction table -- this row is corrected via
    // the confirmed-duplicate-group table instead.
    expect(DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK.has(retained.sleeperRank)).toBe(false);
    expect(computeDisplayTeam(retained.sleeperRank, retained.team)).toBe("SEA");
    expect(computeRosterPosition(retained.sleeperRank, retained.sourcePosition)).toBe("QB");
  });
});

describe("computeRosterPosition (K/DST scope beyond the JKB-only canonicalPosition)", () => {
  it("maps DEF source rows to DST and K source rows to K", () => {
    expect(computeRosterPosition(999999, "DEF")).toBe("DST");
    expect(computeRosterPosition(999999, "K")).toBe("K");
  });

  it("maps the JKB-scoped positions the same way canonicalPositionForSource does", () => {
    expect(computeRosterPosition(999999, "QB")).toBe("QB");
    expect(computeRosterPosition(999999, "RB")).toBe("RB");
    expect(computeRosterPosition(999999, "WR")).toBe("WR");
    expect(computeRosterPosition(999999, "TE")).toBe("TE");
    expect(computeRosterPosition(999999, "DB/WR")).toBe("WR");
  });
});

describe("computeDisplayTeam (no correction on record)", () => {
  it("falls back to the raw source team unchanged", () => {
    expect(computeDisplayTeam(999999, "KC")).toBe("KC");
    expect(computeDisplayTeam(999999, null)).toBeNull();
  });
});
