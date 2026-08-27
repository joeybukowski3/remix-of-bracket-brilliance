import { describe, expect, it } from "vitest";
import { computeDraftDecisionSupportSnapshot } from "@/lib/fantasy/draftPreview/draftDecisionSupport";
import { DRAFT_PREVIEW_ROWS_2026 } from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { getShadowModelRankRow } from "@/lib/fantasy/rosResearch/shadowModelRankJoin";
import type { DraftPreviewRow } from "@/lib/fantasy/draftPreview/draftPreviewBoard";

const ROUND_COUNT = 10;

describe("computeDraftDecisionSupportSnapshot", () => {
  it("matches the approved slot-10 pick sequence and windows", () => {
    const snapshot = computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 0, ROUND_COUNT);
    expect(snapshot.picks.map((pick) => pick.overallPick)).toEqual([10, 15, 34, 39, 58, 63, 82, 87, 106, 111]);
    expect(snapshot.window).toEqual({ round: 1, currentPick: 10, nextPick: 15, opponentPicksBeforeNextTurn: 4 });
  });

  it("bestAvailable is the eligible row with the lowest Sleeper Rank at or after the current pick", () => {
    const snapshot = computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 0, ROUND_COUNT);
    expect(snapshot.bestAvailable?.sleeperRank).toBe(10);
  });

  it("bestProjection and bestPar never fabricate a value when JKB data is missing", () => {
    // Synthetic rows with no JKB join at all -- bestProjection/bestPar must be null, not 0.
    const rows: DraftPreviewRow[] = [
      {
        sleeperRank: 10,
        player: "Unresolved Player",
        team: null,
        sourcePosition: "RB",
        canonicalPosition: "RB",
        bye: null,
        sleeperProjectedPoints: 100,
        sleeperProjectedPpg: 10,
        jkb: undefined,
        jkbProjectedPpg: undefined,
        jkbParPerGame: undefined,
        modelRank: null,
        seasonPointsRank2025: undefined,
        seasonPpgRank2025: undefined,
        lastEightPointsRank: undefined,
        isDuplicatePresentation: false,
      },
    ];
    const snapshot = computeDraftDecisionSupportSnapshot(rows, 10, 0, ROUND_COUNT);
    expect(snapshot.bestAvailable?.player).toBe("Unresolved Player");
    expect(snapshot.bestProjection).toBeNull();
    expect(snapshot.bestPar).toBeNull();
  });

  it("returns one position opportunity cost entry per canonical position", () => {
    const snapshot = computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 0, ROUND_COUNT);
    expect(snapshot.positionOpportunityCosts.map((entry) => entry.position)).toEqual(["QB", "RB", "WR", "TE"]);
  });

  it("recomputes the window when the evaluated pick index changes, without altering the picks list", () => {
    const first = computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 0, ROUND_COUNT);
    const second = computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 1, ROUND_COUNT);
    expect(first.window.currentPick).toBe(10);
    expect(second.window.currentPick).toBe(15);
    expect(second.window.nextPick).toBe(34);
    expect(first.picks).toEqual(second.picks);
  });

  it("recomputes the entire pick sequence when the draft slot changes", () => {
    const slot10 = computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 0, ROUND_COUNT);
    const slot1 = computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 1, 0, ROUND_COUNT);
    expect(slot10.window.currentPick).toBe(10);
    expect(slot1.window.currentPick).toBe(1);
  });
});

describe("regression: Phase 2 never mutates or recomputes existing authorities", () => {
  it("leaves Sleeper Rank, JKB projection, JKB PAR, and Model Rank unchanged after computing a snapshot", () => {
    const gibbsBefore = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Jahmyr Gibbs")!;
    const jkbBefore = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    const modelRankBefore = getShadowModelRankRow(jkbBefore.overallRank)?.modelRank ?? null;

    computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 0, ROUND_COUNT);
    computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 5, ROUND_COUNT);

    const gibbsAfter = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbsAfter.sleeperRank).toBe(gibbsBefore.sleeperRank);
    expect(gibbsAfter.jkbProjectedPpg).toBe(gibbsBefore.jkbProjectedPpg);
    expect(gibbsAfter.jkbParPerGame).toBe(gibbsBefore.jkbParPerGame);
    expect(gibbsAfter.modelRank).toBe(modelRankBefore);
  });

  it("does not mutate the base Sleeper or JKB source arrays", () => {
    const sleeperBefore = JSON.parse(JSON.stringify(SLEEPER_DRAFT_BOARD_2026));
    const jkbBefore = JSON.parse(JSON.stringify(FANTASY_RANKINGS.rows));

    computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 0, ROUND_COUNT);

    expect(SLEEPER_DRAFT_BOARD_2026).toEqual(sleeperBefore);
    expect(FANTASY_RANKINGS.rows).toEqual(jkbBefore);
  });

  it("does not reorder DRAFT_PREVIEW_ROWS_2026 itself", () => {
    const before = DRAFT_PREVIEW_ROWS_2026.map((row) => row.sleeperRank);
    computeDraftDecisionSupportSnapshot(DRAFT_PREVIEW_ROWS_2026, 10, 3, ROUND_COUNT);
    const after = DRAFT_PREVIEW_ROWS_2026.map((row) => row.sleeperRank);
    expect(after).toEqual(before);
  });
});
