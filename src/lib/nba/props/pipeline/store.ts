/**
 * Storage contract for the research pipeline.
 *
 * Research records (snapshots, results, evaluations, attempts) are append-only:
 * there is no update or delete. A postgame job can therefore never overwrite a
 * pregame line or projection; it can only add a result revision and an
 * evaluation revision that point back at it. Only the schedule cache (a
 * convenience, not research data) is replaced in place.
 *
 * Implementations here: in-memory (tests) and local JSONL files under the
 * gitignored data/nba/. A Supabase implementation follows the same contract
 * (see supabase/proposed/); none is built or enabled yet.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256Json } from "../canonicalJson";
import {
  parseAttempt,
  parseEvaluation,
  parseGame,
  parseResult,
  parseRun,
  parseSnapshot,
  playerKeyOf,
  resultSubstance,
  type NbaCaptureAttempt,
  type NbaFinalResult,
  type NbaJobRun,
  type NbaPipelineGame,
  type NbaPregameSnapshot,
  type NbaPropEvaluation,
} from "./contracts";

export type InsertOutcome = "inserted" | "duplicate";

export class RevisionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionConflictError";
  }
}

/** An evaluation that does not match the snapshot or result it claims to judge. */
export class EvaluationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationIntegrityError";
  }
}

export interface PipelineStore {
  insertSnapshot(snapshot: NbaPregameSnapshot): Promise<InsertOutcome>;
  latestSnapshotForMarket(marketKey: string): Promise<NbaPregameSnapshot | null>;
  listSnapshots(): Promise<NbaPregameSnapshot[]>;

  appendResult(result: NbaFinalResult): Promise<InsertOutcome>;
  latestResult(canonicalGameKey: string, playerKey: string): Promise<NbaFinalResult | null>;
  /** Every revision, oldest first. */
  listResults(): Promise<NbaFinalResult[]>;

  appendEvaluation(evaluation: NbaPropEvaluation): Promise<InsertOutcome>;
  latestEvaluation(snapshotId: string): Promise<NbaPropEvaluation | null>;
  listEvaluations(): Promise<NbaPropEvaluation[]>;

  appendAttempt(attempt: NbaCaptureAttempt): Promise<InsertOutcome>;
  listAttempts(canonicalGameKey?: string): Promise<NbaCaptureAttempt[]>;

  recordRun(run: NbaJobRun): Promise<void>;
  listRuns(): Promise<NbaJobRun[]>;

  upsertGame(game: NbaPipelineGame): Promise<void>;
  listGames(): Promise<NbaPipelineGame[]>;

  /** True if this owner now holds the lock. An unreleased lock expires after ttlMs. */
  acquireLock(name: string, owner: string, ttlMs: number, now: Date): Promise<boolean>;
  releaseLock(name: string, owner: string): Promise<void>;
}

const evaluationSubstance = (e: NbaPropEvaluation) => sha256Json({ settlement: e.settlement, actual: e.actual, resultRevision: e.resultRevision, reason: e.reason });
const resultKey = (r: NbaFinalResult) => `${r.game.canonicalGameKey}|${playerKeyOf(r.player)}`;

type Table = "snapshots" | "results" | "evaluations" | "attempts" | "runs";

export class MemoryPipelineStore implements PipelineStore {
  private snapshots = new Map<string, NbaPregameSnapshot>();
  private results = new Map<string, NbaFinalResult[]>();
  private evaluations = new Map<string, NbaPropEvaluation[]>();
  private attempts = new Map<string, NbaCaptureAttempt>();
  private runs: NbaJobRun[] = [];
  private games = new Map<string, NbaPipelineGame>();
  private locks = new Map<string, { owner: string; expiresAtMs: number }>();

  /** Called after a record is accepted; FilePipelineStore persists here. */
  protected onAccepted(_table: Table, _record: unknown): void {}
  protected onGames(_games: readonly NbaPipelineGame[]): void {}

  async insertSnapshot(input: NbaPregameSnapshot): Promise<InsertOutcome> {
    const snapshot = parseSnapshot(input);
    if (this.snapshots.has(snapshot.snapshotId)) return "duplicate";
    this.snapshots.set(snapshot.snapshotId, structuredClone(snapshot));
    this.onAccepted("snapshots", snapshot);
    return "inserted";
  }

