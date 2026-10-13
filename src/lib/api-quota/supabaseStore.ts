/**
 * Durable usage store on Supabase Postgres, shared by GitHub Actions and
 * Vercel. NOT ACTIVE: the table and functions below are a reviewed draft
 * (docs/plans/active/api-quota-manager.md) and have not been migrated.
 *
 * Atomicity is enforced by the database, not by the client:
 * - Clients have no table privileges. All access goes through two
 *   SECURITY DEFINER functions granted only to service_role.
 * - `api_quota_cas(account, expected_version, state)` is a single
 *   `UPDATE ... WHERE account_id = $1 AND version = $2` (or an
 *   `INSERT ... ON CONFLICT DO NOTHING` for version 0). Postgres row locking
 *   serializes concurrent updates; the loser re-evaluates the WHERE clause,
 *   matches nothing and gets NULL back, and this store retries from a fresh
 *   read. The version can only ever advance by one.
 *
 * Cap enforcement itself is computed by QuotaManager inside the transaction
 * function; the CAS guarantees each read-modify-write is serializable, so every
 * writer that uses the manager sees every earlier reservation.
 *
 * The caller injects an authenticated fetch with the same shape as
 * api/_lib/supabase.ts `supabaseAdminFetch(path, init)`. This module never
 * reads environment variables.
 */
import type { Transaction, UsageStore } from "./store";
import { emptyUsageState, type AccountUsageState } from "./types";

export type SupabaseFetch = (path: string, init?: RequestInit) => Promise<Response>;

export const QUOTA_READ_RPC = "api_quota_read";
export const QUOTA_CAS_RPC = "api_quota_cas";

interface AccountRow {
  version: number;
  state: AccountUsageState;
}

export class QuotaStoreConflictError extends Error {
  constructor(accountId: string, attempts: number) {
    super(`Quota state for ${accountId} kept changing; gave up after ${attempts} attempts`);
    this.name = "QuotaStoreConflictError";
  }
}

export class SupabaseUsageStore implements UsageStore {
  constructor(
    private readonly fetchImpl: SupabaseFetch,
    private readonly maxAttempts = 8,
  ) {}

  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(`/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`Quota store ${name} failed: HTTP ${response.status}`);
    return response.json();
  }

  private async readRow(accountId: string): Promise<AccountRow | null> {
    const rows = (await this.rpc(QUOTA_READ_RPC, { p_account_id: accountId })) as AccountRow[];
    if (!Array.isArray(rows)) throw new Error(`Quota store ${QUOTA_READ_RPC} returned an unexpected shape`);
    return rows[0] ?? null;
  }

  async read(accountId: string): Promise<AccountUsageState> {
    return (await this.readRow(accountId))?.state ?? emptyUsageState();
  }

  /** true = written; false = another writer won the race (retry from a fresh read). */
  private async compareAndSwap(accountId: string, expectedVersion: number, state: AccountUsageState): Promise<boolean> {
    const newVersion = await this.rpc(QUOTA_CAS_RPC, { p_account_id: accountId, p_expected_version: expectedVersion, p_state: state });
    if (newVersion === null) return false;
    if (newVersion !== expectedVersion + 1) throw new Error(`Quota store ${QUOTA_CAS_RPC} returned version ${String(newVersion)}, expected ${expectedVersion + 1}`);
    return true;
  }

  async transact<T>(accountId: string, fn: Transaction<T>): Promise<T> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const row = await this.readRow(accountId);
      const { state, result, changed } = fn(row?.state ?? emptyUsageState());
      if (changed === false) return result;
      if (await this.compareAndSwap(accountId, row?.version ?? 0, state)) return result;
    }
    throw new QuotaStoreConflictError(accountId, this.maxAttempts);
  }
}
