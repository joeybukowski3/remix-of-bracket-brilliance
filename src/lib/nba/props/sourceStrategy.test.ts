/**
 * Phase 3E: free-first provider strategy. Synthetic data only; no network.
 */
import { describe, expect, it } from "vitest";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { buildDataset, type NormalizedSnapshot } from "./dataset";
import { canonicalGameKey, canonicalTeamCode, canonicalizePlayerGames, compareSources, etGameDate, linkPlayers, resolvePlayer, type PlayerLink } from "./canonical";
import { SOURCE_LICENSES } from "./sources/licenses";
import { effectivePermittedUses, SOURCE_PROFILES, validateSourceRegistry } from "./sources/registry";
import { assessSourceQuality } from "./sources/qualityGate";
import { planSourceCoverage } from "./sources/selection";
import { DATA_USES, type NbaSourceAdapter, type NbaSourceId, type SourceLicense } from "./sources/types";
import { normalizePayloads, SourceUseNotPermittedError } from "./sources/ingest";
import { syntheticSourceAdapter } from "./__fixtures__/syntheticSource";
import type { NbaPlayerGame, NbaTeamGame } from "./types";

const ACCOUNT_IDS = new Set(PROVIDER_ACCOUNTS.map((a) => a.accountId));
const grant = (uses: SourceLicense["permittedUses"]): SourceLicense => ({ status: "commercial-licensed", permittedUses: uses, basis: "synthetic test grant", reviewedOn: "2026-10-18" });

describe("source license records", () => {
  it("treats every real third-party source as unusable until a verified grant is recorded, except the owner's private-research decision for hoopR/ESPN", () => {
    const real: NbaSourceId[] = ["stats.nba.com", "llimllib-nba-data", "thesportsdb", "sportsdataio", "balldontlie", "api-sports-nba"];
    for (const id of real) expect(SOURCE_LICENSES[id].permittedUses).toEqual([]);
    expect(SOURCE_LICENSES.synthetic.permittedUses).toEqual([...DATA_USES]);
  });

  it("records hoopR/ESPN as private-research plus private-hosted, as owner-provided authorization that is not ESPN's or SportsDataverse's license", () => {
    for (const id of ["espn", "hoopr-espn"] as const) {
      expect(SOURCE_LICENSES[id].permittedUses).toEqual(["private-research", "private-hosted"]);
      expect(SOURCE_LICENSES[id].status).toBe("unlicensed");
      expect(SOURCE_LICENSES[id].basis).toMatch(/OWNER DECISION 2026-10-23/);
      expect(SOURCE_LICENSES[id].basis).toMatch(/OWNER AUTHORIZATION 2026-10-29/);
      expect(SOURCE_LICENSES[id].basis).toMatch(/owner-provided/);
      expect(SOURCE_LICENSES[id].basis).toMatch(/no ESPN or SportsDataverse license/);
    }
    expect(effectivePermittedUses("hoopr-espn").permittedUses).toEqual(["private-research", "private-hosted"]);
    for (const use of ["model-development", "public-display", "raw-redistribution"] as const) expect(effectivePermittedUses("hoopr-espn").permittedUses).not.toContain(use);
  });

  it("keeps raw redistribution a separate use from public derived display", () => {
    expect(DATA_USES).toContain("raw-redistribution");
    expect(DATA_USES).toContain("public-display");
  });

  it("caps a mirror at what its origin permits, however the mirror is licensed", () => {
    const licenses = { ...SOURCE_LICENSES, "hoopr-espn": grant(["private-research", "model-development", "public-display"]) };
    expect(effectivePermittedUses("hoopr-espn", licenses)).toEqual({ permittedUses: ["private-research"], chain: ["hoopr-espn", "espn"] });
    expect(effectivePermittedUses("hoopr-espn").permittedUses).toEqual(["private-research", "private-hosted"]);
    expect(effectivePermittedUses("llimllib-nba-data", { ...SOURCE_LICENSES, "llimllib-nba-data": grant(["model-development"]) }).permittedUses).toEqual([]);
  });

  it("terminates on a cyclic origin chain and still intersects every record on it", () => {
    const profiles = { ...SOURCE_PROFILES, espn: { ...SOURCE_PROFILES.espn, origin: "hoopr-espn" as NbaSourceId } };
    const licenses = { ...SOURCE_LICENSES, "hoopr-espn": grant(["private-research", "model-development"]), espn: grant(["private-research"]) };
    expect(effectivePermittedUses("hoopr-espn", licenses, profiles)).toEqual({ permittedUses: ["private-research"], chain: ["hoopr-espn", "espn"] });
    expect(validateSourceRegistry(profiles, ACCOUNT_IDS).map((i) => i.code)).toContain("origin_cycle");
  });

  it("flags a static dataset that declares no origin, since that silently drops the origin cap", () => {
    const profiles = { ...SOURCE_PROFILES, "hoopr-espn": { ...SOURCE_PROFILES["hoopr-espn"], origin: null } };
    expect(validateSourceRegistry(profiles, ACCOUNT_IDS).map((i) => i.code)).toContain("static_dataset_without_origin");
  });
});

