/**
 * Offline board build, end to end: a ledger file written by the real sink, local projection / roster / box-score
 * inputs, the runner, and the artifact read back through the same view model the page uses.
 * Everything is invented (players, lines, box scores, a fictional "licensed" source); no network, no provider.
 */
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_TEAM_CODES } from "./canonical";
import { DVP_POSITIONS, type DvpPlayerGameLine } from "./dvp";
import { assembleBoard, NO_LINE_CAPTURED_REASON, NO_PROJECTION_REASON, type ProjectionRecord } from "./pipeline/boardBuild";
import { runBoardBuild } from "./pipeline/boardBuildRun";
import { buildSnapshot } from "./pipeline/contracts";
import { buildLineCapture, fileLineCaptureSink, snapshotsFromCapture, type NbaLineCapture } from "./pipeline/lineCapture";
import { LINES_NOT_PUBLISHED_REASON } from "./pipeline/propsBoardArtifact";
import { buildBoardRows, type PropsBoardArtifact } from "./propsBoard";
import { SOURCE_LICENSES } from "./sources/licenses";
import type { NbaSourceId, SourceLicense } from "./sources/types";

const dirs: string[] = [];
const tempRoot = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "nba-board-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const GAME_KEY = "2026-11-09|NYK@BOS";
const TIPOFF = "2026-11-10T00:30:00Z";
const CAPTURED = "2026-11-09T21:30:00Z";
const BUILD_AT = "2026-11-09T22:00:00Z";
/** A fictional stat source with every right granted, to exercise the gates that only a licensed source can pass. */
const LICENSED_ID: NbaSourceId = "balldontlie";
const LICENSES: Readonly<Record<NbaSourceId, SourceLicense>> = { ...SOURCE_LICENSES, [LICENSED_ID]: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "invented test grant", reviewedOn: "2026-11-01" } };

function demoCapture(over: Partial<Parameters<typeof buildLineCapture>[0]> = {}): NbaLineCapture {
  const ref = (market: string, i: number) => ({ eventId: "evt-nyk-bos", bookmakerKey: "demobook", marketKey: market, overOutcomeIndex: i, underOutcomeIndex: i + 1 });
  return buildLineCapture({
    sourceId: "the-odds-api",
    capturedAtUtc: CAPTURED,
    approvalId: "nba-odds-points-test0001",
    requestRef: "basketball_nba/events/evt-nyk-bos/odds",
    creditsCharged: 1,
    event: { sourceEventId: "evt-nyk-bos", commenceTimeUtc: TIPOFF, homeTeamName: "Boston Celtics", awayTeamName: "New York Knicks" },
    lines: [
      { playerName: "Demo Guard One", team: null, market: "pts", sportsbook: "demobook", line: 24.5, overPrice: -115, underPrice: -105, lastUpdateUtc: "2026-11-09T21:20:00Z", rawProviderRef: ref("player_points", 0) },
      { playerName: "Demo Big Four", team: null, market: "reb", sportsbook: "demobook", line: 11.5, overPrice: -110, underPrice: -110, lastUpdateUtc: "2026-11-09T21:20:00Z", rawProviderRef: ref("player_rebounds", 2) },
      { playerName: "Demo Stale Five", team: null, market: "pts", sportsbook: "demobook", line: 12.5, overPrice: -110, underPrice: -110, lastUpdateUtc: "2026-11-09T18:00:00Z" },
      { playerName: "Demo Bench Six", team: null, market: "ast", sportsbook: "demobook", line: 2.5, overPrice: -120, underPrice: 100, lastUpdateUtc: "2026-11-09T21:25:00Z" },
    ],
    unmatched: [],
    usageIssue: null,
    ...over,
  });
}

const ROSTER = {
  players: {
    "Demo Guard One": { team: "NYK", position: "PG" },
    "Demo Big Four": { team: "NYK", position: "C" },
    "Demo Stale Five": { team: "BOS", position: "SF" },
    "Demo Bench Six": { team: "BOS", position: null },
    "Demo Projected Only": { team: "BOS", position: "SG" },
  },
};

