/**
 * Source profiles: what each NBA data source offers, what it costs, how it is
 * reached, and where its data really comes from. Profiles are facts about a
 * source; whether we may USE it is decided only by the license records
 * (licenses.ts), and a redistributor's rights are capped by its origin's.
 *
 * Adding or migrating a provider is a registry + license entry, not a code
 * change: selection.ts reads these records.
 */
import { SOURCE_LICENSES } from "./licenses";
import type { DataUse, NbaSourceId, SourceCapabilities, SourceLicense } from "./types";
import { DATA_USES } from "./types";

export type MinutesPrecision = SourceCapabilities["playerMinutes"];

/** verified = observed in our own saved data; documented = provider docs; unverified = secondhand or inferred. */
export type Evidence = "verified" | "documented" | "unverified";

export interface PlayerStatSupport {
  pts: boolean;
  reb: boolean;
  ast: boolean;
  /** null = the source does not document a minutes field. */
  minutes: MinutesPrecision | null;
  /** rows = players who did not play appear (zero minutes); absent = no row; unknown = not established. */
  dnp: "rows" | "absent" | "unknown";
}

export interface SourceOffering {
  tier: "free" | "paid";
  label: string;
  /** null = price not published or not verified; never treated as $0. */
  monthlyUsd: number | null;
  /** First covered season, e.g. "2022-23". null = depth not established. */
  firstSeason: string | null;
  /** Last covered season, or "current" when the offering serves the live season. */
  lastSeason: string | "current";
  /** null = no documented per-game player statistics. */
  playerStats: PlayerStatSupport | null;
  /** Registered quota account (must exist in PROVIDER_ACCOUNTS). */
  quotaAccountId: string | null;
  /** Account to register before this offering can be enabled. */
  plannedQuotaAccountId: string | null;
  evidence: Evidence;
  notes: string;
}

/**
 * live-api: metered HTTP API (needs a quota account). static-dataset: files we
 * would download (no quota, still license-gated). origin-only: we never retrieve
 * from it; it matters only as the origin of redistributed data.
 */
export type SourceAccess = "live-api" | "static-dataset" | "origin-only" | "synthetic";

export interface SourceProfile {
  sourceId: NbaSourceId;
  label: string;
  access: SourceAccess;
  /** Where the data originates when this source only redistributes it. */
  origin: NbaSourceId | null;
  /** License of the redistributing code/repo. Says nothing about the data. */
  codeLicense: string | null;
  offerings: readonly SourceOffering[];
}

const FULL = { pts: true, reb: true, ast: true } as const;

