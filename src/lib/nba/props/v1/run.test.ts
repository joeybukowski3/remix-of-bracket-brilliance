/**
 * Props board V1 end to end: files on disk -> V1 builder -> existing board builder -> artifact read back through the
 * page's own view model. Everything is invented. Two rights situations are run on identical inputs:
 *   - a test-only license table that grants a fictional agreement, to prove the slice works once a source is licensed;
 *   - the repository's real registry, where no source may feed the public board: the blocker that holds today.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_BUILD_AT, fixtureImportFile, fixturePositionsFile, fixtureRows, fixtureSlateFile } from "../__fixtures__/v1Fixtures";
import { buildBoardRows, type PropsBoardArtifact } from "../propsBoard";
import { SOURCE_LICENSES } from "../sources/licenses";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { runV1Build, runV1PrivatePreview } from "./run";

/** The registry as it stood before the owner's hoopR/ESPN statements of 2026-10-29: private research only. */
const BEFORE_STATEMENTS: Record<NbaSourceId, SourceLicense> = {
  ...SOURCE_LICENSES,
  espn: { ...SOURCE_LICENSES.espn, permittedUses: ["private-research"] },
  "hoopr-espn": { ...SOURCE_LICENSES["hoopr-espn"], permittedUses: ["private-research"] },
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const LICENSED: Record<NbaSourceId, SourceLicense> = {
  ...SOURCE_LICENSES,
  balldontlie: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "fictional test agreement", reviewedOn: "2026-10-23" },
};

function project(over: { sourceId?: string; csv?: boolean } = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "nba-v1-"));
  dirs.push(root);
  const dir = path.join(root, "data", "nba", "props-v1");
  mkdirSync(dir, { recursive: true });
  const put = (name: string, body: unknown) => writeFileSync(path.join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  if (over.csv) {
    const header = "season,seasonType,gameId,gameDate,team,opponent,isHome,playerId,playerName,minutes,pts,reb,ast";
    put("player-games.csv", [header, ...fixtureRows().map((r) => [r.season, r.seasonType, r.gameId, r.gameDate, r.team, r.opponent, r.isHome, r.playerId, r.playerName, r.minutes, r.pts, r.reb, r.ast].join(","))].join("\n"));
    put("player-games.source.json", { sourceId: over.sourceId ?? "balldontlie", retrievedAtUtc: "2026-10-23T12:00:00Z", provenance: "invented CSV for tests, not real" });
  } else put("player-games.json", fixtureImportFile({ sourceId: over.sourceId }));
  put("positions-2025-26.json", fixturePositionsFile("2025-26"));
  put("positions-2026-27.json", fixturePositionsFile("2026-27"));
  put("slate.json", fixtureSlateFile());
  return root;
}

const readBoard = (file: string): PropsBoardArtifact => JSON.parse(readFileSync(file, "utf8")) as PropsBoardArtifact;

