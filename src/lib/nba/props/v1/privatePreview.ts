/**
 * Private preview board: projections and approximate DvP from a source whose rights allow PRIVATE RESEARCH but not
 * publication (hoopR/ESPN today). This is deliberately a separate path from the public board builder
 * (pipeline/boardBuild.ts), whose rights gates are not touched and still withhold everything from such a source.
 *
 * What keeps it private:
 *  - every source behind an input must carry an effective private-research right in the registry, must not be
 *    synthetic, and must NOT already be publicly licensed (a source that may be published goes through the public
 *    builder, not this one);
 *  - the artifact carries `privatePreview` with a notice and an attribution the page must show, and a sportsbook line only
 *    from a stored odds capture whose rights include private research (v1/privateLines.ts);
 *  - the runner writes it only under data/nba/ (gitignored, excluded from deployment), never under public/;
 *  - nothing here reads the network, a secret or a sportsbook.
 * The owner's decision to use the data privately is not the upstream owner's permission, and the notice says so.
 */
import { canonicalTeamCode } from "../canonical";
import { buildDvpRows } from "../dvp";
import { normalizePlayerName } from "../pipeline/contracts";
import type { DvpInput, ProjectionRecord, RosterRecord } from "../pipeline/boardBuild";
import type { NbaLineCapture } from "../pipeline/lineCapture";
import { BOARD_MARKETS, BOARD_SCHEMA_VERSION, type BoardEntry, type PropsBoardArtifact } from "../propsBoard";
import type { OpponentBoxScores, OpponentRecentSequence } from "../recentForm";
import type { SeasonStatsView } from "../seasonStats";
import { SOURCE_LICENSES } from "../sources/licenses";
import { effectivePermittedUses } from "../sources/registry";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { attachPrivateLines, type PrivateLineReport } from "./privateLines";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const GAME_KEY = /^(\d{4}-\d{2}-\d{2})\|([A-Z]{3})@([A-Z]{3})$/;
const MAX_MINUTES = 60;

export const NO_LINE_REASON = "no sportsbook line in a private preview";

export interface PrivatePreviewInput {
  generatedAtUtc: string;
  projections: readonly ProjectionRecord[];
  roster: Readonly<Record<string, RosterRecord>>;
  dvp: DvpInput | null;
  /** Season-to-date production by `gameKey|normalized name` (v1/seasonStatsBuild.ts); shown only because this board is private. */
  seasonStats?: Readonly<Record<string, SeasonStatsView>>;
  /** Opponent last-ten allowed sequences by `gameKey|team|position` (v1/opponentRecentBuild.ts); shown only because this board is private. */
  opponentRecent?: Readonly<Record<string, OpponentRecentSequence>>;
  /** The individual opposing players behind those sequences by `gameKey|team` (v1/opponentRecentBuild.ts); shown only because this board is private. */
  opponentBoxScores?: Readonly<OpponentBoxScores>;
  /** Stored odds captures (pipeline/lineCapture.ts) whose lines are joined to the entries; none means no lines (v1/privateLines.ts). */
  captures?: readonly NbaLineCapture[];
  /** Rights records; defaults to the repository registry. A test seam. */
  licenses?: Readonly<Record<NbaSourceId, SourceLicense>>;
}

export interface PrivatePreviewReport {
  sources: string[];
  projections: { supplied: number; shown: number; rejected: Array<{ player: string; market: string; reason: string }> };
  dvp: { rows: number; excludedPlayerGames: number };
  /** What happened to every captured line; null when no capture was supplied. */
  lines: PrivateLineReport | null;
  entries: number;
}

const attributionFor = (sources: readonly string[], lineSources: readonly string[]): string =>
  [
    ...sources.map((id) => (id === "hoopr-espn" ? "Data: hoopR (sportsdataverse, CC BY 4.0), derived from ESPN; columns selected and non-playing rows excluded" : `Data: ${id}`)),
    ...(lineSources.length > 0 ? [`Lines: ${lineSources.map((id) => (id === "the-odds-api" ? "The Odds API" : id)).join(", ")}, for private research only; raw odds are not redistributed`] : []),
  ].join("; ");

const noticeFor = (sources: readonly string[]): string =>
  `PRIVATE PREVIEW. Built from ${sources.join(", ")} data under the owner's decision to use it for private analysis. The upstream owner's commercial and public reuse terms are unresolved, and this decision is not their permission. Not licensed for publication: do not publish, share or deploy this board.`;

/** Throws unless the source may feed a private preview and may not already be published through the public builder. */
export function assertPrivatePreviewSource(id: NbaSourceId, licenses: Readonly<Record<NbaSourceId, SourceLicense>>): void {
  const license = licenses[id];
  if (!license) throw new Error(`unknown source ${id}`);
  if (license.status === "synthetic") throw new Error(`source ${id} is synthetic; invented data never appears on the board`);
  const { permittedUses } = effectivePermittedUses(id, licenses);
  if (!permittedUses.includes("private-research")) throw new Error(`source ${id} has no effective private-research right in the registry, so no private preview may be built from it`);
  if (permittedUses.includes("public-display")) throw new Error(`source ${id} may be published: build the public board instead of a private preview`);
}

const teamsOf = (gameKey: string): [string, string] | null => {
  const m = GAME_KEY.exec(gameKey);
  return m ? [m[2], m[3]] : null;
};

