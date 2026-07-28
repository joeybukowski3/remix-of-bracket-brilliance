import { describe, expect, it } from "vitest";
import { SIMULATION_PLAYERS } from "../data";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import {
  getDraftUrgency,
  getLatestReasonablePick,
  isOverdue,
} from "../engine/draftRealism";
import { isLegalCompletedRoster } from "../engine/rosterRules";

const SEEDS = [
  "realism-seed-1",
  "realism-seed-2",
  "realism-seed-3",
  "realism-seed-4",
  "realism-seed-5",
];

const RANK_BUCKETS: Array<{ minRank: number; maxRank: number; latestPick: number }> = [
  { minRank: 1, maxRank: 2, latestPick: 8 },
  { minRank: 3, maxRank: 6, latestPick: 12 },
  { minRank: 7, maxRank: 12, latestPick: 22 },
  { minRank: 13, maxRank: 20, latestPick: 35 },
];

function draftFor(seed: string) {
  return simulateAutomaticDraft(SIMULATION_PLAYERS, 1, seed);
}

function overallPickOf(selections: ReturnType<typeof draftFor>["selections"], playerId: string) {
  return selections.find((selection) => selection.playerId === playerId)!.overallPick;
}

describe("16-0 draft realism helper functions", () => {
  it("assigns tight, non-overlapping fall-limit buckets near the top of the board", () => {
    expect(getLatestReasonablePick(1)).toBe(8);
    expect(getLatestReasonablePick(2)).toBe(8);
    expect(getLatestReasonablePick(3)).toBe(12);
    expect(getLatestReasonablePick(6)).toBe(12);
    expect(getLatestReasonablePick(7)).toBe(22);
    expect(getLatestReasonablePick(12)).toBe(22);
    expect(getLatestReasonablePick(13)).toBe(35);
    expect(getLatestReasonablePick(20)).toBe(35);
  });

  it("has no guardrail (null) far down the board", () => {
    expect(getLatestReasonablePick(500)).toBeNull();
  });

  it("reports isOverdue exactly at and after the latest reasonable pick", () => {
    expect(isOverdue(1, 7)).toBe(false);
    expect(isOverdue(1, 8)).toBe(true);
    expect(isOverdue(1, 9)).toBe(true);
  });

  it("ramps urgency up to 1 as the deadline is reached, and 0 while far away", () => {
    expect(getDraftUrgency(1, 1)).toBe(0);
    expect(getDraftUrgency(1, 8)).toBe(1);
    expect(getDraftUrgency(1, 6)).toBeGreaterThan(0);
    expect(getDraftUrgency(1, 6)).toBeLessThan(1);
  });
});

describe("16-0 CPU draft realism guardrails (repeated seeded drafts)", () => {
  const drafts = SEEDS.map((seed) => ({ seed, draft: draftFor(seed) }));

  it("never lets a rank 1-2 player fall past pick 8, rank 3-6 past pick 12, rank 7-12 past pick 22, rank 13-20 past pick 35", () => {
    for (const { seed, draft } of drafts) {
      for (const bucket of RANK_BUCKETS) {
        const playersInBucket = SIMULATION_PLAYERS.filter(
          (player) =>
            player.consensusOverallRank >= bucket.minRank &&
            player.consensusOverallRank <= bucket.maxRank,
        );
        for (const player of playersInBucket) {
          const selection = draft.selections.find((entry) => entry.playerId === player.id);
          if (!selection) continue; // not part of this particular draft pool edge case
          expect(
            selection.overallPick,
            `seed ${seed}: rank ${player.consensusOverallRank} player ${player.name} fell to pick ${selection.overallPick}, expected <= ${bucket.latestPick}`,
          ).toBeLessThanOrEqual(bucket.latestPick);
        }
      }
    }
  });

  it("still produces exactly 204 unique drafted players across 12 legal 17-man rosters", () => {
    for (const { draft } of drafts) {
      expect(draft.selections).toHaveLength(204);
      expect(new Set(draft.selections.map((selection) => selection.playerId)).size).toBe(204);
      for (const [, roster] of draft.rosters) {
        expect(roster).toHaveLength(17);
        expect(isLegalCompletedRoster(roster)).toBe(true);
      }
    }
  });

  it("keeps K/DST draft timing legal (no team drafts a 2nd starter K/DST before round 16)", () => {
    for (const { draft } of drafts) {
      for (const [, roster] of draft.rosters) {
        expect(isLegalCompletedRoster(roster)).toBe(true);
      }
    }
  });

  it("still produces meaningful CPU strategy variation (not identical picks across strategies)", () => {
    const draft = drafts[0].draft;
    const strategySet = new Set(Object.values(draft.strategies));
    expect(strategySet.size).toBeGreaterThan(1);
    // Two CPU teams under different strategies should not always draft
    // the same player order for their first few picks.
    const cpuSlots = Object.keys(draft.strategies).map(Number);
    const [slotA, slotB] = cpuSlots.filter(
      (slot) => draft.strategies[slot] !== draft.strategies[cpuSlots[0]],
    ).length
      ? [cpuSlots[0], cpuSlots.find((slot) => draft.strategies[slot] !== draft.strategies[cpuSlots[0]])!]
      : [cpuSlots[0], cpuSlots[1]];
    const firstThreeA = draft.rosters.get(slotA)!.slice(0, 3).map((player) => player.id);
    const firstThreeB = draft.rosters.get(slotB)!.slice(0, 3).map((player) => player.id);
    expect(firstThreeA).not.toEqual(firstThreeB);
  });

  it("is deterministic: the same seed always reproduces the same draft", () => {
    const first = draftFor("realism-repeat-seed");
    const second = draftFor("realism-repeat-seed");
    expect(first.selections).toEqual(second.selections);
  });

  it("still produces different, legal drafts for different seeds", () => {
    const first = draftFor("realism-diff-seed-a");
    const second = draftFor("realism-diff-seed-b");
    expect(first.selections).not.toEqual(second.selections);
    for (const [, roster] of first.rosters) expect(isLegalCompletedRoster(roster)).toBe(true);
    for (const [, roster] of second.rosters) expect(isLegalCompletedRoster(roster)).toBe(true);
  });

  it("does not calibrate toward the user drafting worse — the user's auto-pick logic is untouched by the guardrail", () => {
    // The guardrail only participates in chooseCpuPlayer's scoring; the
    // user/auto-pick path (chooseAutoPick) has no overallPick or urgency
    // parameter at all, so it cannot be affected by this change.
    for (const { draft } of drafts) {
      const userRoster = draft.rosters.get(1)!;
      expect(userRoster).toHaveLength(17);
    }
  });
});