  async latestSnapshotForMarket(marketKey: string): Promise<NbaPregameSnapshot | null> {
    const matches = [...this.snapshots.values()].filter((s) => s.marketKey === marketKey).sort((a, b) => a.timing.capturedAtUtc.localeCompare(b.timing.capturedAtUtc));
    const latest = matches.at(-1);
    return latest ? structuredClone(latest) : null;
  }

  async listSnapshots(): Promise<NbaPregameSnapshot[]> {
    return [...this.snapshots.values()].sort((a, b) => a.timing.capturedAtUtc.localeCompare(b.timing.capturedAtUtc) || a.snapshotId.localeCompare(b.snapshotId)).map((s) => structuredClone(s));
  }

  async appendResult(input: NbaFinalResult): Promise<InsertOutcome> {
    const result = parseResult(input);
    const key = resultKey(result);
    const chain = this.results.get(key) ?? [];
    const latest = chain.at(-1);
    if (latest && result.revision === latest.revision) {
      if (result.contentSha256 === latest.contentSha256) return "duplicate";
      throw new RevisionConflictError(`Result ${key} revision ${result.revision} already exists with different content`);
    }
    if (result.revision !== (latest?.revision ?? 0) + 1) throw new RevisionConflictError(`Result ${key}: revision ${result.revision} does not follow ${latest?.revision ?? 0}`);
    if (latest && resultSubstance(latest) === resultSubstance(result)) throw new RevisionConflictError(`Result ${key}: revision ${result.revision} changes nothing`);
    this.results.set(key, [...chain, structuredClone(result)]);
    this.onAccepted("results", result);
    return "inserted";
  }

  async latestResult(canonicalGameKey: string, playerKey: string): Promise<NbaFinalResult | null> {
    const latest = this.results.get(`${canonicalGameKey}|${playerKey}`)?.at(-1);
    return latest ? structuredClone(latest) : null;
  }

  async listResults(): Promise<NbaFinalResult[]> {
    return [...this.results.values()].flat().sort((a, b) => a.recordedAtUtc.localeCompare(b.recordedAtUtc) || a.revision - b.revision).map((r) => structuredClone(r));
  }

  async appendEvaluation(input: NbaPropEvaluation): Promise<InsertOutcome> {
    const evaluation = parseEvaluation(input);
    this.assertEvaluationMatchesRecords(evaluation);
    const chain = this.evaluations.get(evaluation.snapshotId) ?? [];
    const latest = chain.at(-1);
    if (latest && evaluation.revision === latest.revision) {
      if (evaluation.contentSha256 === latest.contentSha256) return "duplicate";
      throw new RevisionConflictError(`Evaluation ${evaluation.snapshotId} revision ${evaluation.revision} already exists with different content`);
    }
    if (evaluation.revision !== (latest?.revision ?? 0) + 1) throw new RevisionConflictError(`Evaluation ${evaluation.snapshotId}: revision ${evaluation.revision} does not follow ${latest?.revision ?? 0}`);
    if (latest && evaluationSubstance(latest) === evaluationSubstance(evaluation)) throw new RevisionConflictError(`Evaluation ${evaluation.snapshotId}: revision ${evaluation.revision} changes nothing`);
    this.evaluations.set(evaluation.snapshotId, [...chain, structuredClone(evaluation)]);
    this.onAccepted("evaluations", evaluation);
    return "inserted";
  }

  /** An evaluation must cite a stored snapshot by its hash, and a stored result revision when it names one. */
  private assertEvaluationMatchesRecords(e: NbaPropEvaluation): void {
    const snapshot = this.snapshots.get(e.snapshotId);
    if (!snapshot) throw new EvaluationIntegrityError(`Evaluation cites unknown snapshot ${e.snapshotId}`);
    if (snapshot.contentSha256 !== e.snapshotSha256) throw new EvaluationIntegrityError(`Evaluation of ${e.snapshotId} cites a different snapshot hash`);
    if (snapshot.market !== e.market || snapshot.line !== e.line) throw new EvaluationIntegrityError(`Evaluation of ${e.snapshotId} disagrees with the snapshot's market or line`);
    if (e.resultId === null) return;
    const chain = this.results.get(`${snapshot.game.canonicalGameKey}|${playerKeyOf(snapshot.player)}`) ?? [];
    const result = chain.find((r) => r.resultId === e.resultId && r.revision === e.resultRevision);
    if (!result) throw new EvaluationIntegrityError(`Evaluation of ${e.snapshotId} cites a result revision that is not stored`);
  }

