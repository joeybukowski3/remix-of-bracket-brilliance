/**
 * File-level runner for the props-board build: reads local inputs, assembles, validates, writes the artifact.
 * Offline by construction: it imports no provider adapter and makes no network call.
 *
 * Inputs live under data/nba/ (gitignored, restricted research data). The only outputs are the public board
 * file under public/data/ or a private copy under data/nba/. The write is atomic, and the artifact is checked
 * before it is written, so a failed build never leaves a half-written or unsafe file.
 */
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BOARD_SCHEMA_VERSION } from "../propsBoard";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { assembleBoard, type BoardBuildReport, type DvpInput, type ProjectionRecord, type RosterRecord } from "./boardBuild";
import { normalizePlayerName, type NbaPregameSnapshot } from "./contracts";
import { readLineCaptures, snapshotsFromCapture } from "./lineCapture";
import { FilePipelineStore } from "./store";

const SOURCE_IDS = ["stats.nba.com", "espn", "hoopr-espn", "llimllib-nba-data", "thesportsdb", "sportsdataio", "balldontlie", "api-sports-nba", "synthetic"] as const;
const sourceId = z.enum(SOURCE_IDS);

const projectionFile = z.object({
  records: z.array(
    z.object({
      gameKey: z.string(),
      tipoffUtc: z.string(),
      playerName: z.string().min(1),
      team: z.string().nullable(),
      market: z.enum(["pts", "reb", "ast"]),
      value: z.number(),
      minutes: z.number().nullable(),
      modelVersion: z.string(),
      inputCutoffUtc: z.string(),
      inputSourceIds: z.array(sourceId),
    }),
  ),
});
const rosterFile = z.object({ players: z.record(z.string(), z.object({ team: z.string(), position: z.string().nullable() })) });
const dvpFile = z.object({
  sourceId,
  lines: z.array(
    z.object({
      season: z.enum(["2025-26", "2026-27"]),
      gameId: z.string(),
      opponentTeam: z.string(),
      playerId: z.string(),
      minutes: z.number(),
      pts: z.number(),
      reb: z.number(),
      ast: z.number(),
      positionLabel: z.string().nullable(),
      positionMinutes: z.record(z.string(), z.number()).optional(),
      sourceId: z.string(),
      sourceUpdatedAtUtc: z.string(),
    }),
  ),
});

export interface BoardRunOptions {
  root: string;
  generatedAtUtc: string;
  /** Directory of line-capture files. Default data/nba/odds-captures. */
  capturesDir?: string;
  /** Existing pipeline store (snapshots.jsonl). Optional. */
  storeDir?: string;
  projectionsFile?: string;
  rosterFile?: string;
  dvpFile?: string;
  outFile?: string;
  publishLines?: boolean;
  /** Rights records for stat sources; defaults to the repository registry. A test seam: production never overrides it. */
  sourceLicenses?: Readonly<Record<NbaSourceId, SourceLicense>>;
}

export interface BoardRunResult {
  outFile: string;
  report: BoardBuildReport;
  conversion: { captures: number; snapshots: number; rejected: Array<{ player: string; bookmaker: string; market: string; reason: string }> };
}

export const DEFAULT_BOARD_OUT = path.join("public", "data", "nba-props-board.json");
/** Public board files only; any other file under public/data belongs to something else and is never overwritten. */
const PUBLIC_BOARD_NAME = /^nba-props-board[A-Za-z0-9._-]*\.json$/;

const fold = (p: string): string => (process.platform === "win32" ? p.toLowerCase() : p);
const within = (dir: string, full: string): boolean => fold(full) === fold(dir) || fold(full).startsWith(fold(`${dir}${path.sep}`));

/** Real location of a path that may not exist yet: the deepest existing ancestor is resolved through links, the rest is appended. */
function realLocation(full: string): string {
  const missing: string[] = [];
  let probe = full;
  while (!existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    missing.unshift(path.basename(probe));
    probe = parent;
  }
  return path.join(realpathSync.native(probe), ...missing);
}

