/**
 * Phase 4 — focused tests for the browser-safe NFL betting-lines view adapter.
 * Covers deterministic sportsbook selection, the current-market view model,
 * pure line-movement derivation, freshness, the JKB game join, and fail-safe
 * parsing.
 */
import { describe, expect, it } from "vitest";
import {
  buildCurrentMarketView,
  buildLineMovementView,
  bettingLinesHistoryPath,
  deriveFreshness,
  deriveLineMovement,
  parseBettingLinesCurrentArtifact,
  parseBettingLinesHistoryArtifact,
  selectSportsbook,
  type BettingLineObservation,
  type BettingLinesCurrentArtifact,
  type BettingLinesHistoryArtifact,
} from "./bettingLinesView";

const GAME_ID = "2026_01_NE_SEA";

function observation(
  overrides: Partial<BettingLineObservation> & { sportsbook: string },
): BettingLineObservation {
  return {
    provider: "the-odds-api",
    providerEventId: "evt",
    capturedAt: "2026-08-31T12:00:00.000Z",
    providerUpdatedAt: "2026-08-31T12:00:00.000Z",
    firstObservedAt: "2026-08-31T12:00:00.000Z",
    lastObservedAt: "2026-08-31T12:00:00.000Z",
    contentHash: "hash",
    spread: { homeLine: -3.5, awayLine: 3.5, homePrice: -110, awayPrice: -110 },
    total: { line: 44.5, overPrice: -110, underPrice: -110 },
    moneyline: { homePrice: -190, awayPrice: 160 },
    ...overrides,
  };
}

function currentArtifact(
  books: BettingLineObservation[],
  generatedAt = "2026-08-31T12:31:48.198Z",
): BettingLinesCurrentArtifact {
  return {
    schemaVersion: "jkb-betting-lines-current-v1",
    generatedAt,
    games: [
      {
        league: "nfl",
        season: 2026,
        week: 1,
        jkbGameId: GAME_ID,
        awayTeamId: "ne",
        homeTeamId: "sea",
        kickoffUtc: "2026-09-10T00:20:00.000Z",
        books,
      },
    ],
  };
}

function historyArtifact(series: BettingLineObservation[]): BettingLinesHistoryArtifact {
  return {
    schemaVersion: "jkb-betting-lines-history-v1",
    generatedAt: "2026-08-31T12:31:48.198Z",
    league: "nfl",
    season: 2026,
    jkbGameId: GAME_ID,
    awayTeamId: "ne",
    homeTeamId: "sea",
    kickoffUtc: "2026-09-10T00:20:00.000Z",
    series,
  };
}

describe("selectSportsbook", () => {
  it("1. picks DraftKings over all others", () => {
    const selection = selectSportsbook([
      observation({ sportsbook: "fanduel" }),
      observation({ sportsbook: "betmgm" }),
      observation({ sportsbook: "draftkings" }),
      observation({ sportsbook: "caesars" }),
    ]);
    expect(selection?.sportsbook.id).toBe("draftkings");
    expect(selection?.reason).toBe("priority");
  });

  it("2. falls back to FanDuel when DraftKings is absent", () => {
    const selection = selectSportsbook([
      observation({ sportsbook: "caesars" }),
      observation({ sportsbook: "betmgm" }),
      observation({ sportsbook: "fanduel" }),
    ]);
    expect(selection?.sportsbook.id).toBe("fanduel");
  });

  it("3. falls back to BetMGM when DraftKings and FanDuel are absent", () => {
    const selection = selectSportsbook([
      observation({ sportsbook: "caesars" }),
      observation({ sportsbook: "betmgm" }),
    ]);
    expect(selection?.sportsbook.id).toBe("betmgm");
  });

  it("4. falls back to Caesars when only Caesars and unlisted books exist", () => {
    const selection = selectSportsbook([
      observation({ sportsbook: "bovada" }),
      observation({ sportsbook: "caesars" }),
    ]);
    expect(selection?.sportsbook.id).toBe("caesars");
  });

  it("5. falls back deterministically to the alphabetically-first available book", () => {
    const books = [
      observation({ sportsbook: "mybookieag" }),
      observation({ sportsbook: "betrivers" }),
      observation({ sportsbook: "bovada" }),
    ];
    expect(selectSportsbook(books)?.sportsbook.id).toBe("betrivers");
    expect(selectSportsbook([...books].reverse())?.sportsbook.id).toBe("betrivers");
    expect(selectSportsbook(books)?.reason).toBe("first-available");
  });

  it("6. preserves the selected sportsbook identity (id + display name)", () => {
    const selection = selectSportsbook([observation({ sportsbook: "draftkings" })]);
    expect(selection?.sportsbook).toEqual({ id: "draftkings", name: "DraftKings" });
  });

  it("returns null when there is no usable book", () => {
    expect(selectSportsbook([])).toBeNull();
  });
});

