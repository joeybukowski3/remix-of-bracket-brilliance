/**
 * Deterministic "final approved pre-kickoff line" selector for the yardage
 * market archive (data/nfl/props/market-archive/nfl-yardage-market-archive.jsonl).
 *
 * Reused by both the Yardage Props Review Last-10 tables (historical
 * "Vegas Line" columns) and, going forward, any other consumer that needs
 * a truthful historical prop line for a player/game/market. Never
 * estimates, backfills, or substitutes a spread/total for a missing prop
 * line -- a game with no valid pre-kickoff observation resolves to `null`.
 *
 * Pure, dependency-free -- no filesystem access here (the caller reads the
 * .jsonl and passes parsed observation objects).
 */
import { APPROVED_SPORTSBOOKS, isApprovedSportsbook } from "./nfl-book-classification.mjs";

/**
 * @typedef {object} ArchiveObservation
 * @property {string} observedAt - ISO timestamp.
 * @property {string} canonicalMarket - "passingYards" | "rushingYards" | "receivingYards".
 * @property {string} playerId
 * @property {string} gameId
 * @property {string} bookmaker
 * @property {number} point
 */

/**
 * Resolve the final approved pre-kickoff line for one player/game/market.
 *
 * Rules (in order):
 *   1. Only observations for the exact playerId + canonicalMarket + gameId.
 *   2. Only approved sportsbooks (`nfl-book-classification.mjs`) -- an
 *      exchange/DFS observation never substitutes.
 *   3. Only observations strictly BEFORE kickoff (`observedAt < kickoffIso`).
 *      A missing/unparseable kickoffIso makes every observation ineligible
 *      (fails closed -- never assumes "before kickoff" without a kickoff).
 *   4. Among eligible observations, take the one with the latest
 *      `observedAt` (the final pre-kickoff snapshot) -- ties broken by
 *      `APPROVED_SPORTSBOOKS` priority order.
 *
 * @param {ArchiveObservation[]} observations - already filtered to one gameId is NOT required; this filters internally.
 * @param {{ playerId: string, canonicalMarket: string, gameId: string, kickoffIso: string | null }} target
 * @returns {{ point: number, bookmaker: string, observedAt: string } | null}
 */
export function resolveFinalPreKickoffLine(observations, target) {
  if (!target.kickoffIso || Number.isNaN(Date.parse(target.kickoffIso))) return null;
  const kickoffMs = Date.parse(target.kickoffIso);

  const eligible = (Array.isArray(observations) ? observations : []).filter((obs) => {
    if (!obs || obs.playerId !== target.playerId) return false;
    if (obs.canonicalMarket !== target.canonicalMarket) return false;
    if (obs.gameId !== target.gameId) return false;
    if (!isApprovedSportsbook(obs.bookmaker)) return false;
    if (typeof obs.point !== "number" || !Number.isFinite(obs.point)) return false;
    const observedMs = Date.parse(obs.observedAt);
    if (Number.isNaN(observedMs)) return false;
    return observedMs < kickoffMs;
  });

  if (eligible.length === 0) return null;

  const bookRank = (bookmaker) => {
    const index = APPROVED_SPORTSBOOKS.indexOf(String(bookmaker ?? "").trim().toLowerCase());
    return index === -1 ? APPROVED_SPORTSBOOKS.length : index;
  };

  eligible.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || bookRank(a.bookmaker) - bookRank(b.bookmaker));
  const chosen = eligible[0];
  return { point: chosen.point, bookmaker: chosen.bookmaker, observedAt: chosen.observedAt };
}

/** Parse the market-archive .jsonl text into an array of observation objects. Malformed lines are skipped, never thrown. */
export function parseMarketArchiveJsonl(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines -- never fail the whole archive over one bad row.
    }
  }
  return out;
}

/** Builds a `playerId|canonicalMarket|gameId` index so repeated lookups over one archive don't re-scan it each time. */
export function indexArchiveByTarget(observations) {
  const index = new Map();
  for (const obs of observations) {
    if (!obs || !obs.playerId || !obs.canonicalMarket || !obs.gameId) continue;
    const key = `${obs.playerId}|${obs.canonicalMarket}|${obs.gameId}`;
    const bucket = index.get(key);
    if (bucket) bucket.push(obs);
    else index.set(key, [obs]);
  }
  return index;
}

/** Convenience wrapper: resolve using a prebuilt index from {@link indexArchiveByTarget}. */
export function resolveFinalPreKickoffLineFromIndex(index, target) {
  const key = `${target.playerId}|${target.canonicalMarket}|${target.gameId}`;
  return resolveFinalPreKickoffLine(index.get(key) ?? [], target);
}
