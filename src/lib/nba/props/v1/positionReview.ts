/**
 * The unclassified-position gap: why players have no position, and a prioritized list for a human to review.
 *
 * Nothing here classifies anyone. Weak Wikidata evidence (a label that exists only on a season-, team- or end-date-scoped
 * statement, or only a hybrid label such as "swingman") is shown to the reviewer as a candidate, never applied. The only
 * way a player leaves the list is a manual override with a stated reason, read back from the reviewed CSV, and only for a
 * player that exists in the hoopR data.
 *
 * Ordering: by combined minutes across both seasons, highest first, because minutes decide how much DvP coverage a
 * decision buys. `onSlate` marks players whose team plays on the current slate, so a reviewer can start with the board.
 */
import { DVP_POSITIONS, type DvpPosition } from "../dvpPositions";
import { readCsvTable } from "../pipeline/csv";
import type { PlayerSeasonSummary } from "./hooprAdapter";
import type { EvidenceKind, PositionOverrides, UnclassifiedPlayer } from "./positionMapper";

const ESPN_ALLOWS: Readonly<Record<string, readonly DvpPosition[]>> = Object.freeze({ G: ["PG", "SG"], F: ["SF", "PF"], C: ["C"], PG: ["PG"], SG: ["SG"], SF: ["SF"], PF: ["PF"] });
export const TOP_N_STEPS = [25, 50, 100] as const;
const MIN_REASON_CHARS = 5;

export interface ReviewEntry {
  priority: number;
  playerId: string;
  name: string;
  /** Team of the player's latest 2026-27 game, or of the latest game overall when he has none this season. */
  team: string;
  onSlate: boolean;
  minutes: Record<string, number>;
  games: Record<string, number>;
  /** ESPN's most frequent position listing for the player, or "none". */
  espnListing: string;
  /** The positions ESPN's listing allows, as a hint for the reviewer. */
  allowedByEspn: DvpPosition[];
  evidence: UnclassifiedPlayer["evidence"];
}

interface Bucket {
  players: number;
  minutes: number;
  /** Share of the season's total player minutes (0-1). */
  minutesShare: number;
}

export interface SeasonGap {
  totalMinutes: number;
  unclassifiedPlayers: number;
  unclassifiedMinutes: number;
  unclassifiedMinutesShare: number;
  byEvidence: Partial<Record<EvidenceKind, Bucket>>;
  byEspnListing: Record<string, Bucket>;
  /** Unclassified minutes that have only weak Wikidata evidence (a scoped or hybrid label): shown to reviewers, never applied. */
  weakEvidenceMinutesShare: number;
  /** If the top N unclassified players (by this season's minutes) were classified: the share of the gap closed and the resulting coverage. */
  topN: Record<string, { gapClosedShare: number; coverageWouldBe: number }>;
}

const espnListingOf = (p: PlayerSeasonSummary): string => Object.entries(p.espnPositions).filter(([c]) => c in ESPN_ALLOWS).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "none";
const share = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

function bucketOf(rows: readonly PlayerSeasonSummary[], total: number): Bucket {
  const minutes = rows.reduce((sum, p) => sum + p.minutes, 0);
  return { players: rows.length, minutes: Math.round(minutes), minutesShare: share(minutes, total) };
}

function seasonGap(season: string, allPlayers: readonly PlayerSeasonSummary[], unclassified: readonly UnclassifiedPlayer[]): SeasonGap {
  const total = allPlayers.filter((p) => p.season === season).reduce((sum, p) => sum + p.minutes, 0);
  const rows = unclassified.filter((u) => u.summary.season === season);
  const byEvidence: SeasonGap["byEvidence"] = {};
  for (const kind of new Set(rows.map((u) => u.evidence.kind))) byEvidence[kind] = bucketOf(rows.filter((u) => u.evidence.kind === kind).map((u) => u.summary), total);
  const byEspnListing: SeasonGap["byEspnListing"] = {};
  for (const listing of new Set(rows.map((u) => espnListingOf(u.summary)))) byEspnListing[listing] = bucketOf(rows.filter((u) => espnListingOf(u.summary) === listing).map((u) => u.summary), total);
  const gap = rows.reduce((sum, u) => sum + u.summary.minutes, 0);
  const sorted = [...rows].sort((a, b) => b.summary.minutes - a.summary.minutes);
  const weak = rows.filter((u) => u.evidence.scopedCandidates.length > 0 || u.evidence.hybridLabels.length > 0).reduce((sum, u) => sum + u.summary.minutes, 0);
  return {
    totalMinutes: Math.round(total),
    unclassifiedPlayers: rows.length,
    unclassifiedMinutes: Math.round(gap),
    unclassifiedMinutesShare: share(gap, total),
    byEvidence,
    byEspnListing,
    weakEvidenceMinutesShare: share(weak, total),
    topN: Object.fromEntries(
      TOP_N_STEPS.map((n) => {
        const covered = sorted.slice(0, n).reduce((sum, u) => sum + u.summary.minutes, 0);
        return [String(n), { gapClosedShare: share(covered, gap), coverageWouldBe: share(total - gap + covered, total) }];
      }),
    ),
  };
}

export interface GapReview {
  entries: ReviewEntry[];
  analysis: Record<string, SeasonGap>;
}