describe("ingestion gate honors the origin cap", () => {
  const mirror = (own: SourceLicense, sourceId: NbaSourceId = "hoopr-espn"): NbaSourceAdapter => ({ ...syntheticSourceAdapter, sourceId, license: own });

  it("refuses a redistributor whose own record grants a use its origin does not", () => {
    const adapter = mirror(grant(["private-research", "model-development", "public-display"]));
    expect(() => normalizePayloads(adapter, [], "model-development")).toThrow(SourceUseNotPermittedError);
    expect(() => normalizePayloads(adapter, [], "public-display")).toThrow(/hoopr-espn -> espn/);
    expect(normalizePayloads(adapter, [], "private-research")).toEqual([]);
  });

  it("permits only private-research for the recorded hoopR/ESPN adapter, and refuses every wider use", () => {
    expect(normalizePayloads(mirror(SOURCE_LICENSES["hoopr-espn"]), [], "private-research")).toEqual([]);
    for (const use of ["model-development", "public-display", "raw-redistribution"] as const) {
      expect(() => normalizePayloads(mirror(SOURCE_LICENSES["hoopr-espn"]), [], use)).toThrow(SourceUseNotPermittedError);
    }
  });

  it("keeps the existing behavior for sources without an origin", () => {
    expect(normalizePayloads(syntheticSourceAdapter, [], "model-development")).toEqual([]);
  });

  it("lets neither the adapter's copy nor the registry widen the other", () => {
    const own = grant(["model-development"]);
    const adapter = mirror(own, "api-sports-nba");
    // Adapter claims a grant, registry has none: refused.
    expect(() => normalizePayloads(adapter, [], "model-development")).toThrow(SourceUseNotPermittedError);
    // Registry grants, adapter's copy does not: refused.
    const registry = { ...SOURCE_LICENSES, "api-sports-nba": own };
    expect(() => normalizePayloads(mirror(SOURCE_LICENSES["api-sports-nba"], "api-sports-nba"), [], "model-development", registry)).toThrow(SourceUseNotPermittedError);
    // Both grant: allowed.
    expect(normalizePayloads(adapter, [], "model-development", registry)).toEqual([]);
  });
});

describe("source registry", () => {
  it("references only registered quota accounts", () => {
    expect(validateSourceRegistry(SOURCE_PROFILES, ACCOUNT_IDS)).toEqual([]);
  });

  it("flags a typo in a registered quota account id", () => {
    const profile = SOURCE_PROFILES["api-sports-nba"];
    const profiles = { ...SOURCE_PROFILES, "api-sports-nba": { ...profile, offerings: profile.offerings.map((o) => (o.quotaAccountId ? { ...o, quotaAccountId: "api-sports:nbaa" } : o)) } };
    expect(validateSourceRegistry(profiles, ACCOUNT_IDS).map((i) => i.code)).toContain("unknown_quota_account");
  });

  it("flags a live API offering that delivers player stats but has no registered or planned quota account", () => {
    const profile = SOURCE_PROFILES["api-sports-nba"];
    const profiles = { ...SOURCE_PROFILES, "api-sports-nba": { ...profile, offerings: profile.offerings.map((o) => ({ ...o, quotaAccountId: null, plannedQuotaAccountId: null })) } };
    expect(validateSourceRegistry(profiles, ACCOUNT_IDS).map((i) => i.code)).toContain("live_api_without_quota_account");
  });
});

