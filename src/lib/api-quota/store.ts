/**
 * Usage stores. Every mutation runs as one atomic read-modify-write per
 * account, so concurrent workflows can never both reserve the last units.
 *
 * - MemoryUsageStore: tests and single-process use.
 * - FileUsageStore: local runs (e.g. the NBA probe) on ONE machine. The lock
 *   file is not a distributed lock: never point several cloud runners at it.
 * - SupabaseUsageStore (supabaseStore.ts): durable, shared by GitHub Actions and Vercel.
 */
import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { emptyUsageState, type AccountUsageState } from "./types";

/** `changed: false` = read-only outcome (e.g. a denial); the store skips the write. */
export type TransactionOutcome<T> = { state: AccountUsageState; result: T; changed?: boolean };
export type Transaction<T> = (state: AccountUsageState) => TransactionOutcome<T>;

export interface UsageStore {
  read(accountId: string): Promise<AccountUsageState>;
  transact<T>(accountId: string, fn: Transaction<T>): Promise<T>;
}

const clone = (state: AccountUsageState): AccountUsageState => JSON.parse(JSON.stringify(state)) as AccountUsageState;

export class MemoryUsageStore implements UsageStore {
  private readonly states = new Map<string, AccountUsageState>();
  private readonly queues = new Map<string, Promise<unknown>>();

  async read(accountId: string): Promise<AccountUsageState> {
    return clone(this.states.get(accountId) ?? emptyUsageState());
  }

  transact<T>(accountId: string, fn: Transaction<T>): Promise<T> {
    const previous = this.queues.get(accountId) ?? Promise.resolve();
    const run = previous.then(() => {
      const { state, result, changed } = fn(clone(this.states.get(accountId) ?? emptyUsageState()));
      if (changed !== false) this.states.set(accountId, clone(state));
      return result;
    });
    this.queues.set(accountId, run.catch(() => undefined));
    return run;
  }
}

/** Windows reports EPERM/EACCES while another process is deleting or renaming the file. */
const BUSY_CODES = new Set(["EEXIST", "EPERM", "EACCES"]);
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code ?? "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FileUsageStoreOptions {
  lockTimeoutMs?: number;
  /** A lock file older than this is presumed abandoned by a crashed process. */
  staleLockMs?: number;
  retryDelayMs?: number;
}

export class LockTimeoutError extends Error {
  constructor(lockPath: string) {
    super(`Timed out waiting for quota lock ${lockPath}`);
    this.name = "LockTimeoutError";
  }
}

export class FileUsageStore implements UsageStore {
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;
  private readonly retryDelayMs: number;

  constructor(private readonly dir: string, options: FileUsageStoreOptions = {}) {
    this.lockTimeoutMs = options.lockTimeoutMs ?? 15_000;
    this.staleLockMs = options.staleLockMs ?? 60_000;
    this.retryDelayMs = options.retryDelayMs ?? 25;
  }

  private file(accountId: string): string {
    return path.join(this.dir, `${accountId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  }

  async read(accountId: string): Promise<AccountUsageState> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return JSON.parse(await readFile(this.file(accountId), "utf8")) as AccountUsageState;
      } catch (error) {
        if (errorCode(error) === "ENOENT") return emptyUsageState();
        if (!BUSY_CODES.has(errorCode(error)) || attempt >= 20) throw error;
        await sleep(this.retryDelayMs);
      }
    }
  }

  /**
   * Break a stale lock atomically: rename it aside (only one breaker can win),
   * then confirm the moved file is the stale one we inspected. If a live lock was
   * moved by mistake, put it back with link(), which fails rather than overwrite.
   */
  private async breakStaleLock(lockPath: string, staleToken: string): Promise<void> {
    const aside = `${lockPath}.stale-${randomUUID()}`;
    try {
      await rename(lockPath, aside);
    } catch {
      return;
    }
    const movedToken = await readFile(aside, "utf8").catch(() => null);
    if (movedToken !== staleToken) await link(aside, lockPath).catch(() => undefined);
    await rm(aside, { force: true }).catch(() => undefined);
  }

  private async acquire(lockPath: string): Promise<string> {
    const token = `${process.pid}-${randomUUID()}`;
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      try {
        const handle = await open(lockPath, "wx");
        await handle.writeFile(token);
        await handle.close();
        return token;
      } catch (error) {
        if (!BUSY_CODES.has(errorCode(error))) throw error;
        // Read the owner token BEFORE checking age: if a live lock replaces the
        // stale one in between, its fresh mtime stops the break, and a token
        // mismatch after the rename restores it.
        const staleToken = await readFile(lockPath, "utf8").catch(() => null);
        const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
        if (staleToken !== null && age > this.staleLockMs) {
          await this.breakStaleLock(lockPath, staleToken);
          continue;
        }
        if (Date.now() > deadline) throw new LockTimeoutError(lockPath);
        await sleep(this.retryDelayMs);
      }
    }
  }

  /** Remove the lock only if it is still ours (it may have been broken as stale). */
  private async releaseLock(lockPath: string, token: string): Promise<void> {
    const current = await readFile(lockPath, "utf8").catch(() => null);
    if (current === token) await rm(lockPath, { force: true }).catch(() => undefined);
  }

  async transact<T>(accountId: string, fn: Transaction<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true });
    const target = this.file(accountId);
    const lockPath = `${target}.lock`;
    const token = await this.acquire(lockPath);
    try {
      const { state, result, changed } = fn(await this.read(accountId));
      if (changed !== false) {
        const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
        await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
        await rename(temp, target);
      }
      return result;
    } finally {
      await this.releaseLock(lockPath, token);
    }
  }
}
