/**
 * Offline assembly of the public props-board artifact (Node side; no network, no provider, no credentials).
 *
 * Inputs are already-validated local records: pregame snapshots (from the pipeline store or converted from
 * a line-capture ledger), projections that name the sources they were built from, a roster, and box-score
 * lines for Defense vs. Position. Every gate fails closed and is counted in the report:
 *
 *   - synthetic data never appears;
 *   - a game that has already started is dropped;
 *   - sportsbook lines are withheld unless `publishLines` is set AND the snapshot's rights include public
 *     display, and a stale, backfilled or age-unknown line is always withheld;
 *   - a projection is accepted only if every source it names permits model development and public display
 *     (effective rights, capped by the source's origin); one built from restricted data never publishes;
 *   - DvP rows are built only from a source whose effective rights include public display.
 *
 * A missing sportsbook line, a missing projection and missing DvP are three different states on the entry and
 * in the report. With nothing qualifying the result is a valid, empty artifact.
 */
import { buildDvpRows, type DvpPlayerGameLine, type DvpRow } from "../dvp";
import { BOARD_SCHEMA_VERSION, BOARD_MARKETS, type BoardEntry, type BoardMarket, type PropsBoardArtifact } from "../propsBoard";
import { effectivePermittedUses } from "../sources/registry";
import { SOURCE_LICENSES } from "../sources/licenses";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { canonicalTeamCode } from "../canonical";
import { normalizePlayerName, type NbaPregameSnapshot } from "./contracts";
import { buildPropsBoardArtifact } from "./propsBoardArtifact";

export interface ProjectionRecord {
  gameKey: string;
  tipoffUtc: string;
  playerName: string;
  team: string | null;
  market: BoardMarket;
  value: number;
  minutes: number | null;
  modelVersion: string;
  /** Latest information the projection used. */
  inputCutoffUtc: string;
  /** Every data source the projection (and its minutes and rate inputs) was built from. */
  inputSourceIds: readonly NbaSourceId[];
}

export interface RosterRecord {
  team: string;
  position: string | null;
}

export interface DvpInput {
  sourceId: NbaSourceId;
  lines: readonly DvpPlayerGameLine[];
}

export interface BoardBuildInput {
  generatedAtUtc: string;
  snapshots: readonly NbaPregameSnapshot[];
  projections: readonly ProjectionRecord[];
  /** Keyed by normalizePlayerName. */
  roster: Readonly<Record<string, RosterRecord>>;
  dvp: DvpInput | null;
  /** Show raw sportsbook lines. Default false: redistribution of raw lines is unconfirmed. */
  publishLines?: boolean;
  /** Rights records; tests inject their own. */
  sourceLicenses?: Readonly<Record<NbaSourceId, SourceLicense>>;
}

export interface BoardBuildReport {
  snapshots: {
    considered: number;
    synthetic: number;
    pastTipoff: number;
    lineWithheld: Record<string, number>;
    linesPublished: number;
    /** Projections stored inside snapshots are not trusted for publication: they do not name their input sources. */
    embeddedProjectionsIgnored: number;
    /** Entries left with neither a publishable line nor an accepted projection. */
    droppedNoContent: number;
  };
  projections: { supplied: number; accepted: number; rejected: Array<{ player: string; market: string; reason: string }> };
  dvp: { status: "included" | "withheld" | "absent"; reason: string | null; rows: number; excludedPlayerGames: number };
  entries: { total: number; withLine: number; withProjection: number; withBoth: number; projectionOnly: number; lineOnly: number };
}

export interface BoardBuildResult {
  artifact: PropsBoardArtifact;
  report: BoardBuildReport;
}

export const NO_LINE_CAPTURED_REASON = "no sportsbook line captured for this player and market";
export const NO_PROJECTION_REASON = "no projection supplied for this player and market";

const GAME_KEY = /^(\d{4}-\d{2}-\d{2})\|([A-Z]{3})@([A-Z]{3})$/;
const teamsOfGame = (gameKey: string): [away: string, home: string] | null => {
  const m = GAME_KEY.exec(gameKey);
  return m ? [m[2], m[3]] : null;
};
const opponentIn = (gameKey: string, team: string | null): string | null => {
  const teams = teamsOfGame(gameKey);
  if (!teams || team === null) return null;
  return team === teams[0] ? teams[1] : team === teams[1] ? teams[0] : null;
};
const slot = (gameKey: string, playerName: string, market: string): string => `${gameKey}|${normalizePlayerName(playerName)}|${market}`;
const isIso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(s) && !Number.isNaN(Date.parse(s));
const bump = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