describe("provider selection", () => {
  const request = { use: "model-development", seasons: ["2022-23", "2024-25", "2026-27"], currentSeason: "2026-27", quotaAccountIds: ACCOUNT_IDS } as const;

  it("selects nothing today: no real source has a verified grant", () => {
    const plan = planSourceCoverage(request);
    expect(plan.assignments.every((a) => a.chosen === null)).toBe(true);
    expect(plan.unmetSeasons).toEqual(["2022-23", "2024-25", "2026-27"]);
    expect(plan.assignments[0].blockers.map((b) => b.category)).toContain("license");
  });

  it("never lets coverage, price or quota override a missing license", () => {
    const plan = planSourceCoverage({ ...request, maxMonthlyUsd: 1000 });
    expect(plan.unmetSeasons).toEqual(request.seasons);
    expect(plan.assignments.flatMap((a) => (a.chosen ? [a.chosen.sourceId] : []))).toEqual([]);
  });

  it("assigns the free source for the seasons it covers once a grant exists", () => {
    const licenses = { ...SOURCE_LICENSES, "api-sports-nba": grant(["private-research", "model-development"]) };
    const plan = planSourceCoverage({ ...request, licenses });
    expect(plan.assignments.map((a) => a.chosen?.sourceId ?? null)).toEqual(["api-sports-nba", "api-sports-nba", null]);
    expect(plan.unmetSeasons).toEqual(["2026-27"]);
    const gap = plan.assignments[2].blockers.map((b) => b.category);
    expect(gap).toEqual(expect.arrayContaining(["coverage"]));
  });

  it("migrates free to paid by registry and license entries alone", () => {
    const licenses = {
      ...SOURCE_LICENSES,
      "api-sports-nba": grant(["private-research", "model-development"]),
      balldontlie: grant(["private-research", "model-development"]),
    };
    const freeOnly = planSourceCoverage({ ...request, licenses });
    expect(freeOnly.unmetSeasons).toEqual(["2026-27"]);
    // A paid offering needs a budget AND its own registered quota account.
    const noAccount = planSourceCoverage({ ...request, licenses, maxMonthlyUsd: 10 });
    expect(noAccount.unmetSeasons).toEqual(["2026-27"]);
    expect(noAccount.assignments[2].blockers.map((b) => b.category)).toContain("quota");
    const withAccount = planSourceCoverage({ ...request, licenses, maxMonthlyUsd: 10, quotaAccountIds: new Set([...ACCOUNT_IDS, "balldontlie:all-star"]) });
    expect(withAccount.assignments[2].chosen).toMatchObject({ sourceId: "balldontlie", tier: "paid", monthlyUsd: 9.99 });
    expect(withAccount.assignments[0].chosen?.sourceId).toBe("api-sports-nba");
  });

  it("prefers a permitted free offering over a permitted paid one, then better evidence", () => {
    const licenses = {
      ...SOURCE_LICENSES,
      "api-sports-nba": grant(["model-development"]),
      balldontlie: grant(["model-development"]),
      "hoopr-espn": grant(["model-development"]),
      espn: grant(["model-development"]),
    };
    const accounts = new Set([...ACCOUNT_IDS, "balldontlie:all-star"]);
    const plan = planSourceCoverage({ ...request, seasons: ["2026-27", "2024-25"], licenses, maxMonthlyUsd: 100, quotaAccountIds: accounts });
    // 2026-27: the free dataset (unverified evidence) beats every paid API.
    expect(plan.assignments[0].chosen?.sourceId).toBe("hoopr-espn");
    expect(plan.assignments[0].alternatives.map((c) => c.sourceId)).toContain("balldontlie");
    // 2024-25: two free offerings; verified evidence wins over unverified.
    expect(plan.assignments[1].chosen?.sourceId).toBe("api-sports-nba");
    expect(plan.assignments[1].alternatives.map((c) => c.sourceId)).toEqual(["hoopr-espn"]);
  });

  it("rejects malformed seasons and budgets instead of treating them as covered", () => {
    expect(() => planSourceCoverage({ ...request, seasons: ["2024"] })).toThrow(/season/);
    expect(() => planSourceCoverage({ ...request, currentSeason: "next" })).toThrow(/season/);
    expect(() => planSourceCoverage({ ...request, maxMonthlyUsd: Number.NaN })).toThrow(/budget/);
  });

  it("keeps synthetic data out of real plans unless asked", () => {
    const licenses = { ...SOURCE_LICENSES, synthetic: grant(["model-development"]) };
    expect(planSourceCoverage({ ...request, licenses, seasons: ["2024-25"] }).unmetSeasons).toEqual(["2024-25"]);
    expect(planSourceCoverage({ ...request, licenses, seasons: ["2024-25"], allowSynthetic: true }).assignments[0].chosen?.sourceId).toBe("synthetic");
  });

  it("refuses a source that lacks the needed use even if another use is granted", () => {
    const licenses = { ...SOURCE_LICENSES, "api-sports-nba": grant(["private-research"]) };
    expect(planSourceCoverage({ ...request, licenses, use: "model-development" }).unmetSeasons).toEqual(request.seasons);
    expect(planSourceCoverage({ ...request, licenses, use: "private-research", seasons: ["2024-25"] }).unmetSeasons).toEqual([]);
  });

  it("rejects offerings that cannot deliver minutes, points, rebounds and assists", () => {
    const licenses = { ...SOURCE_LICENSES, thesportsdb: grant(["model-development"]) };
    const plan = planSourceCoverage({ ...request, licenses, seasons: ["2024-25"] });
    expect(plan.assignments[0].chosen).toBeNull();
    expect(plan.assignments[0].blockers.filter((b) => b.sourceId === "thesportsdb").map((b) => b.category)).toContain("fields");
  });
});

