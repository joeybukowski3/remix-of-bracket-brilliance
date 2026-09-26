/**
 * AI Picks v2 WU3 -- assembles the published v2 record from the two validated
 * stages, attaches every MECHANICAL field (market numbers, key-number metadata,
 * sources) and stores it write-once.
 *
 * Source attribution is mechanical: URLs and labels come ONLY from the
 * validated evidence records the model cited (`evidenceRefsUsed`) plus two
 * JKB-internal entries with a null url. The model never authors a link.
 *
 * Storage is a separate, immutable, content-addressed file per record under the
 * game's analysis directory. It does not touch the v1 snapshot chain: existing
 * v1 snapshots and public artifacts stay exactly as they are, and wiring v2
 * into the snapshot lifecycle / presentation is a later work unit.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EvidenceCategory, EvidenceRecord } from "./nfl-evidence-types";
import type { HandicapV2MarketContext } from "./nfl-handicap-v2-market";
import { contentHash, type JsonValue } from "./nfl-production-prediction-archive";
import { HANDICAP_V2_PROMPT_VERSION, HANDICAP_V2_SCHEMA_VERSION, type HandicapV2Record, type HandicapV2Source, type StageAV2, type StageBV2 } from "./nfl-handicap-v2-types";

const SOURCE_TYPE_BY_CATEGORY: Record<EvidenceCategory, HandicapV2Source["type"]> = {
  injury: "injury",
  availability: "injury",
  depth_chart: "injury",
  weather: "weather",
  market: "market",
  personnel: "news",
  coaching: "news",
  scheme: "news",
  usage: "news",
  matchup: "news",
  news: "news",
  scheduling: "news",
  travel: "news",
  situational: "news",
  quote: "news",
  other: "other",
} as Record<EvidenceCategory, HandicapV2Source["type"]>;

export function sourceTypeForCategory(category: EvidenceCategory): HandicapV2Source["type"] {
  return SOURCE_TYPE_BY_CATEGORY[category] ?? "other";
}

/** Sources for the evidence the write-up cited, deduplicated, plus the JKB-internal market and team-data entries. */
export function buildHandicapV2Sources(input: { evidenceRefsUsed: readonly string[]; factRefsUsed: readonly string[]; evidenceRecords: readonly EvidenceRecord[]; market: HandicapV2MarketContext }): HandicapV2Source[] {
  const byId = new Map(input.evidenceRecords.map((r) => [r.evidenceId, r] as const));
  const sources: HandicapV2Source[] = [];
  const seen = new Set<string>();
  for (const id of input.evidenceRefsUsed) {
    const record = byId.get(id);
    if (!record) continue;
    const key = `${record.source.url ?? record.source.name}|${record.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ label: record.source.name, url: record.source.url, type: sourceTypeForCategory(record.category), evidenceId: id });
  }
  sources.push({ label: `${input.market.spread.sportsbook ?? "Sportsbook"} spread and total (JKB betting lines${input.market.asOf ? `, as of ${input.market.asOf}` : ""})`, url: null, type: "market" });
  if (input.factRefsUsed.length > 0) sources.push({ label: "Team game data: nflverse play-by-play and official team stats (JKB)", url: null, type: "other" });
  return sources;
}

export interface BuildHandicapV2RecordInput {
  stageA: StageAV2;
  stageB: StageBV2;
  market: HandicapV2MarketContext;
  evidenceRecords: readonly EvidenceRecord[];
}

export function buildHandicapV2Record(input: BuildHandicapV2RecordInput): HandicapV2Record {
  const { stageA, stageB, market } = input;
  return {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    gameId: stageB.gameId,
    provider: stageB.model,
    generatedAt: stageB.generatedAt,
    stageAGeneratedAt: stageA.generatedAt,
    contextHash: stageA.contextHash,
    promptVersion: HANDICAP_V2_PROMPT_VERSION,

    marketSpread: {
      sportsbook: market.spread.sportsbook,
      homeLine: market.spread.homeLine,
      awayLine: market.spread.awayLine,
      homePrice: market.spread.homePrice,
      awayPrice: market.spread.awayPrice,
      asOf: market.asOf,
    },
    marketTotal: market.total.line,

    preferredSide: stageB.preferredSide,
    preferredTeam: stageB.preferredTeam,
    preferredLine: stageB.preferredLine,
    coverProbabilityPreferred: stageB.coverProbabilityPreferred,
    coverProbabilityOther: stageB.coverProbabilityOther,
    impliedPushProbability: stageB.impliedPushProbability,

    fairSpread: stageA.fairSpread,
    fairScoreAway: stageA.fairScore.away,
    fairScoreHome: stageA.fairScore.home,
    projectedTotal: stageA.projectedTotal,

    confidence: stageB.confidence,
    uncertainty: stageA.uncertainty,
    verdict: stageB.verdict,

    keyNumberSensitivity: stageB.keyNumberSensitivity,
    keyNumberContext: market.keyNumbers,

    keyDrivers: stageA.keyDrivers,
    mainRisk: stageA.mainRisk,
    counterargument: stageB.counterargument,

    analysisMarkdown: stageB.analysisMarkdown,
    wordCount: stageB.wordCount,
    factRefsUsed: stageB.factRefsUsed,
    evidenceRefsUsed: stageB.evidenceRefsUsed,
    sources: buildHandicapV2Sources({ evidenceRefsUsed: stageB.evidenceRefsUsed, factRefsUsed: stageB.factRefsUsed, evidenceRecords: input.evidenceRecords, market }),
    warnings: stageB.warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export function handicapV2Directory(root: string, season: number, week: number, gameId: string, provider: string): string {
  return join(root, "data", "nfl", "analysis", String(season), String(week), gameId, provider, "handicap-v2");
}

export function handicapV2RecordId(record: HandicapV2Record): string {
  const stamp = record.generatedAt.replace(/[^0-9A-Za-z]/g, "");
  return `${stamp}-${contentHash(record as unknown as JsonValue).slice(0, 12)}`;
}

/** Write-once: a record is never overwritten. Returns the path written. */
export function writeHandicapV2Record(root: string, season: number, week: number, record: HandicapV2Record): string {
  const path = join(handicapV2Directory(root, season, week, record.gameId, record.provider), `${handicapV2RecordId(record)}.json`);
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing v2 handicap record ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return path;
}

/** Newest record for a game/provider, or null. Files sort chronologically by their timestamp prefix. */
export function readLatestHandicapV2Record(root: string, season: number, week: number, gameId: string, provider: string): HandicapV2Record | null {
  const dir = handicapV2Directory(root, season, week, gameId, provider);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const latest = files[files.length - 1];
  return latest ? (JSON.parse(readFileSync(join(dir, latest), "utf8")) as HandicapV2Record) : null;
}
