import path from "node:path";
import {
  BettingSplitFileStoreError,
  listJsonlFiles,
  listSubdirectories,
  readFileOrNull,
  splitJsonlLines,
  toGameFileToken,
  writeFileAtomic,
} from "../bettingSplitsFsUtils";
import { safeParseBettingLineSnapshot } from "./bettingLineSchema";
import type { BettingLineLeague, StoredBettingLineSnapshot } from "./bettingLineTypes";
import type { BettingLinePersistenceAdapter } from "./bettingLineStore";

/**
 * WU8 file-backed persistence for betting lines. Sibling of the betting-splits
 * file store; it reuses only the generic FS helpers from
 * {@link ../bettingSplitsFsUtils}.
 *
 * Layout under `rootDir`:
 *
 * ```
 * <root>/history/<league>/<season>/<gameToken>.jsonl   one line per book state observation
 * ```
 */

export type BettingLineFileStoreOptions = { rootDir: string };

export type BettingLineGameHistoryQuery = {
  league: BettingLineLeague;
  season: number;
  jkbGameId: string;
};

export interface BettingLineFileStore extends BettingLinePersistenceAdapter {
  listSnapshotsForGame(
    query: BettingLineGameHistoryQuery,
  ): Promise<StoredBettingLineSnapshot[]>;
  listAllSnapshots(): Promise<StoredBettingLineSnapshot[]>;
}

const ROW_KEY_ORDER: readonly (keyof StoredBettingLineSnapshot)[] = [
  "schemaVersion",
  "league",
  "season",
  "week",
  "jkbGameId",
  "awayTeamId",
  "homeTeamId",
  "kickoffUtc",
  "provider",
  "providerEventId",
  "sportsbook",
  "capturedAt",
  "providerUpdatedAt",
  "spread",
  "total",
  "moneyline",
  "contentHash",
  "firstObservedAt",
  "lastObservedAt",
  "id",
];

function serializeRow(row: StoredBettingLineSnapshot): string {
  return JSON.stringify(
    ROW_KEY_ORDER.reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = row[key];
      return accumulator;
    }, {}),
  );
}

function parseRow(
  line: string,
  context: { file: string; lineNumber: number },
): StoredBettingLineSnapshot {
  const location = `${context.file}:${context.lineNumber}`;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new BettingSplitFileStoreError(
      `Malformed JSON in betting-lines history line ${location}.`,
    );
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BettingSplitFileStoreError(
      `Betting-lines history line ${location} is not a JSON object.`,
    );
  }
  const { id, ...candidate } = raw as Record<string, unknown>;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new BettingSplitFileStoreError(
      `Betting-lines history line ${location} is missing a non-empty "id".`,
    );
  }
  const parsed = safeParseBettingLineSnapshot(candidate);
  if (!parsed.success) {
    throw new BettingSplitFileStoreError(
      `Betting-lines history line ${location} failed schema validation: ` +
        parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "snapshot"}: ${issue.message}`)
          .join("; "),
    );
  }
  if (parsed.data.contentHash === null) {
    throw new BettingSplitFileStoreError(
      `Betting-lines history line ${location} has a null contentHash; stored rows must be hashed.`,
    );
  }
  return { ...parsed.data, id, contentHash: parsed.data.contentHash };
}

export function createBettingLineFileStore(
  options: BettingLineFileStoreOptions,
): BettingLineFileStore {
  const rootDir = path.resolve(options.rootDir);
  const historyDir = path.join(rootDir, "history");
  const idFileCache = new Map<string, string>();

  function gameFilePath(
    league: BettingLineLeague,
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

  async function readGameRows(filePath: string): Promise<StoredBettingLineSnapshot[]> {
    const blob = await readFileOrNull(filePath);
    if (blob === null) return [];
    const relative = path.relative(rootDir, filePath);
    const rows = splitJsonlLines(blob).map((line, index) =>
      parseRow(line, { file: relative, lineNumber: index + 1 }),
    );
    for (const row of rows) idFileCache.set(row.id, filePath);
    return rows;
  }

  async function writeGameRows(
    filePath: string,
    rows: readonly StoredBettingLineSnapshot[],
  ): Promise<void> {
    await writeFileAtomic(filePath, `${rows.map(serializeRow).join("\n")}\n`);
    for (const row of rows) idFileCache.set(row.id, filePath);
  }

  async function locateGameFile(
    league: BettingLineLeague,
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

  return {
    async findLatestSnapshot(key) {
      const filePath = await locateGameFile(key.league, key.jkbGameId);
      if (filePath === null) return null;
      const rows = await readGameRows(filePath);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (
          row.league === key.league &&
          row.jkbGameId === key.jkbGameId &&
          row.provider === key.provider &&
          row.sportsbook === key.sportsbook
        ) {
          return row;
        }
      }
      return null;
    },

    async insertSnapshot(record) {
      const filePath = gameFilePath(record.league, record.season, record.jkbGameId);
      const rows = await readGameRows(filePath);
      await writeGameRows(filePath, [...rows, record]);
    },

    async extendSnapshotObservation(id, observation) {
      let filePath = idFileCache.get(id) ?? null;
      if (filePath === null) {
        await forEachGameFile(async (candidate) => {
          if (filePath !== null) return;
          const rows = await readGameRows(candidate);
          if (rows.some((row) => row.id === id)) filePath = candidate;
        });
      }
      if (filePath === null) {
        throw new BettingSplitFileStoreError(`Unknown betting-line snapshot id: ${id}`);
      }
      const rows = await readGameRows(filePath);
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) {
        throw new BettingSplitFileStoreError(`Unknown betting-line snapshot id: ${id}`);
      }
      const next = [...rows];
      next[index] = {
        ...rows[index],
        lastObservedAt: observation.lastObservedAt,
        providerUpdatedAt: observation.providerUpdatedAt,
      };
      await writeGameRows(filePath, next);
    },

    async listSnapshotsForGame(query) {
      return readGameRows(
        gameFilePath(query.league, query.season, query.jkbGameId),
      );
    },

    async listAllSnapshots() {
      const rows: StoredBettingLineSnapshot[] = [];
      await forEachGameFile(async (filePath) => {
        rows.push(...(await readGameRows(filePath)));
      });
      return rows;
    },
  };
}
