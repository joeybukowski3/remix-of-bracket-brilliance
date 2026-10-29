/**
 * Sportsbook lines for the private preview board: joins captured odds (the write-once ledger under data/nba/odds-captures)
 * to the board's projection entries by game, player and market. Pure: no file, network, credential or clock.
 *
 * Every gate is the pipeline's own, reused unchanged: a capture becomes pregame snapshots through `snapshotsFromCapture`
 * (45-240 minute window, canonical game key, rights narrowed to what the record and today's registry both allow). On top of
 * that a line must
 *   - carry a private-research right (a private board is never a publication path);
 *   - name a game that is on the board, and a player and market the board projects in that game (normalized name match;
 *     nothing is guessed, and a near miss is reported, not attached);
 *   - agree with the scheduled tipoff to within an hour.
 * A line whose age cannot be established is withheld; a stale one is shown and flagged. Every line that does not reach the
 * board is reported with its reason.
 *
 * Alternate ladders. A book that posts several distinct lines for one player and market in one capture is posting alternate
 * thresholds. The provider gives every rung the same market key and marks none as the main line, so none is picked (not the
 * middle rung, not the nearest to the others): the book is left out of the vote, its lines are reported as unmatched, and
 * every rung it posted is recorded on the entry. A line that merely moved between two captures is not a ladder, and a book is judged by its newest capture: a newer single line replaces an older ladder, and a newer ladder drops the book's older line.
 *
 * Each entry also carries `lineDetail`: every voting book's own line, prices and timestamps, the book shown (its line and its
 * own prices, never a blend), and the selection rationale. The raw lines stay in the write-once capture.
 */
import { normalizePlayerName, type NbaPregameSnapshot } from "../pipeline/contracts";
import { snapshotsFromCapture, type NbaLineCapture } from "../pipeline/lineCapture";
import { ODDS_SOURCE_LICENSES } from "../pipeline/oddsSources";
import type { BoardEntry, BoardLine, BookLineView, ExcludedBookView, LineDetail } from "../propsBoard";

export const NO_CAPTURED_LINE_REASON = "no sportsbook line captured for this player and market";
export const UNKNOWN_AGE_REASON = "line age could not be established";
export const ALTERNATE_LADDER_REASON = "alternate-line ladder: this book posted several lines for the player and market, and the provider marks none as the main line";
export const ALTERNATE_ONLY_REASON = "only alternate-line ladders were posted; no main line is identified";

const TIPOFF_TOLERANCE_MS = 60 * 60_000;

export interface UnmatchedLine {
  player: string;
  bookmaker: string;
  market: string;
  gameKey: string | null;
  reason: string;
}

export interface PrivateLineReport {
  captures: number;
  /** Every line stored in the captures considered. */
  linesRetrieved: number;
  /** Lines that reached a board entry; the rest are in `unmatched`, so `linesRetrieved = matched + unmatched.length`. */
  matched: number;
  unmatched: UnmatchedLine[];
  /** Matched lines set aside because the same book has a newer (or, over an undated one, a dated) line. */
  superseded: number;
  /** Entries whose only matched lines have an unknown age: no line is shown for them. */
  withheld: number;
  /** Entries that show a line. */
  displayed: number;
  /** Provider ids behind the displayed lines. */
  sources: string[];
}

export interface AttachOptions {
  /** Rights in force now; the narrower of these and each capture's recorded rights applies. A test seam. */
  currentLicenses?: typeof ODDS_SOURCE_LICENSES;
}

const slotOf = (gameKey: string, playerName: string, market: string): string => `${gameKey}|${normalizePlayerName(playerName)}|${market}`;

/** A dated line always beats one of unknown age; otherwise the newer capture wins, and within one capture the newer provider update. */
const newer = (a: NbaPregameSnapshot, b: NbaPregameSnapshot): boolean => {
  const aDated = a.freshness.status !== "unknown";
  if (aDated !== (b.freshness.status !== "unknown")) return aDated;
  return a.timing.capturedAtUtc !== b.timing.capturedAtUtc ? a.timing.capturedAtUtc > b.timing.capturedAtUtc : (a.timing.sourceLastUpdateUtc ?? "") > (b.timing.sourceLastUpdateUtc ?? "");
};

/**
 * The line most books agree on. A tie goes to the value nearest the middle of the posted lines, then to the lower one. The
 * book shown is the one that posted that value most recently (then alphabetically), with its own prices.
 */
