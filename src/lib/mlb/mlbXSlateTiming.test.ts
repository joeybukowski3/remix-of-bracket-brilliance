import { describe, expect, it } from "vitest";
import {
  SlatePhase,
  computeSlateTiming,
  fetchSlateTiming,
  getEtSlateDate,
  isGameExcluded,
  isGameStarted,
  normalizeScheduleGames,
} from "../../../scripts/lib/mlb-x-slate-timing.mjs";

const MIN = 60_000;

function scheduledGame(gameDateIso: string, detailedState = "Scheduled", abstractGameState = "Preview") {
  return { gameDate: gameDateIso, status: { detailedState, abstractGameState } };
}

/** Build a game whose first pitch is `minutesFromNow` minutes away from `now`. */
function gameAtOffset(now: Date, minutesFromNow: number, overrides: Record<string, unknown> = {}) {
  return {
    gameDate: new Date(now.getTime() + minutesFromNow * MIN).toISOString(),
    status: { detailedState: "Scheduled", abstractGameState: "Preview" },
    ...overrides,
  };
}

describe("computeSlateTiming windows and phases", () => {
  const now = new Date("2026-07-15T15:00:00Z");

  it("anchors every window to the earliest first pitch (noon ET earliest game)", () => {
    // Noon EDT = 16:00Z; now is 15:00Z → 60 min out.
    const result = computeSlateTiming({ games: [scheduledGame("2026-07-15T16:00:00Z")], now, slateDate: "2026-07-15" });
    expect(result.hasGames).toBe(true);
    expect(result.earliestGameTime).toBe("2026-07-15T16:00:00.000Z");
    expect(result.pollingStartsAt).toBe("2026-07-15T13:00:00.000Z"); // -180m
    expect(result.preferredWindowStartsAt).toBe("2026-07-15T14:30:00.000Z"); // -90m
    expect(result.preferredWindowEndsAt).toBe("2026-07-15T15:00:00.000Z"); // -60m
    expect(result.finalCutoffAt).toBe("2026-07-15T15:20:00.000Z"); // -40m
    expect(result.minutesUntilFirstPitch).toBe(60);
  });

  it("PRE_POLLING before the polling window (1:00 PM ET earliest game, 5h out)", () => {
    const result = computeSlateTiming({ games: [gameAtOffset(now, 300)], now });
    expect(result.phase).toBe(SlatePhase.PRE_POLLING);
    expect(result.isPostingWindow).toBe(false);
  });

  it("POLLING window (4:00 PM ET earliest game, 150m out)", () => {
    const result = computeSlateTiming({ games: [gameAtOffset(now, 150)], now });
    expect(result.phase).toBe(SlatePhase.POLLING);
    expect(result.isPostingWindow).toBe(true);
    expect(result.isPreferredWindow).toBe(false);
    expect(result.isFinalCutoff).toBe(false);
  });

  it("PREFERRED posting window (75m out)", () => {
    const result = computeSlateTiming({ games: [gameAtOffset(now, 75)], now });
    expect(result.phase).toBe(SlatePhase.PREFERRED);
    expect(result.isPreferredWindow).toBe(true);
    expect(result.isPostingWindow).toBe(true);
  });

  it("FINAL_CUTOFF window (50m out, 7:00 PM ET earliest game framing)", () => {
    const result = computeSlateTiming({ games: [gameAtOffset(now, 50)], now });
    expect(result.phase).toBe(SlatePhase.FINAL_CUTOFF);
    expect(result.isFinalCutoff).toBe(true);
    expect(result.isPostingWindow).toBe(true);
  });

  it("EXPIRED after the cutoff (30m out)", () => {
    const result = computeSlateTiming({ games: [gameAtOffset(now, 30)], now });
    expect(result.phase).toBe(SlatePhase.EXPIRED);
    expect(result.isExpired).toBe(true);
    expect(result.isPostingWindow).toBe(false);
  });

  it("phase boundaries are inclusive on the earlier side", () => {
    expect(computeSlateTiming({ games: [gameAtOffset(now, 180)], now }).phase).toBe(SlatePhase.POLLING);
    expect(computeSlateTiming({ games: [gameAtOffset(now, 90)], now }).phase).toBe(SlatePhase.PREFERRED);
    expect(computeSlateTiming({ games: [gameAtOffset(now, 60)], now }).phase).toBe(SlatePhase.FINAL_CUTOFF);
    expect(computeSlateTiming({ games: [gameAtOffset(now, 40)], now }).phase).toBe(SlatePhase.EXPIRED);
  });
});

