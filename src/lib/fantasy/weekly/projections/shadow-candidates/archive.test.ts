import { afterEach, describe, expect, it } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArchiveIntegrityError, appendOutcomeEvents, appendPredictionEvents, buildOutcomeEvent, buildPredictionEvent, classifyCapture, currentOutcomes, readJsonl,
  resolveKickoff, selectFinalPreKickoff, shadowArchivePaths, verifyEvent, type OutcomeEvent,
} from "../../../../../../scripts/lib/fantasy-shadow-archive";
import { evaluatePosition, pairwiseOrdering, pointMetrics, spearman, topKInclusion, type EvalRow } from "../../../../../../scripts/lib/fantasy-shadow-evaluation";
import { collectEvalRows } from "../../../../../../scripts/evaluate-fantasy-shadow-candidates";
import { parseArchiveArgs, runShadowArchive } from "../../../../../../scripts/archive-fantasy-shadow-projections";

const KICK = "2026-09-27T17:00:00.000Z";
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "jkb-shadow-")); dirs.push(d); return d; };
const ev = (capturedAt: string, points = 20, kickoff = KICK, playerId = "gsis:1") => buildPredictionEvent({
  schema: "s", capturedAt, season: 2026, week: 3, playerId, gameId: "g", kickoff, candidateVersions: { candidateA: "A", candidateB: "B" }, sourceHashes: { x: "h" }, payload: { position: "WR", team: "buf", points },
});

describe("shadow archive: freezing", () => {
  it("classifies capture strictly before kickoff; equality, later and missing kickoff are rejected", () => {
    expect(classifyCapture("2026-09-27T16:59:59.999Z", KICK)).toBe("eligible");
    expect(classifyCapture(KICK, KICK)).toBe("post-kickoff");
    expect(classifyCapture("2026-09-27T18:00:00.000Z", KICK)).toBe("post-kickoff");
    expect(classifyCapture("2026-09-01T00:00:00.000Z", "")).toBe("no-kickoff");
  });
  it("never writes post-kickoff rows and reports them", () => {
    const path = join(tmp(), "a.jsonl");
    const r = appendPredictionEvents(path, [ev("2026-09-27T18:00:00.000Z", 20, KICK, "gsis:late"), ev("2026-09-24T10:00:00.000Z", 20, KICK, "gsis:ok")]);
    expect(r.appended).toBe(1);
    expect(r.rejected).toEqual([{ playerId: "gsis:late", reason: "post-kickoff" }]);
    expect(readJsonl(path).rows).toHaveLength(1);
  });
  it("is content-addressed: identical re-capture is a no-op that keeps the first capture time; changed content appends", () => {
    const path = join(tmp(), "a.jsonl");
    appendPredictionEvents(path, [ev("2026-09-24T10:00:00.000Z")]);
    const bytes = readFileSync(path, "utf8");
    expect(appendPredictionEvents(path, [ev("2026-09-25T10:00:00.000Z")])).toMatchObject({ appended: 0, duplicates: 1 });
    expect(readFileSync(path, "utf8")).toBe(bytes);
    expect(appendPredictionEvents(path, [ev("2026-09-25T10:00:00.000Z", 22)]).appended).toBe(1);
    expect(readFileSync(path, "utf8").startsWith(bytes)).toBe(true);          // append-only: prior bytes untouched
  });
  it("dry-run writes nothing", () => {
    const path = join(tmp(), "a.jsonl");
    expect(appendPredictionEvents(path, [ev("2026-09-24T10:00:00.000Z")], { dryRun: true }).appended).toBe(1);
    expect(readJsonl(path).rows).toHaveLength(0);
  });
  it("aborts on a tampered or malformed existing line instead of appending on top", () => {
    const path = join(tmp(), "a.jsonl");
    appendPredictionEvents(path, [ev("2026-09-24T10:00:00.000Z")]);
    const original = readFileSync(path, "utf8");
    writeFileSync(path, original.replace('"points":20', '"points":99'));
    expect(verifyEvent(JSON.parse(readFileSync(path, "utf8")))).toBe(false);
    expect(() => appendPredictionEvents(path, [ev("2026-09-25T10:00:00.000Z", 30)])).toThrow(ArchiveIntegrityError);
    writeFileSync(path, original); appendFileSync(path, "{not json\n");
    expect(() => appendPredictionEvents(path, [ev("2026-09-25T10:00:00.000Z", 30)])).toThrow(ArchiveIntegrityError);
  });
  it("selects the latest PRE-kickoff observation; a later one cannot replace it", () => {
    const events = [ev("2026-09-23T10:00:00.000Z", 20), ev("2026-09-25T10:00:00.000Z", 22), ev("2026-09-27T18:00:00.000Z", 40)];
    const sel = selectFinalPreKickoff(events);
    expect(sel).toHaveLength(1);
    expect((sel[0].payload as { points: number }).points).toBe(22);
  });
  it("resolves canonical kickoff and refuses to infer a missing one", () => {
    const games = [{ gameId: "g1", season: 2026, week: 3, seasonType: "REG", dateUtc: KICK, homeAbbr: "buf", awayAbbr: "mia" }, { gameId: "g2", season: 2026, week: 3, seasonType: "REG", dateUtc: null, homeAbbr: "nyj", awayAbbr: "ne" }];
    expect(resolveKickoff(games, 2026, 3, "MIA")).toEqual({ gameId: "g1", kickoff: KICK });
    expect(resolveKickoff(games, 2026, 3, "nyj")).toBeNull();
    expect(resolveKickoff(games, 2026, 3, "dal")).toBeNull();
  });
  it("CLI: --captured-at is refused without --dry-run (no backdating)", () => {
    expect(() => parseArchiveArgs(["--season=2026", "--week=3", "--captured-at=2026-09-20T00:00:00Z"])).toThrow(/dry-run/);
    expect(parseArchiveArgs(["--season=2026", "--week=3", "--dry-run", "--captured-at=2026-09-20T00:00:00Z"]).dryRun).toBe(true);
  });
});