describe("canonical identifiers", () => {
  it("maps current-era franchise codes and refuses to guess unknown ones", () => {
    expect(["PHO", "BRK", "GS", "NO", "SA", "WSH", "UTAH", "CHO"].map(canonicalTeamCode)).toEqual(["PHX", "BKN", "GSW", "NOP", "SAS", "WAS", "UTA", "CHA"]);
    expect(canonicalTeamCode("XYZ")).toBeNull();
  });

  it("converts instants to the Eastern calendar date so sources agree across the UTC boundary", () => {
    expect(etGameDate("2024-01-16T03:30:00Z")).toBe("2024-01-15");
    expect(etGameDate("2024-01-15T18:00:00Z")).toBe("2024-01-15");
    expect(etGameDate("2024-07-01T02:00:00Z")).toBe("2024-06-30");
  });

  it("refuses instants without an explicit offset rather than guessing a timezone", () => {
    expect(() => etGameDate("2024-01-15")).toThrow(/offset/);
    expect(() => etGameDate("2024-01-15T20:00:00")).toThrow(/offset/);
    expect(etGameDate("2024-01-16T03:30:00+00:00")).toBe("2024-01-15");
    expect(etGameDate("2024-01-15T22:30:00-05:00")).toBe("2024-01-15");
  });

  it("builds one game key regardless of source team-code spelling", () => {
    expect(canonicalGameKey({ gameDate: "2025-01-10", homeCode: "PHO", awayCode: "GS" })).toBe("2025-01-10|GSW@PHX");
    expect(canonicalGameKey({ gameDate: "2025-01-10", homeCode: "PHX", awayCode: "GSW" })).toBe("2025-01-10|GSW@PHX");
    expect(canonicalGameKey({ gameDate: "2025-01-10", homeCode: null, awayCode: null, neutralCodes: ["PHX", "GS"] })).toBe("2025-01-10|GSW-PHX");
    expect(canonicalGameKey({ gameDate: "2025-01-10", homeCode: "PHX", awayCode: "ZZZ" })).toBeNull();
  });

  it("links player ids across sources and reports conflicts instead of overwriting", () => {
    const base: PlayerLink[] = [{ sourceId: "synthetic", nativeId: "9001", canonicalId: "p:0001", evidence: "synthetic" }];
    const ok = linkPlayers(base, [{ sourceId: "balldontlie", nativeId: "77", canonicalId: "p:0001", evidence: "synthetic" }]);
    expect(ok.conflicts).toEqual([]);
    expect(resolvePlayer(ok.links, "balldontlie", "77")).toBe("p:0001");
    const clash = linkPlayers(ok.links, [
      { sourceId: "synthetic", nativeId: "9001", canonicalId: "p:0002", evidence: "synthetic" },
      { sourceId: "balldontlie", nativeId: "78", canonicalId: "p:0001", evidence: "synthetic" },
    ]);
    expect(clash.conflicts.map((c) => c.code)).toEqual(["native_id_relinked", "canonical_id_duplicated_in_source"]);
    expect(clash.links).toEqual(ok.links);
    expect(resolvePlayer(clash.links, "synthetic", "404")).toBeNull();
  });
});

