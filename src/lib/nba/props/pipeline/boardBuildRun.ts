/**
 * File-level runner for the props-board build: reads local inputs, assembles, validates, writes the artifact.
 * Offline by construction: it imports no provider adapter and makes no network call.
 *
 * Inputs live under data/nba/ (gitignored, restricted research data). The only outputs are the public board
 * file under public/data/ or a private copy under data/nba/. The write is atomic, and the artifact is checked
 * before it is written, so a failed build never leaves a half-written or unsafe file.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

function inside(root: string, rel: string, allowed: readonly string[], what: string): string {
  const full = path.resolve(root, rel);
  if (!allowed.some((dir) => full === path.join(root, dir) || full.startsWith(`${path.join(root, dir)}${path.sep}`))) throw new Error(`${what} must be under ${allowed.join(" or ")} (got ${rel})`);
  return full;
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

export async function runBoardBuild(options: BoardRunOptions): Promise<BoardRunResult> {
  const { root } = options;
  const dataDir = path.join("data", "nba");
  const capturesDir = inside(root, options.capturesDir ?? path.join(dataDir, "odds-captures"), [dataDir], "the captures directory");
  const outFile = inside(root, options.outFile ?? DEFAULT_BOARD_OUT, [path.join("public", "data"), dataDir], "the output file");

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
  const tmp = `${outFile}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(artifact)}\n`);
  renameSync(tmp, outFile);
  return { outFile, report, conversion };
}