describe("computeSlateTiming slate composition", () => {
  const now = new Date("2026-07-15T15:00:00Z");

  it("West-Coast-only slate anchors to the (late) first pitch", () => {
    // Only a 10:10 PM ET game = 02:10Z next day → far in the future → PRE_POLLING.
    const result = computeSlateTiming({ games: [scheduledGame("2026-07-16T02:10:00Z")], now });
    expect(result.hasGames).toBe(true);
    expect(result.phase).toBe(SlatePhase.PRE_POLLING);
    expect(result.earliestGameTime).toBe("2026-07-16T02:10:00.000Z");
  });

  it("doubleheader: earliest of the two games anchors the window", () => {
    const result = computeSlateTiming({
      games: [gameAtOffset(now, 75), gameAtOffset(now, 260)],
      now,
    });
    expect(result.minutesUntilFirstPitch).toBe(75);
    expect(result.phase).toBe(SlatePhase.PREFERRED);
    expect(result.usableGameCount).toBe(2);
  });

  it("postponed first game is excluded; the next game anchors the window", () => {
    const result = computeSlateTiming({
      games: [
        gameAtOffset(now, 60, { status: { detailedState: "Postponed", abstractGameState: "Preview" } }),
        gameAtOffset(now, 170),
      ],
      now,
    });
    expect(result.usableGameCount).toBe(1);
    expect(result.minutesUntilFirstPitch).toBe(170);
    expect(result.phase).toBe(SlatePhase.POLLING);
  });

  it("suspended games are excluded from the earliest calc", () => {
    expect(isGameExcluded({ status: { detailedState: "Suspended" } })).toBe(true);
    expect(isGameExcluded({ status: { detailedState: "Cancelled" } })).toBe(true);
    expect(isGameExcluded({ status: { detailedState: "Scheduled" } })).toBe(false);
  });

  it("games with missing start times are dropped", () => {
    const result = computeSlateTiming({
      games: [{ status: { detailedState: "Scheduled" } }, gameAtOffset(now, 120)],
      now,
    });
    expect(result.usableGameCount).toBe(1);
    expect(result.minutesUntilFirstPitch).toBe(120);
  });

  it("missing schedule / no games → NO_GAMES, fails closed", () => {
    const result = computeSlateTiming({ games: [], now });
    expect(result.phase).toBe(SlatePhase.NO_GAMES);
    expect(result.hasGames).toBe(false);
    expect(result.isPostingWindow).toBe(false);
    expect(result.earliestGameTime).toBeNull();
  });

  it("all games already started → allGamesStarted flag set", () => {
    const result = computeSlateTiming({
      games: [
        gameAtOffset(now, -30, { status: { detailedState: "In Progress", abstractGameState: "Live" } }),
        gameAtOffset(now, -120, { status: { detailedState: "Final", abstractGameState: "Final" } }),
      ],
      now,
    });
    expect(result.allGamesStarted).toBe(true);
    expect(result.phase).toBe(SlatePhase.EXPIRED);
  });

  it("start-time change is reflected immediately (recompute off new gameDate)", () => {
    const first = computeSlateTiming({ games: [gameAtOffset(now, 150)], now });
    expect(first.phase).toBe(SlatePhase.POLLING);
    // Game pushed back 2 hours → back into PRE_POLLING.
    const pushed = computeSlateTiming({ games: [gameAtOffset(now, 270)], now });
    expect(pushed.phase).toBe(SlatePhase.PRE_POLLING);
  });
});

