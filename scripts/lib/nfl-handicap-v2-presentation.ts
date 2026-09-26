/**
 * AI Picks v2 -- presentation plumbing only. Selects the newest VALID
 * write-once handicap-v2 record for a game/provider and projects it to the
 * public card (src/lib/nfl/aiHandicapPresentation.ts AiHandicapV2Card).
 *
 * No handicapping logic lives here: nothing recomputes a probability,
 * verdict, fair line or total. "Valid" is a structural publishability check
 * on the stored record (the stage validators already ran before it was
 * written); an unreadable or malformed file is skipped, never repaired.
 * Internal provenance (contextHash, promptVersion, factRefs, evidenceRefs,
 * evidence ids, warnings) is deliberately not published.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { handicapV2Directory } from "./nfl-handicap-v2-record";
import { HANDICAP_V2_SCHEMA_VERSION, VERDICTS, CONFIDENCE_LEVELS, UNCERTAINTY_LEVELS, type HandicapV2Record } from "./nfl-handicap-v2-types";
import type { AiHandicapProvider, AiHandicapV2Card, AiHandicapV2Source } from "../../src/lib/nfl/aiHandicapPresentation";

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isHttpUrl = (value: unknown): value is string => typeof value === "string" && /^https?:\/\//i.test(value);

/** True when the record can be safely published for this game and provider. */
export function isPublishableHandicapV2Record(record: unknown, gameId: string, provider: AiHandicapProvider): record is HandicapV2Record {
  if (!record || typeof record !== "object") return false;
  const r = record as Partial<HandicapV2Record>;
  return (
    r.schemaVersion === HANDICAP_V2_SCHEMA_VERSION &&
    r.gameId === gameId &&
    r.provider === provider &&
    isNonEmptyString(r.generatedAt) &&
    !Number.isNaN(new Date(r.generatedAt as string).getTime()) &&
    (VERDICTS as readonly string[]).includes(r.verdict as string) &&
    (CONFIDENCE_LEVELS as readonly string[]).includes(r.confidence as string) &&
    (UNCERTAINTY_LEVELS as readonly string[]).includes(r.uncertainty as string) &&
    (r.preferredSide === "home" || r.preferredSide === "away") &&
    isNonEmptyString(r.preferredTeam) &&
    isFiniteNumber(r.preferredLine) &&
    isFiniteNumber(r.coverProbabilityPreferred) &&
    isFiniteNumber(r.coverProbabilityOther) &&
    isFiniteNumber(r.impliedPushProbability) &&
    isFiniteNumber(r.fairSpread?.line) &&
    isNonEmptyString(r.fairSpread?.team) &&
    isFiniteNumber(r.fairScoreAway) &&
    isFiniteNumber(r.fairScoreHome) &&
    isFiniteNumber(r.projectedTotal) &&
    isFiniteNumber(r.marketSpread?.homeLine) &&
    isFiniteNumber(r.marketSpread?.awayLine) &&
    isNonEmptyString(r.analysisMarkdown) &&
    isNonEmptyString(r.mainRisk) &&
    Array.isArray(r.keyDrivers) &&
    Array.isArray(r.sources)
  );
}

/** Newest-first scan: the latest record that is publishable, or null. Records are never modified. */
export function readLatestPublishableHandicapV2Record(root: string, season: number, week: number, gameId: string, provider: AiHandicapProvider): HandicapV2Record | null {
  const dir = handicapV2Directory(root, season, week, gameId, provider);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
      if (isPublishableHandicapV2Record(parsed, gameId, provider)) return parsed;
    } catch {
      // Unreadable/corrupt file: skip it; an older valid record (or the v1 fallback) is used instead.
    }
  }
  return null;
}

/** Public sources: only what is attached to the record. A url must be http(s) or it is dropped to null (labelled internal); duplicates collapse. */
export function buildPublicV2Sources(sources: readonly HandicapV2Record["sources"][number][]): AiHandicapV2Source[] {
  const seen = new Set<string>();
  const out: AiHandicapV2Source[] = [];
  for (const source of sources) {
    if (!source || !isNonEmptyString(source.label)) continue;
    const url = isHttpUrl(source.url) ? source.url : null;
    const key = url ?? `internal:${source.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: source.label, url, type: source.type });
  }
  return out;
}

export function buildHandicapV2PublicCard(record: HandicapV2Record, displayName: string): AiHandicapV2Card {
  return {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    provider: record.provider,
    displayName,
    generatedAt: record.generatedAt,
    verdict: record.verdict,
    preferredSide: record.preferredSide,
    preferredTeam: record.preferredTeam,
    preferredLine: record.preferredLine,
    marketSpread: { ...record.marketSpread },
    marketTotal: record.marketTotal,
    coverProbabilityPreferred: record.coverProbabilityPreferred,
    coverProbabilityOther: record.coverProbabilityOther,
    impliedPushProbability: record.impliedPushProbability,
    fairSpread: { team: record.fairSpread.team, line: record.fairSpread.line },
    fairScoreAway: record.fairScoreAway,
    fairScoreHome: record.fairScoreHome,
    projectedTotal: record.projectedTotal,
    confidence: record.confidence,
    uncertainty: record.uncertainty,
    keyNumberSensitivity: record.keyNumberSensitivity ?? null,
    analysisMarkdown: record.analysisMarkdown,
    keyDrivers: record.keyDrivers.map((driver) => ({ summary: driver.summary })),
    mainRisk: record.mainRisk,
    sources: buildPublicV2Sources(record.sources),
  };
}