describe("buildCurrentMarketView", () => {
  it("7-9. exposes spread, total and moneyline current values from the selected book only", () => {
    const view = buildCurrentMarketView({
      artifact: currentArtifact([
        observation({
          sportsbook: "draftkings",
          spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
          total: { line: 45, overPrice: -110, underPrice: -110 },
          moneyline: { homePrice: -175, awayPrice: 150 },
        }),
        observation({
          sportsbook: "fanduel",
          spread: { homeLine: -2.5, awayLine: 2.5, homePrice: -105, awayPrice: -115 },
        }),
      ]),
      jkbGameId: GAME_ID,
      now: Date.parse("2026-08-31T12:35:00.000Z"),
    });
    expect(view?.sportsbook.id).toBe("draftkings");
    expect(view?.spread?.homeLine).toBe(-3);
    expect(view?.total?.line).toBe(45);
    expect(view?.moneyline?.homePrice).toBe(-175);
    expect(view?.artifactGeneratedAt).toBe("2026-08-31T12:31:48.198Z");
  });

  it("10. keeps total available when the selected book is missing spread", () => {
    const view = buildCurrentMarketView({
      artifact: currentArtifact([
        observation({ sportsbook: "draftkings", spread: null }),
      ]),
      jkbGameId: GAME_ID,
    });
    expect(view?.spread).toBeNull();
    expect(view?.total?.line).toBe(44.5);
  });

  it("11. keeps spread available when the selected book is missing total", () => {
    const view = buildCurrentMarketView({
      artifact: currentArtifact([
        observation({ sportsbook: "draftkings", total: null }),
      ]),
      jkbGameId: GAME_ID,
    });
    expect(view?.total).toBeNull();
    expect(view?.spread?.homeLine).toBe(-3.5);
  });

  it("12. preserves null markets when both spread and total are missing", () => {
    const view = buildCurrentMarketView({
      artifact: currentArtifact([
        observation({ sportsbook: "draftkings", spread: null, total: null, moneyline: null }),
      ]),
      jkbGameId: GAME_ID,
    });
    expect(view?.spread).toBeNull();
    expect(view?.total).toBeNull();
    expect(view?.moneyline).toBeNull();
  });

  it("19. joins on the canonical JKB game id and returns null for an unknown game", () => {
    const artifact = currentArtifact([observation({ sportsbook: "draftkings" })]);
    expect(buildCurrentMarketView({ artifact, jkbGameId: GAME_ID })?.sportsbook.id).toBe(
      "draftkings",
    );
    expect(buildCurrentMarketView({ artifact, jkbGameId: "2026_01_DAL_NYG" })).toBeNull();
  });

  it("builds the history path from the canonical game token", () => {
    expect(bettingLinesHistoryPath(GAME_ID)).toBe(
      "/data/market/betting-lines-history/nfl/2026_01_NE_SEA.json",
    );
  });
});