export const SOURCE_PROFILES: Readonly<Record<NbaSourceId, SourceProfile>> = Object.freeze({
  "stats.nba.com": {
    sourceId: "stats.nba.com",
    label: "NBA.com stats endpoints",
    access: "origin-only",
    origin: null,
    codeLicense: null,
    offerings: [],
  },
  espn: {
    sourceId: "espn",
    label: "ESPN site data",
    access: "origin-only",
    origin: null,
    codeLicense: null,
    offerings: [],
  },
  "hoopr-espn": {
    sourceId: "hoopr-espn",
    label: "sportsdataverse hoopR-nba-data (ESPN-derived release files)",
    access: "static-dataset",
    origin: "espn",
    codeLicense: "code open source; license file not read (repository page showed none)",
    offerings: [
      {
        tier: "free",
        label: "GitHub release files, daily workflow",
        monthlyUsd: 0,
        firstSeason: "2001-02",
        lastSeason: "current",
        playerStats: { ...FULL, minutes: "whole-minutes", dnp: "unknown" },
        quotaAccountId: null,
        plannedQuotaAccountId: null,
        evidence: "unverified",
        notes:
          "Repo says 'hoopR NBA Data 2002 - Present'; player box scores in the espn_nba_player_boxscores release (79 assets), last published 2026-08-26. Column names (minutes, did_not_play) and the first season's convention could not be read this session.",
      },
    ],
  },
  "llimllib-nba-data": {
    sourceId: "llimllib-nba-data",
    label: "llimllib/nba_data (parquet dumps)",
    access: "static-dataset",
    origin: "stats.nba.com",
    codeLicense: "none stated",
    offerings: [
      {
        tier: "free",
        label: "Per-season parquet files, refreshed every 4 hours",
        monthlyUsd: 0,
        firstSeason: "2009-10",
        lastSeason: "current",
        playerStats: null,
        quotaAccountId: null,
        plannedQuotaAccountId: null,
        evidence: "documented",
        notes: "README documents game logs and player season stats; minutes are not mentioned, and the NBA tables come from stats.nba.com.",
      },
    ],
  },
  thesportsdb: {
    sourceId: "thesportsdb",
    label: "TheSportsDB",
    access: "live-api",
    origin: null,
    codeLicense: null,
    offerings: [
      {
        tier: "free",
        label: "Free v1 key",
        monthlyUsd: 0,
        firstSeason: null,
        lastSeason: "current",
        playerStats: null,
        quotaAccountId: null,
        plannedQuotaAccountId: null,
        evidence: "documented",
        notes: "30 requests/min. Docs list event and player-statistics lookups but no per-game box score or NBA coverage.",
      },
    ],
  },
  sportsdataio: {
    sourceId: "sportsdataio",
    label: "SportsDataIO",
    access: "live-api",
    origin: null,
    codeLicense: null,
    offerings: [
      {
        tier: "paid",
        label: "Commercial license (quoted per client)",
        monthlyUsd: null,
        firstSeason: null,
        lastSeason: "current",
        playerStats: { ...FULL, minutes: "whole-minutes", dnp: "unknown" },
        quotaAccountId: null,
        plannedQuotaAccountId: "sportsdataio:paid",
        evidence: "unverified",
        notes: "Free trial returns scrambled data and may not be used for analysis.",
      },
    ],
  },
  balldontlie: {
    sourceId: "balldontlie",
    label: "BALLDONTLIE",
    access: "live-api",
    origin: null,
    codeLicense: null,
    offerings: [
      {
        tier: "free",
        label: "Free (teams, players, games only)",
        monthlyUsd: 0,
        firstSeason: null,
        lastSeason: "current",
        playerStats: null,
        quotaAccountId: "balldontlie:free",
        plannedQuotaAccountId: null,
        evidence: "documented",
        notes: "5 requests/min; game player stats are not on the free tier.",
      },
      {
        tier: "paid",
        label: "ALL-STAR",
        monthlyUsd: 9.99,
        firstSeason: null,
        lastSeason: "current",
        playerStats: { ...FULL, minutes: "whole-minutes", dnp: "unknown" },
        quotaAccountId: null,
        plannedQuotaAccountId: "balldontlie:all-star",
        evidence: "documented",
        notes: "60 requests/min, cursor pagination up to 100 rows; stats endpoint start year not stated; no DNP indicator documented.",
      },
    ],
  },
  "api-sports-nba": {
    sourceId: "api-sports-nba",
    label: "API-NBA (api-sports.io, direct)",
    access: "live-api",
    origin: null,
    codeLicense: null,
    offerings: [
      {
        tier: "free",
        label: "Free plan (100/day, 10/min)",
        monthlyUsd: 0,
        firstSeason: "2022-23",
        lastSeason: "2024-25",
        playerStats: { ...FULL, minutes: "whole-minutes", dnp: "rows" },
        quotaAccountId: "api-sports:nba",
        plannedQuotaAccountId: null,
        evidence: "verified",
        notes: "Phase 3C probe: season ids 2022-2024 only; complete and internally consistent; zero-minute DNP rows present, inactive players absent, no DNP reason.",
      },
      {
        tier: "paid",
        label: "Pro",
        monthlyUsd: 15,
        firstSeason: "2015-16",
        lastSeason: "current",
        playerStats: { ...FULL, minutes: "whole-minutes", dnp: "rows" },
        quotaAccountId: null,
        plannedQuotaAccountId: "api-sports:nba-pro",
        evidence: "unverified",
        notes: "Price and 5,000/day from a RapidAPI listing, not the direct pricing page; current-season access unverified.",
      },
    ],
  },
  synthetic: {
    sourceId: "synthetic",
    label: "Synthetic test data",
    access: "synthetic",
    origin: null,
    codeLicense: null,
    offerings: [
      {
        tier: "free",
        label: "Generated",
        monthlyUsd: 0,
        firstSeason: "2000-01",
        lastSeason: "current",
        playerStats: { ...FULL, minutes: "decimal", dnp: "rows" },
        quotaAccountId: null,
        plannedQuotaAccountId: null,
        evidence: "verified",
        notes: "Invented ids and values.",
      },
    ],
  },
});

