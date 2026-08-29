import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

/**
 * Filesystem helpers shared by the WU5 file-backed betting-splits store and the
 * public artifact publisher.
 *
 * The store is otherwise pure orchestration; every disk touch flows through here
 * so the atomic-write and directory-creation strategy lives in exactly one place.
 */

/** Error thrown for any corrupt / unreadable file-store input. Always fails closed. */
export class BettingSplitFileStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BettingSplitFileStoreError";
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Same-directory write-temp → fsync → rename. The rename is atomic on POSIX and
 * near-atomic on Windows (ReplaceFile semantics), which is enough to keep a
 * concurrent reader from ever seeing a half-written file.
 */
export async function writeFileAtomic(
  filePath: string,
  contents: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${process.hrtime.bigint().toString()}.tmp`,
  );
  try {
    const handle = await open(tmpPath, "w");
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, filePath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {
      /* best-effort cleanup; original error is authoritative */
    });
    throw error;
  }
}

/** Read a file, returning `null` when it does not exist (any other error rethrows). */
export async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

/** List immediate subdirectory names of `dir`; `[]` when `dir` is absent. */
export async function listSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

/** List immediate `*.jsonl` file names of `dir`; `[]` when `dir` is absent. */
export async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Deterministic, filesystem-safe token for a canonical game id. NFL ids are
 * already safe (`2026_01_NE_SEA`); this only guards exotic CFB / provider ids.
 */
export function toGameFileToken(jkbGameId: string): string {
  const cleaned = jkbGameId.replace(/[^A-Za-z0-9_-]/g, "_");
  if (cleaned.length === 0) {
    throw new BettingSplitFileStoreError(
      `Cannot route a betting-splits history file for jkbGameId ${JSON.stringify(jkbGameId)}.`,
    );
  }
  return cleaned;
}

/** Split a JSONL blob into non-empty trimmed lines, preserving order. */
export function splitJsonlLines(blob: string): string[] {
  return blob
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
