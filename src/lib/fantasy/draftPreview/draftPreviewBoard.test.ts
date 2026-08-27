import { describe, expect, it } from "vitest";
import {
  DRAFT_PREVIEW_ROWS_2026,
  buildDraftPreviewRows,
  filterDraftPreviewRows,
} from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { getShadowModelRankRow } from "@/lib/fantasy/rosResearch/shadowModelRankJoin";
import { DRAFT_PREVIEW_DUPLICATE_GROUPS } from "@/lib/fantasy/draftPreview/presentationSuppression";

describe("buildDraftPreviewRows", () => {
  it("builds exactly one row per source row, in fixed Sleeper Rank order", () => {
    expect(DRAFT_PREVIEW_ROWS_2026).toHaveLength(267);
    expect(DRAFT_PREVIEW_ROWS_2026.map((row) => row.sleeperRank)).toEqual(
      Array.from({ length: 267 }, (_, i) => i + 1),
    );
  });

  it("never mutates the Sleeper source or the JKB rankings source", () => {
    const sleeperBefore = JSON.parse(JSON.stringify(SLEEPER_DRAFT_BOARD_2026));
    const jkbBefore = JSON.parse(JSON.stringify(FANTASY_RANKINGS.rows));
    buildDraftPreviewRows();
    expect(SLEEPER_DRAFT_BOARD_2026).toEqual(sleeperBefore);
    expect(FANTASY_RANKINGS.rows).toEqual(jkbBefore);
  });

  it("reuses (never recomputes) the existing JKB rank/PAR/Model Rank authorities for a resolved player", () => {
    const gibbs = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Jahmyr Gibbs")!;
    const jkbGibbs = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs.jkb).toBe(jkbGibbs);
    expect(gibbs.jkb?.positionRank).toBe(jkbGibbs.positionRank);
    expect(gibbs.modelRank).toBe(getShadowModelRankRow(jkbGibbs.overallRank)?.modelRank ?? null);
  });

  it("leaves JKB-derived fields undefined/null for an unresolved row, without fabricating a value", () => {
    const defRow = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sourcePosition === "DEF")!;
    expect(defRow.canonicalPosition).toBeNull();
    expect(defRow.jkb).toBeUndefined();
    expect(defRow.jkbProjectedPpg).toBeUndefined();
    expect(defRow.jkbParPerGame).toBeUndefined();
    expect(defRow.modelRank).toBeNull();
  });
});

describe("filterDraftPreviewRows", () => {
  it("changes only which rows are visible, never their Sleeper Rank or Pos Rk values", () => {
    const rbRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "RB", "");
    expect(rbRows.length).toBeGreaterThan(0);
    expect(rbRows.every((row) => row.canonicalPosition === "RB")).toBe(true);
    for (const row of rbRows) {
      const original = DRAFT_PREVIEW_ROWS_2026.find((candidate) => candidate.sleeperRank === row.sleeperRank)!;
      expect(row.sleeperRank).toBe(original.sleeperRank);
      expect(row.jkb?.positionRank).toBe(original.jkb?.positionRank);
    }
  });

  it("matches player and team on a free-text search", () => {
    const results = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "jahmyr gibbs");
    expect(results.map((row) => row.player)).toEqual(["Jahmyr Gibbs"]);
  });

  it("renders exactly one presentation row for each duplicated real player, never two", () => {
    for (const name of ["Dylan Sampson", "Braelon Allen", "Rashod Bateman"]) {
      const rows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", name);
      expect(rows).toHaveLength(1);
    }
  });

  it("always keeps the lowest Sleeper Rank among duplicate rows, never using JKB team as the selection authority", () => {
    // Rashod Bateman: JKB's own team is "bal", which matches the HIGHER-ranked
    // duplicate (254), not the lower one (235) -- proving JKB team is not
    // driving the pick here. The lowest Sleeper Rank wins regardless.
    const rashodBateman = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "rashod bateman")[0];
    expect(rashodBateman.sleeperRank).toBe(235);
    expect(rashodBateman.team).toBe("KC");

    const dylanSampson = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "dylan sampson")[0];
    expect(dylanSampson.sleeperRank).toBe(89);

    const braelonAllen = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "braelon allen")[0];
    expect(braelonAllen.sleeperRank).toBe(152);
  });

  it("merges all three Keon Coleman source rows (151 TE/KC, 167 WR/DEN, 257 WR/BUF) into the single lowest-ranked row, canonical BUF/WR", () => {
    // Phase 2C data-integrity correction: all three rows are the SAME
    // canonical player (confirmed by the identity audit), even though 151's
    // source POS (TE) never matched the other two under the old JKB-join-only
    // duplicate check. Every source row shares the group's real identity, so
    // the lowest Sleeper Rank (151) is retained regardless of which row(s)
    // happened to resolve to a JKB entry.
    const keonColemanRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "keon coleman");
    expect(keonColemanRows).toHaveLength(1);
    expect(keonColemanRows[0].sleeperRank).toBe(151);
    expect(keonColemanRows[0].displayTeam).toBe("BUF");
    expect(keonColemanRows[0].rosterPosition).toBe("WR");
    // Raw source team/position on the retained row are untouched.
    expect(keonColemanRows[0].team).toBe("KC");
    expect(keonColemanRows[0].sourcePosition).toBe("TE");
  });

  it("keeps every duplicate source row inside DRAFT_PREVIEW_ROWS_2026 for provenance, only hiding it at presentation time", () => {
    const allSampsonRows = DRAFT_PREVIEW_ROWS_2026.filter((row) => row.player === "Dylan Sampson");
    expect(allSampsonRows.map((row) => row.sleeperRank).sort((a, b) => a - b)).toEqual([89, 188]);
    expect(allSampsonRows.find((row) => row.sleeperRank === 188)?.isDuplicatePresentation).toBe(true);
    expect(allSampsonRows.find((row) => row.sleeperRank === 89)?.isDuplicatePresentation).toBe(false);
  });
});

