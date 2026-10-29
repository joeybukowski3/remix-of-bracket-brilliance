/**
 * Public NBA snapshot: what may be stored in the hosted snapshot table and served to any visitor, and the check that runs
 * again on every read.
 *
 * The publish script decides a tier from the source license records (hostingGate.ts) and stores the result as an envelope.
 * The serverless function imports ONLY this module (types erased), so it re-applies the tier on every read without loading
 * the license registry, the model or any ingest code. Both directions are allowlists: a field that is not named here never
 * reaches the snapshot table or the browser, whatever the board builder adds later.
 *
 *  - full: every field of the board: projections, season statistics with recent games, opponent tables, Defense vs. Position
 *    and sportsbook lines with per-book detail. Requires the statistics source's public-display, model-development and
 *    raw-redistribution rights (the last because the dashboard shows per-game rows) and the line source's public-display.
 *  - lines-only: sportsbook lines and per-book detail only. Projections, season statistics, last-ten tables, Defense vs.
 *    Position and roster positions all derive from hoopR/ESPN and are removed. This is what every visitor gets until the
 *    statistics source's records allow more.
 *
 * Neither tier carries the builder's `privatePreview` notice ("do not publish, share or deploy"): this is the public board,
 * and its source credit and any limitation are the fixed text below.
 */
import type { BoardEntry, PropsBoardArtifact } from "../propsBoard";

export const HOSTED_SNAPSHOT_SCHEMA = "jkb-nba-hosted-snapshot-v1";
/** Mirrors BOARD_SCHEMA_VERSION (propsBoard.ts); a test keeps them equal. Not imported so the function bundle stays small. */
export const HOSTED_BOARD_SCHEMA = "nba-props-board-v1";
export const HOSTED_TIERS = ["full", "lines-only"] as const;
export type HostedTier = (typeof HOSTED_TIERS)[number];

export const WITHHELD_PROJECTION_REASON = "Not shown yet: the statistics source is not cleared for public display.";

/** Public text per tier. `notice` is a limitation the page states; null when there is none. */
export interface PublicText {
  attribution: string;
  notice: string | null;
}
export const PUBLIC_TEXT: Readonly<Record<HostedTier, PublicText>> = Object.freeze({
  full: {
    attribution: "Statistics: hoopR (sportsdataverse, CC BY 4.0), derived from ESPN, columns selected and non-playing rows excluded. Sportsbook lines: The Odds API. Projections are JKB model estimates, not advice.",
    notice: null,
  },
  "lines-only": {
    attribution: "Sportsbook lines: The Odds API.",
    notice: "Showing sportsbook lines only. JKB projections, season statistics, last-ten tables and Defense vs. Position are not shown on this page yet.",
  },
});

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
    return {
      schemaVersion: board.schemaVersion,
      generatedAtUtc: board.generatedAtUtc,
      isSynthetic: board.isSynthetic,
      sources: board.sources,
      entries: board.entries,
      dvpRows: board.dvpRows,
      ...(board.opponentRecent ? { opponentRecent: board.opponentRecent } : {}),
      ...(board.opponentBoxScores ? { opponentBoxScores: board.opponentBoxScores } : {}),
    };
  }
  return {
    schemaVersion: board.schemaVersion,
    generatedAtUtc: board.generatedAtUtc,
    isSynthetic: board.isSynthetic,
    sources: { lines: [...board.sources.lines], dvp: null, dvpUpdatedUtc: null },
    entries: board.entries.filter((entry) => entry.line !== null).map(linesOnlyEntry),
    dvpRows: [],
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
