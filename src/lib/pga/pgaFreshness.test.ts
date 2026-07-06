import { describe, expect, it } from "vitest";
import { assessPgaFreshness, type PgaFreshnessScheduleEvent } from "./pgaFreshness";

const asOf = "2026-07-06T12:00:00Z";

const currentEvent: PgaFreshnessScheduleEvent = {
  id: "genesis-scottish-open-2026",
  slug: "genesis-scottish-open-2026-picks",
  name: "Genesis Scottish Open",
  shortName: "Genesis Scottish Open",
  startDate: "2026-07-06",
  endDate: "2026-07-12",
  status: "upcoming",
};

const upcomingEvent: PgaFreshnessScheduleEvent = {
  ...currentEvent,
  startDate: "2026-07-09",
};

describe("PGA freshness helper", () => {
  it("marks a matching current tournament model with rows as current", () => {
    const result = assessPgaFreshness(
      {
        tournamentName: "Genesis Scottish Open",
        generatedAt: "2026-07-05T14:00:00Z",
        rows: [{ player: "Scottie Scheffler" }],
      },
      { payloadType: "current-tournament", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("current");
    expect(result.severity).toBe("ok");
    expect(result.isUsable).toBe(true);
    expect(result.rowCount).toBe(1);
  });

  it("marks a matching future tournament payload as upcoming", () => {
    const result = assessPgaFreshness(
      {
        tournamentName: "Genesis Scottish Open",
        generatedAt: "2026-07-05T14:00:00Z",
        rows: [{ player: "Scottie Scheffler" }],
      },
      { payloadType: "next-tournament", expectedEvent: upcomingEvent, asOf },
    );

    expect(result.status).toBe("upcoming");
    expect(result.severity).toBe("info");
    expect(result.isUsable).toBe(true);
    expect(result.isCurrent).toBe(false);
  });

  it("marks a completed prior tournament as stale", () => {
    const result = assessPgaFreshness(
      {
        tournamentName: "John Deere Classic",
        generatedAt: "2026-07-03T14:00:00Z",
        rows: [{ player: "Chris Gotterup" }],
      },
      {
        payloadType: "current-tournament",
        expectedEvent: {
          name: "John Deere Classic",
          shortName: "John Deere Classic",
          startDate: "2026-07-02",
          endDate: "2026-07-05",
          status: "complete",
        },
        asOf,
      },
    );

    expect(result.status).toBe("stale");
    expect(result.isStale).toBe(true);
    expect(result.isUsable).toBe(false);
  });

  it("marks a mismatched tournament name", () => {
    const result = assessPgaFreshness(
      {
        tournamentName: "John Deere Classic",
        generatedAt: "2026-07-05T14:00:00Z",
        rows: [{ player: "Chris Gotterup" }],
      },
      { payloadType: "current-tournament", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("mismatched");
    expect(result.isMismatched).toBe(true);
    expect(result.expectedTournament).toBe("Genesis Scottish Open");
    expect(result.actualTournament).toBe("John Deere Classic");
  });

  it("marks empty rows as missing rows", () => {
    const result = assessPgaFreshness(
      {
        tournamentName: "Genesis Scottish Open",
        generatedAt: "2026-07-05T14:00:00Z",
        rows: [],
      },
      { payloadType: "current-tournament", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("missing-rows");
    expect(result.isEmpty).toBe(true);
    expect(result.isUsable).toBe(false);
  });

  it("marks missing generatedAt as missing timestamp", () => {
    const result = assessPgaFreshness(
      {
        tournamentName: "Genesis Scottish Open",
        rows: [{ player: "Scottie Scheffler" }],
      },
      { payloadType: "current-tournament", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("missing-timestamp");
    expect(result.generatedAt).toBeNull();
    expect(result.isUsable).toBe(false);
  });

  it("marks modelAvailable false as unavailable", () => {
    const result = assessPgaFreshness(
      {
        tournamentName: "Genesis Scottish Open",
        generatedAt: "2026-07-05T14:00:00Z",
        modelAvailable: false,
        modelNote: "Sheet is too stale to publish.",
        rows: [],
      },
      { payloadType: "next-tournament", expectedEvent: upcomingEvent, asOf },
    );

    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("Sheet is too stale to publish.");
    expect(result.isUsable).toBe(false);
  });

  it("marks stale best-bets payloads", () => {
    const result = assessPgaFreshness(
      {
        tournament: "Genesis Scottish Open",
        generatedAt: "2026-06-20T14:00:00Z",
        outrights: [{ player: "Scottie Scheffler" }],
        top5: [],
        top10: [],
        top20: [],
      },
      { payloadType: "best-bets", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("stale");
    expect(result.daysOld).toBe(16);
    expect(result.isStale).toBe(true);
  });

  it("marks empty best-bets arrays as empty", () => {
    const result = assessPgaFreshness(
      {
        tournament: "Genesis Scottish Open",
        generatedAt: "2026-07-05T14:00:00Z",
        outrights: [],
        top5: [],
        top10: [],
        top20: [],
        valueBets: [],
      },
      { payloadType: "best-bets", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("empty");
    expect(result.rowCount).toBe(0);
    expect(result.isUsable).toBe(false);
  });

  it("marks current field matching schedule", () => {
    const result = assessPgaFreshness(
      {
        tournament: "Genesis Scottish Open",
        fetchedAt: "2026-07-05T14:00:00Z",
        source: "pga-tour-official-field",
        fieldCount: 144,
        players: ["Scottie Scheffler"],
      },
      { payloadType: "current-field", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("current");
    expect(result.fetchedAt).toBe("2026-07-05T14:00:00Z");
    expect(result.source).toBe("pga-tour-official-field");
    expect(result.rowCount).toBe(144);
  });

  it("marks current field stale and mismatched", () => {
    const result = assessPgaFreshness(
      {
        tournament: "John Deere Classic",
        fetchedAt: "2026-06-25T14:00:00Z",
        fieldCount: 144,
        players: ["Chris Gotterup"],
      },
      { payloadType: "current-field", expectedEvent: currentEvent, asOf },
    );

    expect(result.status).toBe("mismatched");
    expect(result.isMismatched).toBe(true);
    expect(result.isStale).toBe(true);
    expect(result.daysOld).toBe(11);
  });

  it("marks player stats metadata fresh", () => {
    const result = assessPgaFreshness(
      {
        exportDate: "2026-07-05",
        syncedAt: "2026-07-05T14:00:00Z",
        playerCount: 151,
        source: "pga-tour-api-fallback",
      },
      { payloadType: "player-stats-meta", asOf },
    );

    expect(result.status).toBe("current");
    expect(result.isUsable).toBe(true);
    expect(result.rowCount).toBe(151);
  });

  it("marks player stats metadata stale", () => {
    const result = assessPgaFreshness(
      {
        exportDate: "2026-06-01",
        syncedAt: "2026-06-01T14:00:00Z",
        playerCount: 151,
        source: "pga-tour-api-fallback",
      },
      { payloadType: "player-stats-meta", asOf },
    );

    expect(result.status).toBe("stale");
    expect(result.daysOld).toBe(35);
    expect(result.isUsable).toBe(false);
  });

  it("handles unknown malformed payloads safely", () => {
    const result = assessPgaFreshness(null, {
      payloadType: "current-tournament",
      expectedEvent: currentEvent,
      asOf,
    });

    expect(result.status).toBe("unknown");
    expect(result.severity).toBe("error");
    expect(result.isUsable).toBe(false);
    expect(result.reason).toContain("malformed");
  });
});
