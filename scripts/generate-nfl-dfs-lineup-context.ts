/** Local-only downstream adapter. Reads committed sources; --output writes one artifact, --dry-run writes nothing. No network/archive/publishing. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { buildDepthChartIndex, parseDepthChartRows, lookupDepthChartEntry, depthRankOneCandidates, type NflDepthChartCsvRow } from "../src/lib/nfl/props/currentWeekDepthChart";
import { normalizeNflTeamAbbr, canonicalPlayerId } from "../src/lib/nfl/identity/identity";
import { normalizeFantasyAvailability } from "../src/lib/fantasy/weekly/availability";
import { weeklyFantasyProjectionProductionArtifactSchema } from "../src/lib/fantasy/weekly/projections/production/artifactContract";
import type { NflCurrentWeekProjectionArtifact } from "../src/lib/nfl/props/types/currentWeekProjection";
import type { InjuriesArtifact } from "../src/lib/nfl/injuryData";
import { buildCurrentRatingBoard } from "../src/lib/nfl/currentRating2026";
import { validateNflV03ReviewArtifact } from "../src/lib/nfl/v03Review";
import { validateNflV04ProjectionArtifact } from "../src/lib/nfl/v04Projection";
import { buildPublicProjectionBoard } from "../src/lib/nfl/publicProjection2026";
import { validateTeamPerformanceAnalyticsArtifact } from "../src/lib/nfl/teamPerformanceAnalytics";
import { matchupRankDifference } from "../src/lib/nfl/matchupEdges";
import { createTrenchResolver, resolveTrenchPeriods, type TrenchMetricsArtifact } from "../src/lib/nfl/trenchMetricsData";
import { deriveImpliedTeamTotals } from "../src/lib/fantasy/weekly/impliedTeamTotals";
import type { MarketArtifact } from "../src/lib/nfl/marketData";
import { teamTotalFor, type TeamTotalsArtifact } from "../src/lib/nfl/totalsProjectionData";
import type { NflGameRecord } from "../src/lib/nfl/standings";
import { lineupContextSchema, type DfsLineupContextArtifact } from "../src/lib/nfl/dfs/lineupContext";
import { isFreshDfsSource, type DfsRoleEvidence } from "../src/lib/nfl/dfs/roleContext";
import type { DstMatchupInput } from "../src/lib/nfl/dfs/dstMatchup";
import { DST_MATCHUP_V1 } from "../src/lib/nfl/dfs/policies/dstMatchupV1";
import { OPTIMIZER_ELIGIBILITY_V1 } from "../src/lib/nfl/dfs/policies/optimizerEligibilityV1";

const { values } = parseArgs({ options: { season: { type: "string", default: "2026" }, week: { type: "string", default: "1" }, "as-of": { type: "string" }, output: { type: "string" }, "dry-run": { type: "boolean" } } });
const season = Number(values.season), week = Number(values.week), asOf = values["as-of"] ?? new Date().toISOString();
if (season !== 2026 || !Number.isInteger(week) || week < 1 || week > 18 || !Number.isFinite(Date.parse(asOf))) throw new Error("Adapter requires 2026 and a valid week/as-of (current rating authority is 2026)");
if (!values.output && !values["dry-run"]) throw new Error("Specify --output or --dry-run");
const sources: DfsLineupContextArtifact["sources"] = [];
function read(path: string) { const text = readFileSync(path, "utf8"); sources.push({ path, sha256: createHash("sha256").update(text).digest("hex") }); return text; }
function json<T>(path: string): T { return JSON.parse(read(path)) as T; }
function csv<T>(path: string): T[] { const result = Papa.parse<T>(read(path), { header: true, skipEmptyLines: true }); if (result.errors.length) throw new Error(`Invalid CSV ${path}`); return result.data; }
const base = `public/data/nfl/${season}`;
const fantasy = weeklyFantasyProjectionProductionArtifactSchema.parse(json(`public/data/fantasy/projections/${season}/week-${String(week).padStart(2,"0")}.json`));
if (fantasy.season !== season || fantasy.week !== week || Date.parse(fantasy.generatedAt) > Date.parse(asOf)) throw new Error("Fantasy source target/as-of mismatch");
const yardage = json<NflCurrentWeekProjectionArtifact>(`${base}/yardage-projections.json`);
const yardageUsable = yardage.season === season && yardage.week === week && yardage.generationMode === "currentWeek" && Date.parse(yardage.generatedAt) <= Date.parse(asOf);
const depth = buildDepthChartIndex(parseDepthChartRows(csv<NflDepthChartCsvRow>(`data/nfl/nflverse/depth-charts/depth_charts_${season}.csv`)));
const roster = csv<Record<string,string>>(`data/nfl/nflverse/weekly-rosters/roster_weekly_${season}.csv`).filter(r => Number(r.season) === season && Number(r.week) === week && r.game_type === "REG");
const rosterMeta = json<{ files: { season: number; retrievedDateUtc: string }[] }>("data/nfl/nflverse/weekly-rosters/manifest.json").files.find(f => f.season === season);
// Date-only capture is disclosed; midnight is the conservative oldest possible observation that day.
const rosterAsOf = rosterMeta ? `${rosterMeta.retrievedDateUtc}T00:00:00Z` : null;
const injuries = json<InjuriesArtifact>("public/data/nfl/matchup-injuries.json");
const injuryCurrent = !injuries.isHistorical && injuries.dataSeason === season && injuries.dataWeek === week && isFreshDfsSource(injuries._meta.generatedAt, asOf, OPTIMIZER_ELIGIBILITY_V1.maxAvailabilityAgeHours);
const games = json<{ games: NflGameRecord[] }>(`${base}/games.json`).games.filter(g => g.season === season && g.week === week && g.seasonType === "REG");
const roles: DfsRoleEvidence[] = Object.values(fantasy.rows).flat().flatMap(p => {
  const game = games.find(g => [g.homeAbbr,g.awayAbbr].includes(p.team) && [g.homeAbbr,g.awayAbbr].includes(p.opponent));
  if (!game) return [];
  const d = lookupDepthChartEntry(depth, p.team, p.position, p.playerId);
  const ones = depthRankOneCandidates(depth, p.team, p.position);
  const currentRows = yardageUsable ? yardage.rows.filter(r => r.playerId === p.playerId && r.position === p.position && r.team === p.team && r.gameId === game.gameId && r.season === season && r.week === week && r.status === "projected") : [];
  const rush = currentRows.find(r => r.market === "rushing"), rec = currentRows.find(r => r.market === "receiving");
  const rosterRows = roster.filter(r => canonicalPlayerId(r.gsis_id) === p.playerId && normalizeNflTeamAbbr(r.team) === p.team && r.position === p.position);
  const injury = injuryCurrent ? injuries.teams[p.team]?.entries.find(r => canonicalPlayerId(r.gsisId) === p.playerId) : null;
  const availability = normalizeFantasyAvailability({ gameStatus: injury?.gameStatus, reserveStatus: injury?.reserveStatus, rosterStatus: rosterRows.length === 1 ? rosterRows[0].status : null, sourceSeason: season, sourceWeek: week, sourceAsOf: injury ? injuries._meta.generatedAt : rosterAsOf }, { season, week });
  const usageEvidence = [rush,rec].filter(r => r != null).map(r => ({ source: `${base}/yardage-projections.json`, asOf: r.generatedAt, detail: r.market === "receiving" ? `${r.modelVersion}; ${r.allocationDiagnostics?.allocationFallbackReason ?? "per-player fallback"}; published projectedTargets` : `${r.modelVersion}; published per-player projectedCarries; not finite-pool shadow allocation` }));
  return [{ playerId: p.playerId, team: p.team, position: p.position, season, week, gameId: game.gameId, kickoff: game.dateUtc,
    depthRank: d?.depthRank ?? null, depthAsOf: d?.sourceSnapshotAt ?? depth.sourceSnapshotAt,
    starterEvidence: p.position !== "QB" || !d ? "unavailable" : ones.length > 1 ? "ambiguous" : d.depthRank > 1 ? "backup" : ones.length === 1 ? "confirmed" : "unavailable",
    roleConflict: p.position === "QB" && ones.length > 1,
    projectedCarries: rush?.market === "rushing" ? rush.projectedCarries : null,
    projectedTargets: rec?.market === "receiving" && rec.allocationDiagnostics?.allocationFallbackReason !== "equalSplit" ? rec.projectedTargets : null,
    usageAsOf: usageEvidence.length ? usageEvidence.map(e => e.asOf).sort()[0] : null, usageEvidence,
    availability: availability.status, availabilityAsOf: availability.sourceAsOf, availabilityStale: availability.isStale, injuryFeedStale: !injuryCurrent,
    sourceReferences: [
      { source: `data/nfl/nflverse/depth-charts/depth_charts_${season}.csv`, asOf: depth.sourceSnapshotAt, detail: "nflverse / ESPN formation-slot depth rank; source snapshot timestamp" },
      { source: `data/nfl/nflverse/weekly-rosters/roster_weekly_${season}.csv`, asOf: rosterAsOf, detail: `Exact season/week roster; status ${rosterRows[0]?.status ?? "unavailable"}; capture date only, publication time unavailable` },
      { source: "public/data/nfl/matchup-injuries.json", asOf: injuries._meta.generatedAt, detail: `Data ${injuries.dataSeason} week ${injuries.dataWeek}; ${injuryCurrent ? "current" : "disregarded as stale"}` },
      ...usageEvidence,
    ],
  }];
});
const performance = validateTeamPerformanceAnalyticsArtifact(json(`${base}/team-performance-analytics.json`));
const preseason = validateNflV03ReviewArtifact("preseason", 2026, json(`${base}/preseason-power-ratings.json`), "DFS current OFF anchor");
const board = buildCurrentRatingBoard({ season, preseasonV03: preseason, performanceAnalytics: performance,
  v04Board: buildPublicProjectionBoard(validateNflV04ProjectionArtifact(json(`${base}/projected-power-ratings-v04.json`), "DFS current rating anchor")) });
const market = json<MarketArtifact>("public/data/nfl/matchup-market.json");
const totals = json<TeamTotalsArtifact>("public/data/nfl/team-totals.json");
const trench = json<TrenchMetricsArtifact>("public/data/nfl/matchup-trench-metrics.json");
const trenchResolve = createTrenchResolver(trench);
const defenses: DstMatchupInput[] = games.flatMap(game => [game.homeAbbr, game.awayAbbr].map(team => {
  const opponent = team === game.homeAbbr ? game.awayAbbr : game.homeAbbr;
  const off = board.teams.find(t => t.abbr === opponent), def = board.teams.find(t => t.abbr === team);
  const m = market.currentMarket[game.gameId];
  const marketAsOf = market.provenance.upstreamCommitAt;
  const validMarket = m?.season === season && m.week === week && m.homeAbbr === game.homeAbbr && m.awayAbbr === game.awayAbbr && isFreshDfsSource(marketAsOf, asOf, DST_MATCHUP_V1.maxWeeklyAgeHours);
  const implied = validMarket ? deriveImpliedTeamTotals(m, { source: market.attribution, generatedAt: marketAsOf!, perRowTimestampAvailable: false }) : null;
  const total = teamTotalFor(totals, game.gameId);
  const validTotal = total?.season === season && total.week === week && total.status === "projected" && total.homeTeam === game.homeAbbr && total.awayTeam === game.awayAbbr && isFreshDfsSource(total.predictionTimestamp, asOf, DST_MATCHUP_V1.maxWeeklyAgeHours);
  const points = implied ? opponent === game.homeAbbr ? implied.home : implied.away : validTotal ? opponent === game.homeAbbr ? total.homeExpectedPoints : total.awayExpectedPoints : null;
  const period = resolveTrenchPeriods(off?.gamesPlayed ?? 0, def?.gamesPlayed ?? 0)[0];
  const passBlock = trenchResolve(opponent, "off.passBlockWinRate", period), passRush = trenchResolve(team,"def.passRushWinRate",period);
  const edge = matchupRankDifference(passBlock?.espnRank, passRush?.espnRank);
  const weekly = DST_MATCHUP_V1.maxWeeklyAgeHours;
  return { team, opponent, gameId: game.gameId, kickoff: game.dateUtc, components: {
    opponentPoints: { value: points, source: implied ? "public/data/nfl/matchup-market.json" : "public/data/nfl/team-totals.json", asOf: implied ? marketAsOf : validTotal ? total.predictionTimestamp : null, detail: implied ? "nflverse implied opponent points; upstream commit time only, no per-line observation timestamp" : "JKB expected opponent team points fallback", maxAgeHours: weekly },
    opponentOffense: { value: off?.offenseRating ?? null, source: "currentRating2026.buildCurrentRatingBoard", asOf: off?.state === "preseason" ? preseason._meta.generatedAt : performance._meta.generatedAt, detail: `${off?.state ?? "unavailable"} canonical OFF; ${off?.gamesPlayed ?? 0} current-season games`, maxAgeHours: off?.state === "preseason" ? null : weekly },
    trenches: { value: edge == null ? null : -edge, source: "public/data/nfl/matchup-trench-metrics.json", asOf: trench.seasons[period.slice(0,4)]?.sourceLastModified ?? null, detail: `${period}; opponent PBWR rank ${passBlock?.espnRank ?? "unknown"} minus DST PRWR rank ${passRush?.espnRank ?? "unknown"}`, maxAgeHours: period === "2025-season" ? null : DST_MATCHUP_V1.maxCurrentTrenchAgeHours },
    historicalPpg: { value: null, source: "Unavailable", asOf: null, detail: "No canonical DST fantasy scoring history; DK Avg PPG remains a separate benchmark with unspecified window", maxAgeHours: null },
  }, warnings: ["No historical percentile-to-fantasy-points calibration", "Prior-season trenches / preseason OFF are contextual priors", ...(implied ? ["Market freshness uses upstream commit time; per-line timestamp unavailable"] : ["Market unavailable or stale; JKB team points fallback attempted"])] };
}));
const artifact = lineupContextSchema.parse({ schemaVersion: "nfl-dfs-lineup-context-v1", season, week, generatedAt: asOf, roles, defenses, sources, warnings: [...(!injuryCurrent ? ["Injury feed is stale; no current health assertion from that feed"] : []), ...(!yardageUsable ? ["Weekly yardage source mismatched or unavailable"] : [])] });
if (!values["dry-run"]) { const output = resolve(values.output!); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(artifact) + "\n"); }
console.log(JSON.stringify({ season, week, asOf, roles: roles.length, defenses: defenses.length, warnings: artifact.warnings, output: values["dry-run"] ? null : values.output }));
