/**
 * File-level runner for the props board V1: reads the local import, position estimates and slate, writes the three
 * board inputs, then calls the existing board builder. Offline by construction: no provider adapter, no network, no
 * credential, no Odds API request, no quota. Inputs and intermediate files live under the gitignored data/nba/.
 *
 * Expected files in the input directory (default data/nba/props-v1):
 *   player-games.json                      the import (see playerGameImport.ts), or
 *   player-games.csv + player-games.source.json   an owner CSV export and its source record
 *   positions-2026-27.json                 required: 2026-27 estimates      positions-2025-26.json  optional
 *   slate.json                             the games to project
 *
 * The board is written to a private copy by default; pass `outFile` under public/data to publish. Whatever the
 * source's effective rights do not permit is withheld by the existing builder and counted in the report.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { inside, resolveBoardOutFile, runBoardBuild, writeAtomically, type BoardRunResult } from "../pipeline/boardBuildRun";
import { readLineCaptures } from "../pipeline/lineCapture";
import { SOURCE_LICENSES } from "../sources/licenses";
import { effectivePermittedUses } from "../sources/registry";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { parsePlayerGameImport, playerGamesFromCsv, type PlayerGameImport } from "./playerGameImport";
import { buildEstimateSet } from "./positionEstimates";
import { buildPrivatePreviewBoard, type PrivatePreviewReport } from "./privatePreview";
import { buildV1Inputs, parseSlate, type V1Report } from "./slateBuild";

export const DEFAULT_V1_DIR = path.join("data", "nba", "props-v1");
const DATA_DIR = path.join("data", "nba");

const csvSource = z.object({ sourceId: z.string(), retrievedAtUtc: z.string(), provenance: z.string() });

export interface V1RunOptions {
  root: string;
  generatedAtUtc: string;
  inputDir?: string;
  outFile?: string;
  /** Rights records; a test seam. Production never overrides it. */
  sourceLicenses?: Readonly<Record<NbaSourceId, SourceLicense>>;
}

