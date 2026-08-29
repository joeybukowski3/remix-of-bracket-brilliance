import path from "node:path";
import { safeParseBettingSplitSnapshot } from "./bettingSplitsSchema";
import type { BettingLeague, BettingSplitSnapshot } from "./bettingSplitsTypes";
import type {
  BettingProviderGameCrosswalkKey,
  BettingProviderGameCrosswalkRecord,
  BettingSplitPersistenceAdapter,
  BettingSplitSeriesKey,
  StoredBettingSplitSnapshot,
} from "./bettingSplitsPersistence";
import {
  BettingSplitFileStoreError,
  listJsonlFiles,
  listSubdirectories,
  readFileOrNull,
  splitJsonlLines,
  toGameFileToken,
  writeFileAtomic,
} from "./bettingSplitsFsUtils";

/**
 * WU5 file-backed implementation of the WU4 {@link BettingSplitPersistenceAdapter}.
 *
 * Layout under {@link BettingSplitFileStoreOptions.rootDir}:
 *
 * ```
 * <root>/
 *   provider-game-crosswalks.json          one deterministic JSON document
 *   history/
 *     <league>/<season>/<gameToken>.jsonl  one line per BettingSplitSnapshot state period
 * ```
 *
 * WU4 dedup semantics are enforced by {@link storeBettingSplitSnapshot}; this
 * adapter only appends rows, extends the latest row in place, and never blindly
 * overwrites a conflicting crosswalk.
 */

export const BETTING_SPLIT_CROSSWALK_DOCUMENT_VERSION =
  "jkb-betting-splits-crosswalks-v1" as const;

export type BettingSplitFileStoreOptions = {
  /** Absolute or cwd-relative directory that owns the private source files. */
  rootDir: string;
};

export type BettingSplitGameHistoryQuery = {
  league: BettingLeague;
  season: number;
  jkbGameId: string;
};

export type BettingSplitSlateQuery = {
  league: BettingLeague;
  season: number;
  week: number;
};

/**
 * Superset of the WU4 adapter with the read-only fan-out queries the WU5 read
 * layer and public publisher need. The WU4 store never calls these.
 */
export interface BettingSplitFileStore extends BettingSplitPersistenceAdapter {
  listSnapshotsForGame(
    query: BettingSplitGameHistoryQuery,
  ): Promise<StoredBettingSplitSnapshot[]>;
  listSnapshotsForSlate(
    query: BettingSplitSlateQuery,
  ): Promise<StoredBettingSplitSnapshot[]>;
  listAllSnapshots(): Promise<StoredBettingSplitSnapshot[]>;
  listAllCrosswalks(): Promise<BettingProviderGameCrosswalkRecord[]>;
}

type CrosswalkDocument = {
  schemaVersion: typeof BETTING_SPLIT_CROSSWALK_DOCUMENT_VERSION;
  crosswalks: BettingProviderGameCrosswalkRecord[];
};

const STORED_ROW_KEY_ORDER: readonly (keyof StoredBettingSplitSnapshot)[] = [
  "schemaVersion",
  "league",
  "season",
  "week",
  "jkbGameId",
  "awayTeamId",
  "homeTeamId",
  "kickoffUtc",
  "provider",
  "providerGameId",
  "sportsbook",
  "capturedAt",
  "providerCreatedAt",
  "providerLastSeenAt",
  "spread",
  "total",
  "moneyline",
  "contentHash",
  "firstObservedAt",
  "lastObservedAt",
  "id",
];

const CROSSWALK_KEY_ORDER: readonly (keyof BettingProviderGameCrosswalkRecord)[] = [
  "league",
  "provider",
  "providerGameId",
  "jkbGameId",
  "providerHomeTeamId",
  "providerAwayTeamId",
  "canonicalHomeTeamId",
  "canonicalAwayTeamId",
  "firstVerifiedAt",
  "lastVerifiedAt",
  "id",
];

function orderKeys<T extends Record<string, unknown>>(
  value: T,
  order: readonly (keyof T)[],
): T {
  return order.reduce<Record<string, unknown>>((accumulator, key) => {
    accumulator[key as string] = value[key];
    return accumulator;
  }, {}) as T;
}

function serializeStoredRow(row: StoredBettingSplitSnapshot): string {
  return JSON.stringify(orderKeys(row, STORED_ROW_KEY_ORDER));
}