describe("V1 with a licensed source (test-only agreement)", () => {
  it("publishes projections and estimated primary-position DvP, with no sportsbook lines needed", async () => {
    const root = project();
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED });
    const board = readBoard(result.board.outFile);

    expect(path.relative(root, result.board.outFile).split(path.sep).join("/")).toBe("data/nba/props-v1/nba-props-board.json");
    expect(existsSync(path.join(root, "public"))).toBe(false);
    expect(board.isSynthetic).toBe(false);
    expect(result.board.report.entries).toMatchObject({ total: 48, withProjection: 48, withLine: 0, projectionOnly: 48 });
    expect(result.board.report.projections).toMatchObject({ supplied: 48, accepted: 48, rejected: [] });
    expect(result.v1.projections).toMatchObject({ playersProjected: 16, propsProduced: 48 });
    expect(board.sources.lines).toEqual([]);
    expect(board.sources.dvp).toBe("balldontlie");
  });

  it("builds DvP rows for both seasons, ranked once all 30 teams have data, with games sampled and coverage", async () => {
    const root = project();
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED });
    const board = readBoard(result.board.outFile);
    // 30 teams x 5 positions x 3 stats x 2 seasons.
    expect(board.dvpRows).toHaveLength(900);
    expect(result.board.report.dvp).toMatchObject({ status: "included", rows: 900, excludedPlayerGames: 0 });
    for (const season of ["2025-26", "2026-27"]) {
      const pts = board.dvpRows.filter((r) => r.season === season && r.position === "PG" && r.statistic === "PTS");
      expect(pts.map((r) => r.rank).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
      expect(pts.every((r) => r.minutesCoverage === 1 && r.gamesSampled === (season === "2025-26" ? 12 : 2))).toBe(true);
    }
    const best = board.dvpRows.filter((r) => r.season === "2025-26" && r.position === "PG" && r.statistic === "PTS").find((r) => r.rank === 1);
    const worst = board.dvpRows.filter((r) => r.season === "2025-26" && r.position === "PG" && r.statistic === "PTS").find((r) => r.rank === 30);
    expect(best!.allowedPerGame).toBeGreaterThan(worst!.allowedPerGame);
  });

  it("shows each prop with the player's estimated primary position and its opponent DvP context", async () => {
    const root = project();
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED });
    const rows = buildBoardRows(readBoard(result.board.outFile), "pts");
    const bos1 = rows.find((r) => r.entry.playerName === "Demo Player BOS 1");
    expect(bos1?.entry).toMatchObject({ team: "BOS", opponent: "NYK", positionLabel: "PG", line: null });
    expect(bos1?.entry.projection?.modelVersion).toBe("nba-props-baseline-v0");
    expect(bos1?.dvp).toMatchObject({ kind: "ok", position: "PG", isMultiPosition: false });
    expect(rows).toHaveLength(16);
  });

  it("writes the roster into the public board inputs only for a source that may be published", async () => {
    const licensedRoot = project();
    const licensed = await runV1Build({ root: licensedRoot, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED });
    const licensedRoster = JSON.parse(readFileSync(path.join(licensedRoot, licensed.files.roster), "utf8")) as { players: Record<string, unknown> };
    expect(Object.keys(licensedRoster.players)).toHaveLength(240 + 1);
    // Without a public-display right, hoopR/ESPN's team and position labels never ride into a public build...
    const hooprRoot = project({ sourceId: "hoopr-espn" });
    const hoopr = await runV1Build({ root: hooprRoot, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: BEFORE_STATEMENTS });
    expect(JSON.parse(readFileSync(path.join(hooprRoot, hoopr.files.roster), "utf8"))).toEqual({ players: {} });
    // ...and with the owner's recorded statements the unchanged rule lets them through.
    const recordedRoot = project({ sourceId: "hoopr-espn" });
    const recorded = await runV1Build({ root: recordedRoot, generatedAtUtc: FIXTURE_BUILD_AT });
    expect(Object.keys((JSON.parse(readFileSync(path.join(recordedRoot, recorded.files.roster), "utf8")) as { players: Record<string, unknown> }).players).length).toBeGreaterThan(0);
  });

  it("accepts the same data as a CSV export plus a source record", async () => {
    const root = project({ csv: true });
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED });
    expect(result.board.report.entries.withProjection).toBe(48);
    expect(result.board.report.dvp.rows).toBe(900);
  });

  it("writes the board inputs and a build report under data/nba/props-v1/board-inputs", async () => {
    const root = project();
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED });
    for (const file of Object.values(result.files)) if (file) expect(existsSync(path.join(root, file))).toBe(true);
    const report = JSON.parse(readFileSync(path.join(root, result.files.report), "utf8"));
    expect(report.positions.method).toBe("estimated-primary-position");
    expect(report.dvp.method).toBe("estimated-primary-position");
  });
});

