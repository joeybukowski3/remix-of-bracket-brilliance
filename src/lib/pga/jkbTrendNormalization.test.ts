// @ts-nocheck -- exercises the JavaScript generator module directly.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TREND_CONFIG,
  buildAdjustedRounds,
  buildDiagnostics,
  buildPlayerSummaries,
  dedupeRounds,
  eventIdentity,
  finishValue,
  flattenPgaHistory,
  generateTrendArtifacts,
  normalizeRoundScore,
  validateTrendOutput,
} from "../../../scripts/generate-jkb-trend-rank.mjs";

const history = JSON.parse(readFileSync("public/data/pga/player-history.json", "utf8"));
const flattened = flattenPgaHistory(history);
const scottish = flattened.rounds.filter((row) => row.eventId === "R2026541");
const scottishAdjusted = buildAdjustedRounds(scottish, new Map(), DEFAULT_TREND_CONFIG).rounds;

function row(overrides = {}) {
  const value = {
    tour: "PGA",
    player: "Player 1",
    playerId: "1",
    season: 2026,
    eventId: "event-1",
    eventName: "Example Open",
    eventDate: "2026-07-12",
    courseName: null,
    round: 1,
    rawScore: 70,
    strokes: 70,
    scoreUnit: "actual_strokes",
    sourceScoreUnit: "inferred_actual_strokes",
    finishPosition: 10,
    finishText: "T10",
    status: "finished",
    ...overrides,
  };
  value.eventIdentity = eventIdentity(value);
  return value;
}

function validSources() {
  return {
    PGA: { status: "available", newestUsableRoundDate: "2026-07-12" },
    LIV: { status: "unavailable", newestUsableRoundDate: null },
    DPWT: { status: "unavailable", newestUsableRoundDate: null },
  };
}

function syntheticPayloads() {
  const players = Array.from({ length: 8 }, (_, playerIndex) => ({
    player: `Player ${playerIndex + 1}`,
    playerId: String(playerIndex + 1),
    eventHistory: Object.fromEntries(Array.from({ length: 5 }, (_, eventIndex) => {
      const day = String(12 - eventIndex * 2).padStart(2, "0");
      return [`event-${eventIndex}`, [{
        season: 2026,
        eventId: `E${eventIndex}`,
        eventName: `Event ${eventIndex}`,
        eventDate: `2026-07-${day}`,
        courseName: eventIndex % 2 ? null : "Test Course",
        finishPosition: playerIndex + 1,
        finishText: playerIndex === 0 ? "1" : `T${playerIndex + 1}`,
        status: "finished",
        rounds: { r1: 68 + playerIndex, r2: 69 + playerIndex, r3: 70 + playerIndex, r4: 71 + playerIndex },
      }]];
    })),
  }));
  return {
    pgaHistory: { players },
    stats: players.map((player, index) => ({ player: player.player, sgTotal: (7 - index) / 10 })),
    liv: { rounds: [] },
    dpwt: { rounds: [] },
  };
}

