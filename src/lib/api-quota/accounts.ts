/**
 * Provider-account registry (reviewed 2026-10-20).
 *
 * Rules:
 * - One record per provider ACCOUNT. Env var names are listed for mapping only;
 *   different names are not evidence of different accounts.
 * - A limit is `account-verified` only after our own account reports it.
 * - Never add a second account to the same provider to gain quota: API-Sports
 *   and ParlayAPI terms forbid duplicate accounts.
 * - `liveApproval` is set only from an explicit user approval, with its scope.
 *
 * Existing NFL/MLB/PGA/NCAAB workloads are NOT routed through the manager yet;
 * they are listed in `unmanagedConsumers` and are visible only through
 * provider-reported usage.
 */
import type { ProviderAccountConfig } from "./types";

const ALERTS = [0.5, 0.75, 0.9] as const;
const RESERVATION_TTL_MS = 10 * 60_000;

const apiSportsWindows = [
  { kind: "day", limit: 100, source: "provider-docs", resetHourUtc: 0, note: "Free plan, api-sports.io pricing/docs; not yet confirmed by our /status" },
  { kind: "minute", limit: 10, source: "provider-docs" },
] as const;

export const PROVIDER_ACCOUNTS: readonly ProviderAccountConfig[] = Object.freeze([
  {
    accountId: "api-sports:nba",
    provider: "api-sports",
    description: "API-NBA v2 (v2.nba.api-sports.io), direct API-Sports dashboard, never RapidAPI",
    credentialEnvVars: ["API_SPORTS_KEY"],
    identity: "single-key",
    billingUnit: "requests",
    planStatus: "documented",
    planBasis: "Public free-plan docs (100 requests/day, 10/min, reset 00:00 UTC). No account exists in repo config; key name proposed.",
    windows: apiSportsWindows,
    safetyReserve: 5,
    nonessentialMaxRatio: 0.9,
    alertThresholds: ALERTS,
    reservationTtlMs: RESERVATION_TTL_MS,
    maxUsageChecksPerWindow: 2,
    nonessentialBlockedReason: null,
    liveApproval: null,
    unmanagedConsumers: [],
  },
  {
    accountId: "api-sports:basketball",
    provider: "api-sports",
    description: "API-Basketball v1 (v1.basketball.api-sports.io); same API-Sports account key, separate per-API quota",
    credentialEnvVars: ["API_SPORTS_KEY"],
    identity: "single-key",
    billingUnit: "requests",
    planStatus: "unknown",
    planBasis:
      "Public free-plan docs list 100/day per API, but a quota separate from API-NBA on the same key is UNVERIFIED. Stays UNKNOWN (no new consumers) until /status on both APIs confirms separate counters; then set planStatus documented + separateQuotaVerified.",
    windows: apiSportsWindows,
    safetyReserve: 5,
    nonessentialMaxRatio: 0.9,
    alertThresholds: ALERTS,
    reservationTtlMs: RESERVATION_TTL_MS,
    maxUsageChecksPerWindow: 2,
    nonessentialBlockedReason: null,
    liveApproval: null,
    unmanagedConsumers: [],
  },
  {
    accountId: "balldontlie:free",
    provider: "balldontlie",
    description: "BALLDONTLIE free tier: teams, players, games only",
    credentialEnvVars: ["BALLDONTLIE_API_KEY"],
    identity: "single-key",
    billingUnit: "requests",
    planStatus: "documented",
    planBasis: "Public pricing: free tier 5 requests/min, no published daily/monthly cap. No account exists in repo config; key name proposed.",
    windows: [{ kind: "minute", limit: 5, source: "provider-docs" }],
    safetyReserve: 0,
    nonessentialMaxRatio: 1,
    alertThresholds: ALERTS,
    reservationTtlMs: RESERVATION_TTL_MS,
    maxUsageChecksPerWindow: 0,
    nonessentialBlockedReason: null,
    liveApproval: null,
    unmanagedConsumers: [],
  },
  {
    accountId: "the-odds-api:unverified-pool",
    provider: "the-odds-api",
    description: "The Odds API (api.the-odds-api.com/v4). THE_ODDS_API_KEY and ODDS_API_KEY share the reported Starter pool; backup-key identity remains unverified.",
    credentialEnvVars: ["ODDS_API_KEY", "THE_ODDS_API_KEY", "ODDS_API_KEY_BACKUP"],
    identity: "unverified-may-share",
    billingUnit: "credits",
    planStatus: "documented",
    planBasis:
      "Owner-confirmed Starter account: 500 credits/month, reset 1st 00:00 UTC. THE_ODDS_API_KEY is bound to this account; THE_ODDS_API_KEY and ODDS_API_KEY share its reported pool. Backup-key identity remains unverified and is conservatively counted through fresh provider usage. The 2026-10-20 balance is historical, not a usable snapshot.",
    windows: [{ kind: "month", limit: 500, source: "repo-evidence", resetDayOfMonth: 1, note: "Owner-confirmed Starter account; fresh provider usage required before NBA spending" }],
    safetyReserve: 50,
    nonessentialMaxRatio: 0.5,
    alertThresholds: ALERTS,
    reservationTtlMs: RESERVATION_TTL_MS,
    maxUsageChecksPerWindow: 0,
    nonessentialBlockedReason: null,
    liveApproval: null,
    unmanagedConsumers: [
      ".github/workflows/nfl-betting-lines-daily.yml (THE_ODDS_API_KEY)",
      ".github/workflows/generate-mlb-hr-props.yml (ODDS_API_KEY, ODDS_API_KEY_BACKUP)",
      ".github/workflows/props-value-refresh.yml (ODDS_API_KEY, ODDS_API_KEY_BACKUP)",
      ".github/workflows/nfl-yardage-market.yml (ODDS_API_KEY)",
      ".github/workflows/sync-pga-data.yml (ODDS_API_KEY)",
      ".github/workflows/generate-best-bets-manual.yml (ODDS_API_KEY)",
      "api/odds/current.ts, api/odds/_service.ts, api/_lib/odds-service.ts (Vercel runtime, ODDS_API_KEY)",
    ],
  },
  {
    accountId: "parlayapi:primary",
    provider: "parlayapi",
    description: "ParlayAPI (parlay-api.com/v1)",
    credentialEnvVars: ["PARLAYAPI"],
    identity: "single-key",
    billingUnit: "credits",
    planStatus: "unknown",
    planBasis: "Commit 9c1d41d0c (2026-06-25) says free tier, 1,000 credits/month; not confirmed since.",
    windows: [{ kind: "month", limit: 1000, source: "repo-evidence", resetDayOfMonth: 1, note: "Reset day UNKNOWN; 1st assumed" }],
    safetyReserve: 100,
    nonessentialMaxRatio: 0.5,
    alertThresholds: ALERTS,
    reservationTtlMs: RESERVATION_TTL_MS,
    maxUsageChecksPerWindow: 0,
    nonessentialBlockedReason:
      "ParlayAPI Terms (2026-09-30) s4.1: free access is personal evaluation/non-commercial research only; s4.2(f): no public/customer-facing product incl. derived insights without a signed agreement; s4.2(c): 90-day cap on stored line-level prices. No new JKB consumers until resolved.",
    liveApproval: null,
    unmanagedConsumers: [
      ".github/workflows/generate-mlb-hr-props.yml (scripts/fetch-mlb-odds.mjs)",
      ".github/workflows/props-value-refresh.yml (scripts/fetch-mlb-odds.mjs)",
      ".github/workflows/nfl-yardage-market.yml (nfl:yardage-market, nfl:anytime-td-market)",
      ".github/workflows/nfl-touchdown-preview.yml (nfl:anytime-td-market)",
      "manual: nfl:td-forward-snapshot, scripts/research/fetch-nfl-anytime-td-research-archive.mjs",
    ],
  },
  {
    accountId: "therundown:primary",
    provider: "therundown",
    description: "TheRundown (MLB moneyline fallback in scripts/lib/mlb-moneyline-providers.mjs)",
    credentialEnvVars: ["THERUNDOWNAPI"],
    identity: "single-key",
    billingUnit: "requests",
    planStatus: "unknown",
    planBasis: "No plan or quota evidence in the repository.",
    windows: [],
    safetyReserve: 0,
    nonessentialMaxRatio: 0,
    alertThresholds: ALERTS,
    reservationTtlMs: RESERVATION_TTL_MS,
    maxUsageChecksPerWindow: 0,
    nonessentialBlockedReason: "Plan, quota and terms UNKNOWN; not assessed for NBA.",
    liveApproval: null,
    unmanagedConsumers: [".github/workflows/generate-mlb-hr-props.yml", ".github/workflows/props-value-refresh.yml"],
  },
]);
