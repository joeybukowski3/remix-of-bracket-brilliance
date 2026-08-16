import parConsensusSource from "../../../data/fantasy/2026-par-consensus.json";
import {
  FANTASY_RANKINGS,
  type FantasyPosition,
  type FantasyRankingRow,
} from "@/lib/fantasy/rankings";

export type FantasyParSourceRow = {
  Player: string;
  Team: string;
  Position: string;
  "Projected Games": number;
  "2026 Projected Fantasy Points": number;
  "2026 Projected PPG": number;
  "Historical Replacement PPG": number;
  "PAR/G": number;
  "Projected Season PAR": number;
  "Projection Status": string;
  "Source ID": string;
  "Consensus Position Rank": number;
};

export type FantasyParRankingRow = {
  player: string;
  team: string;
  position: FantasyPosition;
  projectedGames: number;
  projectedFantasyPoints: number;
  projectedPpg: number;
  replacementPpg: number;
  parPerGame: number;
  projectedSeasonPar: number;
  projectionStatus: string;
  sourceId: string;
  consensusPositionRank: number;
  parRank: number;
  tier: number;
  jkbPositionRank?: number;
  jkbOverallRank?: number;
};

export type FantasyResearchBoardRow = {
  key: string;
  player: string;
  team?: string;
  position: FantasyPosition;
  jkb?: FantasyRankingRow;
  par?: FantasyParRankingRow;
  tier?: number;
};

export type FantasyPositionResearchBoard = {
  position: FantasyPosition;
  jkbRowCount: number;
  tierGroups: ReadonlyArray<{
    tier: number;
    rows: readonly FantasyResearchBoardRow[];
  }>;
  outsideDraftPool: readonly FantasyResearchBoardRow[];
};

type TierBoundary = {
  tier: number;
  start: number;
  end: number;
};

export const PAR_POSITION_LIMITS: Record<FantasyPosition, number> = {
  QB: 18,
  RB: 66,
  WR: 78,
  TE: 18,
};

export const PAR_TIER_BOUNDARIES: Record<FantasyPosition, readonly TierBoundary[]> = {
  QB: [
    { tier: 1, start: 1, end: 1 },
    { tier: 2, start: 2, end: 2 },
    { tier: 3, start: 3, end: 6 },
    { tier: 4, start: 7, end: 12 },
    { tier: 5, start: 13, end: 16 },
    { tier: 6, start: 17, end: 18 },
  ],
  RB: [
    { tier: 1, start: 1, end: 3 },
    { tier: 2, start: 4, end: 5 },
    { tier: 3, start: 6, end: 11 },
    { tier: 4, start: 12, end: 17 },
    { tier: 5, start: 18, end: 24 },
    { tier: 6, start: 25, end: 26 },
    { tier: 7, start: 27, end: 32 },
    { tier: 8, start: 33, end: 43 },
    { tier: 9, start: 44, end: 55 },
    { tier: 10, start: 56, end: 66 },
  ],
  WR: [
    { tier: 1, start: 1, end: 1 },
    { tier: 2, start: 2, end: 2 },
    { tier: 3, start: 3, end: 4 },
    { tier: 4, start: 5, end: 9 },
    { tier: 5, start: 10, end: 15 },
    { tier: 6, start: 16, end: 24 },
    { tier: 7, start: 25, end: 32 },
    { tier: 8, start: 33, end: 44 },
    { tier: 9, start: 45, end: 52 },
    { tier: 10, start: 53, end: 59 },
    { tier: 11, start: 60, end: 71 },
    { tier: 12, start: 72, end: 78 },
  ],
  TE: [
    { tier: 1, start: 1, end: 1 },
    { tier: 2, start: 2, end: 2 },
    { tier: 3, start: 3, end: 4 },
    { tier: 4, start: 5, end: 8 },
    { tier: 5, start: 9, end: 11 },
    { tier: 6, start: 12, end: 13 },
    { tier: 7, start: 14, end: 18 },
  ],
};

export const PAR_POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

const rawRows = parConsensusSource as readonly FantasyParSourceRow[];