function projectionRejection(p: ProjectionRecord, generatedMs: number, licenses: Readonly<Record<NbaSourceId, SourceLicense>>): string | null {
  if (!BOARD_MARKETS.includes(p.market)) return "unknown market";
  if (!teamsOfGame(p.gameKey)) return "not a canonical game key";
  if (!isIso(p.tipoffUtc) || !isIso(p.inputCutoffUtc)) return "tipoff or input cutoff is not an ISO UTC instant";
  if (Date.parse(p.tipoffUtc) <= generatedMs) return "game has already started";
  if (Date.parse(p.inputCutoffUtc) > generatedMs) return "inputs postdate the build";
  if (!Number.isFinite(p.value) || p.value < 0) return "projection value is not a non-negative number";
  if (p.minutes !== null && !(Number.isFinite(p.minutes) && p.minutes >= 0 && p.minutes <= 60)) return "minutes outside 0-60";
  if (!p.modelVersion.trim()) return "no model version";
  if (p.inputSourceIds.length === 0) return "does not name the data sources it was built from";
  for (const id of p.inputSourceIds) {
    if (!licenses[id]) return `unknown input source ${id}`;
    const { permittedUses } = effectivePermittedUses(id, licenses);
    if (licenses[id].status === "synthetic") return `built from synthetic source ${id}`;
    if (!permittedUses.includes("model-development") || !permittedUses.includes("public-display")) return `built from ${id}, whose rights do not permit model development and public display`;
  }
  if (p.team !== null && canonicalTeamCode(p.team) !== p.team) return "team is not a canonical code";
  return null;
}

function buildDvp(input: DvpInput | null, licenses: Readonly<Record<NbaSourceId, SourceLicense>>): { rows: DvpRow[]; report: BoardBuildReport["dvp"] } {
  if (input === null) return { rows: [], report: { status: "absent", reason: "no box-score input supplied", rows: 0, excludedPlayerGames: 0 } };
  const withheld = (reason: string) => ({ rows: [], report: { status: "withheld" as const, reason, rows: 0, excludedPlayerGames: 0 } });
  if (!licenses[input.sourceId]) return withheld(`unknown source ${input.sourceId}`);
  if (licenses[input.sourceId].status === "synthetic") return withheld(`synthetic source ${input.sourceId}`);
  if (!effectivePermittedUses(input.sourceId, licenses).permittedUses.includes("public-display")) return withheld(`rights for ${input.sourceId} do not permit public display of derived statistics`);
  const stray = input.lines.find((l) => l.sourceId !== input.sourceId);
  if (stray) return withheld(`box-score line ${stray.gameId}/${stray.playerId} names source ${stray.sourceId}, not ${input.sourceId}`);
  const built = buildDvpRows(input.lines);
  return { rows: built.rows, report: { status: "included", reason: null, rows: built.rows.length, excludedPlayerGames: built.excluded.length } };
}

