import { describe, expect, it } from "vitest";
import { selectNumerologyEmailPlays, selectNumerologyEmailPlaysFromArtifact } from "../../../scripts/lib/mlb-numerology-email-selection.mjs";

function play(player, score, overrides = {}) {
  return {
    player,
    playerId: overrides.playerId ?? player,
    team: overrides.team ?? "NYM",
    opponent: overrides.opponent ?? "LAD",
    numerologyScore: score,
    isTopPlay: false,
    ...overrides,
  };
}

function card(plays) {
  return {
    plays,
    topPlay: plays[0] ?? null,
    allQualifiedPlaysOver50: plays.filter((entry) => entry.numerologyScore > 50),
  };
}

describe("selectNumerologyEmailPlays", () => {
  it("includes every distinct play scoring strictly above 65", () => {
    const selected = selectNumerologyEmailPlays(card([
      play("One", 82), play("Two", 76), play("Three", 71), play("Four", 68), play("Five", 65),
    ]));
    expect(selected.emailSelectedPlays.map((entry) => entry.player)).toEqual(["One", "Two", "Three", "Four"]);
    expect(selected.emailSelectionPolicy.mode).toBe("all-above-threshold");
  });

  it("appends only the next-ranked player when two clear the threshold", () => {
    const selected = selectNumerologyEmailPlays(card([
      play("One", 74), play("Two", 66), play("Three", 65), play("Four", 64),
    ]));
    expect(selected.emailSelectedPlays.map((entry) => entry.player)).toEqual(["One", "Two", "Three"]);
    expect(selected.emailSelectedPlays).toHaveLength(3);
  });

  it("uses the top three overall when no play clears the threshold", () => {
    const selected = selectNumerologyEmailPlays(card([
      play("One", 65), play("Two", 64), play("Three", 61), play("Four", 58),
    ]));
    expect(selected.emailSelectedPlays.map((entry) => entry.player)).toEqual(["One", "Two", "Three"]);
  });

  it("preserves source ranking order while deduplicating by player ID plus team", () => {
    const selected = selectNumerologyEmailPlays(card([
      play("Jackson Merrill", 79, { playerId: 701538, team: "SD" }),
      play("J. Merrill", 78, { playerId: 701538, team: "SD" }),
      play("Second", 67, { playerId: 2 }),
      play("Third", 62, { playerId: 3 }),
      play("Fourth", 60, { playerId: 4 }),
    ]));
    expect(selected.emailSelectedPlays.map((entry) => entry.player)).toEqual(["Jackson Merrill", "Second", "Third"]);
  });

  it("deduplicates normalized player name plus team when no player ID exists", () => {
    const selected = selectNumerologyEmailPlays(card([
      play("Jackson  Merrill", 70, { playerId: null, team: "SD" }),
      play(" jackson merrill ", 69, { playerId: null, team: "SD" }),
      play("Second", 64, { playerId: null }),
      play("Third", 60, { playerId: null }),
    ]));
    expect(selected.emailSelectedPlays).toHaveLength(3);
    expect(selected.emailSelectedPlays.map((entry) => entry.numerologyScore)).toEqual([70, 64, 60]);
  });

  it("shows only the valid ranked players available and leaves board fields unchanged", () => {
    const original = card([play("Only Player", 40), { player: "", team: "TOR", numerologyScore: 90 }]);
    const selected = selectNumerologyEmailPlays(original);
    expect(selected.emailSelectedPlays.map((entry) => entry.player)).toEqual(["Only Player"]);
    expect(selected.topPlay.player).toBe("Only Player");
    expect(selected.plays).toBe(original.plays);
    expect(selected.allQualifiedPlaysOver50).toBe(original.allQualifiedPlaysOver50);
  });
});

describe("selectNumerologyEmailPlaysFromArtifact", () => {
  const baseCard = card([play("Ignored Score-Threshold Play", 90)]);

  it("uses exactly the artifact's rows -- not an independent re-derivation from the card", () => {
    const artifact = {
      slateDate: undefined,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      confirmationAsOf: "2026-07-20T18:00:00.000Z",
      rows: [play("Confirmed One", 55), play("Confirmed Two", 52)],
    };
    const cardWithDate = { ...baseCard, date: "2026-07-20" };
    artifact.slateDate = "2026-07-20";
    const selected = selectNumerologyEmailPlaysFromArtifact(cardWithDate, artifact);
    expect(selected.emailSelectedPlays.map((entry) => entry.player)).toEqual(["Confirmed One", "Confirmed Two"]);
    expect(selected.topPlay?.player).toBe("Confirmed One");
    expect(selected.emailSelectionPolicy.mode).toBe("confirmed-lineup-artifact");
  });

  it("throws when the artifact's slate date does not match the card's (stale/mismatched artifact must fail loudly)", () => {
    const cardWithDate = { ...baseCard, date: "2026-07-20" };
    const staleArtifact = { slateDate: "2026-07-19", rows: [play("Stale Play", 60)] };
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, staleArtifact)).toThrow(/slate date/i);
  });

  it("throws when the artifact is missing or malformed", () => {
    const cardWithDate = { ...baseCard, date: "2026-07-20" };
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, null)).toThrow(/missing or malformed/i);
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, {})).toThrow(/missing or malformed/i);
  });

  it("produces an empty selection (no topPlay) when the artifact has zero confirmed rows", () => {
    const cardWithDate = { ...baseCard, date: "2026-07-20" };
    const emptyArtifact = { slateDate: "2026-07-20", rows: [] };
    const selected = selectNumerologyEmailPlaysFromArtifact(cardWithDate, emptyArtifact);
    expect(selected.emailSelectedPlays).toEqual([]);
    expect(selected.topPlay).toBeNull();
  });
});