describe("board completeness (Phase 1B)", () => {
  it("renders every QB/RB/WR/TE Sleeper player, including unresolved ones, in fixed Sleeper Rank order", () => {
    const rows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "");
    const skillRows = rows.filter((row) => row.canonicalPosition != null);
    // 230 skill-position source rows minus the 9 confirmed-canonical-duplicate
    // suppressions minus the 1 malformed row (Sleeper Rank 256, sourcePosition
    // TE) confirmed by the Phase 2C identity audit.
    expect(skillRows).toHaveLength(220);
    const ranks = skillRows.map((row) => row.sleeperRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("shows Sleeper Rank and Sleeper projections for an unresolved skill-position player, with JKB fields N/A", () => {
    const unresolved = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Tua Tagovailoa")!;
    expect(unresolved.canonicalPosition).toBe("QB");
    expect(unresolved.jkb).toBeUndefined();
    expect(unresolved.sleeperProjectedPoints).toBeGreaterThan(0);
    expect(unresolved.jkbProjectedPpg).toBeUndefined();
    expect(unresolved.jkbParPerGame).toBeUndefined();
    expect(unresolved.modelRank).toBeNull();
    // Still present in the filtered QB view, not omitted from the draft sequence.
    expect(filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "QB", "").some((row) => row.player === "Tua Tagovailoa")).toBe(true);
  });
});

describe("displayTeam / rosterPosition (Phase 2C identity-display correction)", () => {
  it("corrects displayTeam for a known stale-team row while leaving the raw Sleeper team untouched", () => {
    const price = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Jadarian Price")!;
    expect(price.team).toBe("WAS");
    expect(price.displayTeam).toBe("SEA");
  });

  it("leaves displayTeam/rosterPosition equal to the raw source for a row with no correction", () => {
    const gibbs = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs.displayTeam).toBe(gibbs.team);
    expect(gibbs.rosterPosition).toBe(gibbs.canonicalPosition);
  });

  it("never changes canonicalPosition (the JKB ranking/PAR join key) even when rosterPosition is corrected", () => {
    const savion = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sleeperRank === 155)!;
    expect(savion.sourcePosition).toBe("K");
    expect(savion.canonicalPosition).toBeNull(); // JKB scope untouched -- K stays out of scope
    expect(savion.rosterPosition).toBe("WR"); // display/roster-slot scope corrected
  });

  it("gives DEF rows a DST rosterPosition and K rows a K rosterPosition (outside the JKB-only canonicalPosition scope)", () => {
    const defRow = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sourcePosition === "DEF")!;
    expect(defRow.canonicalPosition).toBeNull();
    expect(defRow.rosterPosition).toBe("DST");
    const kRow = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sourcePosition === "K" && row.sleeperRank !== 155)!;
    expect(kRow.canonicalPosition).toBeNull();
    expect(kRow.rosterPosition).toBe("K");
  });
});

