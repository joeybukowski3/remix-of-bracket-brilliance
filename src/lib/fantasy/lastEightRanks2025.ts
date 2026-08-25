import lastEightSource from "../../../data/fantasy/ros-last8-ppr.json";
import type { LastEightPointsRank } from "@/lib/fantasy/lastEightPoints";
import { FANTASY_RANKINGS, type FantasyPosition, type FantasyRankingRow } from "@/lib/fantasy/rankings";
import { normalizedFantasyPlayerKey } from "@/lib/fantasy/rosPlayerIdentity";

type LastEightSummary = Omit<LastEightPointsRank, "games" | "rank" | "poolSize">;
export type LastEightRank = LastEightSummary & Pick<LastEightPointsRank, "rank" | "poolSize">;

/** Exact reviewed JKB workbook name -> nflverse display-name differences. */
const NFLVERSE_NAME_ALIASES: Readonly<Record<string, string>> = {
  "RB:kennethwalker": "Kenneth Walker III",
  "RB:kennethgainwell": "Kenny Gainwell",
  "RB:tyronetracy": "Tyrone Tracy Jr.",
  "RB:olliegordon": "Ollie Gordon II",
  "WR:lutherburden": "Luther Burden III",
  "WR:chrisgodwin": "Chris Godwin Jr.",
  "WR:deebosamuel": "Deebo Samuel Sr.",
  "WR:marvinmims": "Marvin Mims Jr.",
  "TE:chigoziemokonkwo": "Chig Okonkwo",
};

const summaries = lastEightSource.rows as readonly LastEightSummary[];
const SUMMARY_BY_NAME_POSITION = new Map<string, LastEightSummary>();
for (const row of summaries) {
  const key = normalizedFantasyPlayerKey(row.position as FantasyPosition, row.playerName);
  if (SUMMARY_BY_NAME_POSITION.has(key)) throw new Error(`Ambiguous L8 identity ${key}.`);
  SUMMARY_BY_NAME_POSITION.set(key, row);
}

function getSummary(
  row: Pick<FantasyRankingRow, "player" | "position">,
): LastEightSummary | undefined {
  const jkbKey = normalizedFantasyPlayerKey(row.position, row.player);
  const aliasedName = NFLVERSE_NAME_ALIASES[jkbKey];
  return SUMMARY_BY_NAME_POSITION.get(
    aliasedName ? normalizedFantasyPlayerKey(row.position, aliasedName) : jkbKey,
  );
}

/** Prepares immutable board-population ranks; UI filtering/sorting cannot alter them. */
export function buildRosLastEightRankIndex(
  rankingRows: readonly FantasyRankingRow[],
): ReadonlyMap<number, LastEightRank> {
  const index = new Map<number, LastEightRank>();
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const pool = rankingRows
      .filter((row) => row.position === position)
      .flatMap((row) => {
        const summary = getSummary(row);
        return summary ? [{ row, summary }] : [];
      })
      .sort(
        (a, b) =>
          b.summary.totalPoints - a.summary.totalPoints ||
          a.summary.playerId.localeCompare(b.summary.playerId),
      );
    let priorTotal: number | null = null;
    let priorRank = 0;
    pool.forEach(({ row, summary }, order) => {
      const rank = priorTotal !== null && summary.totalPoints === priorTotal ? priorRank : order + 1;
      priorTotal = summary.totalPoints;
      priorRank = rank;
      index.set(row.overallRank, { ...summary, rank, poolSize: pool.length });
    });
  }
  return index;
}

const RANK_BY_OVERALL = buildRosLastEightRankIndex(FANTASY_RANKINGS.rows);

export function getLastEightRank(row: Pick<FantasyRankingRow, "overallRank">): LastEightRank | undefined {
  return RANK_BY_OVERALL.get(row.overallRank);
}

export const LAST_EIGHT_RANKS_META = lastEightSource._meta;
