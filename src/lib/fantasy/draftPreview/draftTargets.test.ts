import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DRAFT_TARGETS_STORAGE_KEY,
  addTarget,
  countTargetsByRound,
  createEmptyDraftTargetsState,
  getRoundsForPlayer,
  getTargetsForRound,
  loadDraftTargetsState,
  moveTargetDown,
  moveTargetUp,
  parseDraftTargetsState,
  removePlayerFromAllTargets,
  removeTarget,
  saveDraftTargetsState,
  type DraftTargetsState,
} from "@/lib/fantasy/draftPreview/draftTargets";

describe("addTarget", () => {
  it("adds a player to a round's target list", () => {
    const state = addTarget(createEmptyDraftTargetsState(), 3, 42);
    expect(getTargetsForRound(state, 3)).toEqual([42]);
  });

  it("allows the same player to be targeted in multiple rounds", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 3, 42);
    state = addTarget(state, 4, 42);
    expect(getTargetsForRound(state, 3)).toEqual([42]);
    expect(getTargetsForRound(state, 4)).toEqual([42]);
    expect(getRoundsForPlayer(state, 42)).toEqual([3, 4]);
  });

  it("prevents a duplicate entry when the same player is targeted twice in the same round", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 3, 42);
    state = addTarget(state, 3, 42);
    expect(getTargetsForRound(state, 3)).toEqual([42]);
  });

  it("appends new targets at the end, preserving existing order", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 1, 10);
    state = addTarget(state, 1, 20);
    state = addTarget(state, 1, 30);
    expect(getTargetsForRound(state, 1)).toEqual([10, 20, 30]);
  });

  it("does not mutate the previous state object (immutable update)", () => {
    const before = createEmptyDraftTargetsState();
    const after = addTarget(before, 1, 10);
    expect(getTargetsForRound(before, 1)).toEqual([]);
    expect(getTargetsForRound(after, 1)).toEqual([10]);
  });
});

describe("removeTarget", () => {
  it("removes a player from one round only, leaving other rounds and other players untouched", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 3, 42);
    state = addTarget(state, 3, 99);
    state = addTarget(state, 4, 42);
    state = removeTarget(state, 3, 42);
    expect(getTargetsForRound(state, 3)).toEqual([99]);
    expect(getTargetsForRound(state, 4)).toEqual([42]);
  });

  it("is a no-op when the player is not targeted in that round", () => {
    const state = addTarget(createEmptyDraftTargetsState(), 3, 42);
    const after = removeTarget(state, 5, 42);
    expect(after).toBe(state);
  });

  it("removes the round entirely once its last target is removed", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 3, 42);
    state = removeTarget(state, 3, 42);
    expect(getTargetsForRound(state, 3)).toEqual([]);
    expect(countTargetsByRound(state).has(3)).toBe(false);
  });
});

describe("removePlayerFromAllTargets", () => {
  it("clears a player from every round they were targeted in", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 1, 42);
    state = addTarget(state, 2, 42);
    state = addTarget(state, 3, 99);
    state = removePlayerFromAllTargets(state, 42);
    expect(getRoundsForPlayer(state, 42)).toEqual([]);
    expect(getTargetsForRound(state, 3)).toEqual([99]);
  });

  it("is a no-op (returns the same reference) when the player has no targets", () => {
    const state = addTarget(createEmptyDraftTargetsState(), 1, 42);
    expect(removePlayerFromAllTargets(state, 999)).toBe(state);
  });
});

describe("moveTargetUp / moveTargetDown", () => {
  it("moves a target earlier in the round's manual order", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 1, 10);
    state = addTarget(state, 1, 20);
    state = addTarget(state, 1, 30);
    state = moveTargetUp(state, 1, 30);
    expect(getTargetsForRound(state, 1)).toEqual([10, 30, 20]);
  });

  it("moves a target later in the round's manual order", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 1, 10);
    state = addTarget(state, 1, 20);
    state = addTarget(state, 1, 30);
    state = moveTargetDown(state, 1, 10);
    expect(getTargetsForRound(state, 1)).toEqual([20, 10, 30]);
  });

  it("is a no-op moving the first target up or the last target down", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 1, 10);
    state = addTarget(state, 1, 20);
    expect(getTargetsForRound(moveTargetUp(state, 1, 10), 1)).toEqual([10, 20]);
    expect(getTargetsForRound(moveTargetDown(state, 1, 20), 1)).toEqual([10, 20]);
  });

  it("never changes order in a round other than the one requested", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 1, 10);
    state = addTarget(state, 1, 20);
    state = addTarget(state, 2, 30);
    state = addTarget(state, 2, 40);
    state = moveTargetDown(state, 1, 10);
    expect(getTargetsForRound(state, 2)).toEqual([30, 40]);
  });
});

