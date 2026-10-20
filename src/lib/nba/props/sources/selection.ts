/**
 * Provider selection: for each season, which authorized source supplies
 * player-game points, rebounds, assists and minutes, free-first.
 *
 * Order of gates, none of which can be traded against another:
 *   access -> license (effective, origin-capped) -> fields -> coverage -> quota -> cost.
 * A source that fails any gate is reported with its reason, never silently
 * skipped, so "why not provider X" is always answerable. Pure; no network.
 */
import { SOURCE_LICENSES } from "./licenses";
import { effectivePermittedUses, SOURCE_PROFILES, type Evidence, type SourceOffering, type SourceProfile } from "./registry";
import type { DataUse, NbaSourceId, SourceLicense } from "./types";

export type BlockerCategory = "access" | "license" | "fields" | "coverage" | "quota" | "cost";

export interface Blocker {
  sourceId: NbaSourceId;
  tier: SourceOffering["tier"];
  category: BlockerCategory;
  reason: string;
}

export interface Choice {
  sourceId: NbaSourceId;
  tier: SourceOffering["tier"];
  monthlyUsd: number | null;
  evidence: Evidence;
  quotaAccountId: string | null;
}

export interface SeasonAssignment {
  season: string;
  chosen: Choice | null;
  /** Other eligible offerings, best first. */
  alternatives: Choice[];
  blockers: Blocker[];
}

export interface CoveragePlan {
  assignments: SeasonAssignment[];
  unmetSeasons: string[];
}

export interface CoverageRequest {
  use: DataUse;
  seasons: readonly string[];
  /** The season in progress, e.g. "2026-27". */
  currentSeason: string;
  /** Accounts registered with the quota manager. A live API offering needs one before it can be selected. */
  quotaAccountIds: ReadonlySet<string>;
  /** Monthly budget in USD. Default 0 (free only). */
  maxMonthlyUsd?: number;
  allowSynthetic?: boolean;
  licenses?: Readonly<Record<NbaSourceId, SourceLicense>>;
  profiles?: Readonly<Record<NbaSourceId, SourceProfile>>;
}

const startYear = (season: string): number => Number.parseInt(season.slice(0, 4), 10);
const EVIDENCE_RANK: Record<Evidence, number> = { verified: 0, documented: 1, unverified: 2 };

function coverageBlocker(offering: SourceOffering, season: string, currentSeason: string): string | null {
  const wanted = startYear(season);
  const isCurrent = season === currentSeason;
  if (offering.lastSeason === "current") {
    if (wanted > startYear(currentSeason)) return `${season} is after the current season`;
  } else if (wanted > startYear(offering.lastSeason)) {
    return `offering ends at ${offering.lastSeason}; ${season} is not available`;
  }
  // An unknown start year cannot be assumed to reach back; the live season is served by definition.
  if (offering.firstSeason === null) return isCurrent && offering.lastSeason === "current" ? null : `historical depth for ${season} is not established`;
  return wanted < startYear(offering.firstSeason) ? `offering starts at ${offering.firstSeason}` : null;
}

function evaluate(profile: SourceProfile, offering: SourceOffering, season: string, request: CoverageRequest, licenses: Readonly<Record<NbaSourceId, SourceLicense>>): { choice: Choice } | { blocker: Blocker } {
  const block = (category: BlockerCategory, reason: string) => ({ blocker: { sourceId: profile.sourceId, tier: offering.tier, category, reason } });
  if (profile.access === "origin-only") return block("access", "origin-only source; we do not retrieve from it");
  if (profile.access === "synthetic" && !request.allowSynthetic) return block("access", "synthetic data is excluded from real research plans");
  const effective = effectivePermittedUses(profile.sourceId, licenses, request.profiles ?? SOURCE_PROFILES);
  if (!effective.permittedUses.includes(request.use)) {
    return block("license", `"${request.use}" is not permitted (chain: ${effective.chain.join(" -> ")})`);
  }
  const stats = offering.playerStats;
  if (!stats || !stats.pts || !stats.reb || !stats.ast || stats.minutes === null) return block("fields", "does not deliver player-game points, rebounds, assists and minutes");
  const gap = coverageBlocker(offering, season, request.currentSeason);
  if (gap) return block("coverage", gap);
  const account = offering.quotaAccountId ?? offering.plannedQuotaAccountId;
  if (profile.access === "live-api" && (account === null || !request.quotaAccountIds.has(account))) {
    return block("quota", account === null ? "live API with no quota account" : `quota account ${account} is not registered`);
  }
  const budget = request.maxMonthlyUsd ?? 0;
  if (offering.monthlyUsd === null || offering.monthlyUsd > budget) {
    return block("cost", offering.monthlyUsd === null ? "price unknown" : `$${offering.monthlyUsd}/month exceeds the $${budget} budget`);
  }
  return { choice: { sourceId: profile.sourceId, tier: offering.tier, monthlyUsd: offering.monthlyUsd, evidence: offering.evidence, quotaAccountId: offering.quotaAccountId } };
}

const dnpRank = (choice: Choice, profiles: Readonly<Record<NbaSourceId, SourceProfile>>): number => {
  const offering = profiles[choice.sourceId].offerings.find((o) => o.tier === choice.tier);
  return offering?.playerStats?.dnp === "rows" ? 0 : 1;
};

const SEASON_PATTERN = /^\d{4}-\d{2}$/;

function assertValidRequest(request: CoverageRequest): void {
  for (const season of [request.currentSeason, ...request.seasons]) {
    if (!SEASON_PATTERN.test(season)) throw new Error(`Invalid season "${season}"; expected YYYY-YY`);
  }
  const budget = request.maxMonthlyUsd ?? 0;
  if (!Number.isFinite(budget) || budget < 0) throw new Error(`Invalid budget ${budget}`);
}

/**
 * The budget applies to each season's choice on its own; the plan does not
 * sum the monthly cost of different providers chosen for different seasons.
 */
export function planSourceCoverage(request: CoverageRequest): CoveragePlan {
  assertValidRequest(request);
  const licenses = request.licenses ?? SOURCE_LICENSES;
  const profiles = request.profiles ?? SOURCE_PROFILES;
  const assignments = request.seasons.map((season): SeasonAssignment => {
    const eligible: Choice[] = [];
    const blockers: Blocker[] = [];
    for (const profile of Object.values(profiles)) {
      for (const offering of profile.offerings) {
        const result = evaluate(profile, offering, season, { ...request, profiles }, licenses);
        if ("choice" in result) eligible.push(result.choice);
        else blockers.push(result.blocker);
      }
    }
    eligible.sort(
      (a, b) =>
        (a.monthlyUsd ?? Infinity) - (b.monthlyUsd ?? Infinity) ||
        EVIDENCE_RANK[a.evidence] - EVIDENCE_RANK[b.evidence] ||
        dnpRank(a, profiles) - dnpRank(b, profiles) ||
        a.sourceId.localeCompare(b.sourceId),
    );
    return { season, chosen: eligible[0] ?? null, alternatives: eligible.slice(1), blockers };
  });
  return { assignments, unmetSeasons: assignments.filter((a) => a.chosen === null).map((a) => a.season) };
}