function consensus(candidates: readonly NbaPregameSnapshot[]): { snapshot: NbaPregameSnapshot; selection: string } {
  const lines = candidates.map((c) => c.line).sort((a, b) => a - b);
  const middle = lines.length % 2 === 1 ? lines[(lines.length - 1) / 2] : (lines[lines.length / 2 - 1] + lines[lines.length / 2]) / 2;
  const votes = new Map<number, number>();
  for (const line of lines) votes.set(line, (votes.get(line) ?? 0) + 1);
  const ranked = [...votes].sort((a, b) => b[1] - a[1] || Math.abs(a[0] - middle) - Math.abs(b[0] - middle) || a[0] - b[0]);
  const [best, count] = ranked[0];
  const tied = ranked.filter(([, n]) => n === count).map(([line]) => line);
  const snapshot = candidates
    .filter((c) => c.line === best)
    .sort((a, b) => (b.timing.sourceLastUpdateUtc ?? "").localeCompare(a.timing.sourceLastUpdateUtc ?? "") || a.source.sportsbook.localeCompare(b.source.sportsbook))[0];
  const split = tied.length > 1 ? ` The vote was a tie between ${tied.join(" and ")}; the line nearest the middle of the posted lines was taken, then the lower.` : "";
  return {
    snapshot,
    selection: `Line ${best}: ${count} of ${lines.length} books agree.${split} Shown from ${snapshot.source.sportsbook}, the book that posted it most recently, with its own prices.`,
  };
}

const boardLine = (s: NbaPregameSnapshot): BoardLine => ({
  sportsbook: s.source.sportsbook,
  line: s.line,
  overPrice: s.overPrice,
  underPrice: s.underPrice,
  capturedAtUtc: s.timing.capturedAtUtc,
  freshness: s.freshness.status,
  ageMinutes: s.freshness.ageMinutes,
});

const bookView = (s: NbaPregameSnapshot, role: BookLineView["role"]): BookLineView => ({
  sportsbook: s.source.sportsbook,
  line: s.line,
  overPrice: s.overPrice,
  underPrice: s.underPrice,
  sourceLastUpdateUtc: s.timing.sourceLastUpdateUtc,
  capturedAtUtc: s.timing.capturedAtUtc,
  freshness: s.freshness.status,
  ageMinutes: s.freshness.ageMinutes,
  role,
});

