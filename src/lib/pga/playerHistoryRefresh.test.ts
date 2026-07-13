import { describe, expect, it } from "vitest";
// @ts-expect-error The production refresh helper is an intentional Node ESM module.
import {
  extractScopeNames,
  mergeScopedHistory,
  normalizeTournamentResult,
  resolveScopedPlayers,
  resultIdentity,
  validatePublishedExpectedEvent,
  validateScopedRefresh,
  visibleRecentResults,
} from "../../../scripts/lib/pga-player-history-refresh.mjs";

const EVENT = { eventId: "R2026541", eventName: "Genesis Scottish Open", eventDate: "2026-07-12", season: 2026 };

describe("scoped PGA player history refresh", () => {
  it("puts a made-cut Scottish Open finish first and shifts the old fifth result out of the visible five", () => {
    const before = payload([player("Made Cut", "1", [old("A", "2026-06-21", "T4"), old("B", "2026-06-14", "T11"), old("C", "2026-06-07", "1"), old("D", "2026-05-31", "T20"), old("E", "2026-05-24", "T30")])]);
    const refreshed = new Map([["1", [scottish("T4")]]]);
    const merged = mergeScopedHistory(before, refreshed, options(["1"]));
    expect(visibleRecentResults(merged.payload.players[0]).map((result) => result.finishText)).toEqual(["T4", "T4", "T11", "1", "T20"]);
    expect(merged.payload.players[0].modelRecentResults).toEqual(before.players[0].recentResults.slice(0, 5));
    expect(visibleRecentResults(merged.payload.players[0])).toHaveLength(5);
    expect(merged.payload.players[0].recentResults[0]).toMatchObject({ eventName: EVENT.eventName, madeCut: true, status: "finished" });
  });

  it("normalizes CUT and MDF to an MC styling-compatible missed-cut result", () => {
    for (const position of ["CUT", "MDF"]) {
      const result = normalizeTournamentResult(upstreamEvent(position));
      expect(result).toMatchObject({ finishText: "MC", finishPosition: null, madeCut: false, status: "missed_cut" });
    }
  });

  it("puts a missed cut first without changing finish/status contracts", () => {
    const before = payload([player("Missed Cut", "2")]);
    const merged = mergeScopedHistory(before, new Map([["2", [scottish("MC")]]]), options(["2"]));
    expect(merged.payload.players[0].recentResults[0]).toMatchObject({ finishText: "MC", madeCut: false, status: "missed_cut" });
  });

  it("does not add the event to a scoped nonparticipant", () => {
    const before = payload([player("Nonparticipant", "3")]);
    const merged = mergeScopedHistory(before, new Map([["3", []]]), options(["3"]));
    expect(merged.changed).toBe(false);
    expect(merged.payload).toBe(before);
  });

  it("limits a controlled refresh to the verified expected event identity", () => {
    const before = payload([player("Scoped", "31")]);
    const otherNewer = old("OTHER", "2026-07-05", "T8");
    const merged = mergeScopedHistory(before, new Map([["31", [scottish("T4"), otherNewer]]]), {
      ...options(["31"]),
      allowedEventIdentities: ["2026:R2026541"],
    });
    expect(merged.addedResults.map((result) => result.eventId)).toEqual(["R2026541"]);
    expect(merged.payload.players[0].recentResults[1].eventId).toBe("ROLD");
  });

  it("is idempotent and aliases cannot duplicate an existing event ID and season", () => {
    const before = payload([player("Alias Test", "4")]);
    const first = mergeScopedHistory(before, new Map([["4", [scottish("T11")]]]), options(["4"]));
    const alias = { ...scottish("T11"), eventName: "Scottish Open", eventSlug: "scottish-open" };
    const second = mergeScopedHistory(first.payload, new Map([["4", [alias]]]), options(["4"]));
    expect(second.changed).toBe(false);
    expect(second.payload).toBe(first.payload);
    expect(first.payload.players[0].recentResults.filter((result) => resultIdentity(result) === "2026:R2026541")).toHaveLength(1);
  });

  it("uses the shared identity utility for accents, punctuation, suffixes, initials, and observed aliases", () => {
    const history = payload([
      player("Ludvig Aberg", "10"),
      player("J.J. Spaun", "11"),
      player("Davis Thompson", "12"),
      player("Matt McCarty", "13"),
    ]);
    const resolved = resolveScopedPlayers(history, ["Ludvig Åberg", "J-J Spaun", "Davis Thompson Jr.", "Matthew McCarty"]);
    expect(resolved.map((row) => row.playerId)).toEqual(["10", "11", "12", "13"]);
    expect(resolved[3].matchMethod).toBe("alias");
  });

  it("preserves out-of-scope players byte-for-byte and player order", () => {
    const untouched = player("Untouched", "20");
    const before = payload([player("Scoped", "21"), untouched]);
    const merged = mergeScopedHistory(before, new Map([["21", [scottish("1")]]]), options(["21"]));
    expect(JSON.stringify(merged.payload.players[1])).toBe(JSON.stringify(untouched));
    expect(merged.payload.players.map((row) => row.player)).toEqual(before.players.map((row) => row.player));
    expect(() => validateScopedRefresh(before, merged.payload, { scopePlayerIds: ["21"], refreshedByPlayerId: new Map(), expectedEvent: null })).not.toThrow();
  });

  it("rejects duplicate event identities and validates exact published event identity", () => {
    const before = payload([player("Participant", "30")]);
    const merged = mergeScopedHistory(before, new Map([["30", [scottish("T4")]]]), options(["30"]));
    expect(validatePublishedExpectedEvent(merged.payload, ["30"], EVENT)).toEqual(["Participant"]);
    merged.payload.players[0].recentResults.push(scottish("T4"));
    expect(() => validateScopedRefresh(before, merged.payload, { scopePlayerIds: ["30"], refreshedByPlayerId: new Map(), expectedEvent: null })).toThrow(/duplicate/i);
  });

  it("fails loudly when a known scoped participant is missing the expected event", () => {
    const before = payload([player("Present", "32"), player("Missing", "33")]);
    const merged = mergeScopedHistory(before, new Map([["32", [scottish("T4")]], ["33", []]]), options(["32", "33"]));
    expect(() => validatePublishedExpectedEvent(merged.payload, ["32", "33"], EVENT, ["32", "33"]))
      .toThrow(/Known participant 33/);
  });

  it("preserves unrelated major, ranking, model, JKB Trend, course-fit, and best-bet inputs", () => {
    const before = payload([player("Scoped", "40")]);
    const preservation = {
      majorHistory: { specificMajor: ["T4"], last8Majors: ["T4", "T11"] },
      rows: [{ player: "Scoped", rank: 1, modelRank: 1, modelScore: 89.2, jkbTrend: 3, courseFit: 91.4 }],
      bestBets: ["Scoped"],
      currentTournament: { tournamentName: "The Open" },
    };
    const snapshot = JSON.stringify(preservation);
    mergeScopedHistory(before, new Map([["40", [scottish("1")]]]), options(["40"]));
    expect(JSON.stringify(preservation)).toBe(snapshot);
  });

  it("extracts only the current model rows and rejects duplicate scope names", () => {
    expect(extractScopeNames({ rows: [{ player: "A" }, { player: "B" }] })).toEqual(["A", "B"]);
    expect(() => extractScopeNames({ rows: [{ player: "A" }, { player: "A" }] })).toThrow(/duplicate/i);
  });
});