export interface V1RunResult {
  board: BoardRunResult;
  v1: V1Report;
  files: { projections: string; roster: string; dvp: string | null; report: string };
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

function readImport(root: string, dir: string): PlayerGameImport {
  const json = inside(root, path.join(dir, "player-games.json"), [DATA_DIR], "the player-game import");
  const csv = inside(root, path.join(dir, "player-games.csv"), [DATA_DIR], "the player-game CSV");
  const sidecar = inside(root, path.join(dir, "player-games.source.json"), [DATA_DIR], "the CSV source record");
  // Two possible imports would let one silently win; the owner must pick one.
  if (existsSync(json) && existsSync(csv)) throw new Error(`both ${path.join(dir, "player-games.json")} and player-games.csv exist; remove one so it is clear which data is used`);
  if (existsSync(json)) return parsePlayerGameImport(readJson(json));
  if (!existsSync(csv) || !existsSync(sidecar)) throw new Error(`no player-game import: expected ${path.join(dir, "player-games.json")}, or player-games.csv with player-games.source.json`);
  const source = csvSource.parse(readJson(sidecar));
  return playerGamesFromCsv(readFileSync(csv, "utf8"), { ...source, sourceId: source.sourceId as NbaSourceId });
}

function readPositions(root: string, dir: string): unknown[] {
  const files: unknown[] = [];
  for (const season of ["2025-26", "2026-27"]) {
    const name = `positions-${season}.json`;
    const file = inside(root, path.join(dir, name), [DATA_DIR], `the ${name} file`);
    if (!existsSync(file)) {
      if (season === "2026-27") throw new Error(`missing ${path.join(dir, name)}: the 2026-27 position estimates are required`);
      continue;
    }
    const raw = readJson(file);
    // A file named for one season must hold that season: a mislabelled file would apply its positions to the wrong games.
    if ((raw as { season?: unknown } | null)?.season !== season) throw new Error(`${name} declares season "${String((raw as { season?: unknown } | null)?.season)}", not ${season}`);
    files.push(raw);
  }
  return files;
}

interface Prepared {
  dir: string;
  built: ReturnType<typeof buildV1Inputs>;
  files: V1RunResult["files"];
}

/** Reads the local inputs, builds the V1 inputs and writes them (and the build report) under data/nba. */
function prepare(options: V1RunOptions, includeRoster: boolean): Prepared {
  const { root } = options;
  const dir = options.inputDir ?? DEFAULT_V1_DIR;
  inside(root, dir, [DATA_DIR], "the V1 input directory");
  const imported = readImport(root, dir);
  const positions = buildEstimateSet(readPositions(root, dir));
  const slate = parseSlate(readJson(inside(root, path.join(dir, "slate.json"), [DATA_DIR], "the slate file")));
  const built = buildV1Inputs({ generatedAtUtc: options.generatedAtUtc, imported, positions, slate });

  const outDir = path.join(dir, "board-inputs");
  mkdirSync(inside(root, outDir, [DATA_DIR], "the board-inputs directory"), { recursive: true });
  inside(root, outDir, [DATA_DIR], "the board-inputs directory");
  const write = (name: string, body: unknown): string => {
    const file = inside(root, path.join(outDir, name), [DATA_DIR], name);
    writeAtomically(file, `${JSON.stringify(body)}\n`);
    return path.join(outDir, name);
  };
  const files = {
    projections: write("projections.json", { records: built.projections }),
    // The public builder copies a roster's team and position onto entries without checking rights, so a roster built from a
    // source that may not be published is written empty for the public path.
    roster: write("roster.json", { players: includeRoster ? built.roster : {} }),
    dvp: built.dvp ? write("dvp.json", built.dvp) : null,
    report: write("v1-report.json", built.report),
  };
  return { dir, built, files };
}

export async function runV1Build(options: V1RunOptions): Promise<V1RunResult> {
  const { root } = options;
  const outFile = options.outFile ?? path.join(options.inputDir ?? DEFAULT_V1_DIR, "nba-props-board.json");
  resolveBoardOutFile(root, outFile); // fail on a bad output path before anything is read or written
  const licenses = options.sourceLicenses ?? SOURCE_LICENSES;
  const sourceId = readImport(root, options.inputDir ?? DEFAULT_V1_DIR).sourceId;
  const publishable = effectivePermittedUses(sourceId, licenses).permittedUses.includes("public-display");
  const { built, files } = prepare(options, publishable);
  const board = await runBoardBuild({
    root,
    generatedAtUtc: options.generatedAtUtc,
    projectionsFile: files.projections,
    rosterFile: files.roster,
    dvpFile: files.dvp ?? undefined,
    outFile,
    publishLines: false,
    sourceLicenses: options.sourceLicenses,
  });
  return { board, v1: built.report, files };
}

export const PRIVATE_PREVIEW_FILE = "private-preview-board.json";
/** Where approved odds requests leave their write-once captures (pipeline/lineCapture.ts). */
export const DEFAULT_CAPTURES_DIR = path.join(DATA_DIR, "odds-captures");

export interface V1PrivatePreviewResult {
  /** Project-relative path of the private board, always under data/nba. */
  outFile: string;
  preview: PrivatePreviewReport;
  v1: V1Report;
  files: V1RunResult["files"];
}

/**
 * Builds the private preview board (v1/privatePreview.ts) from the same local inputs. The public board builder is not
 * called and its gates are untouched. The file is written only under data/nba (a path anywhere else, including
 * public/, is refused), and only if every source behind it has a private-research right and no public one.
 *
 * Sportsbook lines come only from the local capture ledger (`capturesDir`, default data/nba/odds-captures): reading it makes
 * no request and spends no credit, and an altered capture fails the build instead of being skipped. With no ledger the
 * board has no lines, as before.
 */
export function runV1PrivatePreview(options: Omit<V1RunOptions, "outFile" | "sourceLicenses"> & { licenses?: Readonly<Record<NbaSourceId, SourceLicense>>; capturesDir?: string }): V1PrivatePreviewResult {
  const { root } = options;
  const dir = options.inputDir ?? DEFAULT_V1_DIR;
  const target = path.join(dir, PRIVATE_PREVIEW_FILE);
  inside(root, target, [DATA_DIR], "the private preview file");
  const captures = readLineCaptures(inside(root, options.capturesDir ?? DEFAULT_CAPTURES_DIR, [DATA_DIR], "the captures directory"));
  const { built, files } = prepare(options, true);
  const { artifact, report } = buildPrivatePreviewBoard({ generatedAtUtc: options.generatedAtUtc, projections: built.projections, roster: built.roster, dvp: built.dvp, seasonStats: built.seasonStats, opponentRecent: built.opponentRecent, opponentBoxScores: built.opponentBoxScores, captures, licenses: options.licenses });
  // Last line of defense: a private board is never written anywhere that is deployed, and a line on it must be credited to its provider.
  if (artifact.privatePreview === undefined) throw new Error("refusing to write a private preview without its notice");
  if (artifact.entries.some((e) => e.line !== null) && artifact.sources.lines.length === 0) throw new Error("refusing to write sportsbook lines that are not credited to a provider");
  writeAtomically(inside(root, target, [DATA_DIR], "the private preview file"), `${JSON.stringify(artifact)}\n`);
  return { outFile: target, preview: report, v1: built.report, files };
}
