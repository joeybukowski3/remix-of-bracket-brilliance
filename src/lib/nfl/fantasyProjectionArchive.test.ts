import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFantasyCapture, fantasyEligibility, persistFantasyCapture, selectFinalPregame } from "../../../scripts/lib/nfl-fantasy-projection-archive";
import { parseFantasyArchiveArgs, runFantasyArchive } from "../../../scripts/archive-fantasy-weekly-projections";
import { loadArchivedPredictions } from "../../../scripts/resolve-nfl-prediction-outcomes";
import { FANTASY_SCORING_VERSION } from "../fantasy/weekly/scoring";

const live = JSON.parse(readFileSync("public/data/fantasy/projections/2026/week-01.json", "utf8"));
const template = structuredClone(live.rows.QB[0]);
const kickoff = "2026-09-10T00:20:00.000Z";
const early = "2026-09-07T10:00:00.000Z";
const later = "2026-09-09T10:00:00.000Z";
const post = "2026-09-11T10:00:00.000Z";
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
function fixture(capturedAt = early, points = 20, change: (artifact: typeof live) => void = () => {}, dateUtc: string | null = kickoff) {
  const artifact = { ...structuredClone(live), rows: { QB: [{ ...template, projectedFantasyPoints: points }], RB: [], WR: [], TE: [] } };
  change(artifact);
  return buildFantasyCapture({ season: 2026, week: 1, capturedAt, sourceArtifact: "fixture.json", sourceText: JSON.stringify(artifact),
    games: [{ gameId: "2026_01_TB_CIN", season: 2026, week: 1, seasonType: "REG", dateUtc, homeAbbr: "cin", awayAbbr: "tb" }],
    players: [{ gsis_id: template.playerId.slice(5), position: "QB" }], resolutionSources: [] });
}
function temp() { const path = mkdtempSync(join(tmpdir(), "jkb-fantasy-archive-")); directories.push(path); return path; }

describe("WU6B.1 fantasy capture", () => {
  it("uses stable content IDs; preserves all three clocks and the exact source row", () => {
    const a = fixture(), b = fixture(later), c = fixture(later, 22);
    expect(a.events[0].predictionId).toBe(b.events[0].predictionId);
    expect(c.events[0].predictionId).not.toBe(a.events[0].predictionId);
    expect(a.events[0]).toMatchObject({ generatedAt: live.generatedAt, inputAsOf: live.inputAsOf, capturedAt: early,
      gameId: "2026_01_TB_CIN", kickoff, scoringVersion: FANTASY_SCORING_VERSION, scoringFormat: "PPR", sourceKickoffMissing: true });
    expect(a.events[0].sourceRow).toEqual({ ...template, projectedFantasyPoints: 20 });
  });
  it("dry-run writes nothing; retries preserve first capture and existing bytes", () => {
    const root = temp(), a = fixture();
    expect(persistFantasyCapture(root, a, true).appended).toBe(1);
    expect(readdirSync(root)).toEqual([]);
    const first = persistFantasyCapture(root, a);
    const bytes = readFileSync(first.intendedWrites[0], "utf8");
    expect(persistFantasyCapture(root, a).appended).toBe(0);
    const repeated = persistFantasyCapture(root, fixture(later));
    expect(repeated.records[0].capturedAt).toBe(early);
    expect(readFileSync(first.intendedWrites[0], "utf8")).toBe(bytes);
    expect(persistFantasyCapture(root, fixture(later, 22)).appended).toBe(1);
    expect(loadArchivedPredictions(root, 2026, 1)).toEqual([]);
  });
  it.each([[early, true], [kickoff, false], [post, false]])("strict capture cutoff %s", (time, eligible) => {
    expect(fantasyEligibility(fixture(time).events[0]).eligible).toBe(eligible);
  });
  it.each([null, "unknown"])("retains missing/invalid canonical kickoff %s without fabrication", dateUtc => {
    const capture = fixture(early, 20, () => {}, dateUtc);
    expect(capture.events[0]).toMatchObject({ kickoff: null, missingKickoffReason: "canonical-kickoff-missing-or-invalid" });
    expect(capture.run.counts.unresolved).toBe(1);
    expect(selectFinalPregame(capture.events, [capture.run], 2026, 1).selections).toEqual([]);
  });
  it("selects latest pregame refresh; postgame refresh cannot replace it", () => {
    const captures = [fixture(), fixture(later, 22), fixture(post, 29)];
    const result = selectFinalPregame(captures.flatMap(c => c.events), captures.map(c => c.run).reverse(), 2026, 1);
    expect(result.selections).toHaveLength(1);
    expect(result.selections[0]).toMatchObject({ predictionId: captures[1].events[0].predictionId, capturedAt: later, freshness: { stale: true } });
    expect(selectFinalPregame(captures.flatMap(c => c.events), captures.map(c => c.run), 2026, 2).selections).toEqual([]);
  });
  it("tracks later observation of unchanged state, including A -> B -> A", () => {
    const a = fixture(), b = fixture("2026-09-08T00:00:00.000Z", 22), again = fixture(later);
    const selection = selectFinalPregame([...a.events, ...b.events], [a.run, b.run, again.run], 2026, 1);
    expect(selection.selections[0]).toMatchObject({ predictionId: a.events[0].predictionId, capturedAt: later });
  });
  it.each([
    ["wrong week", (a: typeof live) => a.week = 2],
    ["unknown player", (a: typeof live) => a.rows.QB[0].playerId = "gsis:unknown"],
    ["unresolved game", (a: typeof live) => a.rows.QB[0].opponent = "sea"],
    ["unsupported scoring", (a: typeof live) => a.scoringVersion = "dk"],
    ["unknown model", (a: typeof live) => a.modelVersion = "unknown"],
    ["bad value", (a: typeof live) => a.rows.QB[0].projectedFantasyPoints = null],
    ["future generation", (a: typeof live) => a.generatedAt = post],
    ["future input", (a: typeof live) => a.inputAsOf = post],
    ["invalid time", (a: typeof live) => a.generatedAt = "yesterday"],
    ["conflicting game ID", (a: typeof live) => a.rows.QB[0].gameId = "wrong-game"],
    ["conflicting source kickoff", (a: typeof live) => a.rows.QB[0].kickoff = post],
    ["duplicate player", (a: typeof live) => a.rows.QB.push(a.rows.QB[0])],
  ])("retains but excludes %s", (_, change) => {
    const capture = fixture(early, 20, change);
    expect(capture.events.length).toBeGreaterThan(0);
    expect(capture.run.counts.finalPregameEligible).toBe(0);
    expect(Object.keys(capture.run.rejectionSummary).length).toBeGreaterThan(0);
    expect(selectFinalPregame(capture.events, [capture.run], 2026, 1).selections).toEqual([]);
  });
  it("keeps slate prelock separate from player/game cutoff", () => {
    const a = fixture(), b = fixture(later, 22);
    const result = selectFinalPregame([...a.events, ...b.events], [a.run, b.run], 2026, 1,
      { kind: "slate-prelock", lockAt: "2026-09-08T00:00:00.000Z", gameIds: ["2026_01_TB_CIN"] });
    expect(result.selections[0].predictionId).toBe(a.events[0].predictionId);
  });
  it("refuses new real captures with supplied historical clocks", () => {
    expect(() => runFantasyArchive(parseFantasyArchiveArgs(["--season", "2026", "--week", "1", "--captured-at", early]))).toThrow(/no backdating/);
  });
});