describe("Jalen Milroe -- confirmed same-player duplicate (Phase 2C data-integrity correction)", () => {
  it("renders exactly one Jalen Milroe row: Sleeper Rank 60, canonical SEA/QB, retaining Rank 60's own Sleeper projections", () => {
    const milroeRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "jalen milroe");
    expect(milroeRows).toHaveLength(1);
    const milroe = milroeRows[0];
    expect(milroe.sleeperRank).toBe(60);
    expect(milroe.displayTeam).toBe("SEA");
    expect(milroe.rosterPosition).toBe("QB");

    const rank60Source = SLEEPER_DRAFT_BOARD_2026.find((row) => row.sleeperRank === 60)!;
    expect(milroe.sleeperProjectedPoints).toBe(rank60Source.projectedPoints);
    expect(milroe.sleeperProjectedPpg).toBe(rank60Source.projectedPpg);
  });

  it("suppresses Sleeper Rank 182 (the RB/IND duplicate) from the rendered board while preserving it in DRAFT_PREVIEW_ROWS_2026", () => {
    const rank182 = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sleeperRank === 182)!;
    expect(rank182.player).toBe("Jalen Milroe");
    expect(rank182.team).toBe("IND"); // raw source untouched
    expect(rank182.sourcePosition).toBe("RB"); // raw source untouched
    expect(rank182.isDuplicatePresentation).toBe(true);
    expect(filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "").some((row) => row.sleeperRank === 182)).toBe(false);
  });

  it("keeps Sleeper Rank 60's own raw team/position exactly as supplied (PHI/QB), separate from the corrected display", () => {
    const rank60 = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sleeperRank === 60)!;
    expect(rank60.team).toBe("PHI");
    expect(rank60.sourcePosition).toBe("QB");
    expect(rank60.displayTeam).toBe("SEA");
  });
});

describe("malformed source row suppression (Phase 2C data-integrity correction)", () => {
  it("keeps Sleeper Rank 256 (\"Denver Broncos\" as a fabricated TE row) out of the rendered/draftable board", () => {
    const malformed = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sleeperRank === 256)!;
    expect(malformed.player).toBe("Denver Broncos");
    expect(malformed.isMalformedSourceRow).toBe(true);
    expect(filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "").some((row) => row.sleeperRank === 256)).toBe(false);
  });

  it("preserves the malformed row's raw values in DRAFT_PREVIEW_ROWS_2026 for provenance, never discarding it", () => {
    const malformed = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sleeperRank === 256)!;
    expect(malformed.sourcePosition).toBe("TE");
    expect(malformed.team).toBe("DEN");
  });

  it("does not suppress the legitimate Denver Broncos DEF row (Sleeper Rank 119)", () => {
    const def = DRAFT_PREVIEW_ROWS_2026.find((row) => row.sleeperRank === 119)!;
    expect(def.player).toBe("Denver Broncos");
    expect(def.sourcePosition).toBe("DEF");
    expect(def.isMalformedSourceRow).toBe(false);
    expect(filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "").some((row) => row.sleeperRank === 119)).toBe(true);
  });
});

describe("legitimate unresolved rows stay retained (Phase 2C data-integrity correction)", () => {
  it("keeps a legitimate player whose canonical nflverse identity could not be confirmed, showing raw source team/position untouched rather than suppressing the row", () => {
    // Stefon Diggs: a real, legitimate NFL player absent from the cached
    // 2026 wk1 nflverse roster snapshot the identity AUDIT uses -- a
    // coverage gap in that specific source, not a malformed row. Must stay
    // on the board, not be suppressed. (His existing JKB join, a completely
    // separate name-based lookup in `identity.ts`, is untouched either way.)
    const diggs = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Stefon Diggs")!;
    expect(diggs.isDuplicatePresentation).toBe(false);
    expect(diggs.isMalformedSourceRow).toBe(false);
    expect(diggs.displayTeam).toBe(diggs.team); // no canonical correction applied -- fails closed to raw source
    expect(diggs.rosterPosition).toBe(diggs.canonicalPosition); // no canonical position correction applied either
    expect(filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "").some((row) => row.player === "Stefon Diggs")).toBe(true);
  });
});

describe("no confirmed canonical player appears twice in the rendered board (Phase 2C)", () => {
  it("every duplicate group's suppressed ranks are absent from the rendered board while the retained rank is present exactly once", () => {
    expect(DRAFT_PREVIEW_DUPLICATE_GROUPS.length).toBeGreaterThan(0);
    const rendered = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "");
    const renderedRanks = new Set(rendered.map((row) => row.sleeperRank));
    for (const group of DRAFT_PREVIEW_DUPLICATE_GROUPS) {
      expect(renderedRanks.has(group.retainedRank)).toBe(true);
      for (const suppressedRank of group.suppressedRanks) {
        expect(renderedRanks.has(suppressedRank)).toBe(false);
      }
    }
  });

  it("never mutates the Sleeper source artifact while resolving duplicate/malformed presentation", () => {
    const before = JSON.stringify(SLEEPER_DRAFT_BOARD_2026);
    filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "");
    expect(JSON.stringify(SLEEPER_DRAFT_BOARD_2026)).toBe(before);
  });
});
