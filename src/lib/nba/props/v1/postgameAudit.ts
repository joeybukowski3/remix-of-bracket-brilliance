/**
 * Postgame audit of one game's points projections against the captured sportsbook lines and the final box score.
 *
 * Pure: it reads an immutable pregame board, the write-once line captures and a final box score, and returns a report. It
 * writes nothing, recomputes no projection and changes no model; the projection and the line it scores are the ones the board
 * showed before tipoff. Anything that could let postgame information into the pregame side is refused (AuditLookaheadError):
 * a board built after tipoff, model inputs cut off after the board was built, a displayed line captured after the board was
 * built, a box score retrieved before tipoff, or a box score that is not a complete game.
 *
 * Sign convention: error = projection (or line) minus actual, so a positive number is an over-prediction.
 * See docs/nba-evaluation-protocol.md.
 */
import { normalizePlayerName } from "../pipeline/contracts";
import type { NbaLineCapture } from "../pipeline/lineCapture";
import type { BoardEntry, BookLineView, ExcludedBookView } from "../propsBoard";
import { isCompleteTeamMinutes } from "./gameResults";
import { attachPrivateLines } from "./privateLines";

export class AuditLookaheadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditLookaheadError";
  }
}

/** One final box-score row, with the team already in the canonical three-letter code. */
export interface FinalBoxRow {
  gameKey: string;
  team: string;
  playerId: string;
  playerName: string;
  minutes: number;
  points: number;
  didNotPlay: boolean;
  started: boolean | null;
}

export interface AuditInput {
  gameKey: string;
  /** The pregame board exactly as it was built; never rebuilt from newer inputs. */
  board: { generatedAtUtc: string; entries: readonly BoardEntry[] };
  /** The write-once captures behind the displayed lines; may be empty (the lines are then taken as displayed). */
  captures: readonly NbaLineCapture[];
  box: readonly FinalBoxRow[];
  boxRetrievedAtUtc: string;
  /** Normalized name to the player ids the pregame history holds, for the identity check. */
  knownPlayerIds?: ReadonlyMap<string, readonly string[]>;
  /** Latest data the projections used, when the build recorded it. */
  projectionInputCutoffUtc?: string;
}

export type GapBand = "<1" | "1-3" | ">=3";
export const GAP_BANDS: readonly GapBand[] = ["<1", "1-3", ">=3"];
/** Below this many scored players the summary is a description, not evidence. */
export const MIN_EVIDENCE_SAMPLE = 30;

export interface PlayerAudit {
  name: string;
  team: string | null;
  position: string | null;
  modelVersion: string;
  projPts: number;
  projMin: number | null;
  line: { line: number; sportsbook: string; overPrice: number; underPrice: number; capturedAtUtc: string } | null;
  /** Each voting book's own line and prices, re-derived from the capture (empty without captures). */
  bookLines: BookLineView[];
  excludedBooks: ExcludedBookView[];
  /** unscorable: played, but the board had no projection or no projected minutes to compare. */
  status: "played" | "dnp" | "no-box-row" | "unscorable";
  actPts: number | null;
  actMin: number | null;
  started: boolean | null;
  ptsErr: number | null;
  minErr: number | null;
  lineErr: number | null;
  projPPM: number | null;
  actPPM: number | null;
  /** Part of ptsErr from projecting the wrong minutes (minErr x projected rate). */
  minutesEffect: number | null;
  /** Part of ptsErr from projecting the wrong scoring rate (actual minutes x rate difference). */
  rateEffect: number | null;
  gap: number | null;
  jkbSide: "Over" | "Under" | null;
  result: "Over" | "Under" | "Push" | null;
  dirHit: boolean | null;
  jkbCloser: boolean | null;
  identity: { boxId: string | null; idMatches: boolean | null; teamMatches: boolean | null };
}

export interface Summary {
  n: number;
  jkbMAE: number;
  jkbME: number;
  lineMAE: number;
  lineME: number;
  minMAE: number;
  minME: number;
  dirHits: number;
  dirN: number;
  closer: number;
  minutesEffect: number;
  rateEffect: number;
}

