import { describe, expect, it } from "vitest";
import parActualSource from "../../../data/fantasy/2025-par-actual.json";
import parConsensusSource from "../../../data/fantasy/2026-par-consensus.json";
import {
  FANTASY_PAR_ACTUAL_2025,
  buildParActual2025Index,
  getParActual2025,
  type FantasyParActualSourceRow,
} from "@/lib/fantasy/parActual2025";

const rawRows = parActualSource as readonly FantasyParActualSourceRow[];
const consensusIds = new Set(
  (parConsensusSource as readonly { "Source ID": string }[]).map((row) => row["Source ID"]),
);

describe("2025 actual PAR source file", () => {
  it("carries the expected populations", () => {
    expect(rawRows).toHaveLength(833);
    const withId = rawRows.filter((row) => row["Source ID"]);
    expect(withId).toHaveLength(587);
    expect(rawRows.length - withId.length).toBe(246);
    expect(withId.every((row) => consensusIds.has(row["Source ID"]!))).toBe(true);
    expect(withId.filter((row) => row["2025 Season PAR"] == null)).toHaveLength(99);
  });

  it("uses a single QB replacement baseline, taken as supplied", () => {
    const baselines = new Set(
      rawRows
        .filter((row) => row.Position === "QB" && row["2025 Replacement PPG"] != null)
        .map((row) => row["2025 Replacement PPG"]),
    );
    expect([...baselines]).toEqual([17.95]);
  });
});

describe("buildParActual2025Index", () => {
  it("indexes only rows with a Source ID and complete stats", () => {
    expect(FANTASY_PAR_ACTUAL_2025.size).toBe(587 - 99);
  });

  it("drops rows with a null Source ID instead of name-matching them", () => {
    const index = buildParActual2025Index([
      { ...rawRows[0], "Source ID": null, Player: "Unmatched Player" },
    ]);
    expect(index.size).toBe(0);
  });

  it("drops joinable rows whose stats are null rather than reporting zero", () => {
    const index = buildParActual2025Index([
      {
        ...rawRows[0],
        "Source ID": "RookiE01",
        "2025 Games Played": null,
        "2025 Fantasy Points": null,
        "2025 PPG": null,
        "2025 Replacement PPG": null,
        "2025 PAR/G": null,
        "2025 Season PAR": null,
      },
    ]);
    expect(index.get("RookiE01")).toBeUndefined();
  });

  it("rejects a duplicate Source ID rather than silently overwriting", () => {
    expect(() => buildParActual2025Index([rawRows[0], rawRows[0]])).toThrow(/Duplicate/i);
  });
});

describe("getParActual2025", () => {
  it("returns the supplied 2025 season verbatim", () => {
    expect(getParActual2025("AlleJo01")).toMatchObject({
      player: "Josh Allen",
      gamesPlayed: 17,
      ppg: 22.04,
      replacementPpg: 17.95,
      parPerGame: 4.09,
      seasonPar: 69.5,
    });
  });

  it("returns undefined for an absent or missing Source ID", () => {
    expect(getParActual2025(undefined)).toBeUndefined();
    expect(getParActual2025("no-such-id")).toBeUndefined();
  });
});