describe("getTargetsForRound / getRoundsForPlayer", () => {
  it("returns an empty list for a round with no saved targets", () => {
    expect(getTargetsForRound(createEmptyDraftTargetsState(), 7)).toEqual([]);
  });

  it("returns rounds in ascending order regardless of insertion order", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 5, 42);
    state = addTarget(state, 1, 42);
    state = addTarget(state, 3, 42);
    expect(getRoundsForPlayer(state, 42)).toEqual([1, 3, 5]);
  });
});

describe("countTargetsByRound", () => {
  it("counts targets per round, omitting empty rounds", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 1, 10);
    state = addTarget(state, 1, 20);
    state = addTarget(state, 2, 30);
    const counts = countTargetsByRound(state);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.has(3)).toBe(false);
  });
});

describe("parseDraftTargetsState (fail-closed validation)", () => {
  it("returns an empty state for null/undefined/non-object input", () => {
    expect(parseDraftTargetsState(null)).toEqual(createEmptyDraftTargetsState());
    expect(parseDraftTargetsState(undefined)).toEqual(createEmptyDraftTargetsState());
    expect(parseDraftTargetsState("not an object")).toEqual(createEmptyDraftTargetsState());
    expect(parseDraftTargetsState(42)).toEqual(createEmptyDraftTargetsState());
  });

  it("returns an empty state when the version does not match the current schema", () => {
    expect(parseDraftTargetsState({ version: 2, rounds: { "1": [42] } })).toEqual(createEmptyDraftTargetsState());
    expect(parseDraftTargetsState({ rounds: { "1": [42] } })).toEqual(createEmptyDraftTargetsState());
  });

  it("returns an empty state when rounds is missing, an array, or not an object", () => {
    expect(parseDraftTargetsState({ version: 1 })).toEqual(createEmptyDraftTargetsState());
    expect(parseDraftTargetsState({ version: 1, rounds: [1, 2, 3] })).toEqual(createEmptyDraftTargetsState());
    expect(parseDraftTargetsState({ version: 1, rounds: "nope" })).toEqual(createEmptyDraftTargetsState());
  });

  it("drops non-numeric or non-positive round keys without crashing", () => {
    const parsed = parseDraftTargetsState({ version: 1, rounds: { abc: [42], "0": [42], "-1": [42], "3": [42] } });
    expect(getTargetsForRound(parsed, 3)).toEqual([42]);
    expect(Object.keys(parsed.rounds)).toEqual(["3"]);
  });

  it("drops non-array round values and non-integer/duplicate ranks within a round", () => {
    const parsed = parseDraftTargetsState({
      version: 1,
      rounds: { "1": "not an array", "2": [42, 42, "nope", 1.5, -3, 99] },
    });
    expect(getTargetsForRound(parsed, 1)).toEqual([]);
    expect(getTargetsForRound(parsed, 2)).toEqual([42, 99]);
  });

  it("round-trips a well-formed payload exactly", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 3, 42);
    state = addTarget(state, 3, 99);
    state = addTarget(state, 5, 7);
    expect(parseDraftTargetsState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

describe("localStorage persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("saves to and reloads from localStorage under the versioned key", () => {
    let state = createEmptyDraftTargetsState();
    state = addTarget(state, 3, 42);
    state = addTarget(state, 3, 99);
    saveDraftTargetsState(state);

    const raw = window.localStorage.getItem(DRAFT_TARGETS_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const reloaded = loadDraftTargetsState();
    expect(getTargetsForRound(reloaded, 3)).toEqual([42, 99]);
  });

  it("returns an empty state (never throws) when localStorage holds malformed JSON", () => {
    window.localStorage.setItem(DRAFT_TARGETS_STORAGE_KEY, "{not valid json");
    expect(() => loadDraftTargetsState()).not.toThrow();
    expect(loadDraftTargetsState()).toEqual(createEmptyDraftTargetsState());
  });

  it("returns an empty state when localStorage holds a payload from a different schema version", () => {
    window.localStorage.setItem(DRAFT_TARGETS_STORAGE_KEY, JSON.stringify({ version: 999, rounds: { "1": [1] } }));
    expect(loadDraftTargetsState()).toEqual(createEmptyDraftTargetsState());
  });

  it("returns an empty state when nothing has been saved yet", () => {
    expect(loadDraftTargetsState()).toEqual(createEmptyDraftTargetsState());
  });
});

describe("type sanity", () => {
  it("createEmptyDraftTargetsState matches the DraftTargetsState shape", () => {
    const state: DraftTargetsState = createEmptyDraftTargetsState();
    expect(state.version).toBe(1);
    expect(state.rounds).toEqual({});
  });
});