function problemWith(p: ProjectionRecord, generatedMs: number): string | null {
  if (!BOARD_MARKETS.includes(p.market)) return "unknown market";
  if (!teamsOf(p.gameKey)) return "not a canonical game key";
  if (!ISO_UTC.test(p.tipoffUtc) || !ISO_UTC.test(p.inputCutoffUtc)) return "tipoff or input cutoff is not an ISO UTC instant";
  if (Date.parse(p.tipoffUtc) <= generatedMs) return "game has already started";
  if (Date.parse(p.inputCutoffUtc) > generatedMs) return "inputs postdate the build";
  if (!Number.isFinite(p.value) || p.value < 0) return "projection value is not a non-negative number";
  if (p.minutes !== null && !(Number.isFinite(p.minutes) && p.minutes >= 0 && p.minutes <= MAX_MINUTES)) return "minutes outside 0-60";
  if (!p.modelVersion.trim()) return "no model version";
  if (p.team !== null && canonicalTeamCode(p.team) !== p.team) return "team is not a canonical code";
  return null;
}

function entryFor(p: ProjectionRecord, roster: PrivatePreviewInput["roster"], seasonStats: PrivatePreviewInput["seasonStats"]): BoardEntry {
  const rostered = roster[normalizePlayerName(p.playerName)];
  const teams = teamsOf(p.gameKey) as [string, string];
  const team = p.team ?? rostered?.team ?? null;
  const opponent = team === teams[0] ? teams[1] : team === teams[1] ? teams[0] : null;
  return {
    entryKey: `${p.gameKey}|${normalizePlayerName(p.playerName)}|${p.market}|private`,
    playerName: p.playerName,
    team,
    opponent,
    gameKey: p.gameKey,
    tipoffUtc: p.tipoffUtc,
    positionLabel: rostered?.position ?? null,
    market: p.market,
    line: null,
    lineWithheldReason: NO_LINE_REASON,
    projection: { value: p.value, minutes: p.minutes, modelVersion: p.modelVersion },
    projectionUnavailableReason: null,
    ...(seasonStats?.[`${p.gameKey}|${normalizePlayerName(p.playerName)}`] ? { seasonStats: seasonStats[`${p.gameKey}|${normalizePlayerName(p.playerName)}`] } : {}),
  };
}

export function buildPrivatePreviewBoard(input: PrivatePreviewInput): { artifact: PropsBoardArtifact; report: PrivatePreviewReport } {
  const licenses = input.licenses ?? SOURCE_LICENSES;
  if (!ISO_UTC.test(input.generatedAtUtc)) throw new Error("generatedAtUtc must be an ISO UTC instant");
  const generatedMs = Date.parse(input.generatedAtUtc);
  const sources = [...new Set([...input.projections.flatMap((p) => p.inputSourceIds), ...(input.dvp ? [input.dvp.sourceId] : [])])].sort();
  if (sources.length === 0) throw new Error("nothing to preview: no projection or DvP source");
  for (const id of sources) assertPrivatePreviewSource(id, licenses);

  const rejected: PrivatePreviewReport["projections"]["rejected"] = [];
  const slots = new Map<string, ProjectionRecord>();
  for (const p of input.projections) {
    const reason = problemWith(p, generatedMs);
    if (reason) rejected.push({ player: p.playerName, market: p.market, reason });
    else {
      const key = `${p.gameKey}|${normalizePlayerName(p.playerName)}|${p.market}`;
      const known = slots.get(key);
      if (!known || p.inputCutoffUtc > known.inputCutoffUtc) slots.set(key, p);
    }
  }
  const stray = input.dvp?.lines.find((l) => l.sourceId !== input.dvp?.sourceId);
  if (stray) throw new Error(`box-score line ${stray.gameId}/${stray.playerId} names source ${stray.sourceId}, not ${input.dvp?.sourceId}`);
  const dvp = input.dvp ? buildDvpRows(input.dvp.lines) : { rows: [], excluded: [] };
  const projected = [...slots.values()]
    .map((p) => entryFor(p, input.roster, input.seasonStats))
    .sort((a, b) => a.gameKey.localeCompare(b.gameKey) || a.playerName.localeCompare(b.playerName) || a.market.localeCompare(b.market));
  const captures = input.captures ?? [];
  const attached = captures.length > 0 ? attachPrivateLines(projected, captures) : null;
  const entries = attached?.entries ?? projected;
  const lineSources = attached?.report.sources ?? [];
  const artifact: PropsBoardArtifact = {
    schemaVersion: BOARD_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    isSynthetic: false,
    sources: { lines: lineSources, dvp: dvp.rows.length > 0 && input.dvp ? input.dvp.sourceId : null, dvpUpdatedUtc: dvp.rows.length > 0 ? dvp.rows.map((r) => r.lastUpdatedUtc).sort().at(-1) ?? null : null },
    entries,
    dvpRows: dvp.rows,
    // Present even when empty (early season: no completed games yet) so the page can tell "no games" from "built before this existed".
    ...(input.opponentRecent ? { opponentRecent: { ...input.opponentRecent } } : {}),
    ...(input.opponentBoxScores ? { opponentBoxScores: { ...input.opponentBoxScores } } : {}),
    privatePreview: { notice: noticeFor(sources), attribution: attributionFor(sources, lineSources) },
  };
  return {
    artifact,
    report: { sources, projections: { supplied: input.projections.length, shown: slots.size, rejected }, dvp: { rows: dvp.rows.length, excludedPlayerGames: dvp.excluded.length }, lines: attached?.report ?? null, entries: entries.length },
  };
}