export interface EffectiveLicense {
  permittedUses: readonly DataUse[];
  /** The source, then each origin whose record also applied. */
  chain: readonly NbaSourceId[];
}

/**
 * Uses permitted for a source's data: its own record intersected with every
 * origin's. A mirror, wrapper or dump can never grant more than the data's
 * owner did, whatever its code license says.
 */
export function effectivePermittedUses(
  sourceId: NbaSourceId,
  licenses: Readonly<Record<NbaSourceId, SourceLicense>> = SOURCE_LICENSES,
  profiles: Readonly<Record<NbaSourceId, SourceProfile>> = SOURCE_PROFILES,
): EffectiveLicense {
  const chain: NbaSourceId[] = [];
  let allowed: readonly DataUse[] = DATA_USES;
  for (let current: NbaSourceId | null = sourceId; current !== null && !chain.includes(current); current = profiles[current]?.origin ?? null) {
    chain.push(current);
    const permitted = licenses[current].permittedUses;
    allowed = allowed.filter((use) => permitted.includes(use));
  }
  return { permittedUses: allowed, chain };
}

export interface RegistryIssue {
  code: "unknown_quota_account" | "live_api_without_quota_account" | "unknown_origin" | "origin_cycle" | "static_dataset_without_origin";
  sourceId: NbaSourceId;
  message: string;
}

/** Static checks over the profiles. Quota enforcement is mandatory for every live API that can deliver player stats. */
export function validateSourceRegistry(
  profiles: Readonly<Record<NbaSourceId, SourceProfile>>,
  quotaAccountIds: ReadonlySet<string>,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  for (const profile of Object.values(profiles)) {
    if (profile.origin !== null && !profiles[profile.origin]) {
      issues.push({ code: "unknown_origin", sourceId: profile.sourceId, message: `${profile.sourceId} names unknown origin ${profile.origin}` });
    }
    // A redistributor with no declared origin silently loses the origin cap on its license.
    if (profile.access === "static-dataset" && profile.origin === null) {
      issues.push({ code: "static_dataset_without_origin", sourceId: profile.sourceId, message: `${profile.sourceId} is a static dataset with no declared origin` });
    }
    const seen = new Set<NbaSourceId>([profile.sourceId]);
    for (let next = profile.origin; next !== null && profiles[next]; next = profiles[next].origin) {
      if (seen.has(next)) {
        issues.push({ code: "origin_cycle", sourceId: profile.sourceId, message: `${profile.sourceId} has a cyclic origin chain through ${next}` });
        break;
      }
      seen.add(next);
    }
    for (const offering of profile.offerings) {
      if (offering.quotaAccountId !== null && !quotaAccountIds.has(offering.quotaAccountId)) {
        issues.push({ code: "unknown_quota_account", sourceId: profile.sourceId, message: `${profile.sourceId} ${offering.tier} offering cites unregistered quota account ${offering.quotaAccountId}` });
      }
      if (profile.access === "live-api" && offering.playerStats && offering.quotaAccountId === null && offering.plannedQuotaAccountId === null) {
        issues.push({ code: "live_api_without_quota_account", sourceId: profile.sourceId, message: `${profile.sourceId} ${offering.tier} offering delivers player stats over a live API with no quota account` });
      }
    }
  }
  return issues;
}
