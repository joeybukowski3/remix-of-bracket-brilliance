/**
 * WU3.3.1 -- deterministic freshness guard for the Game Context Packet an
 * update-mode research pass is about to use.
 *
 * This does NOT check whether market/context VALUES changed -- an unchanged
 * market is a perfectly valid, expected outcome (see
 * nfl-snapshot-market-delta.ts) and this module never flags that as
 * suspicious. What it checks is PROVENANCE: was the context handed to this
 * update pass actually a product of a fresh read (nfl-full-game-context-loader.ts,
 * called at or after `now`), or does it look like the exact prior artifact
 * was reused without ever calling the loader again?
 *
 * The mechanical signal: `loadFreshGameContextPacket()` always stamps
 * `generatedAt`/`provenance.builtAt` with the wall-clock moment it was
 * called (nfl-full-game-context-loader.ts's `nowFn()`), so a genuinely fresh
 * read for THIS update pass must have a `generatedAt` strictly later than
 * the context the PREVIOUS snapshot was built from. If it is not later, the
 * caller either reused a stale object/file or something is wrong with the
 * clock -- either way, this is flagged rather than silently trusted.
 */

export type ContextFreshnessStatus = "fresh" | "stale_or_reused" | "unknown";

export interface ContextFreshnessCheckResult {
  status: ContextFreshnessStatus;
  reason: string;
}

/**
 * Compares the previous snapshot's context generation time against the
 * candidate current context's generation time. Never rejects on VALUE
 * equality (identical contextHash/market numbers are explicitly fine, per
 * the architecture note) -- only on the candidate context failing to be
 * strictly newer than what the previous snapshot was built from.
 */
export function checkContextFreshness(previousContextGeneratedAt: string | null, currentContextGeneratedAt: string | null): ContextFreshnessCheckResult {
  if (!currentContextGeneratedAt || !Number.isFinite(Date.parse(currentContextGeneratedAt))) {
    return { status: "unknown", reason: "currentContextGeneratedAt is missing or unparseable -- cannot establish freshness." };
  }
  if (!previousContextGeneratedAt || !Number.isFinite(Date.parse(previousContextGeneratedAt))) {
    // No prior context timestamp to compare against (e.g. a bootstrap/initial snapshot) -- nothing to be stale relative to.
    return { status: "fresh", reason: "No previous context generation timestamp to compare against; treating as fresh by default." };
  }

  const previousMs = Date.parse(previousContextGeneratedAt);
  const currentMs = Date.parse(currentContextGeneratedAt);

  if (currentMs <= previousMs) {
    return {
      status: "stale_or_reused",
      reason: `currentContextGeneratedAt (${currentContextGeneratedAt}) is not strictly newer than the previous snapshot's context generation time (${previousContextGeneratedAt}) -- this looks like the same prior context artifact was reused rather than freshly regenerated/read.`,
    };
  }

  return { status: "fresh", reason: `currentContextGeneratedAt (${currentContextGeneratedAt}) is newer than the previous snapshot's context generation time (${previousContextGeneratedAt}).` };
}