export function assembleBoard(input: BoardBuildInput): BoardBuildResult {
  const licenses = input.sourceLicenses ?? SOURCE_LICENSES;
  const publishLines = input.publishLines ?? false;
  const generatedMs = Date.parse(input.generatedAtUtc);
  if (!isIso(input.generatedAtUtc)) throw new Error("generatedAtUtc must be an ISO UTC instant");

  const snapshotReport: BoardBuildReport["snapshots"] = { considered: input.snapshots.length, synthetic: 0, pastTipoff: 0, lineWithheld: {}, linesPublished: 0, embeddedProjectionsIgnored: 0, droppedNoContent: 0 };
  const live: NbaPregameSnapshot[] = [];
  for (const s of input.snapshots) {
    if (s.source.method === "synthetic") snapshotReport.synthetic += 1;
    else if (Date.parse(s.game.tipoffUtc) <= generatedMs) snapshotReport.pastTipoff += 1;
    else live.push(s);
  }

  const projectionReport: BoardBuildReport["projections"] = { supplied: input.projections.length, accepted: 0, rejected: [] };
  const accepted = new Map<string, ProjectionRecord>();
  for (const p of input.projections) {
    const reason = projectionRejection(p, generatedMs, licenses);
    if (reason) {
      projectionReport.rejected.push({ player: p.playerName, market: p.market, reason });
      continue;
    }
    const key = slot(p.gameKey, p.playerName, p.market);
    const known = accepted.get(key);
    if (!known || p.inputCutoffUtc > known.inputCutoffUtc) accepted.set(key, p);
  }
  projectionReport.accepted = accepted.size;

  const dvp = buildDvp(input.dvp, licenses);
  const base = buildPropsBoardArtifact({ snapshots: live, dvpRows: dvp.rows, positionLabels: {}, generatedAtUtc: input.generatedAtUtc, publishLines, withholdStale: true, allowSynthetic: false });

  const used = new Set<string>();
  const lineEntries: BoardEntry[] = base.entries.map((entry) => {
    if (entry.lineWithheldReason) bump(snapshotReport.lineWithheld, entry.lineWithheldReason);
    else snapshotReport.linesPublished += 1;
    const key = slot(entry.gameKey, entry.playerName, entry.market);
    const proj = accepted.get(key);
    if (proj) used.add(key);
    const rostered = input.roster[normalizePlayerName(entry.playerName)];
    const team = entry.team ?? (rostered && opponentIn(entry.gameKey, rostered.team) !== null ? rostered.team : proj?.team ?? null);
    if (entry.projection !== null) snapshotReport.embeddedProjectionsIgnored += 1;
    return {
      ...entry,
      team,
      opponent: entry.opponent ?? opponentIn(entry.gameKey, team),
      positionLabel: entry.positionLabel ?? rostered?.position ?? null,
      projection: proj ? { value: proj.value, minutes: proj.minutes, modelVersion: proj.modelVersion } : null,
      projectionUnavailableReason: proj ? null : NO_PROJECTION_REASON,
    };
  });
  const contentful = lineEntries.filter((e) => e.line !== null || e.projection !== null);
  snapshotReport.droppedNoContent = lineEntries.length - contentful.length;
  // Unpublished lines must not leak which sportsbooks posted a prop: one row per player and market, keyed without the book.
  const shown = publishLines ? contentful : [...new Map(contentful.map((e) => [slot(e.gameKey, e.playerName, e.market), { ...e, entryKey: slot(e.gameKey, e.playerName, e.market) }])).values()];

  const projectionOnly: BoardEntry[] = [...accepted.entries()]
    .filter(([key]) => !used.has(key))
    .map(([key, p]) => {
      const rostered = input.roster[normalizePlayerName(p.playerName)];
      const team = p.team ?? (rostered && opponentIn(p.gameKey, rostered.team) !== null ? rostered.team : null);
      return {
        entryKey: `${key}|projection`,
        playerName: p.playerName,
        team,
        opponent: opponentIn(p.gameKey, team),
        gameKey: p.gameKey,
        tipoffUtc: p.tipoffUtc,
        positionLabel: rostered?.position ?? null,
        market: p.market,
        line: null,
        lineWithheldReason: NO_LINE_CAPTURED_REASON,
        projection: { value: p.value, minutes: p.minutes, modelVersion: p.modelVersion },
        projectionUnavailableReason: null,
      };
    });

  const entries = [...shown, ...projectionOnly].sort((a, b) => a.gameKey.localeCompare(b.gameKey) || a.playerName.localeCompare(b.playerName) || a.market.localeCompare(b.market) || a.entryKey.localeCompare(b.entryKey));
  const withLine = entries.filter((e) => e.line !== null).length;
  const withProjection = entries.filter((e) => e.projection !== null).length;
  const withBoth = entries.filter((e) => e.line !== null && e.projection !== null).length;

  const artifact: PropsBoardArtifact = {
    schemaVersion: BOARD_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    isSynthetic: false,
    // Lines are not part of the public artifact unless published; the provider is credited only when its lines are shown.
    sources: { lines: withLine > 0 ? base.sources.lines : [], dvp: dvp.rows.length ? input.dvp!.sourceId : null, dvpUpdatedUtc: base.sources.dvpUpdatedUtc },
    entries,
    dvpRows: dvp.rows,
  };
  return {
    artifact,
    report: {
      snapshots: snapshotReport,
      projections: projectionReport,
      dvp: dvp.report,
      entries: { total: entries.length, withLine, withProjection, withBoth, projectionOnly: projectionOnly.length, lineOnly: entries.filter((e) => e.line !== null && e.projection === null).length },
    },
  };
}