const projection = (over: Partial<ProjectionRecord> = {}): ProjectionRecord => ({
  gameKey: GAME_KEY, tipoffUtc: TIPOFF, playerName: "Demo Guard One", team: "NYK", market: "pts", value: 26.1, minutes: 33, modelVersion: "baseline-v0-test", inputCutoffUtc: "2026-11-09T20:00:00Z", inputSourceIds: [LICENSED_ID], ...over,
});
const PROJECTIONS = {
  records: [
    projection(),
    projection({ playerName: "Demo Big Four", market: "reb", value: 12.3, minutes: 30 }),
    projection({ playerName: "Demo Stale Five", team: "BOS", market: "pts", value: 13.1 }),
    projection({ playerName: "Demo Projected Only", team: "BOS", market: "pts", value: 18.4, minutes: 31 }),
  ],
};

/** Every team, both seasons, every position, 3 games each, from the licensed fictional source. Stats vary by team and position so ranks differ. */
function boxScores(): DvpPlayerGameLine[] {
  const lines: DvpPlayerGameLine[] = [];
  for (const season of ["2025-26", "2026-27"] as const) {
    CANONICAL_TEAM_CODES.forEach((team, t) => {
      for (let g = 0; g < 3; g += 1) {
        DVP_POSITIONS.forEach((position, p) => {
          lines.push({ season, gameId: `${season}-${team}-${g}`, opponentTeam: team, playerId: `${season}-${team}-${g}-${position}`, minutes: 30, pts: 10 + p * 2 + ((t * 7 + p * 3 + g) % 9), reb: 3 + p + ((t + p) % 4), ast: 2 + ((t * 3 + p) % 5), positionLabel: position, sourceId: LICENSED_ID, sourceUpdatedAtUtc: "2026-11-09T12:00:00Z" });
        });
      }
    });
  }
  return lines;
}

function seedInputs(root: string, extra: { captures?: NbaLineCapture[] } = {}): Promise<unknown> {
  const inputs = path.join(root, "data", "nba", "board-inputs");
  mkdirSync(inputs, { recursive: true });
  writeFileSync(path.join(inputs, "roster.json"), JSON.stringify(ROSTER));
  writeFileSync(path.join(inputs, "projections.json"), JSON.stringify(PROJECTIONS));
  writeFileSync(path.join(inputs, "dvp.json"), JSON.stringify({ sourceId: LICENSED_ID, lines: boxScores() }));
  const sink = fileLineCaptureSink(path.join(root, "data", "nba", "odds-captures"));
  return Promise.all((extra.captures ?? [demoCapture()]).map((c) => sink(c)));
}

const run = (root: string, over: Record<string, unknown> = {}) =>
  runBoardBuild({ root, generatedAtUtc: BUILD_AT, projectionsFile: "data/nba/board-inputs/projections.json", rosterFile: "data/nba/board-inputs/roster.json", dvpFile: "data/nba/board-inputs/dvp.json", sourceLicenses: LICENSES, ...over });
const readBoard = (file: string): PropsBoardArtifact => JSON.parse(readFileSync(file, "utf8")) as PropsBoardArtifact;
const entry = (board: PropsBoardArtifact, player: string, market: string) => board.entries.find((e) => e.playerName === player && e.market === market);

