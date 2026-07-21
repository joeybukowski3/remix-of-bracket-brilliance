import { describe, expect, it } from "vitest";
import { assertEmailSelectionConfirmed, selectNumerologyEmailPlays, selectNumerologyEmailPlaysFromArtifact } from "../../../scripts/lib/mlb-numerology-email-selection.mjs";
import { buildNumerologyArtifact } from "../../../scripts/lib/mlb-x-selection-artifact.mjs";

function confirmedPlay(player: string, score: number, overrides: Record<string, unknown> = {}) {
  return { player, playerId: overrides.playerId ?? player, team: overrides.team ?? "NYM", opponent: overrides.opponent ?? "LAD", numerologyScore: score, liveConfirmed: true, ...overrides };
}

function snapshot(asOf = new Date().toISOString()) {
  return { asOf, timing: { phase: "FINAL_CUTOFF", minutesUntilFirstPitch: 50, earliestGameTime: null } };
}

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
  const cardWithDate = { ...baseCard, date: "2026-07-20" };

  function validArtifact(rows = [confirmedPlay("Confirmed One", 55), confirmedPlay("Confirmed Two", 52)]) {
    return buildNumerologyArtifact({ slateDate: "2026-07-20", snapshot: snapshot(), selectedRows: rows, selectionStatus: "READY_CONFIRMED_SELECTIONS" });
  }

  it("uses exactly the artifact's rows -- not an independent re-derivation from the card", () => {
    const selected = selectNumerologyEmailPlaysFromArtifact(cardWithDate, validArtifact());
    expect(selected.emailSelectedPlays.map((entry: { player: string }) => entry.player)).toEqual(["Confirmed One", "Confirmed Two"]);
    expect(selected.topPlay?.player).toBe("Confirmed One");
    expect(selected.emailSelectionPolicy.mode).toBe("confirmed-lineup-artifact");
    expect(selected.emailSelectionPolicy.confirmationStatus).toBe("confirmed");
  });

  it("throws when the artifact's slate date does not match the card's (wrong-slate artifact must fail closed)", () => {
    const wrongSlateArtifact = { ...validArtifact(), slateDate: "2026-07-19" };
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, wrongSlateArtifact)).toThrow(/slate date/i);
  });

  it("throws when the artifact's confirmation snapshot is stale (must fail closed)", () => {
    const staleAsOf = new Date(Date.now() - 60 * 60_000).toISOString();
    const staleArtifact = buildNumerologyArtifact({ slateDate: "2026-07-20", snapshot: snapshot(staleAsOf), selectedRows: [confirmedPlay("Stale Play", 60)], selectionStatus: "READY_CONFIRMED_SELECTIONS" });
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, staleArtifact)).toThrow(/stale/i);
  });

  it("throws when the artifact is missing or malformed", () => {
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, null)).toThrow(/missing or malformed/i);
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, {})).toThrow(/missing or malformed/i);
  });

  it("throws when the artifact has zero rows (empty artifact must block live delivery)", () => {
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, validArtifact([]))).toThrow(/zero confirmed rows/i);
  });

  it("throws when any row in the artifact is missing the live-confirmed marker (an unconfirmed player must block live delivery)", () => {
    const unconfirmedRow = { player: "Snuck In Unconfirmed", team: "NYM", opponent: "LAD", numerologyScore: 70 }; // no liveConfirmed
    const artifact = validArtifact([confirmedPlay("Legit", 80), unconfirmedRow]);
    expect(() => selectNumerologyEmailPlaysFromArtifact(cardWithDate, artifact)).toThrow(/without live lineup confirmation/i);
  });
});

describe("assertEmailSelectionConfirmed (production-safety gate)", () => {
  it("live email send with no artifact fails -- the unconfirmed score-threshold fallback is never sendable", () => {
    const unconfirmedSelection = selectNumerologyEmailPlays(card([play("One", 82), play("Two", 76), play("Three", 71)]));
    expect(unconfirmedSelection.emailSelectionPolicy.confirmationStatus).toBe("unconfirmed-preview");
    expect(() => assertEmailSelectionConfirmed(unconfirmedSelection.emailSelectionPolicy)).toThrow(/not confirmed/i);
  });

  it("manual email rescue uses the confirmed selection: a valid artifact-driven selection is allowed to send", () => {
    const confirmedSelection = selectNumerologyEmailPlaysFromArtifact(
      { ...card([]), date: "2026-07-20" },
      buildNumerologyArtifact({
        slateDate: "2026-07-20",
        snapshot: snapshot(),
        selectedRows: [confirmedPlay("Confirmed One", 55)],
        selectionStatus: "FORCED_CONFIRMED_SELECTION",
      }),
    );
    expect(() => assertEmailSelectionConfirmed(confirmedSelection.emailSelectionPolicy)).not.toThrow();
  });
});