function payload(players) {
  return { version: 1, source: "pga-tour-player-profile-results", generatedAt: "2026-06-22T00:00:00.000Z", startYear: 2016, players, errors: [] };
}

function player(name, id, recentResults = [old("OLD", "2026-06-21", "T20")]) {
  return { player: name, playerId: id, sourcePlayerName: name, recentResults, eventHistory: Object.fromEntries(recentResults.map((result) => [result.eventSlug, [result]])), stats: { sgTotal: 1.2 } };
}

function old(id, date, finishText) {
  const position = Number(finishText.match(/\d+/)?.[0] ?? 999);
  return { season: 2026, eventId: `R${id}`, eventSlug: id.toLowerCase(), eventName: id, eventDate: date, majorType: null, finishText, finishPosition: position, madeCut: true, status: "finished" };
}

function scottish(position) {
  return normalizeTournamentResult(upstreamEvent(position));
}

function upstreamEvent(position) {
  return { tournamentId: EVENT.eventId, tournamentName: EVENT.eventName, courseName: "The Renaissance Club", date: EVENT.eventDate, year: EVENT.season, position, roundScores: [], total: 280, toPar: "-8" };
}

function options(scopePlayerIds) {
  return { scopePlayerIds, asOfDate: "2026-07-13", generatedAt: "2026-07-13T12:00:00.000Z" };
}