describe("end to end: ledger + projections + roster + box scores -> board file", () => {
  it("populates lines, projections and DvP when lines are published", async () => {
    const root = tempRoot();
    await seedInputs(root);
    const result = await run(root, { publishLines: true });
    expect(path.relative(root, result.outFile).split(path.sep).join("/")).toBe("public/data/nba-props-board.json");
    const board = readBoard(result.outFile);
    expect(board).toMatchObject({ schemaVersion: "nba-props-board-v1", isSynthetic: false, generatedAtUtc: BUILD_AT });
    expect(board.sources).toMatchObject({ lines: ["the-odds-api"], dvp: LICENSED_ID });

    const guard = entry(board, "Demo Guard One", "pts")!;
    expect(guard).toMatchObject({ team: "NYK", opponent: "BOS", positionLabel: "PG", gameKey: GAME_KEY, lineWithheldReason: null, projectionUnavailableReason: null });
    expect(guard.line).toMatchObject({ sportsbook: "demobook", line: 24.5, overPrice: -115, underPrice: -105, freshness: "fresh" });
    expect(guard.projection).toEqual({ value: 26.1, minutes: 33, modelVersion: "baseline-v0-test" });

    // The page's own view model reads the written file: difference and DvP both resolve.
    const row = buildBoardRows(board, "pts").find((r) => r.entry.playerName === "Demo Guard One")!;
    expect(row.difference).toBeCloseTo(1.6, 6);
    expect(row.dvp.kind).toBe("ok");
    if (row.dvp.kind === "ok") {
      expect(row.dvp.comparison.prior?.gamesSampled).toBe(3);
      expect(row.dvp.comparison.current?.gamesSampled).toBe(3);
      expect(row.dvp.comparison.prior?.rank).toBeGreaterThanOrEqual(1);
    }
    expect(result.report.entries).toMatchObject({ withBoth: 2, projectionOnly: 1 });
    expect(result.report.dvp).toMatchObject({ status: "included", rows: CANONICAL_TEAM_CODES.length * 2 * 15 });
  });

  it("keeps three kinds of missing data distinct", async () => {
    const root = tempRoot();
    await seedInputs(root);
    const board = readBoard((await run(root, { publishLines: true })).outFile);
    // stale line withheld, projection kept
    expect(entry(board, "Demo Stale Five", "pts")).toMatchObject({ line: null, lineWithheldReason: "line is stale", projection: { value: 13.1 } });
    // projection with no captured line
    expect(entry(board, "Demo Projected Only", "pts")).toMatchObject({ line: null, lineWithheldReason: NO_LINE_CAPTURED_REASON, projection: { value: 18.4 }, projectionUnavailableReason: null });
    // line with no projection
    expect(entry(board, "Demo Bench Six", "ast")).toMatchObject({ projection: null, projectionUnavailableReason: NO_PROJECTION_REASON, line: { line: 2.5 } });
    // no roster position -> DvP says so, separately from the other two
    const bench = buildBoardRows(board, "ast").find((r) => r.entry.playerName === "Demo Bench Six")!;
    expect(bench.dvp.kind).toBe("no-position");
  });

  it("leaves raw sportsbook lines out of the file by default", async () => {
    const root = tempRoot();
    await seedInputs(root);
    const result = await run(root);
    const text = readFileSync(result.outFile, "utf8");
    const board = JSON.parse(text) as PropsBoardArtifact;
    expect(board.entries.length).toBeGreaterThan(0);
    expect(board.entries.every((e) => e.line === null)).toBe(true);
    expect(text).not.toMatch(/overPrice|underPrice|demobook/);
    expect(board.sources.lines).toEqual([]);
    expect(entry(board, "Demo Guard One", "pts")).toMatchObject({ lineWithheldReason: LINES_NOT_PUBLISHED_REASON, projection: { value: 26.1 } });
    // entries that would show nothing at all (no line, no projection) are dropped, not rendered as N/A rows
    expect(entry(board, "Demo Bench Six", "ast")).toBeUndefined();
    expect(result.report.snapshots.droppedNoContent).toBe(1);
  });

  it("writes a valid empty artifact when nothing qualifies", async () => {
    const root = tempRoot();
    const result = await runBoardBuild({ root, generatedAtUtc: BUILD_AT });
    const board = readBoard(result.outFile);
    expect(board).toEqual({ schemaVersion: "nba-props-board-v1", generatedAtUtc: BUILD_AT, isSynthetic: false, sources: { lines: [], dvp: null, dvpUpdatedUtc: null }, entries: [], dvpRows: [] });
    expect(result.report.dvp).toMatchObject({ status: "absent" });
    expect(buildBoardRows(board, "pts")).toEqual([]);
  });

  it("builds from a store directory with no captures, and replays an unchanged build identically", async () => {
    const root = tempRoot();
    await seedInputs(root);
    const first = readFileSync((await run(root, { publishLines: true })).outFile, "utf8");
    const second = readFileSync((await run(root, { publishLines: true })).outFile, "utf8");
    expect(second).toBe(first);
  });

  it("refuses paths outside data/nba and public/data", async () => {
    const root = tempRoot();
    await expect(runBoardBuild({ root, generatedAtUtc: BUILD_AT, outFile: "src/board.json" })).rejects.toThrow(/output file must be under/);
    await expect(runBoardBuild({ root, generatedAtUtc: BUILD_AT, capturesDir: "somewhere/else" })).rejects.toThrow(/captures directory must be under/);
    await expect(runBoardBuild({ root, generatedAtUtc: BUILD_AT, projectionsFile: "../outside.json" })).rejects.toThrow(/must be under/);
    expect(existsSync(path.join(root, "src"))).toBe(false);
  });

  it("fails on a tampered ledger file instead of building from it", async () => {
    const root = tempRoot();
    const [{ file }] = (await seedInputs(root)) as Array<{ file: string }>;
    const { chmodSync } = await import("node:fs");
    chmodSync(file, 0o666);
    writeFileSync(file, readFileSync(file, "utf8").replace("24.5", "30.5"));
    await expect(run(root, { publishLines: true })).rejects.toThrow(/content hash mismatch/);
    expect(existsSync(path.join(root, "public", "data", "nba-props-board.json"))).toBe(false);
  });
});

