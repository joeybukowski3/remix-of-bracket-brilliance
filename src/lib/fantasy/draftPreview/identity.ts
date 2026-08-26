/**
 * Identity join: Sleeper draft-board rows -> the existing canonical JKB
 * fantasy player authority (`FANTASY_RANKINGS`).
 *
 * Exact/fail-closed only. Reuses the canonical name-normalization helper
 * already established for ROS research joins
 * (`normalizedFantasyPlayerKey` in `rosPlayerIdentity.ts`) so this module
 * introduces no new identity logic -- only a small, reviewed alias list for
 * genuine Sleeper-name vs. JKB-workbook-name differences. No fuzzy matching.
 */
import { normalizedFantasyPlayerKey } from "@/lib/fantasy/rosPlayerIdentity";
import { FANTASY_RANKINGS, type FantasyPosition, type FantasyRankingRow } from "@/lib/fantasy/rankings";
import type { SleeperDraftBoardRow } from "@/lib/fantasy/draftPreview/sleeperCsv";

/**
 * The JKB board only ranks QB/RB/WR/TE. Sleeper's POS column also carries
 * DEF, K and dual-eligibility codes (e.g. "DB/WR" for a two-way rookie).
 * This maps a source POS to the JKB-tracked position it corresponds to, or
 * `null` when the position is out of the JKB board's scope entirely (DEF/K)
 * -- those rows are preserved in the artifact but never attempted against
 * FANTASY_RANKINGS.
 */
const SOURCE_POSITION_TO_CANONICAL: Readonly<Record<string, FantasyPosition | null>> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  DEF: null,
  K: null,
  // Travis Hunter is drafted/ranked as a WR in the JKB workbook.
  "DB/WR": "WR",
};

export function canonicalPositionForSource(sourcePosition: string): FantasyPosition | null {
  return SOURCE_POSITION_TO_CANONICAL[sourcePosition] ?? null;
}

/**
 * Reviewed Sleeper-name -> JKB-workbook-name differences. The JKB workbook
 * keeps Jr./III suffixes for these three players; the Sleeper source drops
 * them. Verified 1:1 by position (WR/WR/TE match on both sides) before
 * being added here -- this list intentionally stays small.
 */
export const SLEEPER_NAME_ALIASES: Readonly<Record<string, string>> = {
  "WR:brianthomas": "Brian Thomas Jr.",
  "WR:marvinharrison": "Marvin Harrison Jr.",
  "TE:haroldfannin": "Harold Fannin Jr.",
  "RB:kennygainwell": "Kenneth Gainwell",
  "WR:kcconcepcion": "Kevin Concepcion",
  // Spelling variant; canonical nflverse id BrooJo02 confirms one RB/CAR player.
  "RB:jonathanbrooks": "Jonathon Brooks",
  // Nickname vs. full first name; canonical nflverse id OkonCh00 confirms one TE.
  "TE:chigokonkwo": "Chigoziem Okonkwo",
  // Spelling variant; canonical nflverse id BlueJa01 confirms one RB/DAL player.
  "RB:jaydenblue": "Jaydon Blue",
};

export type DraftPreviewIdentityMatch = {
  sleeperRow: SleeperDraftBoardRow;
  jkbRow: FantasyRankingRow;
};

export type DraftPreviewIdentityUnresolved = {
  sleeperRow: SleeperDraftBoardRow;
  /** Why no JKB row was joined. */
  reason: "out-of-scope-position" | "no-exact-match";
};

export type DraftPreviewIdentityResult = {
  totalSourceRows: number;
  resolved: readonly DraftPreviewIdentityMatch[];
  unresolved: readonly DraftPreviewIdentityUnresolved[];
  /** Sleeper rows whose normalized key matched more than one JKB row. Always empty when JKB has no duplicate keys. */
  ambiguous: readonly SleeperDraftBoardRow[];
  /** JKB rows matched by more than one Sleeper source row. */
  duplicateCanonicalMatches: readonly { jkbRow: FantasyRankingRow; sleeperRows: readonly SleeperDraftBoardRow[] }[];
};

function buildJkbIndex(rows: readonly FantasyRankingRow[]): ReadonlyMap<string, FantasyRankingRow> {
  const index = new Map<string, FantasyRankingRow>();
  for (const row of rows) {
    const key = normalizedFantasyPlayerKey(row.position, row.player);
    if (index.has(key)) {
      throw new Error(`Duplicate JKB ranking key for ${row.player} (${row.position}).`);
    }
    index.set(key, row);
  }
  return index;
}

export function buildDraftPreviewIdentity(
  sleeperRows: readonly SleeperDraftBoardRow[] = [],
  jkbRows: readonly FantasyRankingRow[] = FANTASY_RANKINGS.rows,
): DraftPreviewIdentityResult {
  const jkbByKey = buildJkbIndex(jkbRows);
  const resolved: DraftPreviewIdentityMatch[] = [];
  const unresolved: DraftPreviewIdentityUnresolved[] = [];
  const matchedSleeperRowsByJkbKey = new Map<string, SleeperDraftBoardRow[]>();

  for (const sleeperRow of sleeperRows) {
    const canonicalPosition = canonicalPositionForSource(sleeperRow.sourcePosition);
    if (!canonicalPosition) {
      unresolved.push({ sleeperRow, reason: "out-of-scope-position" });
      continue;
    }
    const rawKey = normalizedFantasyPlayerKey(canonicalPosition, sleeperRow.player);
    const aliasedName = SLEEPER_NAME_ALIASES[rawKey];
    const key = aliasedName ? normalizedFantasyPlayerKey(canonicalPosition, aliasedName) : rawKey;
    const jkbRow = jkbByKey.get(key);
    if (!jkbRow) {
      unresolved.push({ sleeperRow, reason: "no-exact-match" });
      continue;
    }
    resolved.push({ sleeperRow, jkbRow });
    const bucket = matchedSleeperRowsByJkbKey.get(key) ?? [];
    bucket.push(sleeperRow);
    matchedSleeperRowsByJkbKey.set(key, bucket);
  }

  const duplicateCanonicalMatches = [...matchedSleeperRowsByJkbKey.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ jkbRow: jkbByKey.get(key)!, sleeperRows: rows }));

  return {
    totalSourceRows: sleeperRows.length,
    resolved,
    unresolved,
    // The JKB index is built with hard duplicate-key failure above, so one
    // normalized Sleeper key can only ever resolve to one JKB row.
    ambiguous: [],
    duplicateCanonicalMatches,
  };
}