function parseStoredRow(
  line: string,
  context: { file: string; lineNumber: number },
): StoredBettingSplitSnapshot {
  const location = `${context.file}:${context.lineNumber}`;

  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new BettingSplitFileStoreError(
      `Malformed JSON in betting-splits history line ${location}.`,
    );
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BettingSplitFileStoreError(
      `Betting-splits history line ${location} is not a JSON object.`,
    );
  }

  const { id, ...snapshotCandidate } = raw as Record<string, unknown>;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new BettingSplitFileStoreError(
      `Betting-splits history line ${location} is missing a non-empty "id".`,
    );
  }

  const parsed = safeParseBettingSplitSnapshot(snapshotCandidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "snapshot"}: ${issue.message}`)
      .join("; ");
    throw new BettingSplitFileStoreError(
      `Betting-splits history line ${location} failed schema validation: ${issues}.`,
    );
  }

  if (parsed.data.contentHash === null) {
    throw new BettingSplitFileStoreError(
      `Betting-splits history line ${location} has a null contentHash; stored rows must be hashed.`,
    );
  }

  return { ...parsed.data, id, contentHash: parsed.data.contentHash };
}

function seriesMatches(
  row: StoredBettingSplitSnapshot,
  key: BettingSplitSeriesKey,
): boolean {
  return (
    row.league === key.league &&
    row.jkbGameId === key.jkbGameId &&
    row.provider === key.provider &&
    row.sportsbook === key.sportsbook
  );
}

export function createBettingSplitFileStore(
  options: BettingSplitFileStoreOptions,
): BettingSplitFileStore {
  const rootDir = path.resolve(options.rootDir);
  const historyDir = path.join(rootDir, "history");
  const crosswalkFile = path.join(rootDir, "provider-game-crosswalks.json");

  /** id → absolute history file path, warmed by every read so `extend` is O(1). */
  const idFileCache = new Map<string, string>();

  function gameFilePath(
    league: BettingLeague,
    season: number,
    jkbGameId: string,
  ): string {
    return path.join(
      historyDir,
      league,
      String(season),
      `${toGameFileToken(jkbGameId)}.jsonl`,
    );
  }

  async function readGameRows(
    filePath: string,
  ): Promise<StoredBettingSplitSnapshot[]> {
    const blob = await readFileOrNull(filePath);
    if (blob === null) return [];
    const relative = path.relative(rootDir, filePath);
    const rows = splitJsonlLines(blob).map((line, index) =>
      parseStoredRow(line, { file: relative, lineNumber: index + 1 }),
    );
    for (const row of rows) idFileCache.set(row.id, filePath);
    return rows;
  }

  async function writeGameRows(
    filePath: string,
    rows: readonly StoredBettingSplitSnapshot[],
  ): Promise<void> {
    const body = `${rows.map(serializeStoredRow).join("\n")}\n`;
    await writeFileAtomic(filePath, body);
    for (const row of rows) idFileCache.set(row.id, filePath);
  }

  /** Find the season-partitioned history file for a game without knowing its season. */
  async function locateGameFile(
    league: BettingLeague,
    jkbGameId: string,
  ): Promise<string | null> {
    const token = `${toGameFileToken(jkbGameId)}.jsonl`;
    const leagueDir = path.join(historyDir, league);
    for (const season of await listSubdirectories(leagueDir)) {
      const candidate = path.join(leagueDir, season, token);
      if ((await readFileOrNull(candidate)) !== null) return candidate;
    }
    return null;
  }

  async function forEachGameFile(
    visit: (filePath: string) => Promise<void>,
  ): Promise<void> {
    for (const league of await listSubdirectories(historyDir)) {
      const leagueDir = path.join(historyDir, league);
      for (const season of await listSubdirectories(leagueDir)) {
        const seasonDir = path.join(leagueDir, season);
        for (const name of await listJsonlFiles(seasonDir)) {
          await visit(path.join(seasonDir, name));
        }
      }
    }
  }

  async function scanForId(id: string): Promise<string | null> {
    let match: string | null = null;
    await forEachGameFile(async (filePath) => {
      if (match) return;
      const rows = await readGameRows(filePath);
      if (rows.some((row) => row.id === id)) match = filePath;
    });
    return match;
  }

  async function readCrosswalkDocument(): Promise<CrosswalkDocument> {
    const blob = await readFileOrNull(crosswalkFile);
    if (blob === null) {
      return {
        schemaVersion: BETTING_SPLIT_CROSSWALK_DOCUMENT_VERSION,
        crosswalks: [],
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(blob);
    } catch {
      throw new BettingSplitFileStoreError(
        `Malformed JSON in ${path.relative(rootDir, crosswalkFile)}.`,
      );
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { crosswalks?: unknown }).crosswalks)
    ) {
      throw new BettingSplitFileStoreError(
        `${path.relative(rootDir, crosswalkFile)} is not a crosswalk document.`,
      );
    }

    return {
      schemaVersion: BETTING_SPLIT_CROSSWALK_DOCUMENT_VERSION,
      crosswalks: (parsed as CrosswalkDocument).crosswalks.map((record) => ({
        ...record,
      })),
    };
  }

  function compareCrosswalks(
    left: BettingProviderGameCrosswalkRecord,
    right: BettingProviderGameCrosswalkRecord,
  ): number {
    return (
      left.league.localeCompare(right.league) ||
      left.provider.localeCompare(right.provider) ||
      left.providerGameId.localeCompare(right.providerGameId)
    );
  }

  async function writeCrosswalkDocument(
    document: CrosswalkDocument,
  ): Promise<void> {
    const ordered: CrosswalkDocument = {
      schemaVersion: BETTING_SPLIT_CROSSWALK_DOCUMENT_VERSION,
      crosswalks: [...document.crosswalks]
        .sort(compareCrosswalks)
        .map((record) => orderKeys(record, CROSSWALK_KEY_ORDER)),
    };
    await writeFileAtomic(crosswalkFile, `${JSON.stringify(ordered, null, 2)}\n`);
  }

  function crosswalkKeyMatches(
    record: BettingProviderGameCrosswalkRecord,
    key: BettingProviderGameCrosswalkKey,
  ): boolean {
    return (
      record.league === key.league &&
      record.provider === key.provider &&
      record.providerGameId === key.providerGameId
    );
  }

  return {
    async findLatestSnapshot(key) {
      const filePath = await locateGameFile(key.league, key.jkbGameId);
      if (filePath === null) return null;
      const rows = await readGameRows(filePath);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (seriesMatches(rows[index], key)) return rows[index];
      }
      return null;
    },

    async insertSnapshot(record) {
      const filePath = gameFilePath(
        record.league,
        record.season,
        record.jkbGameId,
      );
      const rows = await readGameRows(filePath);
      await writeGameRows(filePath, [...rows, record]);
    },

    async extendSnapshotObservation(id, observation) {
      const filePath = idFileCache.get(id) ?? (await scanForId(id));
      if (filePath === null || filePath === undefined) {
        throw new BettingSplitFileStoreError(`Unknown snapshot id: ${id}`);
      }
      const rows = await readGameRows(filePath);
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) {
        throw new BettingSplitFileStoreError(`Unknown snapshot id: ${id}`);
      }
      const next = [...rows];
      next[index] = {
        ...rows[index],
        lastObservedAt: observation.lastObservedAt,
        providerLastSeenAt: observation.providerLastSeenAt,
      };
      await writeGameRows(filePath, next);
    },

    async findCrosswalk(key) {
      const document = await readCrosswalkDocument();
      return (
        document.crosswalks.find((record) => crosswalkKeyMatches(record, key)) ??
        null
      );
    },

    async insertCrosswalk(record) {
      const document = await readCrosswalkDocument();
      const existing = document.crosswalks.find((candidate) =>
        crosswalkKeyMatches(candidate, record),
      );
      if (existing) {
        if (existing.jkbGameId === record.jkbGameId) return;
        throw new BettingSplitFileStoreError(
          `Refusing to overwrite crosswalk ${record.league}/${record.provider}/${record.providerGameId}: ` +
            `already mapped to ${existing.jkbGameId}, not ${record.jkbGameId}.`,
        );
      }
      await writeCrosswalkDocument({
        schemaVersion: BETTING_SPLIT_CROSSWALK_DOCUMENT_VERSION,
        crosswalks: [...document.crosswalks, record],
      });
    },

    async updateCrosswalkVerification(id, verification) {
      const document = await readCrosswalkDocument();
      const index = document.crosswalks.findIndex((record) => record.id === id);
      if (index === -1) {
        throw new BettingSplitFileStoreError(`Unknown crosswalk id: ${id}`);
      }
      const next = [...document.crosswalks];
      next[index] = { ...document.crosswalks[index], ...verification };
      await writeCrosswalkDocument({
        schemaVersion: BETTING_SPLIT_CROSSWALK_DOCUMENT_VERSION,
        crosswalks: next,
      });
    },

    async listSnapshotsForGame(query) {
      const rows = await readGameRows(
        gameFilePath(query.league, query.season, query.jkbGameId),
      );
      return rows.filter(
        (row) => row.league === query.league && row.season === query.season,
      );
    },

    async listSnapshotsForSlate(query) {
      const rows: StoredBettingSplitSnapshot[] = [];
      const seasonDir = path.join(historyDir, query.league, String(query.season));
      for (const name of await listJsonlFiles(seasonDir)) {
        const fileRows = await readGameRows(path.join(seasonDir, name));
        for (const row of fileRows) {
          if (row.week === query.week) rows.push(row);
        }
      }
      return rows;
    },

    async listAllSnapshots() {
      const rows: StoredBettingSplitSnapshot[] = [];
      await forEachGameFile(async (filePath) => {
        rows.push(...(await readGameRows(filePath)));
      });
      return rows;
    },

    async listAllCrosswalks() {
      return (await readCrosswalkDocument()).crosswalks;
    },
  };
}