function playerRow(over: Partial<NbaPlayerGame> = {}): NbaPlayerGame {
  return {
    schemaVersion: "nba-player-game-v1", gameId: "G1", gameDate: "2025-01-10", season: "2024-25", seasonType: "regular", teamId: 1, teamAbbr: "PHO", opponentTeamId: 2, opponentAbbr: "GS", isHome: true,
    sourceSnapshotId: "s1", playerId: 9001, playerName: "Synthetic One", minutes: 30, pts: 20, reb: 5, ast: 4, oreb: 1, dreb: 4, fgm: 8, fga: 16, fg3m: 2, fg3a: 5, ftm: 2, fta: 2, stl: 1, blk: 0, tov: 2, pf: 3, plusMinus: 3, ...over,
  };
}

describe("cross-source canonicalization and comparison", () => {
  const links: PlayerLink[] = [
    { sourceId: "synthetic", nativeId: "9001", canonicalId: "p:0001", evidence: "synthetic" },
    { sourceId: "balldontlie", nativeId: "77", canonicalId: "p:0001", evidence: "synthetic" },
  ];

  it("canonicalizes rows and reports unmapped players and unknown teams", () => {
    const rows = [playerRow(), playerRow({ playerId: 9999 }), playerRow({ playerId: 9001, gameId: "G2", opponentAbbr: "ZZZ" })];
    const result = canonicalizePlayerGames(rows, "synthetic", links);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ canonicalGameKey: "2025-01-10|GSW@PHX", canonicalPlayerId: "p:0001", sourceGameId: "G1", minutes: 30 });
    expect(result.unmappedPlayerIds).toEqual(["9999"]);
    expect(result.unresolvedGames).toEqual(["G2"]);
  });

  it("measures agreement between two providers on the same canonical game", () => {
    const a = canonicalizePlayerGames([playerRow()], "synthetic", links).rows;
    const b = canonicalizePlayerGames([playerRow({ playerId: 77, gameId: "9", teamAbbr: "PHX", opponentAbbr: "GSW", minutes: 31, pts: 21 })], "balldontlie", links).rows;
    const report = compareSources(a, b, { minutesTolerance: 1 });
    expect(report).toMatchObject({ sharedPlayerGames: 1, onlyInA: 0, onlyInB: 0, mismatches: { pts: 1, reb: 0, ast: 0, minutes: 0 } });
    expect(report.agreementRate).toBe(0);
    const same = compareSources(a, a, { minutesTolerance: 0 });
    expect(same.agreementRate).toBe(1);
  });
});

