import { describe, expect, it } from "vitest";
import { SIMULATION_PLAYERS } from "../data";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { replayDeterministicDraft } from "../engine/replayDraft";

describe("16-0 deterministic draft and season replay", () => {
  it("reproduces a complete run from seed, slot, and draft history", () => {
    const seed = "server-replay";
    const draftSlot = 7;
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, draftSlot, seed);
    const replay = replayDeterministicDraft({
      seed,
      draftSlot,
      draftHistory: draft.selections,
    });
    expect(replay.userRoster).toHaveLength(17);
    expect(replay.result.regularWins + replay.result.regularLosses).toBe(14);
  });

  it("rejects a modified CPU selection", () => {
    const seed = "modified-cpu";
    const draftSlot = 4;
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, draftSlot, seed);
    const modified = draft.selections.map((selection) => ({ ...selection }));
    const cpuIndex = modified.findIndex((selection) => selection.slot !== draftSlot);
    modified[cpuIndex].playerId = SIMULATION_PLAYERS.find(
      (player) => !modified.some((selection) => selection.playerId === player.id),
    )!.id;
    expect(() =>
      replayDeterministicDraft({ seed, draftSlot, draftHistory: modified }),
    ).toThrow(/CPU selection does not match|Illegal roster construction/);
  });

  it("rejects duplicate players and altered result payloads", () => {
    const seed = "modified-result";
    const draftSlot = 1;
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, draftSlot, seed);
    const duplicate = draft.selections.map((selection) => ({ ...selection }));
    duplicate[1].playerId = duplicate[0].playerId;
    expect(() =>
      replayDeterministicDraft({ seed, draftSlot, draftHistory: duplicate }),
    ).toThrow(/drafted more than once/);

    const replay = replayDeterministicDraft({
      seed,
      draftSlot,
      draftHistory: draft.selections,
    });
    expect(() =>
      replayDeterministicDraft({
        seed,
        draftSlot,
        draftHistory: draft.selections,
        submittedResult: { ...replay.result, finalWins: 16 },
      }),
    ).toThrow(/does not match/);
  });
});