function playerKey(position: FantasyPosition, player: string): string {
  const normalizedPlayer = player
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${position}:${normalizedPlayer}`;
}

/** Explicit source-to-workbook aliases. Keep this list reviewable; never fuzzy-match player identity. */
const JKB_PLAYER_ALIASES: Readonly<Record<string, string>> = {
  "QB:patrickmahomesii": "Patrick Mahomes",
  "RB:jamescookiii": "James Cook",
  "RB:kenwalkeriii": "Kenneth Walker",
  "RB:travisetiennejr": "Travis Etienne",
  "RB:kennygainwell": "Kenneth Gainwell",
  "RB:aaronjonessr": "Aaron Jones",
  "RB:tyronetracyjr": "Tyrone Tracy",
  "RB:brianrobinsonjr": "Brian Robinson",
  "RB:lequintallenjr": "LeQuint Allen",
  "RB:mikewashingtonjr": "Mike Washington",
  "WR:lutherburdeniii": "Luther Burden",
  "WR:michaelpittmanjr": "Michael Pittman",
  "WR:chrisgodwinjr": "Chris Godwin",
  "WR:kcconcepcion": "Kevin Concepcion",
  "WR:deebosamuelsr": "Deebo Samuel",
  "TE:kylepittssr": "Kyle Pitts",
};

function jkbLookupKey(position: FantasyPosition, sourcePlayer: string): string {
  const sourceKey = playerKey(position, sourcePlayer);
  const aliasedPlayer = JKB_PLAYER_ALIASES[sourceKey];
  return aliasedPlayer ? playerKey(position, aliasedPlayer) : sourceKey;
}

function getTier(position: FantasyPosition, parRank: number): number {
  const boundary = PAR_TIER_BOUNDARIES[position].find(
    ({ start, end }) => parRank >= start && parRank <= end,
  );
  if (!boundary) {
    throw new Error(`No approved ${position} tier boundary contains PAR rank ${parRank}.`);
  }
  return boundary.tier;
}

function assertFiniteSourceMetrics(row: FantasyParSourceRow): void {
  const values = [
    row["Projected Games"],
    row["2026 Projected Fantasy Points"],
    row["2026 Projected PPG"],
    row["Historical Replacement PPG"],
    row["PAR/G"],
    row["Projected Season PAR"],
    row["Consensus Position Rank"],
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Approved PAR source metrics are incomplete for ${row.Player}.`);
  }
}

export function buildFantasyParRankings(
  sourceRows: readonly FantasyParSourceRow[],
  jkbRows: readonly FantasyRankingRow[],
): Record<FantasyPosition, readonly FantasyParRankingRow[]> {
  const jkbByPlayer = new Map<string, FantasyRankingRow>();
  for (const row of jkbRows) {
    const key = playerKey(row.position, row.player);
    if (jkbByPlayer.has(key)) {
      throw new Error(`Duplicate JKB ranking key for ${row.player}.`);
    }
    jkbByPlayer.set(key, row);
  }

  return Object.fromEntries(
    PAR_POSITIONS.map((position) => {
      const limit = PAR_POSITION_LIMITS[position];
      const universe = sourceRows.filter(
        (row) =>
          row.Position === position &&
          Number.isInteger(row["Consensus Position Rank"]) &&
          row["Consensus Position Rank"] >= 1 &&
          row["Consensus Position Rank"] <= limit,
      );

      if (universe.length !== limit) {
        throw new Error(
          `Approved PAR source must resolve exactly ${position}${limit}; found ${universe.length}.`,
        );
      }

      const consensusRanks = new Set(universe.map((row) => row["Consensus Position Rank"]));
      if (consensusRanks.size !== limit) {
        throw new Error(`Approved ${position} universe has duplicate consensus position ranks.`);
      }

      universe.forEach(assertFiniteSourceMetrics);

      const byPar = universe
        .map((row, sourceOrder) => ({ row, sourceOrder }))
        .sort((a, b) => b.row["PAR/G"] - a.row["PAR/G"] || a.sourceOrder - b.sourceOrder);

      const tiered = byPar.map(({ row }, index): FantasyParRankingRow => {
        const jkb = jkbByPlayer.get(jkbLookupKey(position, row.Player));
        const parRank = index + 1;
        return {
          player: row.Player,
          team: row.Team,
          position,
          projectedGames: row["Projected Games"],
          projectedFantasyPoints: row["2026 Projected Fantasy Points"],
          projectedPpg: row["2026 Projected PPG"],
          replacementPpg: row["Historical Replacement PPG"],
          parPerGame: row["PAR/G"],
          projectedSeasonPar: row["Projected Season PAR"],
          projectionStatus: row["Projection Status"],
          sourceId: row["Source ID"],
          consensusPositionRank: row["Consensus Position Rank"],
          parRank,
          tier: getTier(position, parRank),
          jkbPositionRank: Number.isInteger(jkb?.positionRank) ? jkb?.positionRank : undefined,
          jkbOverallRank: Number.isInteger(jkb?.overallRank) ? jkb?.overallRank : undefined,
        };
      });

      tiered.sort(
        (a, b) =>
          a.tier - b.tier ||
          (a.jkbPositionRank ?? Number.POSITIVE_INFINITY) -
            (b.jkbPositionRank ?? Number.POSITIVE_INFINITY) ||
          a.parRank - b.parRank,
      );

      return [position, tiered];
    }),
  ) as Record<FantasyPosition, readonly FantasyParRankingRow[]>;
}