/** A path under one of the allowed project directories, both as written and after links are resolved (a link out of the project is refused). */
function inside(root: string, rel: string, allowed: readonly string[], what: string): string {
  const full = path.resolve(root, rel);
  const realRoot = realpathSync.native(root);
  const ok = allowed.some((dir) => within(path.join(root, dir), full) && within(path.join(realRoot, dir), realLocation(full)));
  if (!ok) throw new Error(`${what} must be under ${allowed.join(" or ")} (got ${rel})`);
  return full;
}

/** Create-new write under a unique temporary name, then rename over the target; nothing is ever written through an existing path. */
function writeAtomically(file: string, text: string): void {
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  const fd = openSync(tmp, "wx", 0o644);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw error;
  }
  closeSync(fd);
  try {
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

export async function runBoardBuild(options: BoardRunOptions): Promise<BoardRunResult> {
  const { root } = options;
  const dataDir = path.join("data", "nba");
  const capturesDir = inside(root, options.capturesDir ?? path.join(dataDir, "odds-captures"), [dataDir], "the captures directory");
  const outFile = inside(root, options.outFile ?? DEFAULT_BOARD_OUT, [path.join("public", "data"), dataDir], "the output file");
  if (within(path.join(root, "public", "data"), outFile) && !PUBLIC_BOARD_NAME.test(path.basename(outFile))) throw new Error(`the output file must be named nba-props-board*.json under public/data (got ${path.basename(outFile)})`);

  const roster: Record<string, RosterRecord> = {};
  if (options.rosterFile) {
    const parsed = rosterFile.parse(readJson(inside(root, options.rosterFile, [dataDir], "the roster file")));
    for (const [name, record] of Object.entries(parsed.players)) roster[normalizePlayerName(name)] = record as RosterRecord; // zod-validated above; the app tsconfig is non-strict, which widens inferred fields to optional
  }
  const projections: ProjectionRecord[] = options.projectionsFile ? projectionFile.parse(readJson(inside(root, options.projectionsFile, [dataDir], "the projections file"))).records as ProjectionRecord[] : [];
  let dvp: DvpInput | null = null;
  if (options.dvpFile) dvp = dvpFile.parse(readJson(inside(root, options.dvpFile, [dataDir], "the DvP input file"))) as DvpInput;

  const captures = readLineCaptures(capturesDir);
  const conversion: BoardRunResult["conversion"] = { captures: captures.length, snapshots: 0, rejected: [] };
  const snapshots: NbaPregameSnapshot[] = [];
  for (const capture of captures) {
    const converted = snapshotsFromCapture(capture, { teamOf: (name) => roster[normalizePlayerName(name)]?.team ?? null });
    snapshots.push(...converted.snapshots);
    conversion.rejected.push(...converted.rejected);
  }
  if (options.storeDir) {
    const storeDir = inside(root, options.storeDir, [dataDir], "the pipeline store");
    if (existsSync(path.join(storeDir, "snapshots.jsonl"))) snapshots.push(...(await (await FilePipelineStore.open(storeDir)).listSnapshots()));
  }
  conversion.snapshots = snapshots.length;

  const { artifact, report } = assembleBoard({ generatedAtUtc: options.generatedAtUtc, snapshots, projections, roster, dvp, publishLines: options.publishLines ?? false, sourceLicenses: options.sourceLicenses });

  // Last line of defense before anything touches disk.
  if (artifact.schemaVersion !== BOARD_SCHEMA_VERSION || artifact.isSynthetic) throw new Error("refusing to write a synthetic or malformed board");
  if (!(options.publishLines ?? false) && artifact.entries.some((e) => e.line !== null)) throw new Error("refusing to write sportsbook lines without --publish-lines");

  mkdirSync(path.dirname(outFile), { recursive: true });
  // The directory was checked before it existed; check again now that it does, so a link made in between is caught.
  inside(root, path.relative(root, outFile), [path.join("public", "data"), dataDir], "the output file");
  writeAtomically(outFile, `${JSON.stringify(artifact)}\n`);
  return { outFile, report, conversion };
}