  async latestEvaluation(snapshotId: string): Promise<NbaPropEvaluation | null> {
    const latest = this.evaluations.get(snapshotId)?.at(-1);
    return latest ? structuredClone(latest) : null;
  }

  async listEvaluations(): Promise<NbaPropEvaluation[]> {
    return [...this.evaluations.values()].flat().sort((a, b) => a.evaluatedAtUtc.localeCompare(b.evaluatedAtUtc) || a.revision - b.revision).map((e) => structuredClone(e));
  }

  async appendAttempt(input: NbaCaptureAttempt): Promise<InsertOutcome> {
    const attempt = parseAttempt(input);
    if (this.attempts.has(attempt.attemptId)) return "duplicate";
    this.attempts.set(attempt.attemptId, structuredClone(attempt));
    this.onAccepted("attempts", attempt);
    return "inserted";
  }

  async listAttempts(canonicalGameKey?: string): Promise<NbaCaptureAttempt[]> {
    return [...this.attempts.values()].filter((a) => canonicalGameKey === undefined || a.canonicalGameKey === canonicalGameKey).sort((a, b) => a.atUtc.localeCompare(b.atUtc)).map((a) => structuredClone(a));
  }

  async recordRun(input: NbaJobRun): Promise<void> {
    const run = parseRun(input);
    this.runs.push(structuredClone(run));
    this.onAccepted("runs", run);
  }

  async listRuns(): Promise<NbaJobRun[]> {
    return this.runs.map((r) => structuredClone(r));
  }

  async upsertGame(input: NbaPipelineGame): Promise<void> {
    const game = parseGame(input);
    const existing = this.games.get(game.canonicalGameKey);
    if (existing && existing.observedAtUtc > game.observedAtUtc) return;
    this.games.set(game.canonicalGameKey, structuredClone(game));
    this.onGames([...this.games.values()]);
  }

  async listGames(): Promise<NbaPipelineGame[]> {
    return [...this.games.values()].sort((a, b) => a.tipoffUtc.localeCompare(b.tipoffUtc) || a.canonicalGameKey.localeCompare(b.canonicalGameKey)).map((g) => structuredClone(g));
  }

  async acquireLock(name: string, owner: string, ttlMs: number, now: Date): Promise<boolean> {
    // Not reentrant: even the same owner id cannot take a lock that is still held, so a duplicate or re-dispatched run cannot slip in.
    const held = this.locks.get(name);
    if (held && held.expiresAtMs > now.getTime()) return false;
    this.locks.set(name, { owner, expiresAtMs: now.getTime() + ttlMs });
    return true;
  }

  async releaseLock(name: string, owner: string): Promise<void> {
    if (this.locks.get(name)?.owner === owner) this.locks.delete(name);
  }

  /** Replays persisted records without re-triggering persistence. Used by FilePipelineStore. */
  protected async replay(table: Table, record: unknown): Promise<void> {
    const saved = { onAccepted: this.onAccepted };
    this.onAccepted = () => {};
    try {
      if (table === "snapshots") await this.insertSnapshot(record as NbaPregameSnapshot);
      else if (table === "results") await this.appendResult(record as NbaFinalResult);
      else if (table === "evaluations") await this.appendEvaluation(record as NbaPropEvaluation);
      else if (table === "attempts") await this.appendAttempt(record as NbaCaptureAttempt);
      else await this.recordRun(record as NbaJobRun);
    } finally {
      this.onAccepted = saved.onAccepted;
    }
  }

  protected async replayGames(games: readonly unknown[]): Promise<void> {
    const saved = this.onGames;
    this.onGames = () => {};
    try {
      for (const game of games) await this.upsertGame(game as NbaPipelineGame);
    } finally {
      this.onGames = saved;
    }
  }
}

const TABLE_FILES: Record<Table, string> = { snapshots: "snapshots.jsonl", results: "results.jsonl", evaluations: "evaluations.jsonl", attempts: "attempts.jsonl", runs: "runs.jsonl" };

/**
 * Local, single-machine store: one JSONL file per table plus games.json, under
 * a directory the caller points at data/nba/ (gitignored, vercelignored). Every
 * record is re-validated when loaded; a corrupt line fails the load rather than
 * being skipped. Locks are exclusive-create files, so they hold across local
 * processes but NOT across machines (use the Supabase store for cloud runs).
 */
