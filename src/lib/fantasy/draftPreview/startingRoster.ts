/**
 * Phase 2C Starting Roster: explicit 16-slot roster (1 QB, 2 RB, 2 WR,
 * 2 FLEX, 1 K, 1 DST, 7 BENCH) built purely from the manual `MyDraftState`.
 * Starter assignment is a fixed, isolated display default -- it never
 * drives which players get drafted and never touches any JKB ranking/PAR
 * authority. RB/WR/TE can fill FLEX; K only fills K; DST only fills DST.
 * A row with no JKB Proj PPG is never assigned a starting slot with an
 * invented 0 -- it goes to the bench (or is left out entirely past
 * BENCH7) instead.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { DraftPreviewRow } from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import type { MyDraftState } from "@/lib/fantasy/draftPreview/myDraft";
import type { RosterPosition } from "@/lib/fantasy/draftPreview/rosterPosition";

export type RosterSlotId =
  | "QB"
  | "RB1"
  | "RB2"
  | "WR1"
  | "WR2"
  | "FLEX1"
  | "FLEX2"
  | "K"
  | "DST"
  | "BENCH1"
  | "BENCH2"
  | "BENCH3"
  | "BENCH4"
  | "BENCH5"
  | "BENCH6"
  | "BENCH7";

export const STARTING_ROSTER_SLOT_ORDER: readonly RosterSlotId[] = [
  "QB",
  "RB1",
  "RB2",
  "WR1",
  "WR2",
  "FLEX1",
  "FLEX2",
  "K",
  "DST",
  "BENCH1",
  "BENCH2",
  "BENCH3",
  "BENCH4",
  "BENCH5",
  "BENCH6",
  "BENCH7",
];

const STARTER_SLOT_IDS: ReadonlySet<RosterSlotId> = new Set([
  "QB",
  "RB1",
  "RB2",
  "WR1",
  "WR2",
  "FLEX1",
  "FLEX2",
  "K",
  "DST",
]);

const BENCH_SLOT_COUNT = 7;
const FLEX_SLOT_COUNT = 2;
const FLEX_ELIGIBLE_POSITIONS: readonly FantasyPosition[] = ["RB", "WR", "TE"];
const REQUIRED_STARTER_COUNTS: Readonly<Partial<Record<RosterPosition, number>>> = { QB: 1, RB: 2, WR: 2 };

export type RosterSlotAssignment = {
  slot: RosterSlotId;
  row: DraftPreviewRow | null;
};

type RankableRow = DraftPreviewRow & { jkbProjectedPpg: number };

function isRankable(row: DraftPreviewRow): row is RankableRow {
  return row.jkbProjectedPpg != null;
}

/** Best-PPG-first, sleeperRank-ascending as the deterministic tie-break. */
function sortByPpgThenSleeperRank(rows: RankableRow[]): RankableRow[] {
  return [...rows].sort((a, b) => b.jkbProjectedPpg - a.jkbProjectedPpg || a.sleeperRank - b.sleeperRank);
}

/** K/DST have no JKB PPG authority at all; deterministic tie-break is lowest Sleeper Rank (earliest drafted position on the board). */
function pickBySleeperRank(rows: readonly DraftPreviewRow[]): DraftPreviewRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => a.sleeperRank - b.sleeperRank)[0];
}

export function computeStartingRoster(state: MyDraftState): readonly RosterSlotAssignment[] {
  const drafted = [...state.values()];
  const used = new Set<number>();

  const byPosition: Record<RosterPosition, DraftPreviewRow[]> = { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] };
  for (const row of drafted) {
    if (row.rosterPosition) byPosition[row.rosterPosition].push(row);
  }

  const rankableByPosition: Record<FantasyPosition, RankableRow[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    rankableByPosition[position] = sortByPpgThenSleeperRank(byPosition[position].filter(isRankable));
  }

  const assignments = new Map<RosterSlotId, DraftPreviewRow | null>();

  assignments.set("QB", rankableByPosition.QB[0] ?? null);
  if (rankableByPosition.QB[0]) used.add(rankableByPosition.QB[0].sleeperRank);

  const rbCount = REQUIRED_STARTER_COUNTS.RB ?? 0;
  for (let i = 0; i < rbCount; i += 1) {
    const row = rankableByPosition.RB[i] ?? null;
    assignments.set(i === 0 ? "RB1" : "RB2", row);
    if (row) used.add(row.sleeperRank);
  }

  const wrCount = REQUIRED_STARTER_COUNTS.WR ?? 0;
  for (let i = 0; i < wrCount; i += 1) {
    const row = rankableByPosition.WR[i] ?? null;
    assignments.set(i === 0 ? "WR1" : "WR2", row);
    if (row) used.add(row.sleeperRank);
  }

  const flexPool = sortByPpgThenSleeperRank(
    FLEX_ELIGIBLE_POSITIONS.flatMap((position) => rankableByPosition[position]).filter(
      (row) => !used.has(row.sleeperRank),
    ),
  );
  for (let i = 0; i < FLEX_SLOT_COUNT; i += 1) {
    const row = flexPool[i] ?? null;
    assignments.set(i === 0 ? "FLEX1" : "FLEX2", row);
    if (row) used.add(row.sleeperRank);
  }

  const kicker = pickBySleeperRank(byPosition.K);
  assignments.set("K", kicker);
  if (kicker) used.add(kicker.sleeperRank);

  const dst = pickBySleeperRank(byPosition.DST);
  assignments.set("DST", dst);
  if (dst) used.add(dst.sleeperRank);

  const bench = [...drafted]
    .filter((row) => !used.has(row.sleeperRank))
    .sort((a, b) => {
      const aPpg = isRankable(a) ? a.jkbProjectedPpg : -Infinity;
      const bPpg = isRankable(b) ? b.jkbProjectedPpg : -Infinity;
      return bPpg - aPpg || a.sleeperRank - b.sleeperRank;
    });
  for (let i = 0; i < BENCH_SLOT_COUNT; i += 1) {
    assignments.set(`BENCH${i + 1}` as RosterSlotId, bench[i] ?? null);
  }

  return STARTING_ROSTER_SLOT_ORDER.map((slot) => ({ slot, row: assignments.get(slot) ?? null }));
}

export type StartingRosterTotals = {
  starterCount: number;
  startingLineupProjectedPpg: number | null;
  startingLineupTotalPar: number | null;
};

/** Totals over only the occupied STARTER slots (QB/RB1/RB2/WR1/WR2/FLEX1/FLEX2/K/DST) -- bench is excluded. */
export function computeStartingRosterTotals(roster: readonly RosterSlotAssignment[]): StartingRosterTotals {
  const starters = roster.filter((entry) => STARTER_SLOT_IDS.has(entry.slot) && entry.row != null).map((entry) => entry.row as DraftPreviewRow);

  let ppgSum = 0;
  let ppgCount = 0;
  let parSum = 0;
  let parCount = 0;
  for (const row of starters) {
    if (row.jkbProjectedPpg != null) {
      ppgSum += row.jkbProjectedPpg;
      ppgCount += 1;
    }
    if (row.jkbParPerGame != null) {
      parSum += row.jkbParPerGame;
      parCount += 1;
    }
  }

  return {
    starterCount: starters.length,
    startingLineupProjectedPpg: ppgCount > 0 ? ppgSum : null,
    startingLineupTotalPar: parCount > 0 ? parSum : null,
  };
}