/** Written into every report so the containment check can recognize a copy outside data/nba; assembled so source files do not contain the literal. */
export const PRIVATE_AUDIT_MARKER = ["jkb", "private", "postgame", "audit"].join("-");

export interface AuditReport {
  /** Always PRIVATE_AUDIT_MARKER: the report carries hoopR/ESPN stats and sportsbook prices. */
  privateMarker: string;
  gameKey: string;
  tipoffUtc: string;
  boardBuiltUtc: string;
  boxRetrievedAtUtc: string;
  captureIds: string[];
  modelVersions: string[];
  finalScore: Record<string, number>;
  players: PlayerAudit[];
  /** Players with a displayed line who played: the sample for line and direction comparisons. */
  matched: Summary | null;
  groups: Record<GapBand, Summary | null>;
  /** Every player who played, line or not: model-only error. */
  allPlayed: { n: number; jkbMAE: number | null; jkbME: number | null; minMAE: number | null; minME: number | null; projTotalPts: number; actTotalPts: number; projTotalMin: number; actTotalMin: number };
  missing: Array<{ name: string; team: string | null; status: "dnp" | "no-box-row" | "unscorable"; projPts: number; projMin: number | null }>;
  warnings: string[];
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** A comparison with an unparseable time is always false, so every guard parses strictly and refuses rather than passing. */
function instant(value: unknown, what: string): number {
  const time = typeof value === "string" && ISO_UTC.test(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) throw new AuditLookaheadError(`the ${what} is missing or not a UTC instant: ${JSON.stringify(value)}`);
  return time;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const nameKey = (name: string): string => normalizePlayerName(name);

function summarize(players: readonly PlayerAudit[]): Summary | null {
  if (players.length === 0) return null;
  const pick = (f: (p: PlayerAudit) => number | null): number[] => players.map((p) => f(p) as number);
  const sided = players.filter((p) => p.dirHit !== null);
  return {
    n: players.length,
    jkbMAE: mean(pick((p) => Math.abs(p.ptsErr as number))),
    jkbME: mean(pick((p) => p.ptsErr)),
    lineMAE: mean(pick((p) => Math.abs(p.lineErr as number))),
    lineME: mean(pick((p) => p.lineErr)),
    minMAE: mean(pick((p) => Math.abs(p.minErr as number))),
    minME: mean(pick((p) => p.minErr)),
    dirHits: sided.filter((p) => p.dirHit).length,
    dirN: sided.length,
    closer: players.filter((p) => p.jkbCloser).length,
    minutesEffect: mean(pick((p) => p.minutesEffect)),
    rateEffect: mean(pick((p) => p.rateEffect)),
  };
}

function bandOf(gap: number): GapBand {
  const size = Math.abs(gap);
  return size < 1 ? "<1" : size < 3 ? "1-3" : ">=3";
}

function assertNoLookahead(input: AuditInput, entries: readonly BoardEntry[], rows: readonly FinalBoxRow[]): string {
  const tipoff = entries[0].tipoffUtc;
  const t = instant(tipoff, "scheduled tipoff");
  const built = instant(input.board.generatedAtUtc, "board build time");
  if (built > t) throw new AuditLookaheadError(`the pregame board was built after tipoff (${input.board.generatedAtUtc} > ${tipoff})`);
  if (input.projectionInputCutoffUtc !== undefined && instant(input.projectionInputCutoffUtc, "model input cutoff") > built) throw new AuditLookaheadError(`the projection input cutoff ${input.projectionInputCutoffUtc} is after the board was built`);
  for (const e of entries) {
    if (!e.line) continue;
    const captured = instant(e.line.capturedAtUtc, `${e.playerName} line capture time`);
    if (captured > built || captured > t) throw new AuditLookaheadError(`${e.playerName}: the displayed line was captured after the board was built or after tipoff`);
  }
  if (instant(input.boxRetrievedAtUtc, "box-score retrieval time") <= t) throw new AuditLookaheadError(`the box score was retrieved before tipoff (${input.boxRetrievedAtUtc})`);
  const minutes = new Map<string, number>();
  for (const r of rows) if (!r.didNotPlay) minutes.set(r.team, (minutes.get(r.team) ?? 0) + r.minutes);
  if (minutes.size !== 2 || [...minutes.values()].some((m) => !isCompleteTeamMinutes(m))) throw new AuditLookaheadError(`the box score is not a complete game (team minutes ${JSON.stringify(Object.fromEntries(minutes))})`);
  return tipoff;
}

export function auditGame(input: AuditInput): AuditReport {
  const entries = input.board.entries.filter((e) => e.gameKey === input.gameKey && e.market === "pts");
  if (entries.length === 0) throw new AuditLookaheadError(`game ${input.gameKey} is not on the pregame board`);
  const rows = input.box.filter((r) => r.gameKey === input.gameKey);
  if (rows.length === 0) throw new AuditLookaheadError(`game ${input.gameKey} is not in the box score`);
  const tipoffUtc = assertNoLookahead(input, entries, rows);

  const warnings: string[] = [];
  if (input.projectionInputCutoffUtc === undefined) warnings.push("no model-input cutoff was recorded for this board, so the check that the projections used no data from after the board was built was not made");
  const builtMs = Date.parse(input.board.generatedAtUtc);
  const captures = input.captures.filter((c) => Date.parse(c.capturedAtUtc) <= builtMs);
  if (captures.length < input.captures.length) warnings.push(`${input.captures.length - captures.length} capture(s) taken after the board was built were ignored: the board never saw their lines`);
  const rederived = new Map<string, BoardEntry>();
  if (captures.length > 0) {
    const bare = entries.map((e): BoardEntry => ({ ...e, line: null, lineWithheldReason: null, lineDetail: undefined }));
    for (const e of attachPrivateLines(bare, captures).entries) rederived.set(e.entryKey, e);
  }
  const rowOf = new Map<string, FinalBoxRow>();
  for (const r of rows) {
    const key = nameKey(r.playerName);
    if (rowOf.has(key)) warnings.push(`two box-score rows share the normalized name "${key}"; matching is by name, so the later row is used and the identity check may flag it`);
    rowOf.set(key, r);
  }

  const players = entries.map((e): PlayerAudit => {
    const box = rowOf.get(nameKey(e.playerName));
    const played = box !== undefined && !box.didNotPlay && box.minutes > 0;
    const again = rederived.get(e.entryKey);
    if (captures.length > 0 && (e.line?.line !== again?.line?.line || e.line?.sportsbook !== again?.line?.sportsbook)) {
      warnings.push(`${e.playerName}: the displayed line (${e.line?.line ?? "none"} ${e.line?.sportsbook ?? ""}) differs from the line re-derived from the capture (${again?.line?.line ?? "none"} ${again?.line?.sportsbook ?? ""}); the displayed line is scored`);
    }
    const ids = input.knownPlayerIds?.get(nameKey(e.playerName));
    const idMatches = box && ids ? ids.length === 1 && ids[0] === box.playerId : null;
    if (idMatches === false) warnings.push(`${e.playerName}: box-score id ${box?.playerId} does not match the pregame history id(s) ${ids?.join(", ")}`);
    const teamMatches = box ? box.team === e.team : null;
    if (teamMatches === false) warnings.push(`${e.playerName}: box-score team ${box?.team} differs from the board team ${e.team}`);

    const projPts = e.projection?.value ?? Number.NaN;
    const projMin = e.projection?.minutes ?? null;
    const base: PlayerAudit = {
      name: e.playerName, team: e.team, position: e.positionLabel, modelVersion: e.projection?.modelVersion ?? "none", projPts, projMin,
      line: e.line ? { line: e.line.line, sportsbook: e.line.sportsbook, overPrice: e.line.overPrice, underPrice: e.line.underPrice, capturedAtUtc: e.line.capturedAtUtc } : null,
      bookLines: (again?.lineDetail?.books ?? []).filter((b) => b.role !== "unknown-age"), excludedBooks: again?.lineDetail?.excluded ?? [],
      status: !box ? "no-box-row" : played ? "played" : "dnp",
      actPts: null, actMin: null, started: box?.started ?? null, ptsErr: null, minErr: null, lineErr: null, projPPM: null, actPPM: null,
      minutesEffect: null, rateEffect: null, gap: null, jkbSide: null, result: null, dirHit: null, jkbCloser: null,
      identity: { boxId: box?.playerId ?? null, idMatches, teamMatches },
    };
    if (played && (projMin === null || projMin <= 0 || !Number.isFinite(projPts))) {
      warnings.push(`${e.playerName}: played but the board had no projected minutes or points to compare, so the player is unscorable`);
      return { ...base, status: "unscorable" };
    }
    if (!played || !box || projMin === null) return base;
    const projPPM = projPts / projMin;
    const actPPM = box.points / box.minutes;
    const scored: PlayerAudit = {
      ...base, actPts: box.points, actMin: box.minutes, ptsErr: projPts - box.points, minErr: projMin - box.minutes, projPPM, actPPM,
      minutesEffect: (projMin - box.minutes) * projPPM, rateEffect: box.minutes * (projPPM - actPPM),
    };
    if (!e.line) return scored;
    const gap = projPts - e.line.line;
    const result = box.points > e.line.line ? "Over" : box.points < e.line.line ? "Under" : "Push";
    const jkbSide = gap > 0 ? "Over" : gap < 0 ? "Under" : null;
    const lineErr = e.line.line - box.points;
    return {
      ...scored, lineErr, gap, jkbSide, result,
      dirHit: jkbSide === null || result === "Push" ? null : jkbSide === result,
      jkbCloser: Math.abs(projPts - box.points) < Math.abs(lineErr),
    };
  });

  const played = players.filter((p) => p.status === "played" && p.ptsErr !== null);
  const matched = played.filter((p) => p.line !== null);
  if (matched.length < MIN_EVIDENCE_SAMPLE) warnings.push(`a sample of ${matched.length} scored players with lines is too small to support a conclusion about the model (${MIN_EVIDENCE_SAMPLE} or more across several games are needed); read these as observations`);
  const groups = Object.fromEntries(GAP_BANDS.map((band) => [band, summarize(matched.filter((p) => bandOf(p.gap as number) === band))])) as Record<GapBand, Summary | null>;
  const teamPoints: Record<string, number> = {};
  for (const r of rows) teamPoints[r.team] = (teamPoints[r.team] ?? 0) + r.points;
  const errs = (f: (p: PlayerAudit) => number | null): number[] => played.map((p) => f(p) as number);

  return {
    privateMarker: PRIVATE_AUDIT_MARKER, gameKey: input.gameKey, tipoffUtc, boardBuiltUtc: input.board.generatedAtUtc, boxRetrievedAtUtc: input.boxRetrievedAtUtc,
    captureIds: captures.map((c) => c.captureId), modelVersions: [...new Set(players.map((p) => p.modelVersion))].sort(),
    finalScore: teamPoints, players, matched: summarize(matched), groups,
    allPlayed: {
      n: played.length,
      jkbMAE: played.length ? mean(errs((p) => Math.abs(p.ptsErr as number))) : null, jkbME: played.length ? mean(errs((p) => p.ptsErr)) : null,
      minMAE: played.length ? mean(errs((p) => Math.abs(p.minErr as number))) : null, minME: played.length ? mean(errs((p) => p.minErr)) : null,
      projTotalPts: sum(played.map((p) => p.projPts)), actTotalPts: sum(played.map((p) => p.actPts as number)),
      projTotalMin: sum(played.map((p) => p.projMin ?? 0)), actTotalMin: sum(played.map((p) => p.actMin as number)),
    },
    missing: players.filter((p) => p.status !== "played").map((p) => ({ name: p.name, team: p.team, status: p.status as "dnp" | "no-box-row" | "unscorable", projPts: p.projPts, projMin: p.projMin })),
    warnings,
  };
}