export function attachPrivateLines(entries: readonly BoardEntry[], captures: readonly NbaLineCapture[], options: AttachOptions = {}): { entries: BoardEntry[]; report: PrivateLineReport } {
  const licenses = options.currentLicenses ?? ODDS_SOURCE_LICENSES;
  const bySlot = new Map(entries.map((e) => [slotOf(e.gameKey, e.playerName, e.market), e]));
  const boardGames = new Set(entries.map((e) => e.gameKey));
  const unmatched: UnmatchedLine[] = [];
  const latestPerBook = new Map<string, NbaPregameSnapshot>();
  const ladderLines = new Map<string, Set<number>>();
  let linesRetrieved = 0;
  let matched = 0;
  let superseded = 0;

  // Oldest first, so a book's newest capture has the last word: its single line replaces an older ladder, and a newer ladder drops its older line.
  const chronological = [...captures].sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc) || a.captureId.localeCompare(b.captureId));
  for (const capture of chronological) {
    linesRetrieved += capture.lines.length;
    const converted = snapshotsFromCapture(capture, { currentLicenses: licenses });
    for (const r of converted.rejected) unmatched.push({ player: r.player, bookmaker: r.bookmaker, market: r.market, gameKey: capture.event.canonicalGameKey, reason: r.reason });
    const accepted = new Map<string, NbaPregameSnapshot[]>();
    for (const snapshot of converted.snapshots) {
      const { canonicalGameKey: gameKey } = snapshot.game;
      const refuse = (reason: string) => unmatched.push({ player: snapshot.player.sourcePlayerName, bookmaker: snapshot.source.sportsbook, market: snapshot.market, gameKey, reason });
      const entry = bySlot.get(slotOf(gameKey, snapshot.player.sourcePlayerName, snapshot.market));
      if (snapshot.source.method === "synthetic") refuse("synthetic line: invented data never appears on the board");
      else if (!snapshot.permissions.permittedUses.includes("private-research")) refuse("the source's current rights do not permit private research use");
      else if (!boardGames.has(gameKey)) refuse(`game ${gameKey} is not on this board`);
      else if (!entry) refuse("no projection for this player and market in this game");
      else if (Math.abs(Date.parse(snapshot.game.tipoffUtc) - Date.parse(entry.tipoffUtc)) > TIPOFF_TOLERANCE_MS) refuse(`tipoff differs: provider ${snapshot.game.tipoffUtc}, schedule ${entry.tipoffUtc}`);
      else {
        const key = `${slotOf(gameKey, snapshot.player.sourcePlayerName, snapshot.market)}|${snapshot.source.sportsbook}`;
        accepted.set(key, [...(accepted.get(key) ?? []), snapshot]);
      }
    }
    for (const [key, group] of accepted) {
      if (new Set(group.map((s) => s.line)).size > 1) {
        latestPerBook.delete(key);
        ladderLines.set(key, new Set([...(ladderLines.get(key) ?? []), ...group.map((s) => s.line)]));
        for (const s of group) unmatched.push({ player: s.player.sourcePlayerName, bookmaker: s.source.sportsbook, market: s.market, gameKey: s.game.canonicalGameKey, reason: ALTERNATE_LADDER_REASON });
        continue;
      }
      for (const snapshot of group) {
        matched += 1;
        const known = latestPerBook.get(key);
        if (known) superseded += 1;
        if (!known || newer(snapshot, known)) latestPerBook.set(key, snapshot);
      }
      ladderLines.delete(key);
    }
  }

  const slotOfKey = (key: string): string => key.slice(0, key.lastIndexOf("|"));
  const bySlotCandidates = new Map<string, NbaPregameSnapshot[]>();
  for (const [key, snapshot] of latestPerBook) bySlotCandidates.set(slotOfKey(key), [...(bySlotCandidates.get(slotOfKey(key)) ?? []), snapshot]);
  const excludedBySlot = new Map<string, ExcludedBookView[]>();
  for (const [key, lines] of ladderLines) {
    const excluded: ExcludedBookView = { sportsbook: key.slice(key.lastIndexOf("|") + 1), lines: [...lines].sort((a, b) => a - b), reason: ALTERNATE_LADDER_REASON };
    excludedBySlot.set(slotOfKey(key), [...(excludedBySlot.get(slotOfKey(key)) ?? []), excluded].sort((a, b) => a.sportsbook.localeCompare(b.sportsbook)));
  }

  let withheld = 0;
  const shownSources = new Set<string>();
  const attached = entries.map((entry): BoardEntry => {
    const slot = slotOf(entry.gameKey, entry.playerName, entry.market);
    const candidates = bySlotCandidates.get(slot) ?? [];
    const excluded = excludedBySlot.get(slot) ?? [];
    const detail = (selection: string, shown: NbaPregameSnapshot | null): LineDetail => ({
      selection,
      books: [...candidates]
        .sort((a, b) => a.source.sportsbook.localeCompare(b.source.sportsbook))
        .map((c) => bookView(c, c === shown ? "shown" : c.freshness.status === "unknown" ? "unknown-age" : "voted")),
      excluded,
    });
    if (candidates.length === 0) {
      if (excluded.length === 0) return { ...entry, lineWithheldReason: NO_CAPTURED_LINE_REASON };
      return { ...entry, lineWithheldReason: ALTERNATE_ONLY_REASON, lineDetail: detail("No line shown: only alternate ladders were posted, and the provider marks no main line.", null) };
    }
    const dated = candidates.filter((c) => c.freshness.status !== "unknown");
    if (dated.length === 0) {
      withheld += 1;
      return { ...entry, lineWithheldReason: UNKNOWN_AGE_REASON, lineDetail: detail("No line shown: no book's line has an age that can be established.", null) };
    }
    const chosen = consensus(dated);
    shownSources.add(chosen.snapshot.source.sourceId);
    return { ...entry, line: boardLine(chosen.snapshot), lineWithheldReason: null, lineDetail: detail(chosen.selection, chosen.snapshot) };
  });

  return {
    entries: attached,
    report: { captures: captures.length, linesRetrieved, matched, unmatched, superseded, withheld, displayed: attached.filter((e) => e.line !== null).length, sources: [...shownSources].sort() },
  };
}
