/**
 * Hosted private snapshot: what may leave the owner's computer, and the check that runs again when it is served.
 *
 * The publish script decides a tier from the source license records (hostingGate.ts) and stores the result as an envelope.
 * The serverless function imports ONLY this module (types erased), so it re-applies the tier on every read without loading
 * the license registry, the model or any ingest code. Both directions are allowlists: a field that is not named here never
 * reaches the hosted store or the browser, whatever the board builder adds later.
 *
 *  - full: every field of the private board. Requires an explicit private-hosted right on the lines and statistics sources.
 *  - lines-only: sportsbook lines and per-book detail (The Odds API) only. Projections, season statistics, last-ten tables,
 *    Defense vs. Position and roster positions all derive from hoopR/ESPN and are removed.
 */
import type { BoardEntry, PropsBoardArtifact } from "../propsBoard";

export const HOSTED_SNAPSHOT_SCHEMA = "jkb-nba-hosted-snapshot-v1";
/** Mirrors BOARD_SCHEMA_VERSION (propsBoard.ts); a test keeps them equal. Not imported so the function bundle stays small. */
export const HOSTED_BOARD_SCHEMA = "nba-props-board-v1";
export const HOSTED_TIERS = ["full", "lines-only"] as const;
export type HostedTier = (typeof HOSTED_TIERS)[number];

export const WITHHELD_PROJECTION_REASON = "Withheld from the hosted board: the statistics source is not cleared for hosting.";
/** Fixed text for a lines-only board: the carried-over notice describes hoopR/ESPN statistics, which this tier does not contain. */
export const LINES_ONLY_NOTICE = "Private hosted board for the owner only. Not for publication. Lines-only view: projections, statistics and Defense vs. Position stay on the owner's computer until their source rights allow hosting.";
export const LINES_ONLY_ATTRIBUTION = "Lines: The Odds API, for private research only; raw odds are not redistributed.";
/**
 * Fixed text for a full board. The local builder's notice says "do not publish, share or deploy", which is not what this
 * owner-authenticated deployment is; this one states the actual basis without claiming an ESPN or SportsDataverse license.
 */
export const FULL_NOTICE = "Private hosted board for the owner only: not for publication or redistribution. hoopR/ESPN statistics are used under the owner's own authorization (owner-provided; no ESPN or SportsDataverse license or written permission is on file).";
const DEFAULT_ATTRIBUTION = "Data: hoopR (sportsdataverse, CC BY 4.0), derived from ESPN; Lines: The Odds API, for private research only; raw odds are not redistributed.";

export interface HostedSnapshotEnvelope {
  schemaVersion: typeof HOSTED_SNAPSHOT_SCHEMA;
  tier: HostedTier;
  publishedAtUtc: string;
  board: PropsBoardArtifact;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isIso = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** A lines-only entry: identity, the sportsbook line and its per-book detail. Everything else is rebuilt, never copied. */
function linesOnlyEntry(entry: BoardEntry): BoardEntry {
  return {
    entryKey: entry.entryKey,
    playerName: entry.playerName,
    team: entry.team,
    opponent: entry.opponent,
    gameKey: entry.gameKey,
    tipoffUtc: entry.tipoffUtc,
    positionLabel: null,
    market: entry.market,
    line: entry.line,
    lineWithheldReason: null,
    projection: null,
    projectionUnavailableReason: WITHHELD_PROJECTION_REASON,
    ...(entry.lineDetail ? { lineDetail: entry.lineDetail } : {}),
  };
}

/** Applies a tier to a board. Idempotent: projecting an already projected board changes nothing. */
export function projectBoardForTier(board: PropsBoardArtifact, tier: HostedTier): PropsBoardArtifact {
  if (tier === "full") {
    const attribution = board.privatePreview?.attribution ?? DEFAULT_ATTRIBUTION;
    return {
      schemaVersion: board.schemaVersion,
      generatedAtUtc: board.generatedAtUtc,
      isSynthetic: board.isSynthetic,
      sources: board.sources,
      entries: board.entries,
      dvpRows: board.dvpRows,
      ...(board.opponentRecent ? { opponentRecent: board.opponentRecent } : {}),
      ...(board.opponentBoxScores ? { opponentBoxScores: board.opponentBoxScores } : {}),
      privatePreview: { notice: FULL_NOTICE, attribution },
    };
  }
  return {
    schemaVersion: board.schemaVersion,
    generatedAtUtc: board.generatedAtUtc,
    isSynthetic: board.isSynthetic,
    sources: { lines: [...board.sources.lines], dvp: null, dvpUpdatedUtc: null },
    entries: board.entries.filter((entry) => entry.line !== null).map(linesOnlyEntry),
    dvpRows: [],
    privatePreview: { notice: LINES_ONLY_NOTICE, attribution: LINES_ONLY_ATTRIBUTION },
  };
}

export function buildEnvelope(board: PropsBoardArtifact, tier: HostedTier, publishedAtUtc: string): HostedSnapshotEnvelope {
  return { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier, publishedAtUtc, board: projectBoardForTier(board, tier) };
}

export type ServeResult = { ok: true; envelope: HostedSnapshotEnvelope } | { ok: false; reason: "malformed" };

/** Validates a stored value and re-applies its tier. A stored snapshot that is not exactly an envelope is refused. */
export function serveableEnvelope(raw: unknown): ServeResult {
  if (!isRecord(raw) || raw.schemaVersion !== HOSTED_SNAPSHOT_SCHEMA) return { ok: false, reason: "malformed" };
  const tier = raw.tier;
  if (!HOSTED_TIERS.includes(tier as HostedTier) || !isIso(raw.publishedAtUtc)) return { ok: false, reason: "malformed" };
  const board = raw.board;
  if (!isRecord(board) || board.schemaVersion !== HOSTED_BOARD_SCHEMA) return { ok: false, reason: "malformed" };
  if (!Array.isArray(board.entries) || !Array.isArray(board.dvpRows) || !isRecord(board.sources) || !Array.isArray(board.sources.lines)) return { ok: false, reason: "malformed" };
  if (typeof board.generatedAtUtc !== "string" || typeof board.isSynthetic !== "boolean") return { ok: false, reason: "malformed" };
  const projected = projectBoardForTier(board as unknown as PropsBoardArtifact, tier as HostedTier);
  return { ok: true, envelope: { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: tier as HostedTier, publishedAtUtc: raw.publishedAtUtc as string, board: projected } };
}