describe("gates", () => {
  const snapshots = () => snapshotsFromCapture(demoCapture(), { teamOf: () => null }).snapshots;
  const base = { generatedAtUtc: BUILD_AT, snapshots: snapshots(), projections: [] as ProjectionRecord[], roster: {}, dvp: null, sourceLicenses: LICENSES };

  it("never publishes a synthetic line or counts it as data", () => {
    const [real] = snapshots();
    const synthetic = buildSnapshot({
      game: real.game, player: real.player, market: "pts", source: { sourceId: "synthetic-odds", method: "synthetic", sportsbook: "fake", sourceMarketKey: "player_points" }, line: 20.5, overPrice: -110, underPrice: -110,
      sourceLastUpdateUtc: "2026-11-09T21:25:00Z", capturedAtUtc: CAPTURED, maxAgeMinutes: 120, permissions: { permittedUses: ["private-research", "model-development", "public-display"], licenseBasis: "invented", licenseReviewedOn: "2026-11-01", attestation: null }, provenance: { runId: null, importBatchId: null, creditsCharged: null },
    });
    const { artifact, report } = assembleBoard({ ...base, snapshots: [synthetic], publishLines: true, projections: [projection({ playerName: real.player.sourcePlayerName })] });
    expect(report.snapshots.synthetic).toBe(1);
    expect(artifact.entries.every((e) => e.line === null)).toBe(true);
    expect(artifact.isSynthetic).toBe(false);
  });

  it("withholds a line whose rights do not include public display, even when publishing is on", () => {
    const narrowed = snapshotsFromCapture(demoCapture(), { currentLicenses: { "the-odds-api": { ...SOURCE_LICENSES["balldontlie"], status: "restricted", permittedUses: ["private-research"] }, parlayapi: { status: "restricted", permittedUses: [], basis: "x", reviewedOn: "x" }, "manual-import": { status: "unlicensed", permittedUses: [], basis: "x", reviewedOn: "x" }, "synthetic-odds": { status: "synthetic", permittedUses: [], basis: "x", reviewedOn: "x" } } }).snapshots;
    const { artifact, report } = assembleBoard({ ...base, snapshots: narrowed, publishLines: true, projections: PROJECTIONS.records });
    expect(artifact.entries.filter((e) => e.line !== null)).toEqual([]);
    expect(report.snapshots.lineWithheld["source license does not permit public display of lines"]).toBeGreaterThan(0);
  });

  it("drops entries for a game that has already started", () => {
    const { artifact, report } = assembleBoard({ ...base, generatedAtUtc: "2026-11-10T00:45:00Z", publishLines: true, projections: PROJECTIONS.records });
    expect(artifact.entries).toEqual([]);
    expect(report.snapshots.pastTipoff).toBe(4);
    expect(report.projections.rejected.every((r) => r.reason === "game has already started")).toBe(true);
  });

  it("rejects projections built from restricted, unknown or unnamed sources", () => {
    const { report, artifact } = assembleBoard({
      ...base,
      projections: [
        projection({ inputSourceIds: ["stats.nba.com"] }),
        projection({ playerName: "Demo Big Four", market: "reb", inputSourceIds: [] }),
        projection({ playerName: "Demo Stale Five", team: "BOS", inputSourceIds: ["llimllib-nba-data"] }),
        projection({ playerName: "Demo Bench Six", market: "ast", inputSourceIds: ["synthetic"] }),
        projection({ playerName: "Demo Projected Only", team: "BOS", value: -3 }),
        projection({ playerName: "Demo Late", inputCutoffUtc: "2026-11-09T23:00:00Z" }),
      ],
    });
    expect(report.projections.accepted).toBe(0);
    expect(report.projections.rejected.map((r) => r.reason)).toEqual([
      expect.stringContaining("stats.nba.com"),
      "does not name the data sources it was built from",
      expect.stringContaining("llimllib-nba-data"),
      "built from synthetic source synthetic",
      "projection value is not a non-negative number",
      "inputs postdate the build",
    ]);
    expect(artifact.entries.every((e) => e.projection === null)).toBe(true);
  });

  it("ignores a projection embedded in a snapshot because it names no sources", () => {
    const [real] = snapshots();
    const embedded = buildSnapshot({
      game: real.game, player: real.player, market: "pts", source: real.source, line: 24.5, overPrice: -115, underPrice: -105, sourceLastUpdateUtc: "2026-11-09T21:20:00Z", capturedAtUtc: CAPTURED, maxAgeMinutes: 120,
      projection: { value: 27, minutes: 30, modelVersion: "from-restricted-data", inputCutoffUtc: "2026-11-09T20:00:00Z", unavailableReason: null }, permissions: real.permissions, provenance: real.provenance,
    });
    const { artifact, report } = assembleBoard({ ...base, snapshots: [embedded], publishLines: true });
    expect(report.snapshots.embeddedProjectionsIgnored).toBe(1);
    expect(artifact.entries[0].projection).toBeNull();
  });

  it("builds no DvP from a restricted or mismatched source, and says why", () => {
    const rows = boxScores();
    const restricted = assembleBoard({ ...base, dvp: { sourceId: "stats.nba.com", lines: rows.map((l) => ({ ...l, sourceId: "stats.nba.com" })) } });
    expect(restricted.artifact.dvpRows).toEqual([]);
    expect(restricted.report.dvp).toMatchObject({ status: "withheld", reason: expect.stringContaining("do not permit public display") });
    const mismatched = assembleBoard({ ...base, dvp: { sourceId: LICENSED_ID, lines: [{ ...rows[0], sourceId: "hoopr-espn" }, ...rows.slice(1)] } });
    expect(mismatched.report.dvp.status).toBe("withheld");
    expect(mismatched.artifact.sources.dvp).toBeNull();
    const synthetic = assembleBoard({ ...base, dvp: { sourceId: "synthetic", lines: rows.map((l) => ({ ...l, sourceId: "synthetic" })) } });
    expect(synthetic.report.dvp).toMatchObject({ status: "withheld", reason: expect.stringContaining("synthetic") });
  });

  it("passes hoopR/ESPN through the unchanged public gate only because both records carry the owner's 2026-10-29 statement", () => {
    const input = { generatedAtUtc: BUILD_AT, snapshots: snapshots(), projections: PROJECTIONS.records.map((p) => ({ ...p, inputSourceIds: ["hoopr-espn"] })), roster: {}, dvp: { sourceId: "hoopr-espn" as const, lines: boxScores().map((l) => ({ ...l, sourceId: "hoopr-espn" as const })) } };
    const recorded = assembleBoard(input);
    expect(recorded.artifact.dvpRows.length).toBeGreaterThan(0);
    expect(recorded.report.projections.accepted).toBeGreaterThan(0);
    // The gate itself did not change: narrow the ESPN origin record, or the box-score source's own, and it closes again.
    const narrowedOrigin = assembleBoard({ ...input, sourceLicenses: { ...SOURCE_LICENSES, espn: { ...SOURCE_LICENSES.espn, permittedUses: ["private-research", "private-hosted"] } } });
    expect(narrowedOrigin.artifact.dvpRows).toEqual([]);
    expect(narrowedOrigin.report.projections.accepted).toBe(0);
    const narrowedSource = assembleBoard({ ...input, sourceLicenses: { ...SOURCE_LICENSES, "hoopr-espn": { ...SOURCE_LICENSES["hoopr-espn"], permittedUses: ["private-research", "private-hosted", "model-development"] } } });
    expect(narrowedSource.artifact.dvpRows).toEqual([]);
    expect(narrowedSource.report.projections.accepted).toBe(0);
  });
});