describe("deriveFreshness", () => {
  it("20. ages the newest real pipeline timestamp, preferring providerUpdatedAt", () => {
    const view = deriveFreshness({
      providerUpdatedAt: "2026-08-31T12:00:00.000Z",
      lastObservedAt: "2026-08-31T11:00:00.000Z",
      capturedAt: "2026-08-31T10:00:00.000Z",
      generatedAt: "2026-08-31T12:30:00.000Z",
      now: Date.parse("2026-08-31T14:00:00.000Z"),
    });
    expect(view.basis).toBe("providerUpdatedAt");
    expect(view.ageMs).toBe(2 * 60 * 60 * 1000);
    expect(view.level).toBe("fresh");
  });

  it("20b. degrades to recent then stale by age, and never uses render time as the basis", () => {
    expect(
      deriveFreshness({
        providerUpdatedAt: "2026-08-31T00:00:00.000Z",
        now: Date.parse("2026-08-31T12:00:00.000Z"),
      }).level,
    ).toBe("recent");
    expect(
      deriveFreshness({
        providerUpdatedAt: "2026-08-29T00:00:00.000Z",
        now: Date.parse("2026-08-31T12:00:00.000Z"),
      }).level,
    ).toBe("stale");
  });

  it("20c. returns unknown (not fresh) when no usable timestamp exists", () => {
    const view = deriveFreshness({
      providerUpdatedAt: null,
      lastObservedAt: null,
      capturedAt: "not-a-date",
      generatedAt: undefined,
      now: Date.parse("2026-08-31T12:00:00.000Z"),
    });
    expect(view.level).toBe("unknown");
    expect(view.basis).toBe("none");
    expect(view.basisAt).toBeNull();
  });
});

describe("deriveLineMovement", () => {
  it("13-16. reports first observed, current, move and chronological points", () => {
    const movement = deriveLineMovement(
      [
        observation({
          sportsbook: "draftkings",
          firstObservedAt: "2026-08-31T12:00:00.000Z",
          lastObservedAt: "2026-08-31T12:05:00.000Z",
          spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
        }),
        observation({
          sportsbook: "draftkings",
          firstObservedAt: "2026-08-31T13:00:00.000Z",
          lastObservedAt: "2026-08-31T13:30:00.000Z",
          spread: { homeLine: -3.5, awayLine: 3.5, homePrice: -110, awayPrice: -110 },
        }),
      ],
      "spread",
    );
    expect(movement?.firstObserved).toBe(-3);
    expect(movement?.current).toBe(-3.5);
    expect(movement?.move).toBe(-0.5);
    expect(movement?.points.map((p) => p.value)).toEqual([-3, -3.5]);
    expect(movement?.firstObservedAt).toBe("2026-08-31T12:00:00.000Z");
    expect(movement?.lastObservedAt).toBe("2026-08-31T13:30:00.000Z");
  });

  it("16b. orders out-of-order observations chronologically", () => {
    const movement = deriveLineMovement(
      [
        observation({
          sportsbook: "dk",
          firstObservedAt: "2026-08-31T15:00:00.000Z",
          total: { line: 46, overPrice: -110, underPrice: -110 },
        }),
        observation({
          sportsbook: "dk",
          firstObservedAt: "2026-08-31T09:00:00.000Z",
          total: { line: 44, overPrice: -110, underPrice: -110 },
        }),
      ],
      "total",
    );
    expect(movement?.points.map((p) => p.value)).toEqual([44, 46]);
  });

  it("17. does not create synthetic states for unchanged consecutive values", () => {
    const movement = deriveLineMovement(
      [
        observation({ sportsbook: "dk", firstObservedAt: "2026-08-31T09:00:00.000Z" }),
        observation({ sportsbook: "dk", firstObservedAt: "2026-08-31T10:00:00.000Z" }),
        observation({
          sportsbook: "dk",
          firstObservedAt: "2026-08-31T11:00:00.000Z",
          spread: { homeLine: -4, awayLine: 4, homePrice: -110, awayPrice: -110 },
        }),
      ],
      "spread",
    );
    expect(movement?.points.map((p) => p.value)).toEqual([-3.5, -4]);
  });

  it("18. degrades spread and total independently", () => {
    const spreadOnly = [
      observation({
        sportsbook: "dk",
        firstObservedAt: "2026-08-31T09:00:00.000Z",
        spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
        total: null,
      }),
    ];
    expect(deriveLineMovement(spreadOnly, "spread")?.current).toBe(-3);
    expect(deriveLineMovement(spreadOnly, "total")).toBeNull();

    const totalOnly = [
      observation({
        sportsbook: "dk",
        firstObservedAt: "2026-08-31T09:00:00.000Z",
        spread: null,
        total: { line: 41, overPrice: -110, underPrice: -110 },
      }),
    ];
    expect(deriveLineMovement(totalOnly, "total")?.current).toBe(41);
    expect(deriveLineMovement(totalOnly, "spread")).toBeNull();
  });

  it("returns null when there are no observations", () => {
    expect(deriveLineMovement([], "spread")).toBeNull();
  });
});

