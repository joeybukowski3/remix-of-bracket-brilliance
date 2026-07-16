/**
 * Focused tests for the dashboard-metadata plumbing bug: nextRunAt and
 * pendingGames exist in the raw generator payload and are already read by
 * useMlbPropsData and MlbGameDetail.tsx, but normalizeHrDashboardPayload
 * previously never copied them into the normalized HrDashboardPayload,
 * so they were always null/[] regardless of what the raw JSON contained.
 */
import { describe, expect, it } from "vitest";
import { normalizeHrDashboardPayload, type HrDashboardPendingGame } from "./MlbHrProps";

function rawPayload(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-07-16",
    generatedAt: "2026-07-16T09:32:34.452Z",
    games: [],
    pitchers: [],
    batters: [],
    ...overrides,
  };
}

/** The full shape normalizePendingGame produces for a sparse input -- every
 * unset optional field is explicitly `undefined`, `null`, or `[]` rather
 * than fabricated, matching the generator's own per-field semantics. */
function expectedPendingGame(overrides: Partial<HrDashboardPendingGame> = {}): HrDashboardPendingGame {
  return {
    matchup: "SEA @ TEX",
    gameKey: undefined,
    gameId: null,
    venue: undefined,
    officialGameDate: undefined,
    gameStartTime: undefined,
    gameNumber: null,
    doubleHeader: undefined,
    missingPitcherSide: [],
    ...overrides,
  };
}

describe("normalizeHrDashboardPayload — nextRunAt", () => {
  it("1. a valid nextRunAt survives normalization with whitespace trimmed", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({ nextRunAt: { time: "  2026-07-16T13:00:00-04:00  ", label: "  1:00 PM ET  " } }),
    );
    expect(result?.nextRunAt).toEqual({ time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" });
  });

  it("4a. a missing nextRunAt field produces nextRunAt: null", () => {
    expect(normalizeHrDashboardPayload(rawPayload())?.nextRunAt).toBeNull();
  });

  it("4b. an explicit null nextRunAt produces nextRunAt: null", () => {
    expect(normalizeHrDashboardPayload(rawPayload({ nextRunAt: null }))?.nextRunAt).toBeNull();
  });

  it("5. a non-object nextRunAt is rejected (malformed)", () => {
    expect(normalizeHrDashboardPayload(rawPayload({ nextRunAt: "10:00 AM ET" }))?.nextRunAt).toBeNull();
    expect(normalizeHrDashboardPayload(rawPayload({ nextRunAt: 42 }))?.nextRunAt).toBeNull();
    expect(normalizeHrDashboardPayload(rawPayload({ nextRunAt: ["10:00 AM ET"] }))?.nextRunAt).toBeNull();
  });

  it("6a. a nextRunAt missing 'label' is rejected (partial)", () => {
    const result = normalizeHrDashboardPayload(rawPayload({ nextRunAt: { time: "2026-07-16T13:00:00-04:00" } }));
    expect(result?.nextRunAt).toBeNull();
  });

  it("6b. a nextRunAt missing 'time' is rejected (partial)", () => {
    const result = normalizeHrDashboardPayload(rawPayload({ nextRunAt: { label: "1:00 PM ET" } }));
    expect(result?.nextRunAt).toBeNull();
  });

  it("6c. a nextRunAt with a blank (whitespace-only) label is rejected", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({ nextRunAt: { time: "2026-07-16T13:00:00-04:00", label: "   " } }),
    );
    expect(result?.nextRunAt).toBeNull();
  });

  it("6d. a nextRunAt with a non-string time is rejected", () => {
    const result = normalizeHrDashboardPayload(rawPayload({ nextRunAt: { time: 12345, label: "1:00 PM ET" } }));
    expect(result?.nextRunAt).toBeNull();
  });

  it("does not infer or fabricate a replacement time when nextRunAt is absent", () => {
    // No time-of-day inference: an absent/rejected nextRunAt is always
    // exactly null, never a guessed or generated value.
    const result = normalizeHrDashboardPayload(rawPayload());
    expect(result?.nextRunAt).toBe(null);
  });
});