export class FilePipelineStore extends MemoryPipelineStore {
  private constructor(private readonly dir: string) {
    super();
  }

  static async open(dir: string): Promise<FilePipelineStore> {
    mkdirSync(path.join(dir, "locks"), { recursive: true });
    const store = new FilePipelineStore(dir);
    for (const table of Object.keys(TABLE_FILES) as Table[]) {
      const file = path.join(dir, TABLE_FILES[table]);
      if (!existsSync(file)) continue;
      const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.trim() !== "");
      for (const [index, line] of lines.entries()) {
        try {
          await store.replay(table, JSON.parse(line));
        } catch (error) {
          throw new Error(`${TABLE_FILES[table]} line ${index + 1} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    const gamesFile = path.join(dir, "games.json");
    if (existsSync(gamesFile)) await store.replayGames(JSON.parse(readFileSync(gamesFile, "utf8")) as unknown[]);
    return store;
  }

  protected override onAccepted(table: Table, record: unknown): void {
    appendFileSync(path.join(this.dir, TABLE_FILES[table]), `${JSON.stringify(record)}\n`);
  }

  protected override onGames(games: readonly NbaPipelineGame[]): void {
    const file = path.join(this.dir, "games.json");
    writeFileSync(`${file}.tmp`, JSON.stringify(games));
    renameSync(`${file}.tmp`, file);
  }

  /**
   * Runs `fn` while holding a cross-process lock on the store directory, then
   * releases it. Open the store INSIDE `fn` so it reflects every record written
   * by the previous holder.
   */
  static async withLock<T>(dir: string, name: string, ttlMs: number, now: () => Date, fn: () => Promise<T>): Promise<T> {
    mkdirSync(path.join(dir, "locks"), { recursive: true });
    const file = lockFile(dir, name);
    const owner = randomUUID();
    if (!acquireFileLock(file, owner, ttlMs, now())) throw new Error(`Another process holds the ${name} lock on ${dir}`);
    try {
      return await fn();
    } finally {
      releaseFileLock(file, owner);
    }
  }

  override async acquireLock(name: string, owner: string, ttlMs: number, now: Date): Promise<boolean> {
    return acquireFileLock(lockFile(this.dir, name), owner, ttlMs, now);
  }

  override async releaseLock(name: string, owner: string): Promise<void> {
    releaseFileLock(lockFile(this.dir, name), owner);
  }
}

function lockFile(dir: string, name: string): string {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid lock name ${name}`);
  return path.join(dir, "locks", `${name}.json`);
}

interface LockBody {
  owner: string;
  expiresAtMs: number;
}

function readLock(file: string): LockBody | null {
  try {
    const body = JSON.parse(readFileSync(file, "utf8")) as Partial<LockBody>;
    return typeof body.owner === "string" && typeof body.expiresAtMs === "number" ? (body as LockBody) : null;
  } catch {
    return null;
  }
}

/**
 * Exclusive-create lock, not reentrant. An expired lock is taken over by
 * renaming it aside (exactly one process wins the rename) and, if what was
 * renamed turns out to be a fresh lock another process just created, putting
 * it back. A lock file that cannot be read (half written) counts as held.
 * Best effort across processes on ONE machine; cloud runs use the database.
 */
function acquireFileLock(file: string, owner: string, ttlMs: number, now: Date): boolean {
  const body = JSON.stringify({ owner, expiresAtMs: now.getTime() + ttlMs });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      writeFileSync(file, body, { flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const held = readLock(file);
    if (held === null || held.expiresAtMs > now.getTime()) return false;
    const aside = `${file}.${randomUUID()}.stale`;
    try {
      renameSync(file, aside);
    } catch {
      continue; // someone else took it over first; retry the exclusive create
    }
    const moved = readLock(aside);
    rmSync(aside, { force: true });
    if (moved !== null && moved.expiresAtMs > now.getTime()) {
      try {
        writeFileSync(file, JSON.stringify(moved), { flag: "wx" }); // we displaced a live lock: put it back
      } catch {
        // another process already re-created it
      }
      return false;
    }
  }
  return false;
}

function releaseFileLock(file: string, owner: string): void {
  if (existsSync(file) && readLock(file)?.owner === owner) rmSync(file, { force: true });
}