describe("buildLineMovementView", () => {
  it("18b. restricts movement to the selected sportsbook and exposes its identity", () => {
    const view = buildLineMovementView({
      history: historyArtifact([
        observation({
          sportsbook: "draftkings",
          firstObservedAt: "2026-08-31T09:00:00.000Z",
          spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
        }),
        observation({
          sportsbook: "draftkings",
          firstObservedAt: "2026-08-31T12:00:00.000Z",
          spread: { homeLine: -2, awayLine: 2, homePrice: -110, awayPrice: -110 },
        }),
        observation({
          sportsbook: "fanduel",
          firstObservedAt: "2026-08-31T12:00:00.000Z",
          spread: { homeLine: -7, awayLine: 7, homePrice: -110, awayPrice: -110 },
        }),
      ]),
      sportsbookId: "draftkings",
    });
    expect(view.sportsbook).toEqual({ id: "draftkings", name: "DraftKings" });
    expect(view.spread?.firstObserved).toBe(-3);
    expect(view.spread?.current).toBe(-2);
  });

  it("21. yields null spread/total when the selected book has no history rows", () => {
    const view = buildLineMovementView({
      history: historyArtifact([observation({ sportsbook: "fanduel" })]),
      sportsbookId: "draftkings",
    });
    expect(view.spread).toBeNull();
    expect(view.total).toBeNull();
  });
});

describe("fail-safe parsing", () => {
  it("21b. returns null for a malformed current artifact", () => {
    expect(parseBettingLinesCurrentArtifact(null)).toBeNull();
    expect(parseBettingLinesCurrentArtifact({ generatedAt: 5 })).toBeNull();
    expect(parseBettingLinesCurrentArtifact({ generatedAt: "x", games: "nope" })).toBeNull();
  });

  it("21c. returns null for a malformed history artifact and drops junk rows", () => {
    expect(parseBettingLinesHistoryArtifact({ generatedAt: "x" })).toBeNull();
    const parsed = parseBettingLinesHistoryArtifact({
      generatedAt: "2026-08-31T12:00:00.000Z",
      jkbGameId: GAME_ID,
      series: [
        { sportsbook: "draftkings", capturedAt: "2026-08-31T12:00:00.000Z" },
        { nope: true },
        "garbage",
      ],
    });
    expect(parsed?.series).toHaveLength(1);
    expect(parsed?.series[0].sportsbook).toBe("draftkings");
  });

  it("22. preserves null / N/A market semantics through parsing (no fabricated prices)", () => {
    const parsed = parseBettingLinesCurrentArtifact({
      schemaVersion: "jkb-betting-lines-current-v1",
      generatedAt: "2026-08-31T12:00:00.000Z",
      games: [
        {
          jkbGameId: GAME_ID,
          books: [
            {
              sportsbook: "draftkings",
              capturedAt: "2026-08-31T12:00:00.000Z",
              spread: { homeLine: null, awayLine: null, homePrice: null, awayPrice: null },
              total: "not-an-object",
              moneyline: null,
            },
          ],
        },
      ],
    });
    const book = parsed?.games[0].books[0];
    expect(book?.spread).toEqual({ homeLine: null, awayLine: null, homePrice: null, awayPrice: null });
    expect(book?.total).toBeNull();
    expect(book?.moneyline).toBeNull();
  });
});