/** Collapses the unclassified player-seasons into one prioritized entry per player, and analyses the gap per season. */
export function buildReviewList(unclassified: readonly UnclassifiedPlayer[], allPlayers: readonly PlayerSeasonSummary[], slateTeams: ReadonlySet<string> = new Set()): GapReview {
  const byPlayer = new Map<string, UnclassifiedPlayer[]>();
  for (const u of unclassified) byPlayer.set(u.summary.playerId, [...(byPlayer.get(u.summary.playerId) ?? []), u]);
  const entries = [...byPlayer.values()]
    .map((list): Omit<ReviewEntry, "priority"> => {
      const latest = [...list].sort((a, b) => b.summary.season.localeCompare(a.summary.season))[0];
      const minutes: Record<string, number> = {};
      const games: Record<string, number> = {};
      for (const u of list) {
        minutes[u.summary.season] = Math.round(u.summary.minutes);
        games[u.summary.season] = u.summary.games;
      }
      const listing = espnListingOf(latest.summary);
      return { playerId: latest.summary.playerId, name: latest.summary.name, team: latest.summary.team, onSlate: list.some((u) => u.summary.season === "2026-27") && slateTeams.has(latest.summary.team), minutes, games, espnListing: listing, allowedByEspn: [...(ESPN_ALLOWS[listing] ?? DVP_POSITIONS)], evidence: latest.evidence };
    })
    .sort((a, b) => Object.values(b.minutes).reduce((x, y) => x + y, 0) - Object.values(a.minutes).reduce((x, y) => x + y, 0) || a.playerId.localeCompare(b.playerId))
    .map((e, i) => ({ priority: i + 1, ...e }));
  const seasons = [...new Set(allPlayers.map((p) => p.season))].sort();
  return { entries, analysis: Object.fromEntries(seasons.map((s) => [s, seasonGap(s, allPlayers, unclassified)])) };
}

const CSV_COLUMNS = ["priority", "playerId", "name", "team", "onSlate", "minutes2025-26", "minutes2026-27", "espnListing", "allowedByEspn", "evidence", "wikidataItem", "scopedCandidates", "hybridLabels", "primary", "secondary", "reason"] as const;

/** A spreadsheet treats a leading = + - @ as a formula: neutralize it so a name or label can never execute. */
const safe = (text: string): string => (/^[\s=+\-@]/.test(text) ? `'${text}` : text);
/** Every cell is neutralized, not only the ones that hold free text today, so a new column cannot reopen the hole. */
const cell = (text: string): string => {
  const neutral = safe(text);
  return /[",\n\r]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral;
};

/** One spreadsheet-safe CSV cell (formula-neutralized, quoted when needed). */
export const csvCell = cell;

/** The review list as CSV. The last three columns (primary, secondary, reason) are blank for the reviewer to fill. */
export function reviewListCsv(entries: readonly ReviewEntry[]): string {
  const lines = entries.map((e) =>
    [
      String(e.priority), e.playerId, e.name, e.team, e.onSlate ? "yes" : "no", String(e.minutes["2025-26"] ?? 0), String(e.minutes["2026-27"] ?? 0), e.espnListing, e.allowedByEspn.join("|"),
      e.evidence.kind, e.evidence.qid ?? "", e.evidence.scopedCandidates.join("|"), e.evidence.hybridLabels.join("|"), "", "", "",
    ].map(cell).join(","),
  );
  return `${[CSV_COLUMNS.join(","), ...lines].join("\n")}\n`;
}

/**
 * Reads the reviewed CSV: a row with a `primary` becomes an override for every season the player has in the hoopR data.
 * Rows with no primary are skipped. A `primary` needs a `reason`; `secondary` is separated by | / or spaces.
 * An id that is not in the data, a repeated player, or an invalid position fails the whole file.
 */
export function overridesFromCsv(text: string, players: readonly PlayerSeasonSummary[]): NonNullable<PositionOverrides> {
  const table = readCsvTable(text, ["playerid", "primary", "reason"]);
  const seasonsOf = (id: string) => players.filter((p) => p.playerId === id).map((p) => p.season);
  const seen = new Set<string>();
  const overrides: NonNullable<PositionOverrides> = [];
  for (const { line, values } of table.rows) {
    if (values.primary === "") continue;
    const primary = values.primary.toUpperCase() as DvpPosition;
    if (!DVP_POSITIONS.includes(primary)) throw new Error(`CSV line ${line}: primary must be one of ${DVP_POSITIONS.join(", ")}`);
    if (values.reason.length < MIN_REASON_CHARS) throw new Error(`CSV line ${line}: a primary needs a reason of at least ${MIN_REASON_CHARS} characters`);
    const seasons = seasonsOf(values.playerid);
    if (seasons.length === 0) throw new Error(`CSV line ${line}: player ${values.playerid} is not in the hoopR data (identities are never invented)`);
    if (seen.has(values.playerid)) throw new Error(`CSV line ${line}: player ${values.playerid} appears twice`);
    seen.add(values.playerid);
    const secondary = (values.secondary ?? "").split(/[|/\s,]+/).filter(Boolean).map((t) => t.toUpperCase() as DvpPosition);
    if (secondary.some((t) => !DVP_POSITIONS.includes(t))) throw new Error(`CSV line ${line}: secondary has a position that is not PG, SG, SF, PF or C`);
    for (const season of seasons) overrides.push({ season, playerId: values.playerid, primary, secondary: secondary.filter((t) => t !== primary), reason: values.reason });
  }
  return overrides;
}
