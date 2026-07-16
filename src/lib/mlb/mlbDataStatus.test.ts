import { describe, expect, it } from "vitest";
import { deriveMlbDataStatus, type MlbFetchState, type MlbStatusPayload } from "./mlbDataStatus";

// today, in the sense every fixture below treats as "today's ET slate"
const TODAY_ET = "2026-07-16";
// noon UTC on 2026-07-16 = 8:00 AM EDT on 2026-07-16 -- safely inside the
// ET calendar day on both sides, not a boundary case itself.
const NOW = new Date("2026-07-16T12:00:00.000Z");

const NOT_STARTED: MlbFetchState = { loading: true, error: null, hasCompletedInitialFetch: false };
const IN_FLIGHT_REFRESH: MlbFetchState = { loading: true, error: null, hasCompletedInitialFetch: true };
const SETTLED_OK: MlbFetchState = { loading: false, error: null, hasCompletedInitialFetch: true };
const SETTLED_ERROR: MlbFetchState = { loading: false, error: "Failed to load MLB data.", hasCompletedInitialFetch: true };

function payload(overrides: Partial<MlbStatusPayload> = {}): MlbStatusPayload {
  return {
    date: TODAY_ET,
    generatedAt: "2026-07-16T09:32:34.452Z",
    games: [{ gameKey: "BAL@CHC" }],
    batters: [{ lineupStatus: "confirmed" }, { lineupStatus: "confirmed" }],
    nextRunAt: null,
    ...overrides,
  };
}

describe("deriveMlbDataStatus — loading", () => {
  it("1. returns loading when the initial fetch has not completed and no payload exists", () => {
    expect(deriveMlbDataStatus(null, NOT_STARTED, NOW)).toEqual({ kind: "loading" });
  });

  it("2. does not return loading for a background refresh when a usable payload already exists", () => {
    const result = deriveMlbDataStatus(payload(), IN_FLIGHT_REFRESH, NOW);
    expect(result.kind).not.toBe("loading");
    expect(result).toEqual({ kind: "current", slateDate: TODAY_ET, generatedAt: "2026-07-16T09:32:34.452Z" });
  });

  it("loading precedence: a not-yet-completed fetch with no usable payload returns loading even if fetchState.error is already set", () => {
    // Documents the exact precedence decision in the module header: rule 1
    // is checked strictly before rule 2, so an error surfacing before the
    // very first fetch has been marked complete still reads as "loading",
    // not "error". This is a real possible input shape for this pure
    // function even if a real hook always flips hasCompletedInitialFetch
    // to true in the same tick it sets an error.
    const state: MlbFetchState = { loading: false, error: "boom", hasCompletedInitialFetch: false };
    expect(deriveMlbDataStatus(null, state, NOW)).toEqual({ kind: "loading" });
  });
});

