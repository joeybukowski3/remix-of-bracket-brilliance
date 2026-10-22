/**
 * Builds the props-board artifact the page reads (Node side; the page never imports this).
 *
 * Gates, applied per captured line:
 *   - the source license must permit public display, else the line is withheld;
 *   - a line whose age is unknown, or that was backfilled after tipoff, is withheld;
 *   - a stale line is shown and flagged.
 * Withheld lines keep their projection and DvP context and carry the reason.
 * Only the latest capture per (game, player, market, sportsbook) is kept.
 */
import { BOARD_SCHEMA_VERSION, type BoardEntry, type BoardLine, type PropsBoardArtifact } from "../propsBoard";
import type { DvpRow } from "../dvp";
import { playerKeyOf, type NbaPregameSnapshot } from "./contracts";

export interface BoardArtifactInput {
  snapshots: readonly NbaPregameSnapshot[];
  dvpRows: readonly DvpRow[];
  /** Roster position label per player, keyed by playerKeyOf(player). */
  positionLabels: Readonly<Record<string, string>>;
  generatedAtUtc: string;
  /** Allow invented test lines. Marks the artifact synthetic. */
  allowSynthetic?: boolean;
  /** True when the DvP rows are invented test data. */
  dvpIsSynthetic?: boolean;
  /** Show raw sportsbook lines. Default true; the public builder sets false until redistribution rights are affirmatively confirmed. */
  publishLines?: boolean;
  /** Withhold a stale line instead of showing it flagged. Default false; the public builder sets true. */
  withholdStale?: boolean;
}

interface LineGates {
  allowSynthetic: boolean;
  publishLines: boolean;
  withholdStale: boolean;
}

export const LINES_NOT_PUBLISHED_REASON = "sportsbook lines are not published (redistribution rights unresolved)";

function withholdReason(s: NbaPregameSnapshot, gates: LineGates): string | null {
  if (!gates.publishLines) return LINES_NOT_PUBLISHED_REASON;
  if (s.source.method === "synthetic" && !gates.allowSynthetic) return "synthetic line";
  if (!s.permissions.permittedUses.includes("public-display")) return "source license does not permit public display of lines";
  if (s.permissions.attestation?.backfilled) return "backfilled after tipoff; capture time cannot be verified";
  if (s.freshness.status === "unknown") return "line age could not be established";
  if (gates.withholdStale && s.freshness.status === "stale") return "line is stale";
  return null;
}

function opponentOf(s: NbaPregameSnapshot): string | null {
  const { team } = s.player;
  const { awayTeam, homeTeam, neutralSite } = s.game;
  if (!team || neutralSite) return null;
  if (team === awayTeam) return homeTeam;
  return team === homeTeam ? awayTeam : null;
}

function toEntry(s: NbaPregameSnapshot, positionLabels: Readonly<Record<string, string>>, gates: LineGates): BoardEntry {
  const reason = withholdReason(s, gates);
  const line: BoardLine | null =
    reason === null
      ? { sportsbook: s.source.sportsbook, line: s.line, overPrice: s.overPrice, underPrice: s.underPrice, capturedAtUtc: s.timing.capturedAtUtc, freshness: s.freshness.status, ageMinutes: s.freshness.ageMinutes }
      : null;
  const p = s.projection;
  return {
    entryKey: s.marketKey,
    playerName: s.player.sourcePlayerName,
    team: s.player.team,
    opponent: opponentOf(s),
    gameKey: s.game.canonicalGameKey,
    tipoffUtc: s.game.tipoffUtc,
    positionLabel: positionLabels[playerKeyOf(s.player)] ?? null,
    market: s.market,
    line,
    lineWithheldReason: reason,
    projection: p.value !== null && p.modelVersion !== null ? { value: p.value, minutes: p.minutes, modelVersion: p.modelVersion } : null,
    projectionUnavailableReason: p.value === null ? p.unavailableReason : null,
  };
}

export function buildPropsBoardArtifact(input: BoardArtifactInput): PropsBoardArtifact {
  const allowSynthetic = input.allowSynthetic ?? false;
  const gates: LineGates = { allowSynthetic, publishLines: input.publishLines ?? true, withholdStale: input.withholdStale ?? false };
  const latest = new Map<string, NbaPregameSnapshot>();
  for (const s of input.snapshots) {
    const known = latest.get(s.marketKey);
    if (!known || s.timing.capturedAtUtc > known.timing.capturedAtUtc) latest.set(s.marketKey, s);
  }
  const kept = [...latest.values()].filter((s) => allowSynthetic || s.source.method !== "synthetic");
  const entries = kept
    .map((s) => toEntry(s, input.positionLabels, gates))
    .sort((a, b) => a.gameKey.localeCompare(b.gameKey) || a.playerName.localeCompare(b.playerName) || a.market.localeCompare(b.market) || a.entryKey.localeCompare(b.entryKey));
  const dvpUpdated = input.dvpRows.reduce<string | null>((max, r) => (max === null || r.lastUpdatedUtc > max ? r.lastUpdatedUtc : max), null);
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    isSynthetic: kept.some((s) => s.source.method === "synthetic") || (input.dvpIsSynthetic ?? false),
    sources: { lines: [...new Set(kept.map((s) => s.source.sourceId))].sort(), dvp: input.dvpRows[0]?.sourceId ?? null, dvpUpdatedUtc: dvpUpdated },
    entries,
    dvpRows: [...input.dvpRows],
  };
}
