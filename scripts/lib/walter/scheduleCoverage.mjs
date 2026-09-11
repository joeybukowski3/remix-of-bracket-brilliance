import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Canonical-schedule coverage diagnostics for one WalterFootball capture run
 * (both window pages for a single wednesday/thursday/saturday/sunday slot).
 *
 * WalterFootball gates most of a week's games behind a premium subscription:
 * the free HTML for a window page contains a full write-up for only one game,
 * followed by a "Premium members have access to the rest..." marker, with the
 * other games entirely absent from the markup (verified live 2026-09-11 --
 * see scripts/lib/walter/__fixtures__). That is an *incomplete-source* state,
 * not a parser defect, so this module reports it as its own diagnostic
 * (`premiumGateDetected` / `canonicalNotCaptured`) rather than folding it into
 * the same "failed" bucket as an actual fetch or parse failure.
 *
 * This module never re-fetches or re-parses anything -- it only aggregates
 * numbers the caller (capture-walter-week.mjs) already computed per window.
 */

const PREMIUM_GATE_MARKER = "Premium members have access";

/** @param {string | null | undefined} html */
export function detectPremiumGate(html) {
  return typeof html === "string" && html.includes(PREMIUM_GATE_MARKER);
}

/**
 * Reads public/data/nfl/{season}/games.json and returns the set of canonical
 * gameIds for the given week, in the same "{season}_{week:02}_{AWAY}_{HOME}"
 * format normalizeGame.mjs produces.
 */
export function loadCanonicalWeekGameIds(root, season, week) {
  const path = resolve(root, "public", "data", "nfl", String(season), "games.json");
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  const games = Array.isArray(artifact.games) ? artifact.games : [];
  return new Set(games.filter((g) => g.week === week).map((g) => g.gameId));
}

/**
 * @param {{
 *   sourcePagesExpected: number,
 *   windowResults: Array<{
 *     fetched: boolean,
 *     panelsDiscovered: number,
 *     parsedGameIds: Array<string | null>,
 *     premiumGateDetected: boolean,
 *   }>,
 *   canonicalGameIds: Set<string>,
 * }} input
 */
export function computeScheduleCoverage({ sourcePagesExpected, windowResults, canonicalGameIds }) {
  const sourcePagesFetched = windowResults.filter((w) => w.fetched).length;
  const panelsDiscovered = windowResults.reduce((sum, w) => sum + w.panelsDiscovered, 0);

  const allParsedIds = windowResults.flatMap((w) => w.parsedGameIds);
  const resolvedIds = allParsedIds.filter((id) => id != null);
  const panelsParsed = resolvedIds.length;

  const occurrences = new Map();
  for (const id of resolvedIds) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);

  const matchedIds = new Set(resolvedIds.filter((id) => canonicalGameIds.has(id)));
  const canonicalMatched = matchedIds.size;

  const unmatchedParsed = [...new Set(resolvedIds.filter((id) => !canonicalGameIds.has(id)))];
  const duplicateCanonicalMatches = [...occurrences.entries()]
    .filter(([id, count]) => count > 1 && canonicalGameIds.has(id))
    .map(([id]) => id);

  const canonicalWeekGameCount = canonicalGameIds.size;
  const canonicalNotCaptured = [...canonicalGameIds].filter((id) => !matchedIds.has(id)).sort();

  const premiumGateDetected = windowResults.some((w) => w.premiumGateDetected);

  return {
    sourcePagesExpected,
    sourcePagesFetched,
    panelsDiscovered,
    panelsParsed,
    canonicalMatched,
    canonicalWeekGameCount,
    canonicalNotCaptured,
    unmatchedParsed,
    duplicateCanonicalMatches,
    // No premium credentials are wired into this pipeline (by design -- see
    // AGENTS.md); every capture is an unauthenticated, public-only fetch.
    accessScope: "public-only",
    premiumGateDetected,
  };
}
