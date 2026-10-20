# Shared API quota manager

Status: **draft, not activated**. Phase 1 is implemented: library, local file ledger, report CLI, and tests against mocked provider responses. No existing workflow, provider integration or Supabase object uses it. No provider request has been made through it.

Code: `src/lib/api-quota/` · Report: `npx tsx scripts/api-quota-report.ts [--dir=artifacts/api-quota] [--json] [--reconcile-orphans]`

## Why

Several provider accounts are shared by many workflows with no common ledger. The only persisted usage file is `data/market/betting-lines/quota-state.json` (The Odds API, one key). ParlayAPI usage is printed to public Actions logs by one script (`scripts/fetch-mlb-odds.mjs:90-92`) and recorded nowhere else. New NBA work must not consume budgets that NFL/MLB/PGA/NCAAB depend on, and must not start on any account whose plan or usage is unknown.

## Invariants (each covered by tests in `src/lib/api-quota/*.test.ts`)

1. **Accounts, not scripts.** Limits live on a provider account (`accounts.ts`). Env var names are mapping only. `validateRegistry` refuses a registry where one credential name funds more than one budget, unless the provider confirmed separate quotas (`separateQuotaVerified`) or every account sharing it is planStatus `unknown` (closed to new consumers). The Odds API keys are one pool with UNKNOWN identity. API-Basketball shares `API_SPORTS_KEY` with API-NBA and stays UNKNOWN until both `/status` counters prove separate quotas.
2. **UNKNOWN blocks new consumers.** A nonessential consumer (all NBA work) is refused for any of these: a blocking reason, an UNKNOWN plan or configured limit, no current user approval (an unparseable expiry counts as expired), an exhausted approval budget, or no provider-reported usage in the current window. While usage is unreported, only a bounded number of usage-check requests are allowed.
3. **Reserve before sending; never assume free.** Every attempt reserves its estimate first, including retries and pages. Settlement charges the provider-reported cost of that call when the provider sends one (`x-requests-last`), otherwise the estimate, whatever the HTTP status. HTTP-200 bodies with API-Sports `errors` are still charged. Network and body-read failures are charged.
4. **No silent refunds.** Only `release()` returns units, and only for a reservation still inside its TTL that the caller proves was never sent. A reservation that is never settled (crash or kill after send) keeps counting at its estimate indefinitely. If settlement itself fails, `guardedRequest` returns the paid response with `settleFailed` instead of throwing; the reservation stays open and charged.
5. **Monotonic within a window.** Effective usage is the maximum of the ledger and, over *every* provider snapshot in the window, provider-reported used + our calls after it + our calls in flight when it was taken. A later, lower report (provider lag, or another key in an unverified pool) never lowers usage. Only a new window resets usage. A provider-reported limit can tighten the configured limit, never raise it. A header-reported limit never lifts an UNKNOWN plan gate.
6. **Caps.** Essential consumers stop at `limit − safetyReserve`. Nonessential consumers stop at `min(limit − safetyReserve, floor(limit × nonessentialMaxRatio))`. Per-minute windows are rate limits with a retry hint. Approval-funded entries are never pruned, so approval budgets never refresh.
7. **Alerts** at 50/75/90 % of each day/month window fire once per window and are returned to the caller. There is no external delivery yet.
8. **Retries and pagination.** Each page and each retry is its own reservation. Retries are opt-in (default statuses 502/503/504), back off exponentially, and never apply to 429.
9. **Secrets.** No URL or header is stored. Endpoint labels are reduced to a path; stored details pass through `redactDetail`. The registry and report hold env var *names* only and never read values.
10. **Concurrency.**
    - `MemoryUsageStore`: one process.
    - `FileUsageStore`: one machine only. It uses a token-owned lock file, and stale locks are broken by atomic rename. It is *not* a distributed lock.
    - `SupabaseUsageStore`: cross-process and cloud use (below).

## Orphaned reservations: recovery process

