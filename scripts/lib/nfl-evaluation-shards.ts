/**
 * Week-sharded storage for the WU3 derived evaluation datasets.
 *
 * Why this exists: the evaluation materializer used to write one monolithic
 * `<dataset>/<season>.jsonl` per prediction type. `receiving/2026.jsonl` grew
 * ~7.6 MB per week and crossed GitHub's 100 MB hard file limit in Week 9, after
 * which every `git push` of the NFL schedules/results workflow was rejected by
 * the pre-receive hook -- taking `games.json` / `results.json` down with it
 * (issue 454). Sharding by week keeps every file an order of magnitude below
 * the limit for the life of the season.
 *
 * Layout: `<versionRoot>/<dataset>/<season>/<WW>.jsonl` (WW = zero-padded week).
 * The datasets are derived and deterministic, so the materializer owns the
 * namespace: each write mirrors the current inputs (stale shards and the
 * superseded legacy `<season>.jsonl` are removed). Readers prefer shards and
 * fall back to the legacy monolith, so a checkout that has not been migrated
 * yet still reads correctly.
 *
 * Rows are partitioned by their top-level integer `week` and each shard keeps
 * the serializer's own deterministic row order, so a shard is an exact
 * subsequence of the legacy file it replaces.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** GitHub rejects any pushed blob over this size (pre-receive hook, GH001). */
export const GITHUB_FILE_LIMIT_BYTES = 100 * 1024 * 1024;
/** Hard cap this module enforces per shard; leaves headroom under the GitHub limit. */
export const MAX_SHARD_BYTES = 90 * 1024 * 1024;

const SHARD_FILE = /^(\d{2})\.jsonl$/;

export function legacyEvaluationPath(versionRoot: string, dataset: string, season: number): string {
  return join(versionRoot, dataset, `${season}.jsonl`);
}

function shardDir(versionRoot: string, dataset: string, season: number): string {
  return join(versionRoot, dataset, String(season));
}

export function evaluationShardPath(versionRoot: string, dataset: string, season: number, week: number): string {
  return join(shardDir(versionRoot, dataset, season), `${String(week).padStart(2, "0")}.jsonl`);
}

function listShardFiles(versionRoot: string, dataset: string, season: number): string[] {
  const dir = shardDir(versionRoot, dataset, season);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => SHARD_FILE.test(name))
    .sort()
    .map((name) => join(dir, name));
}

/** Shard files in week order; the legacy monolith only when no shard exists. */
export function listEvaluationFiles(versionRoot: string, dataset: string, season: number): string[] {
  const shards = listShardFiles(versionRoot, dataset, season);
  if (shards.length > 0) return shards;
  const legacy = legacyEvaluationPath(versionRoot, dataset, season);
  return existsSync(legacy) ? [legacy] : [];
}

export function hasEvaluationData(versionRoot: string, dataset: string, season: number): boolean {
  return listEvaluationFiles(versionRoot, dataset, season).length > 0;
}

export function latestEvaluationMtimeMs(versionRoot: string, dataset: string, season: number): number | null {
  const files = listEvaluationFiles(versionRoot, dataset, season);
  return files.length === 0 ? null : Math.max(...files.map((file) => statSync(file).mtimeMs));
}

export function readEvaluationRows<T>(versionRoot: string, dataset: string, season: number): T[] {
  const rows: T[] = [];
  for (const file of listEvaluationFiles(versionRoot, dataset, season)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (line) rows.push(JSON.parse(line) as T);
    }
  }
  return rows;
}

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export type MigrateResult = { rows: number; shards: string[] };

/**
 * One-time, lossless conversion of a legacy monolith into week shards.
 * Works on the RAW lines (never re-serialized), so each shard is a byte-exact
 * subsequence of the legacy file. The monolith is deleted only after the
 * shards are re-read and their line multiset is proven equal to the original.
 * Returns null when there is no legacy file; throws (changing nothing) if
 * shards already exist, a row has no usable week, or a shard would exceed the cap.
 */