describe("normalizeHrDashboardPayload — pendingGames", () => {
  it("2. a valid pending game survives normalization with every known generator field preserved", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({
        pendingGames: [
          {
            matchup: "SEA @ TEX",
            gameKey: "SEA@TEX",
            gameId: 716501,
            venue: "Globe Life Field",
            officialGameDate: "2026-07-16",
            gameStartTime: "2026-07-16T23:05:00.000Z",
            gameNumber: 1,
            doubleHeader: "N",
            missingPitcherSide: ["SEA"],
          },
        ],
      }),
    );
    expect(result?.pendingGames).toEqual([
      {
        matchup: "SEA @ TEX",
        gameKey: "SEA@TEX",
        gameId: 716501,
        venue: "Globe Life Field",
        officialGameDate: "2026-07-16",
        gameStartTime: "2026-07-16T23:05:00.000Z",
        gameNumber: 1,
        doubleHeader: "N",
        missingPitcherSide: ["SEA"],
      },
    ]);
  });

  it("3. multiple pending games preserve their original array order", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({
        pendingGames: [{ matchup: "SEA @ TEX" }, { matchup: "BAL @ CHC" }, { matchup: "NYY @ BOS" }],
      }),
    );
    expect(result?.pendingGames.map((g) => g.matchup)).toEqual(["SEA @ TEX", "BAL @ CHC", "NYY @ BOS"]);
  });

  it("4c. a missing pendingGames field produces an empty array", () => {
    expect(normalizeHrDashboardPayload(rawPayload())?.pendingGames).toEqual([]);
  });

  it("4d. a null pendingGames field produces an empty array", () => {
    expect(normalizeHrDashboardPayload(rawPayload({ pendingGames: null }))?.pendingGames).toEqual([]);
  });

  it("4e. a non-array pendingGames field produces an empty array", () => {
    expect(normalizeHrDashboardPayload(rawPayload({ pendingGames: "not an array" }))?.pendingGames).toEqual([]);
  });

  it("7a. a pending-game row with no matchup is filtered out", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({ pendingGames: [{ gameKey: "SEA@TEX" }, { matchup: "BAL @ CHC" }] }),
    );
    expect(result?.pendingGames).toEqual([expectedPendingGame({ matchup: "BAL @ CHC" })]);
  });

  it("7b. a pending-game row with a blank matchup is filtered out", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({ pendingGames: [{ matchup: "   " }, { matchup: "BAL @ CHC" }] }),
    );
    expect(result?.pendingGames).toEqual([expectedPendingGame({ matchup: "BAL @ CHC" })]);
  });

  it("7c. a non-object pending-game entry is filtered out", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({ pendingGames: ["not an object", { matchup: "BAL @ CHC" }, null, 42, undefined] }),
    );
    expect(result?.pendingGames).toEqual([expectedPendingGame({ matchup: "BAL @ CHC" })]);
  });

  it("8. valid rows are not altered beyond whitespace trimming -- numeric and array values are preserved exactly", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({
        pendingGames: [{ matchup: "  SEA @ TEX  ", gameId: 716501, gameNumber: 2, missingPitcherSide: ["SEA", "TEX"] }],
      }),
    );
    expect(result?.pendingGames).toEqual([
      expectedPendingGame({ matchup: "SEA @ TEX", gameId: 716501, gameNumber: 2, missingPitcherSide: ["SEA", "TEX"] }),
    ]);
  });

  it("does not create pending-game entries from the ordinary games list", () => {
    const result = normalizeHrDashboardPayload(
      rawPayload({
        games: [
          {
            gameKey: "BAL@CHC",
            matchup: "BAL @ CHC",
            awayTeam: "BAL",
            homeTeam: "CHC",
            stadium: "Wrigley Field",
            roofType: "Open",
            temperature: 78,
            precipitation: 0,
            windSpeed: 6,
            windDirection: "SW",
            conditions: "Clear",
            parkFactor: 1.0,
          },
        ],
        // pendingGames intentionally omitted
      }),
    );
    expect(result?.games).toHaveLength(1);
    expect(result?.pendingGames).toEqual([]);
  });
});

describe("normalizeHrDashboardPayload — does not mutate raw input", () => {
  it("9. the raw payload object and its nested nextRunAt/pendingGames are left untouched", () => {
    const raw = rawPayload({
      nextRunAt: { time: "  2026-07-16T13:00:00-04:00  ", label: "  1:00 PM ET  " },
      pendingGames: [{ matchup: "  SEA @ TEX  ", missingPitcherSide: ["SEA"] }],
    });
    const before = JSON.parse(JSON.stringify(raw));

    expect(() => normalizeHrDashboardPayload(raw)).not.toThrow();

    expect(JSON.parse(JSON.stringify(raw))).toEqual(before);
  });
});