describe("V1 under the repository's real source rights (the blocker that holds today)", () => {
  it("withholds every projection and all DvP from a source with no recorded public-display right, and the artifact leaks nothing", async () => {
    const root = project();
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT });
    const text = readFileSync(result.board.outFile, "utf8");
    const board = JSON.parse(text) as PropsBoardArtifact;

    expect(result.v1.projections.propsProduced).toBe(48);
    expect(result.board.report.projections.accepted).toBe(0);
    expect(result.board.report.projections.rejected).toHaveLength(48);
    expect(new Set(result.board.report.projections.rejected.map((r) => r.reason))).toEqual(new Set(["built from balldontlie, whose rights do not permit model development and public display"]));
    expect(result.board.report.dvp).toMatchObject({ status: "withheld", rows: 0 });
    expect(result.board.report.dvp.reason).toMatch(/do not permit public display/);
    expect(board.entries).toEqual([]);
    expect(board.dvpRows).toEqual([]);
    expect(text).not.toMatch(/Demo Player|BOS-|balldontlie/);
  });

  it.each(["synthetic", "stats.nba.com"] as const)("withholds data labelled as %s", async (sourceId) => {
    const root = project({ sourceId });
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT });
    expect(result.board.report.projections.accepted).toBe(0);
    expect(result.board.report.dvp.status).toBe("withheld");
    expect(readBoard(result.board.outFile).entries).toEqual([]);
  });

  it("withholds data labelled as hoopr-espn unless the records carry the owner's public statements, and the unchanged gate then lets it through", async () => {
    const narrowed = await runV1Build({ root: project({ sourceId: "hoopr-espn" }), generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: BEFORE_STATEMENTS });
    expect(narrowed.board.report.projections.accepted).toBe(0);
    expect(narrowed.board.report.dvp.status).toBe("withheld");
    expect(readBoard(narrowed.board.outFile).entries).toEqual([]);
    const recorded = await runV1Build({ root: project({ sourceId: "hoopr-espn" }), generatedAtUtc: FIXTURE_BUILD_AT });
    expect(recorded.board.report.projections.accepted).toBeGreaterThan(0);
    expect(recorded.board.report.dvp.status).not.toBe("withheld");
  });

  it("does not let a source id inside a CSV source record pick a more permissive license", async () => {
    const root = project({ csv: true, sourceId: "synthetic" });
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT });
    expect(result.board.report.projections.accepted).toBe(0);
  });
});

describe("V1 private preview through the runner (real registry)", () => {
  it("writes a private board for hoopR/ESPN data under data/nba only, never under public, with its notice", () => {
    const root = project({ sourceId: "hoopr-espn" });
    const result = runV1PrivatePreview({ root, generatedAtUtc: FIXTURE_BUILD_AT });
    expect(result.outFile.split(path.sep).join("/")).toBe("data/nba/props-v1/private-preview-board.json");
    expect(existsSync(path.join(root, "public"))).toBe(false);
    const board = readBoard(path.join(root, result.outFile));
    expect(board.privatePreview?.notice).toMatch(/PRIVATE PREVIEW/);
    expect(board.entries).toHaveLength(48);
    expect(board.dvpRows).toHaveLength(900);
    expect(result.preview).toMatchObject({ sources: ["hoopr-espn"], entries: 48 });
    expect(result.v1.projections.projectedWithoutPosition).toBe(0);
  });

  it("refuses sources with no private-research right, so nothing is written", () => {
    for (const sourceId of ["balldontlie", "synthetic", "api-sports-nba"]) {
      const root = project({ sourceId });
      expect(() => runV1PrivatePreview({ root, generatedAtUtc: FIXTURE_BUILD_AT })).toThrow(/private-research|synthetic/);
      expect(existsSync(path.join(root, "data", "nba", "props-v1", "private-preview-board.json"))).toBe(false);
    }
  });

  it("refuses an input directory outside data/nba, including public/", () => {
    const root = project({ sourceId: "hoopr-espn" });
    expect(() => runV1PrivatePreview({ root, generatedAtUtc: FIXTURE_BUILD_AT, inputDir: "public/data" })).toThrow(/must be under/);
  });

  it("leaves the public path unchanged for the same data: with the records narrowed to private research the public run still withholds everything", async () => {
    const root = project({ sourceId: "hoopr-espn" });
    const result = await runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: BEFORE_STATEMENTS });
    expect(result.board.report.projections.accepted).toBe(0);
    expect(result.board.report.dvp.status).toBe("withheld");
    expect(readBoard(result.board.outFile).entries).toEqual([]);
    expect(readBoard(result.board.outFile).privatePreview).toBeUndefined();
  });
});