describe("isGameStarted", () => {
  const nowMs = new Date("2026-07-15T20:00:00Z").getTime();
  it("treats live/final abstract states as started", () => {
    expect(isGameStarted({ status: { abstractGameState: "Live" } }, nowMs)).toBe(true);
    expect(isGameStarted({ status: { abstractGameState: "Final" } }, nowMs)).toBe(true);
  });
  it("treats a passed gameDate as started even when status is stale", () => {
    expect(isGameStarted({ gameDate: "2026-07-15T19:00:00Z", status: { abstractGameState: "Preview" } }, nowMs)).toBe(true);
  });
  it("treats a future scheduled game as not started", () => {
    expect(isGameStarted({ gameDate: "2026-07-15T21:00:00Z", status: { abstractGameState: "Preview" } }, nowMs)).toBe(false);
  });
});

describe("DST safety", () => {
  it("window math is identical in summer (EDT) and winter (EST) for the same offsets", () => {
    const summerNow = new Date("2026-07-15T15:00:00Z");
    const winterNow = new Date("2026-01-15T15:00:00Z");
    const summer = computeSlateTiming({ games: [gameAtOffset(summerNow, 75)], now: summerNow });
    const winter = computeSlateTiming({ games: [gameAtOffset(winterNow, 75)], now: winterNow });
    expect(summer.phase).toBe(SlatePhase.PREFERRED);
    expect(winter.phase).toBe(SlatePhase.PREFERRED);
    expect(summer.minutesUntilFirstPitch).toBe(winter.minutesUntilFirstPitch);
  });

  it("getEtSlateDate returns the correct Eastern calendar date across seasons", () => {
    // Noon EDT and noon EST both fall on their calendar day.
    expect(getEtSlateDate(new Date("2026-07-15T16:00:00Z"))).toBe("2026-07-15");
    expect(getEtSlateDate(new Date("2026-01-15T17:00:00Z"))).toBe("2026-01-15");
    // Just after midnight ET in summer (04:30Z) is still the prior calendar day.
    expect(getEtSlateDate(new Date("2026-07-15T03:30:00Z"))).toBe("2026-07-14");
  });
});

describe("normalizeScheduleGames", () => {
  it("extracts games from a StatsAPI dates[].games payload", () => {
    const json = {
      dates: [
        {
          games: [
            {
              gamePk: 12345,
              gameDate: "2026-07-15T17:05:00Z",
              status: { detailedState: "Scheduled" },
              teams: { away: { team: { abbreviation: "PHI" } }, home: { team: { abbreviation: "DET" } } },
            },
          ],
        },
      ],
    };
    const games = normalizeScheduleGames(json);
    expect(games).toHaveLength(1);
    expect(games[0].gamePk).toBe(12345);
    expect(games[0].matchup).toBe("PHI @ DET");
  });

  it("tolerates malformed payloads without throwing", () => {
    expect(normalizeScheduleGames(null)).toEqual([]);
    expect(normalizeScheduleGames({})).toEqual([]);
    expect(normalizeScheduleGames({ dates: "bad" })).toEqual([]);
  });
});

describe("fetchSlateTiming fail-closed", () => {
  const now = new Date("2026-07-15T15:00:00Z");

  it("returns a NO_GAMES result with an error flag on HTTP failure", async () => {
    const fetchImpl = async () => ({ ok: false, status: 503 }) as unknown as Response;
    const result = await fetchSlateTiming({ now, date: "2026-07-15", fetchImpl });
    expect(result.phase).toBe(SlatePhase.NO_GAMES);
    expect(result.error).toContain("503");
  });

  it("returns a NO_GAMES result with an error flag when fetch throws", async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    const result = await fetchSlateTiming({ now, date: "2026-07-15", fetchImpl });
    expect(result.phase).toBe(SlatePhase.NO_GAMES);
    expect(result.error).toBe("network down");
  });

  it("computes timing from a successful schedule fetch", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({
          dates: [{ games: [{ gamePk: 1, gameDate: new Date(now.getTime() + 75 * MIN).toISOString(), status: { detailedState: "Scheduled" } }] }],
        }),
      }) as unknown as Response;
    const result = await fetchSlateTiming({ now, date: "2026-07-15", fetchImpl });
    expect(result.phase).toBe(SlatePhase.PREFERRED);
    expect(result.minutesUntilFirstPitch).toBe(75);
  });
});