export function migrateLegacyToShards(
  versionRoot: string,
  dataset: string,
  season: number,
  { maxShardBytes = MAX_SHARD_BYTES }: WriteShardsOptions = {},
): MigrateResult | null {
  const legacy = legacyEvaluationPath(versionRoot, dataset, season);
  if (!existsSync(legacy)) return null;
  if (listShardFiles(versionRoot, dataset, season).length > 0) {
    throw new Error(`${dataset}/${season}: shards already exist next to the legacy file; refusing to migrate over them`);
  }

  const lines = readFileSync(legacy, "utf8").split(/\r?\n/).filter(Boolean);
  const byWeek = new Map<number, string[]>();
  for (const line of lines) {
    const week = (JSON.parse(line) as { week?: unknown }).week;
    if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > 99) {
      throw new Error(`${dataset}/${season}: a legacy row has no usable week (${String(week)}); migration aborted, legacy file kept`);
    }
    const bucket = byWeek.get(week);
    if (bucket) bucket.push(line);
    else byWeek.set(week, [line]);
  }

  const planned = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, weekLines]) => ({ week, path: evaluationShardPath(versionRoot, dataset, season, week), text: `${weekLines.join("\n")}\n` }));
  for (const shard of planned) {
    const bytes = Buffer.byteLength(shard.text, "utf8");
    if (bytes > maxShardBytes) {
      throw new Error(`${dataset}/${season} week ${shard.week} shard is ${bytes} bytes, which exceeds the ${maxShardBytes}-byte cap`);
    }
  }
  const written: string[] = [];
  try {
    for (const shard of planned) {
      atomicWrite(shard.path, shard.text);
      written.push(shard.path);
    }
  } catch (error) {
    // A partial set of shards would make readers silently ignore the legacy file; roll back.
    for (const path of written) if (existsSync(path)) unlinkSync(path);
    throw error;
  }

  const migrated = planned.flatMap((shard) => readFileSync(shard.path, "utf8").split(/\r?\n/).filter(Boolean));
  const sortedOriginal = [...lines].sort();
  const sortedMigrated = [...migrated].sort();
  const same = sortedMigrated.length === sortedOriginal.length && sortedMigrated.every((line, i) => line === sortedOriginal[i]);
  if (!same) {
    for (const shard of planned) unlinkSync(shard.path);
    throw new Error(`${dataset}/${season}: shard verification failed (row multiset differs); shards discarded, legacy file kept`);
  }
  unlinkSync(legacy);
  return { rows: lines.length, shards: planned.map((shard) => shard.path) };
}

export type WriteShardsOptions = { maxShardBytes?: number };
export type WriteShardsResult = { written: string[]; removed: string[] };

/**
 * Replaces the dataset for `season` with per-week shards built from `rows`.
 * Every shard is serialized and size-checked BEFORE anything is written, so a
 * refusal leaves the existing data untouched.
 */
export function writeEvaluationShards<T extends { week: number }>(
  versionRoot: string,
  dataset: string,
  season: number,
  rows: readonly T[],
  serialize: (rows: readonly T[]) => string,
  { maxShardBytes = MAX_SHARD_BYTES }: WriteShardsOptions = {},
): WriteShardsResult {
  const byWeek = new Map<number, T[]>();
  for (const row of rows) {
    if (!Number.isInteger(row.week) || row.week < 1 || row.week > 99) {
      throw new Error(`${dataset}/${season}: row has a non-integer or out-of-range week (${String(row.week)}); cannot choose a shard`);
    }
    const bucket = byWeek.get(row.week) ?? [];
    bucket.push(row);
    byWeek.set(row.week, bucket);
  }

  const planned = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, weekRows]) => ({ week, path: evaluationShardPath(versionRoot, dataset, season, week), text: serialize(weekRows) }));
  for (const shard of planned) {
    const bytes = Buffer.byteLength(shard.text, "utf8");
    if (bytes > maxShardBytes) {
      throw new Error(`${dataset}/${season} week ${shard.week} shard is ${bytes} bytes, which exceeds the ${maxShardBytes}-byte cap (GitHub rejects files over ${GITHUB_FILE_LIMIT_BYTES} bytes)`);
    }
  }

  const written: string[] = [];
  for (const shard of planned) {
    atomicWrite(shard.path, shard.text);
    written.push(shard.path);
  }

  const keep = new Set(written);
  const removed: string[] = [];
  for (const stale of listShardFiles(versionRoot, dataset, season)) {
    if (!keep.has(stale)) {
      unlinkSync(stale);
      removed.push(stale);
    }
  }
  const legacy = legacyEvaluationPath(versionRoot, dataset, season);
  if (existsSync(legacy)) {
    unlinkSync(legacy);
    removed.push(legacy);
  }
  return { written, removed };
}