describe("deriveMlbDataStatus — error", () => {
  it("3. fetch error with no retained payload omits slateDate/generatedAt and reports hasLastKnownData: false", () => {
    expect(deriveMlbDataStatus(null, SETTLED_ERROR, NOW)).toEqual({
      kind: "error",
      message: "Failed to load MLB data.",
      hasLastKnownData: false,
    });
  });

  it("4. fetch error with a retained usable payload reports hasLastKnownData: true and preserves slateDate/generatedAt", () => {
    expect(deriveMlbDataStatus(payload(), SETTLED_ERROR, NOW)).toEqual({
      kind: "error",
      message: "Failed to load MLB data.",
      hasLastKnownData: true,
      slateDate: TODAY_ET,
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("9. error takes precedence over stale (mismatched slate date, fetch error set)", () => {
    const result = deriveMlbDataStatus(payload({ date: "2026-07-15" }), SETTLED_ERROR, NOW);
    expect(result.kind).toBe("error");
  });
});

describe("deriveMlbDataStatus — unavailable", () => {
  it("5. completed fetch with a null payload returns unavailable", () => {
    expect(deriveMlbDataStatus(null, SETTLED_OK, NOW)).toEqual({ kind: "unavailable" });
  });

  it("19a. completed fetch with a missing date returns unavailable, not a throw", () => {
    expect(() => deriveMlbDataStatus(payload({ date: undefined }), SETTLED_OK, NOW)).not.toThrow();
    expect(deriveMlbDataStatus(payload({ date: undefined }), SETTLED_OK, NOW)).toEqual({ kind: "unavailable" });
  });

  it("19b. completed fetch with a malformed date (invalid calendar date) returns unavailable, not a throw", () => {
    // 2026-02-30 does not exist; new Date(...) would silently roll this
    // into March without the noon-UTC round-trip guard.
    expect(() => deriveMlbDataStatus(payload({ date: "2026-02-30" }), SETTLED_OK, NOW)).not.toThrow();
    expect(deriveMlbDataStatus(payload({ date: "2026-02-30" }), SETTLED_OK, NOW)).toEqual({ kind: "unavailable" });
  });

  it("19c. a not-yet-completed fetch with a malformed date returns loading, not unavailable (documented alternate safe state)", () => {
    expect(deriveMlbDataStatus(payload({ date: "not-a-date" }), NOT_STARTED, NOW)).toEqual({ kind: "loading" });
  });
});

describe("deriveMlbDataStatus — current", () => {
  it("6. today's ET slate with games and fully confirmed lineups returns current", () => {
    expect(deriveMlbDataStatus(payload(), SETTLED_OK, NOW)).toEqual({
      kind: "current",
      slateDate: TODAY_ET,
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("15. all-confirmed lineups returns current rather than lineup-pending", () => {
    const result = deriveMlbDataStatus(
      payload({ batters: [{ lineupStatus: "confirmed" }, { lineupStatus: "confirmed" }, { lineupStatus: "confirmed" }] }),
      SETTLED_OK,
      NOW,
    );
    expect(result.kind).toBe("current");
  });

  it("16. games present with no batter rows does not falsely claim lineup-pending", () => {
    const result = deriveMlbDataStatus(payload({ batters: [] }), SETTLED_OK, NOW);
    expect(result.kind).toBe("current");
    const resultUndefined = deriveMlbDataStatus(payload({ batters: undefined }), SETTLED_OK, NOW);
    expect(resultUndefined.kind).toBe("current");
  });
});

describe("deriveMlbDataStatus — stale", () => {
  it("7. a previous ET slate date returns stale with direction 'past'", () => {
    expect(deriveMlbDataStatus(payload({ date: "2026-07-15" }), SETTLED_OK, NOW)).toEqual({
      kind: "stale",
      slateDate: "2026-07-15",
      todayEt: TODAY_ET,
      direction: "past",
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("8. a future ET slate date returns stale with direction 'future'", () => {
    expect(deriveMlbDataStatus(payload({ date: "2026-07-17" }), SETTLED_OK, NOW)).toEqual({
      kind: "stale",
      slateDate: "2026-07-17",
      todayEt: TODAY_ET,
      direction: "future",
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("10. stale takes precedence over lineup-pending (mismatched date with incomplete lineups)", () => {
    const result = deriveMlbDataStatus(
      payload({ date: "2026-07-15", batters: [{ lineupStatus: "projected" }] }),
      SETTLED_OK,
      NOW,
    );
    expect(result.kind).toBe("stale");
  });

  it("does not classify staleness by generatedAt age -- an old generatedAt on today's slate is still current", () => {
    const result = deriveMlbDataStatus(payload({ generatedAt: "2020-01-01T00:00:00.000Z" }), SETTLED_OK, NOW);
    expect(result.kind).toBe("current");
  });
});

describe("deriveMlbDataStatus — waiting-for-slate / no-games-scheduled", () => {
  it("11. today's empty slate with a valid nextRunAt returns waiting-for-slate", () => {
    const result = deriveMlbDataStatus(
      payload({ games: [], nextRunAt: { time: "2026-07-16T10:00:00-04:00", label: "10:00 AM ET" } }),
      SETTLED_OK,
      NOW,
    );
    expect(result).toEqual({
      kind: "waiting-for-slate",
      slateDate: TODAY_ET,
      nextRunAt: { time: "2026-07-16T10:00:00-04:00", label: "10:00 AM ET" },
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("12. today's empty slate without a valid nextRunAt returns no-games-scheduled", () => {
    const result = deriveMlbDataStatus(payload({ games: [], nextRunAt: null }), SETTLED_OK, NOW);
    expect(result).toEqual({
      kind: "no-games-scheduled",
      slateDate: TODAY_ET,
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("a nextRunAt missing its label is treated as invalid, falling back to no-games-scheduled", () => {
    const result = deriveMlbDataStatus(
      payload({ games: [], nextRunAt: { time: "2026-07-16T10:00:00-04:00", label: "" } }),
      SETTLED_OK,
      NOW,
    );
    expect(result.kind).toBe("no-games-scheduled");
  });

  it("does not infer waiting-for-slate from time-of-day alone when nextRunAt is absent", () => {
    // Even at 9:00 AM ET (well before any run would plausibly have
    // happened), an absent nextRunAt must not be guessed at.
    const earlyMorning = new Date("2026-07-16T13:00:00.000Z"); // 9:00 AM EDT
    const result = deriveMlbDataStatus(payload({ games: [], nextRunAt: null }), SETTLED_OK, earlyMorning);
    expect(result.kind).toBe("no-games-scheduled");
  });
});

describe("deriveMlbDataStatus — lineup-pending", () => {
  it("13. all-projected lineups returns lineup-pending with confirmedCount 0", () => {
    const result = deriveMlbDataStatus(
      payload({ batters: [{ lineupStatus: "projected" }, { lineupStatus: "projected" }] }),
      SETTLED_OK,
      NOW,
    );
    expect(result).toEqual({
      kind: "lineup-pending",
      slateDate: TODAY_ET,
      confirmedCount: 0,
      totalCount: 2,
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("14. mixed confirmed/projected lineups returns lineup-pending with the correct counts", () => {
    const result = deriveMlbDataStatus(
      payload({
        batters: [{ lineupStatus: "confirmed" }, { lineupStatus: "projected" }, { lineupStatus: "projected" }],
      }),
      SETTLED_OK,
      NOW,
    );
    expect(result).toEqual({
      kind: "lineup-pending",
      slateDate: TODAY_ET,
      confirmedCount: 1,
      totalCount: 3,
      generatedAt: "2026-07-16T09:32:34.452Z",
    });
  });

  it("an 'unknown' lineupStatus also counts as not-confirmed", () => {
    const result = deriveMlbDataStatus(payload({ batters: [{ lineupStatus: "unknown" }] }), SETTLED_OK, NOW);
    expect(result.kind).toBe("lineup-pending");
  });
});

describe("deriveMlbDataStatus — generatedAt tolerance", () => {
  it("17. a missing generatedAt is tolerated and omitted from the result", () => {
    const result = deriveMlbDataStatus(payload({ generatedAt: null }), SETTLED_OK, NOW);
    expect(result).toEqual({ kind: "current", slateDate: TODAY_ET });
    expect("generatedAt" in result).toBe(false);
  });

  it("18. an invalid/unparseable generatedAt string is tolerated and preserved verbatim, never thrown on or replaced by now", () => {
    const result = deriveMlbDataStatus(payload({ generatedAt: "not-a-real-timestamp" }), SETTLED_OK, NOW);
    expect(result).toEqual({ kind: "current", slateDate: TODAY_ET, generatedAt: "not-a-real-timestamp" });
  });
});

describe("deriveMlbDataStatus — ET date boundaries", () => {
  it("20a. midnight ET boundary: 2026-07-16T03:59:00.000Z is still ET calendar date 2026-07-15 (11:59 PM EDT on the 15th)", () => {
    const justBeforeMidnightEt = new Date("2026-07-16T03:59:00.000Z");
    const result = deriveMlbDataStatus(payload({ date: "2026-07-15" }), SETTLED_OK, justBeforeMidnightEt);
    expect(result.kind).toBe("current");
  });

  it("20b. midnight ET boundary: 2026-07-16T04:00:00.000Z rolls to ET calendar date 2026-07-16 (12:00 AM EDT), making a 2026-07-15 slate stale", () => {
    const justAfterMidnightEt = new Date("2026-07-16T04:00:00.000Z");
    const result = deriveMlbDataStatus(payload({ date: "2026-07-15" }), SETTLED_OK, justAfterMidnightEt);
    expect(result).toMatchObject({ kind: "stale", slateDate: "2026-07-15", todayEt: "2026-07-16", direction: "past" });
  });

  it("21a. DST spring-forward (2026-03-08): 2026-03-08T06:59:00.000Z is 1:59 AM EST, ET calendar date 2026-03-08", () => {
    const justBeforeSpringForward = new Date("2026-03-08T06:59:00.000Z");
    const result = deriveMlbDataStatus(payload({ date: "2026-03-08" }), SETTLED_OK, justBeforeSpringForward);
    expect(result.kind).toBe("current");
  });

  it("21b. DST spring-forward (2026-03-08): 2026-03-08T07:00:00.000Z is 3:00 AM EDT (clocks jumped 2AM->3AM), still ET calendar date 2026-03-08 -- the jump does not change the date", () => {
    const justAfterSpringForward = new Date("2026-03-08T07:00:00.000Z");
    const result = deriveMlbDataStatus(payload({ date: "2026-03-08" }), SETTLED_OK, justAfterSpringForward);
    expect(result.kind).toBe("current");
  });

  it("22a. DST fall-back (2026-11-01): 2026-11-01T05:59:00.000Z is 1:59 AM EDT (first pass through the repeated hour), ET calendar date 2026-11-01", () => {
    const firstPassOfRepeatedHour = new Date("2026-11-01T05:59:00.000Z");
    const result = deriveMlbDataStatus(payload({ date: "2026-11-01" }), SETTLED_OK, firstPassOfRepeatedHour);
    expect(result.kind).toBe("current");
  });

  it("22b. DST fall-back (2026-11-01): 2026-11-01T06:01:00.000Z is 1:01 AM EST (second pass through the repeated hour, after clocks fell back), still ET calendar date 2026-11-01 -- the fall-back does not change the date", () => {
    const secondPassOfRepeatedHour = new Date("2026-11-01T06:01:00.000Z");
    const result = deriveMlbDataStatus(payload({ date: "2026-11-01" }), SETTLED_OK, secondPassOfRepeatedHour);
    expect(result.kind).toBe("current");
  });

  it("23. date-only slate comparison is unaffected by the process's local timezone (not the visitor's local time)", () => {
    const originalTz = process.env.TZ;
    try {
      // An extreme, deliberately unrelated local offset (UTC+14). If the
      // function ever fell back to implicit local-time Date parsing
      // instead of the explicit America/New_York Intl calls, this would
      // roll the slate date and change the result.
      process.env.TZ = "Pacific/Kiritimati";
      const result = deriveMlbDataStatus(payload(), SETTLED_OK, NOW);
      expect(result).toEqual({ kind: "current", slateDate: TODAY_ET, generatedAt: "2026-07-16T09:32:34.452Z" });
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("deriveMlbDataStatus — purity", () => {
  it("24. does not mutate the payload, its nested arrays, fetchState, or now", () => {
    const input = Object.freeze(
      payload({
        games: Object.freeze([Object.freeze({ gameKey: "BAL@CHC" })]),
        batters: Object.freeze([Object.freeze({ lineupStatus: "projected" }), Object.freeze({ lineupStatus: "confirmed" })]),
        nextRunAt: Object.freeze({ time: "2026-07-16T10:00:00-04:00", label: "10:00 AM ET" }),
      }),
    );
    const fetchState = Object.freeze({ ...SETTLED_OK });
    const nowSnapshot = new Date(NOW.getTime());
    const before = JSON.parse(JSON.stringify(input));

    expect(() => deriveMlbDataStatus(input, fetchState, NOW)).not.toThrow();

    expect(JSON.parse(JSON.stringify(input))).toEqual(before);
    expect(NOW.getTime()).toBe(nowSnapshot.getTime());
  });

  it("25. the same inputs produce a deeply equal result on repeated calls", () => {
    const input = payload();
    const first = deriveMlbDataStatus(input, SETTLED_OK, NOW);
    const second = deriveMlbDataStatus(input, SETTLED_OK, NOW);
    expect(first).toEqual(second);
    expect(first).not.toBe(second); // fresh object each call, not a cached reference
  });
});
