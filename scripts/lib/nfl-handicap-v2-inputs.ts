/**
 * AI Picks v2 automation -- the deterministic INPUT FINGERPRINT of a v2
 * handicap, plus the market-change policy that decides whether Stage B needs
 * to rerun. Everything here is pure or a free local file read: the planner
 * (nfl-ai-v2-slate-plan.ts) decides what to spend without any model call, and
 * the v2 runner (run-nfl-handicap-v2.ts) stamps the same fingerprint onto every
 * record it writes so the next planning pass has something to compare against.
 *
 * Stage A (football) input  = footballContextHash(packet)  +  stageAEvidenceHash
 * Stage B (market) input    = the displayed line/total, key-number status
 *
 * Nothing here changes what either stage is shown; it only observes it.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { buildCurrentMarketView, findCurrentGame, parseBettingLinesCurrentArtifact } from "../../src/lib/nfl/bettingLinesView";
import { filterEvidenceRecordsForBlindStageA } from "./nfl-ai-context-sanitizer";
import type { EvidenceRecord } from "./nfl-evidence-types";
import { footballContextIdentity, type NflGameContextPacket } from "./nfl-full-game-context";
import { buildBookRange, buildHandicapV2MarketContext, type BookRange, type HandicapV2MarketContext } from "./nfl-handicap-v2-market";
import { contentHash, type JsonValue } from "./nfl-production-prediction-archive";
import type { HandicapV2Record } from "./nfl-handicap-v2-types";

/** Facts about the inputs a record was produced from. Optional on a record: legacy records predate it. */
export interface HandicapV2InputFingerprint {
  /** Hash of the ids of the evidence Stage A could see (market/betting-opinion records excluded). */
  stageAEvidenceHash: string;
  /** Hash of the availability section (injuries, QB status, inactives) of the market-blind football context. */
  availabilityHash: string;
  /** Hash of the weather section of the market-blind football context. */
  weatherHash: string;
  /** The cross-book range Stage B was shown. */
  bookRange: Pick<BookRange, "bookCount" | "homeLineMin" | "homeLineMax" | "totalMin" | "totalMax"> | null;
}

const hashOf = (value: unknown): string => contentHash(value as JsonValue);

export function stageAEvidenceHash(records: readonly EvidenceRecord[]): string {
  return hashOf(
    filterEvidenceRecordsForBlindStageA(records)
      .map((r) => r.evidenceId)
      .sort()
  );
}

export function availabilityHash(packet: NflGameContextPacket): string {
  return hashOf(footballContextIdentity(packet).availability ?? null);
}

export function weatherHash(packet: NflGameContextPacket): string {
  return hashOf(footballContextIdentity(packet).weather ?? null);
}

export function buildInputFingerprint(input: { packet: NflGameContextPacket; evidence: readonly EvidenceRecord[]; market: HandicapV2MarketContext }): HandicapV2InputFingerprint {
  const range = input.market.bookRange;
  return {
    stageAEvidenceHash: stageAEvidenceHash(input.evidence),
    availabilityHash: availabilityHash(input.packet),
    weatherHash: weatherHash(input.packet),
    bookRange: range ? { bookCount: range.bookCount, homeLineMin: range.homeLineMin, homeLineMax: range.homeLineMax, totalMin: range.totalMin, totalMax: range.totalMax } : null,
  };
}

/** Optional fingerprint carried on a v2 record (additive; never published). */
export function recordFingerprint(record: HandicapV2Record): HandicapV2InputFingerprint | null {
  return record.inputs ?? null;
}

/* -------------------------------------------------------------------------- */
/* Market context (shared by the planner and the runner so they cannot drift) */
/* -------------------------------------------------------------------------- */

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The exact market view Stage B is shown for this game: the line JKB displays plus the cross-book range. Null when there is no usable spread. */
export function loadHandicapV2MarketContext(root: string, packet: NflGameContextPacket, gameId: string): HandicapV2MarketContext | null {
  const raw = readJson(join(root, "public", "data", "market", "betting-lines-current.json"));
  const artifact = raw ? parseBettingLinesCurrentArtifact(raw) : null;
  const bookRange = artifact ? buildBookRange(findCurrentGame(artifact, gameId)) : null;
  const displayed = artifact ? buildCurrentMarketView({ artifact, jkbGameId: gameId }) : null;
  return buildHandicapV2MarketContext({
    market: packet.market,
    teams: { homeTeam: packet.identity.homeTeam, awayTeam: packet.identity.awayTeam, homeTeamFull: packet.identity.homeTeamFull, awayTeamFull: packet.identity.awayTeamFull },
    bookRange,
    asOf: displayed?.lastObservedAt ?? packet.market.firstObserved.observedAt ?? packet.provenance.builtAt,
  });
}

/* -------------------------------------------------------------------------- */
/* Market-change policy                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Why Stage B should rerun against the current market ([] = it should not).
 *
 * Follows the existing v1 planner convention (nfl-ai-slate-plan.ts
 * marketAtDecisionChanged): deterministic, exact field equality on the
 * displayed spread and total -- no fuzzy threshold. Half a point is a real
 * change in NFL pricing, so any line move counts, and a move onto or off the
 * key numbers 3 and 7 is always a line move. On top of that, a change in whether
 * the book range straddles a key number counts even when the displayed line did
 * not move. Deliberately NOT triggers: a price-only move (-110 to -112) and a
 * change in the count or spread of other books that leaves every key-number
 * status alone -- both are noise for a cover-probability call, and each would
 * otherwise cost a paid Stage B call.
 */
export function detectMarketChange(prior: HandicapV2Record, current: HandicapV2MarketContext): string[] {
  const reasons: string[] = [];
  if (prior.marketSpread.homeLine !== current.spread.homeLine) reasons.push(`spread moved (home ${prior.marketSpread.homeLine} -> ${current.spread.homeLine})`);
  if (prior.marketTotal !== current.total.line) reasons.push(`total moved (${prior.marketTotal ?? "n/a"} -> ${current.total.line ?? "n/a"})`);
  const before = prior.keyNumberContext;
  const now = current.keyNumbers;
  if (before && (before.onKeyNumber !== now.onKeyNumber || before.nearKeyNumber !== now.nearKeyNumber)) reasons.push("line moved onto/off a key number (3 or 7)");
  if (before && before.bookRangeCrossesKeyNumber !== now.bookRangeCrossesKeyNumber) reasons.push("book range started/stopped straddling a key number");
  return reasons;
}