export const FANTASY_PAR_RANKINGS = buildFantasyParRankings(rawRows, FANTASY_RANKINGS.rows);

export const FANTASY_PAR_ROWS: readonly FantasyParRankingRow[] = PAR_POSITIONS.flatMap(
  (position) => FANTASY_PAR_RANKINGS[position],
);

export function buildFantasyPositionResearchBoards(
  parRankings: Record<FantasyPosition, readonly FantasyParRankingRow[]>,
  jkbRows: readonly FantasyRankingRow[],
): Record<FantasyPosition, FantasyPositionResearchBoard> {
  return Object.fromEntries(
    PAR_POSITIONS.map((position) => {
      const positionJkbRows = jkbRows
        .filter((row) => row.position === position)
        .sort((a, b) => (a.positionRank ?? Number.POSITIVE_INFINITY) - (b.positionRank ?? Number.POSITIVE_INFINITY));
      const jkbByOverallRank = new Map(positionJkbRows.map((row) => [row.overallRank, row]));
      const tieredJkbOverallRanks = new Set<number>();

      const tierGroups = PAR_TIER_BOUNDARIES[position].map(({ tier }) => {
        const rows = parRankings[position]
          .filter((row) => row.tier === tier)
          .map((par): FantasyResearchBoardRow => {
            const jkb = par.jkbOverallRank == null ? undefined : jkbByOverallRank.get(par.jkbOverallRank);
            if (jkb) {
              if (tieredJkbOverallRanks.has(jkb.overallRank)) {
                throw new Error(`JKB player ${jkb.player} joined more than one approved PAR row.`);
              }
              tieredJkbOverallRanks.add(jkb.overallRank);
            }
            return {
              key: par.sourceId,
              player: jkb?.player ?? par.player,
              team: jkb?.team ?? par.team.toLowerCase(),
              position,
              jkb,
              par,
              tier,
            };
          });
        return { tier, rows };
      });

      const outsideDraftPool = positionJkbRows
        .filter((row) => !tieredJkbOverallRanks.has(row.overallRank))
        .map((jkb): FantasyResearchBoardRow => ({
          key: `jkb-${jkb.overallRank}`,
          player: jkb.player,
          team: jkb.team,
          position,
          jkb,
        }));

      return [
        position,
        {
          position,
          jkbRowCount: positionJkbRows.length,
          tierGroups,
          outsideDraftPool,
        },
      ];
    }),
  ) as Record<FantasyPosition, FantasyPositionResearchBoard>;
}

export const FANTASY_POSITION_RESEARCH_BOARDS = buildFantasyPositionResearchBoards(
  FANTASY_PAR_RANKINGS,
  FANTASY_RANKINGS.rows,
);

export function filterFantasyParRankings(
  rows: readonly FantasyParRankingRow[],
  query: string,
): readonly FantasyParRankingRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) => row.player.toLowerCase().includes(needle) || row.team.toLowerCase().includes(needle),
  );
}