1. `npx tsx scripts/api-quota-report.ts` lists open reservations and how many are past `reservationTtlMs` (10 min).
2. Check the provider's own usage figure (dashboard, `/status`, or quota headers) for the window. Record it with `manager.recordProviderUsage`. Because of rule 5 it can only raise usage.
3. Run `--reconcile-orphans`. Every reservation past its TTL is settled as `outcome: "orphaned"`, charged at its estimate, never refunded. After 40 days it becomes prunable into monthly rollups, unless it was approval-funded.
4. If provider evidence proves a different cost for a specific call, settle that reservation explicitly with `providerReportedUnits` *before* it ages out. Never use `release()` for a call that might have been sent.

## Durable shared storage (proposed; NOT migrated, needs approval)

Atomicity is enforced in Postgres, not by the client:
- Clients get no table privileges.
- All access goes through two `SECURITY DEFINER` functions executable only by `service_role`.
- The CAS is a single `UPDATE … WHERE account_id = $1 AND version = $2`. Under concurrent updates, Postgres row locking makes the losing transaction re-check the `WHERE` clause on the committed row. It matches nothing and returns NULL, and the client retries from a fresh read.
- Version 0 inserts with `ON CONFLICT DO NOTHING`.
- Check constraints keep the row well-formed.

QuotaManager computes caps inside each serialized read-modify-write. The database does not evaluate caps itself, so the guarantee holds for every writer that goes through the manager; any other writer is outside it. Not yet executed against a real Postgres: no local Postgres was available.

```sql
create table if not exists public.api_quota_accounts (
  account_id text primary key check (account_id ~ '^[a-z0-9][a-z0-9:._-]{0,99}$'),
  version    bigint not null check (version > 0),
  state      jsonb  not null check (jsonb_typeof(state) = 'object'
                                    and jsonb_typeof(state -> 'entries') = 'array'
                                    and jsonb_typeof(state -> 'snapshots') = 'array'),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.api_quota_accounts enable row level security;
-- No policies and no grants: only the definer functions below can touch the table.
revoke all on table public.api_quota_accounts from public, anon, authenticated, service_role;

create or replace function public.api_quota_read(p_account_id text)
returns table (version bigint, state jsonb)
language sql stable security definer set search_path = public
as $$ select a.version, a.state from public.api_quota_accounts a where a.account_id = p_account_id $$;

create or replace function public.api_quota_cas(p_account_id text, p_expected_version bigint, p_state jsonb)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_new bigint;
begin
  if p_expected_version = 0 then
    insert into public.api_quota_accounts (account_id, version, state)
    values (p_account_id, 1, p_state)
    on conflict (account_id) do nothing
    returning version into v_new;
  else
    update public.api_quota_accounts
       set version = version + 1, state = p_state, updated_at = timezone('utc', now())
     where account_id = p_account_id and version = p_expected_version
    returning version into v_new;
  end if;
  return v_new; -- NULL = lost the race; the client re-reads and retries
end;
$$;

revoke all on function public.api_quota_read(text) from public, anon, authenticated;
revoke all on function public.api_quota_cas(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.api_quota_read(text) to service_role;
grant execute on function public.api_quota_cas(text, bigint, jsonb) to service_role;
```

## Integration plan (each step needs separate approval)

