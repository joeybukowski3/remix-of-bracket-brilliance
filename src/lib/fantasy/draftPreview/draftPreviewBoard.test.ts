import { describe, expect, it } from "vitest";
import {
  DRAFT_PREVIEW_ROWS_2026,
  buildDraftPreviewRows,
  filterDraftPreviewRows,
} from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { getShadowModelRankRow } from "@/lib/fantasy/rosResearch/shadowModelRankJoin";

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

  it("keeps the lowest-ranked Keon Coleman duplicate (167), distinct from the unrelated bad TE/KC row (151)", () => {
    const keonColemanRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "keon coleman");
    const resolvedKeonColeman = keonColemanRows.find((row) => row.jkb != null);
    expect(resolvedKeonColeman?.sleeperRank).toBe(167);
    expect(resolvedKeonColeman?.team).toBe("DEN");
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
    // 230 skill-position source rows minus the 4 suppressed duplicate listings.
    expect(skillRows).toHaveLength(226);
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