describe("V1 input safety", () => {
  it("refuses an input directory outside data/nba", async () => {
    const root = project();
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, inputDir: "public/data" })).rejects.toThrow(/must be under/);
  });

  it("refuses to publish under a name other than the board file", async () => {
    const root = project();
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED, outFile: "public/data/other.json" })).rejects.toThrow(/nba-props-board/);
  });

  it("requires the 2026-27 position file and an import, and fails loudly instead of building an empty board", async () => {
    const root = project();
    rmSync(path.join(root, "data", "nba", "props-v1", "positions-2026-27.json"));
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED })).rejects.toThrow(/2026-27 position estimates are required/);
    const bare = mkdtempSync(path.join(tmpdir(), "nba-v1-"));
    dirs.push(bare);
    mkdirSync(path.join(bare, "data", "nba", "props-v1"), { recursive: true });
    await expect(runV1Build({ root: bare, generatedAtUtc: FIXTURE_BUILD_AT })).rejects.toThrow(/no player-game import/);
  });

  it("fails on a bad output path before writing anything else", async () => {
    const root = project();
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED, outFile: "public/data/other.json" })).rejects.toThrow(/nba-props-board/);
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED, outFile: "src/board.json" })).rejects.toThrow(/must be under/);
    expect(existsSync(path.join(root, "data", "nba", "props-v1", "board-inputs"))).toBe(false);
  });

  it("rejects a position file whose season does not match its filename", async () => {
    const root = project();
    const dir = path.join(root, "data", "nba", "props-v1");
    writeFileSync(path.join(dir, "positions-2026-27.json"), JSON.stringify(fixturePositionsFile("2025-26")));
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED })).rejects.toThrow('positions-2026-27.json declares season "2025-26", not 2026-27');
  });

  it("refuses two competing imports instead of letting the JSON silently win", async () => {
    const root = project();
    const dir = path.join(root, "data", "nba", "props-v1");
    writeFileSync(path.join(dir, "player-games.csv"), "season\n");
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, sourceLicenses: LICENSED })).rejects.toThrow(/both .*player-games\.json and player-games\.csv exist/);
  });

  it("refuses an input directory that is a link out of the project", async (context) => {
    const root = project();
    const outside = mkdtempSync(path.join(tmpdir(), "nba-v1-outside-"));
    dirs.push(outside);
    try {
      symlinkSync(outside, path.join(root, "data", "nba", "escape"), "junction");
    } catch {
      context.skip();
    }
    await expect(runV1Build({ root, generatedAtUtc: FIXTURE_BUILD_AT, inputDir: "data/nba/escape" })).rejects.toThrow(/must be under/);
    expect(readdirSync(outside)).toEqual([]);
  });

  it("does not touch the network: the V1 modules import no provider adapter", () => {
    for (const file of ["run.ts", "slateBuild.ts", "playerGameImport.ts", "positionEstimates.ts"]) {
      const text = readFileSync(path.join(__dirname, file), "utf8");
      expect(text, file).not.toMatch(/theOddsApi|apiNba|statsNbaClient|\bfetch\s*\(|process\.env|api[_-]?key/i);
    }
  });
});