function syntheticDataset(over: { minutes?: number; snapshotId?: string; games?: number } = {}) {
  const games = over.games ?? 2;
  const playerRows: NbaPlayerGame[] = [];
  const teamRows: NbaTeamGame[] = [];
  for (let g = 1; g <= games; g += 1) {
    for (const [teamId, abbr, opp, home] of [[1, "PHX", "GSW", true], [2, "GSW", "PHX", false]] as const) {
      const base = { gameId: `G${g}`, gameDate: `2025-01-${String(10 + g).padStart(2, "0")}`, teamId, teamAbbr: abbr, opponentAbbr: opp, isHome: home, sourceSnapshotId: over.snapshotId ?? "s1" };
      const fields = { season: "2024-25", seasonType: "regular" as const, opponentTeamId: teamId === 1 ? 2 : 1 };
      for (let p = 0; p < 5; p += 1) playerRows.push(playerRow({ ...base, ...fields, playerId: teamId * 100 + p, playerName: `P${teamId}${p}`, minutes: over.minutes ?? 48, pts: 20, reb: 5, ast: 4 }));
      teamRows.push({
        schemaVersion: "nba-team-game-v1", ...base, ...fields, minutes: 240, won: home, pts: 100, reb: 25, ast: 20, oreb: 5, dreb: 20, fgm: 40, fga: 80, fg3m: 10, fg3a: 25, ftm: 10, fta: 12, stl: 5, blk: 3, tov: 10, pf: 15, plusMinus: 0,
      });
    }
  }
  const snapshot: NormalizedSnapshot = { meta: { snapshotId: "s1", endpoint: "synthetic", season: "2024-25", seasonType: "regular", retrievedAtUtc: "2026-10-18T00:00:00Z", sourceId: "synthetic" }, playerRows, teamRows, issues: [] };
  return buildDataset([snapshot]);
}

describe("source acceptance gate", () => {
  const offering = SOURCE_PROFILES["api-sports-nba"].offerings[0];
  const expectations = { "2024-25": { regular: { games: 2 } } };

  it("passes a clean synthetic dataset whose minutes match the declared precision", () => {
    const report = assessSourceQuality(syntheticDataset(), offering, expectations);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("flags fractional minutes from a source declared as whole-minute", () => {
    const report = assessSourceQuality(syntheticDataset({ minutes: 47.5 }), offering, expectations);
    expect(report.findings.map((f) => f.code)).toContain("minutes_precision_mismatch");
  });

  it("fails coverage below the expected games and rows that cite an unknown snapshot", () => {
    const short = assessSourceQuality(syntheticDataset({ games: 1 }), offering, { "2024-25": { regular: { games: 2 } } });
    expect(short.passed).toBe(false);
    expect(short.findings.map((f) => f.code)).toContain("incomplete_coverage");
    const dataset = syntheticDataset();
    const orphan = { ...dataset, playerGames: dataset.playerGames.map((row, i) => (i === 0 ? { ...row, sourceSnapshotId: "ghost" } : row)) };
    expect(assessSourceQuality(orphan, offering, expectations).findings.map((f) => f.code)).toContain("provenance_unknown_snapshot");
  });

  it("fails an expected season that is missing entirely, including from an empty dataset", () => {
    const empty = buildDataset([]);
    const report = assessSourceQuality(empty, offering, expectations);
    expect(report.passed).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("incomplete_coverage");
    expect(assessSourceQuality(syntheticDataset(), offering, { "2023-24": { regular: { games: 2 } } }).passed).toBe(false);
  });

  it("measures games with player rows, not team rows", () => {
    const dataset = syntheticDataset();
    const teamOnly = { ...dataset, coverage: dataset.coverage.map((row) => ({ ...row, gamesWithPlayerRows: 0 })) };
    const report = assessSourceQuality(teamOnly, offering, expectations);
    expect(report.passed).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("incomplete_coverage");
  });
});