describe("shadow archive: end to end with outcomes as separate events", () => {
  it("captures pre-kickoff, rejects a later re-run, and joins outcomes without touching predictions", () => {
    const root = tmp();
    mkdirSync(join(root, "data/fantasy/shadow/2026"), { recursive: true });
    mkdirSync(join(root, "public/data/nfl/2026"), { recursive: true });
    const row = (id: string, team: string, rank: number, proj: number) => ({ playerId: id, position: "WR", team, production: { projection: proj, positionRank: rank }, candidateA: { projection: proj + 0.1 }, candidateB: { projection: proj + 0.2 } });
    writeFileSync(join(root, "data/fantasy/shadow/2026/week-03.json"), JSON.stringify({ season: 2026, week: 3, generatedAt: "x", specSha256: "s", sourceHashes: { p: "h" }, candidateVersions: { candidateA: "A", candidateB: "B" }, rows: [row("gsis:1", "buf", 1, 15), row("gsis:2", "mia", 2, 12)] }));
    writeFileSync(join(root, "public/data/nfl/2026/games.json"), JSON.stringify({ games: [{ gameId: "g1", season: 2026, week: 3, seasonType: "REG", dateUtc: KICK, homeAbbr: "buf", awayAbbr: "mia" }] }));
    const args = parseArchiveArgs(["--season=2026", "--week=3"]);
    const first = runShadowArchive(args, root, () => "2026-09-24T10:00:00.000Z");
    expect(first).toMatchObject({ rows: 2, appended: 2, rejected: 0 });
    const paths = shadowArchivePaths(root, 2026, 3);
    const frozen = readFileSync(paths.predictions, "utf8");
    const late = runShadowArchive(args, root, () => "2026-09-27T18:00:00.000Z");
    expect(late).toMatchObject({ appended: 0, rejected: 2, rejectedByReason: { "post-kickoff": 2 } });
    expect(readFileSync(paths.predictions, "utf8")).toBe(frozen);
    const base = { eventType: "outcome" as const, season: 2026, week: 3, scoringVersion: "v", statsSourceSha256: "h", recordedAt: "2026-09-29T00:00:00.000Z" };
    const o1 = buildOutcomeEvent({ ...base, playerId: "gsis:1", actualFantasyPoints: 18.2, statLine: true }, null)!;
    expect(appendOutcomeEvents(paths.outcomes, [o1])).toBe(1);
    expect(appendOutcomeEvents(paths.outcomes, [o1])).toBe(0);
    expect(buildOutcomeEvent({ ...base, playerId: "gsis:1", actualFantasyPoints: 18.2, statLine: true }, o1)).toBeNull();
    const o2 = buildOutcomeEvent({ ...base, playerId: "gsis:1", actualFantasyPoints: 19.0, statLine: true }, o1)!;
    expect(o2).toMatchObject({ revision: 2, supersedes: o1.outcomeId });
    appendOutcomeEvents(paths.outcomes, [o2]);
    expect(currentOutcomes(readJsonl<OutcomeEvent>(paths.outcomes).rows).get("2026|3|gsis:1")!.actualFantasyPoints).toBe(19.0);
    expect(readFileSync(paths.predictions, "utf8")).toBe(frozen);
    const rows = collectEvalRows(2026, root);
    expect(rows).toHaveLength(1);                                   // gsis:2 has no outcome -> not scored, not zero-filled
    expect(rows[0]).toMatchObject({ playerId: "gsis:1", actual: 19.0, production: 15 });
  });
});

describe("shadow evaluation", () => {
  it("computes point, rank and ordering metrics", () => {
    const m = pointMetrics([10, 12, 8], [11, 9, 8]);
    expect(m.mae).toBeCloseTo(4 / 3, 10); expect(m.bias).toBeCloseTo(2 / 3, 10);
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
    expect(pairwiseOrdering([3, 2, 1], [30, 20, 10])).toBe(1);
    expect(pairwiseOrdering([3, 2, 1], [10, 20, 30])).toBe(0);
    expect(topKInclusion([9, 8, 7, 1, 2, 3, 4, 5, 6], [9, 8, 7, 1, 2, 3, 4, 5, 6], 2)).toBe(1);
    expect(topKInclusion([1, 2, 3], [1, 2, 3], 12)).toBeNull();
  });
  it("refuses a verdict on a tiny sample", () => {
    const rows: EvalRow[] = Array.from({ length: 30 }, (_, i) => ({ position: "WR", season: 2026, week: 3, playerId: `p${i}`, team: `t${i % 8}`, actual: 10 + (i % 5), played: true, production: 12 - i * 0.1, productionRank: i + 1, candidateA: 12 - i * 0.1, candidateB: 12 - i * 0.1 }));
    const r = evaluatePosition(rows, "WR");
    expect(r.verdict.status).toBe("INSUFFICIENT_SAMPLE");
    expect(r.completedWeeks).toBe(1);
    expect(r.pairedVsProduction.candidateA!.dMae).toBeCloseTo(0, 10);
  });
});