describe("JKB Trend round normalization", () => {
  it("normalizes defensible actual-strokes rounds", () => {
    expect(normalizeRoundScore(67)).toMatchObject({ usable: true, strokes: 67, scoreUnit: "actual_strokes" });
  });

  it("converts explicit relative-to-par only with authoritative par and rejects ambiguous values", () => {
    expect(normalizeRoundScore(-4, { declaredUnit: "relative_to_par", coursePar: 72 })).toMatchObject({ usable: true, strokes: 68 });
    expect(normalizeRoundScore(-4)).toMatchObject({ usable: false, reason: "unsupported_or_ambiguous_score_unit" });
    expect(normalizeRoundScore(-4, { declaredUnit: "relative_to_par" })).toMatchObject({ usable: false, reason: "relative_to_par_missing_course_par" });
  });

  it("never mixes unnormalized score units in one comparison group", () => {
    const rows = Array.from({ length: 8 }, (_, index) => row({ player: `P${index}`, playerId: String(index), scoreUnit: index < 4 ? "actual_strokes" : "relative_to_par" }));
    expect(buildAdjustedRounds(rows, new Map()).rounds).toHaveLength(0);
  });

  it("rejects cumulative totals and missing scores instead of coercing them", () => {
    expect(normalizeRoundScore(280)).toMatchObject({ usable: false, reason: "round_score_out_of_range" });
    expect(normalizeRoundScore(null)).toMatchObject({ usable: false, reason: "missing_round_score" });
  });

  it("removes duplicate player/event/round observations", () => {
    const duplicate = row();
    const result = dedupeRounds([duplicate, { ...duplicate }]);
    expect(result.rounds).toHaveLength(1);
    expect(result.rejectedByTour.PGA.duplicate_round).toBe(1);
  });

  it("keeps separate official event IDs separate even when names and dates match", () => {
    const rows = Array.from({ length: 8 }, (_, index) => [
      row({ player: `P${index}`, playerId: String(index), eventId: "A", strokes: 68 + index }),
      row({ player: `P${index}`, playerId: String(index), eventId: "B", strokes: 69 + index }),
    ]).flat();
    const adjusted = buildAdjustedRounds(rows, new Map()).rounds;
    expect(new Set(adjusted.map((value) => value.eventIdentity)).size).toBe(2);
    expect(new Set(adjusted.map((value) => value.fieldSize))).toEqual(new Set([8]));
  });

  it("excludes event-round groups below the configured minimum", () => {
    expect(buildAdjustedRounds(Array.from({ length: 7 }, (_, index) => row({ player: `P${index}`, playerId: String(index) })), new Map()).rounds).toHaveLength(0);
  });

  it("selects the latest 20 rounds chronologically and deterministically", () => {
    const rounds = Array.from({ length: 25 }, (_, index) => ({ ...row({ eventId: `E${index}`, eventDate: `2026-06-${String(index + 1).padStart(2, "0")}` }), adjustedPerformance: index / 100, eventRoundGroupKey: `g${index}`, fieldSize: 8, fieldAverage: 70, fieldRelative: 0, eventStrength: 0 }));
    const [summary] = buildPlayerSummaries(rounds, new Map(), { asOf: new Date("2026-07-01T00:00:00Z") });
    expect(summary.recentRounds).toHaveLength(20);
    expect(summary.recentRounds[0].eventDate).toBe("2026-06-25");
    expect(summary.recentRounds.at(-1).eventDate).toBe("2026-06-06");
  });

  it("fails validation for extreme field-relative or adjusted values", () => {
    const extreme = { ...row(), adjustedPerformance: 21, fieldRelative: 21, fieldSize: 8, eventRoundGroupKey: "group" };
    expect(() => validateTrendOutput({ adjustedRounds: [extreme], rankings: [{ rank: 1, recent20: 1 }], sources: validSources(), config: DEFAULT_TREND_CONFIG, asOf: new Date("2026-07-13T00:00:00Z") })).toThrow(/extreme/);
  });

  for (const player of ["Matt Fitzpatrick", "Tommy Fleetwood"]) {
    it(`${player}'s Scottish Open rounds use coherent actual-strokes groups`, () => {
      const playerRounds = scottishAdjusted.filter((value) => value.player === player);
      expect(playerRounds).toHaveLength(4);
      expect(new Set(playerRounds.map((value) => value.scoreUnit))).toEqual(new Set(["actual_strokes"]));
      expect(playerRounds.every((value) => value.fieldSize >= DEFAULT_TREND_CONFIG.minEventRoundField)).toBe(true);
      expect(playerRounds.every((value) => Math.abs(value.fieldRelative) < 10)).toBe(true);
    });
  }

  it("keeps a missed cut as a negative finish signal without altering round measurement", () => {
    expect(finishValue({ status: "missed_cut", finishText: "MC" })).toBe(10);
    const rows = Array.from({ length: 8 }, (_, index) => row({ player: `P${index}`, playerId: String(index), status: index ? "finished" : "missed_cut", finishText: index ? "T20" : "MC", strokes: 68 + index }));
    const measured = buildAdjustedRounds(rows, new Map()).rounds.find((value) => value.player === "P0");
    expect(measured.fieldRelative).toBe(3.5);
  });
});

describe("JKB Trend artifact health and determinism", () => {
  it("reports empty LIV and DPWT sources as unavailable", () => {
    const result = generateTrendArtifacts(syntheticPayloads(), { asOf: new Date("2026-07-13T00:00:00Z"), generatedAt: "2026-07-13T00:00:00Z" });
    expect(result.rankingsArtifact.sources.LIV.status).toBe("unavailable");
    expect(result.rankingsArtifact.sources.DPWT.status).toBe("unavailable");
    expect(result.rankingsArtifact.sources.PGA.status).toBe("available");
  });

  it("labels comparison groups as tracked cohorts rather than complete fields", () => {
    const result = generateTrendArtifacts(syntheticPayloads(), { asOf: new Date("2026-07-13T00:00:00Z"), generatedAt: "2026-07-13T00:00:00Z" });
    expect(result.rankingsArtifact.methodology.comparisonPopulation).toBe("available_tracked_players");
    expect(result.rankingsArtifact.methodology.minimumTrackedCohortSize).toBe(8);
    expect(result.rankingsArtifact.methodology.note).toContain("not a complete tournament-field average");
    expect(result.rankingsArtifact.validation.minimumTrackedCohortSize).toBe(8);
    expect(result.rankingsArtifact.validation).not.toHaveProperty("minimumEventRoundField");
    const diagnosticRound = buildDiagnostics(result, ["Player 1"]).players[0].recent20Rounds[0];
    expect(diagnosticRound).toMatchObject({ trackedCohortSize: 8 });
    expect(diagnosticRound).not.toHaveProperty("groupFieldSize");
  });

  it("produces deterministic ranks and idempotent content apart from generation time", () => {
    const payloads = syntheticPayloads();
    const first = generateTrendArtifacts(payloads, { asOf: new Date("2026-07-13T00:00:00Z"), generatedAt: "first" });
    const second = generateTrendArtifacts(payloads, { asOf: new Date("2026-07-13T00:00:00Z"), generatedAt: "second" });
    expect(first.rankingsArtifact.players.map((value) => [value.player, value.rank])).toEqual(second.rankingsArtifact.players.map((value) => [value.player, value.rank]));
    first.rankingsArtifact.generatedAt = "timestamp";
    second.rankingsArtifact.generatedAt = "timestamp";
    first.roundHistory.generatedAt = "timestamp";
    second.roundHistory.generatedAt = "timestamp";
    expect(first.rankingsArtifact).toEqual(second.rankingsArtifact);
    expect(first.roundHistory).toEqual(second.roundHistory);
  });
});