1. **Configure a verified API-NBA account.** You create a free API-Sports account directly on api-sports.io, not RapidAPI, and keep the key only in a local untracked environment as `API_SPORTS_KEY`. Do not add it to GitHub or Vercel yet. Confirm in writing, or from the terms, that private evaluation is permitted. Then record it in `SOURCE_LICENSES` as `private-research` only.
2. **Set a hard 10-request research budget.** Set `liveApproval` on `api-sports:nba` to `{ id: "nba-probe-1", approvedBy, approvedOn, scope: "API-NBA 10-request evaluation probe", maxUnits: 10, expiresAt: <~7 days> }`. The approval budget is enforced across the approval's lifetime, independently of the daily window.
3. **Run a controlled probe when authorized.** Add a local-only runner (`scripts/nba-api-nba-probe.ts`, FileUsageStore at `artifacts/api-quota/`):
   - `manager.preflight` over all 10 estimates.
   - Request 1 is `/status` (a usage check); feed `parseApiSportsStatusBody` to `recordProviderUsage`.
   - Requests 2–10 go through `guardedRequest` with `maxAttempts: 1` and `inspectBody: inspectApiSportsBody`, at least 7 s apart.
   - Raw bodies plus `nba-source-snapshot-meta-v2` sidecars go to `data/nba/sources/api-nba/probe/<stamp>/`.
   - Stop on any denial, non-2xx, provider error, plan or season message, or usage rising faster than calls made.

   **Status (2026-10-13): runner built, not run.** `scripts/nba-api-nba-probe.ts` (readiness check by default; `--execute` for live) over `src/lib/nba/props/sources/apiNbaProbe.ts`, tested with mocked transports only. Differences from the outline above:
   - Order: status, seasons, games 2023, games 2024, game player stats, game team stats, team-season player stats, games 2025, games 2026, final status. The seasons most likely to be plan-restricted come last, so a plan-restriction abort cannot cost the box-score checks.
   - Approval is a local file, never committed source. `liveApproval` stays `null` in `accounts.ts`; the CLI reads `data/nba/approvals/api-nba-probe-approval.json` (gitignored and vercelignored), validates it strictly with `apiNbaProbeApproval.ts`, and injects it into an in-memory registry copy for `api-sports:nba` only. A missing, malformed, expired, over-budget or out-of-scope file blocks the run. Create one with `npx tsx scripts/nba-api-nba-probe-approval.ts --approved-by="<name>" [--days=7]`, which uses exclusive create and never overwrites, renews or extends.
   - Cap enforced four ways:
     - an in-run counter;
     - a single-use claim marker (`data/nba/approvals/claims/<approvalId>.json`, exclusive create) taken before the first request;
     - refusal of any approval that has already funded a request;
     - the manager's approval budget.

     The approval must have scope `"API-NBA 10-request evaluation probe"` and `maxUnits` of at most 10, and it must expire within 14 days of `approvedAt`.
   - No S3 wait-and-retry: HTTP 429 aborts. `/status` bodies are saved without `response.account`.
   - `SOURCE_LICENSES["api-sports-nba"]` is `unlicensed` with no permitted use, following readiness Q7 rather than step 1 above. The run's analysis is structural only (coverage, minutes format, DNP rows, box sums, paging, quota delta). Canonical normalization (`apiNba.ts`) is exercised with synthetic payloads only until a license decision.
4. **Report actual quota usage.** `npx tsx scripts/api-quota-report.ts` compares ledger units with provider-reported usage from the final `/status`, shows the unattributed gap (which answers "does `/status` count?"), and lists any open or orphaned reservations.
5. **Observe-only tracking for existing NFL/MLB services.**
   - Add header capture (`HEADER_PARSERS` → `recordProviderUsage`) beside each existing odds fetch: The Odds API and ParlayAPI scripts, and the Vercel odds routes.
   - No reserve and no admission checks, so behavior is unchanged.
   - Start with one workflow per PR. Use the local or Actions-artifact ledger until step 6.
6. **Enable shared Supabase tracking after distributed concurrency validation.**
   - Apply the migration above to a non-production Supabase branch first.
   - Run a concurrency soak there: N parallel GitHub Actions jobs and a Vercel preview each reserving against one test account. Assert reserved ≤ limit and that versions are contiguous.
   - Then add narrowly scoped secrets: a dedicated role or key, not the general service-role key, if possible.
   - Only after that, switch stores and consider admission control for existing workloads as `essential` consumers with a safety reserve.

Separately: decide whether the `ODDS_API_KEY_BACKUP` automatic fallback (`scripts/fetch-mlb-odds.mjs:207-235`) is a second account at the same provider. If so, it may conflict with that provider's terms. The quota manager deliberately has no equivalent.

## Not done

- No Supabase migration, secret, workflow, or existing-integration change.
- SQL is reviewed but not executed (no local Postgres).
- Coverage not measured: `@vitest/coverage-v8` is not installed.
- No external alert delivery.
