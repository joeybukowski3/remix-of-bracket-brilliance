import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DVP_SEASONS, SEASON_LABEL } from "@/lib/nba/props/dvp";
import { formatAmerican, type BoardMarket, type BoardRow, type BoardSortKey } from "@/lib/nba/props/propsBoard";
import { RECENT_WINDOWS, EARLY_SEASON_GAMES, marketRates, recentPerGame, type RecentAverages } from "@/lib/nba/props/seasonStats";
import type { ColumnId } from "@/lib/nba/props/boardColumns";
import { MinutesEditor, MinutesScale } from "@/components/nba/MinutesEditor";
import { BASIS_LABEL, DvpSeasonCell, LowSample, NA, SeasonSampleCell, TIER_CELL, TIER_CHIP, TIER_LABEL, diffClass, dvpWhy, etTime, gamesLabel, signed } from "@/components/nba/boardCells";

/**
 * The props table's columns. Each cell renderer returns only the value, so the same renderer fills a table cell and a
 * line of the expanded row detail (a phone shows the detail, a wide screen shows the columns). Nothing here changes a number.
 */
export interface CellContext {
  row: BoardRow;
  market: BoardMarket;
  draft: string;
  onDraftChange: (text: string) => void;
  onReset: () => void;
}

export type ColumnGroup = "season" | "matchup" | "jkb" | "minutes";
export const COLUMN_GROUP_LABEL: Record<ColumnGroup, string> = {
  season: "Season form",
  matchup: "Opponent & matchup (DvP)",
  jkb: "Line & JKB model",
  minutes: "Your minutes",
};

export interface ColumnDef {
  id: ColumnId;
  group: ColumnGroup;
  label: (market: BoardMarket) => string;
  title: (market: BoardMarket) => string;
  sortKey?: BoardSortKey;
  /** Still a table column on a phone. The others appear there in the expanded row. */
  mobile?: boolean;
  align?: "left" | "right" | "center";
  headClass?: string;
  cellClass?: (ctx: CellContext) => string;
  render: (ctx: CellContext) => ReactNode;
}

const STAT: Record<BoardMarket, string> = { pts: "PTS", reb: "REB", ast: "AST" };
const PER_GAME: Record<BoardMarket, string> = { pts: "PPG", reb: "RPG", ast: "APG" };
const STAT_WORD: Record<BoardMarket, string> = { pts: "points", reb: "rebounds", ast: "assists" };
const PREVIOUS = DVP_SEASONS[0];
const CURRENT = DVP_SEASONS[1];

const NO_SEASON = "No season statistics for this player on this board";
const NO_GAMES = "No games this season yet";
const STALE_BOARD = "This board was built before last-five averages existed; rebuild the private preview board to add them";

const tierOf = (row: BoardRow) => (row.dvp.kind === "ok" ? row.dvp.comparison.tier : null);

/** The minutes input's availability for a row: needs a JKB projection with minutes, or a season rate to scale. */
export function minutesEditorInfo(row: BoardRow, market: BoardMarket): { jkbMinutes: number | null; canEdit: boolean; placeholder: string } {
  const jkbMinutes = row.entry.projection?.minutes ?? null;
  const seasonPerMinute = marketRates(row.season?.current ?? null, market).perMinute;
  const canEdit = (jkbMinutes !== null && jkbMinutes > 0 && row.entry.projection !== null) || seasonPerMinute !== null;
  return { jkbMinutes, canEdit, placeholder: jkbMinutes !== null ? jkbMinutes.toFixed(1) : "min" };
}

function RecentCell({ row, window }: { row: BoardRow; window: keyof typeof RECENT_WINDOWS }) {
  const { season, entry } = row;
  if (!season) return <NA why={NO_SEASON} />;
  if (!season.hasRecent) return <NA why={STALE_BOARD} />;
  const averages: RecentAverages | null = season[window];
  const value = recentPerGame(averages, entry.market);
  if (averages === null || value === null) return <span className="text-slate-500" title={NO_GAMES}>—</span>;
  const size = RECENT_WINDOWS[window];
  const short = averages.games < size;
  return (
    <span title={`Last ${size} completed games this season: ${gamesLabel(averages.games)}, did-not-play and zero-minute games excluded`}>
      {value.toFixed(1)}
      {short ? <LowSample why={`Only ${gamesLabel(averages.games)} so far this season`} games={averages.games} /> : null}
    </span>
  );
}

export const COLUMN_DEFS: Record<ColumnId, ColumnDef> = {
  seasonSample: {
    id: "seasonSample",
    group: "season",
    label: () => "Sample",
    title: () => "Which season the figures are from and how many games they cover",
    align: "left",
    render: ({ row }) => <SeasonSampleCell season={row.season} />,
  },
  mpg: {
    id: "mpg",
    group: "season",
    label: () => "MPG",
    title: () => "Minutes per game this season, completed games only",
    sortKey: "seasonMpg",
    align: "right",
    render: ({ row }) => {
      const { season } = row;
      if (!season) return <NA why={NO_SEASON} />;
      const current = season.current;
      if (!current || current.mpg === null) return <span className="text-slate-500" title={NO_GAMES}>—</span>;
      return (
        <span title={`${current.season}, ${gamesLabel(current.games)}`}>
          {current.mpg.toFixed(1)}
          {current.games < EARLY_SEASON_GAMES ? <LowSample why={`Small sample: ${gamesLabel(current.games)} this season`} games={current.games} /> : null}
        </span>
      );
    },
  },
  perGame: {
    id: "perGame",
    group: "season",
    label: (m) => PER_GAME[m],
    title: (m) => `${STAT_WORD[m][0].toUpperCase()}${STAT_WORD[m].slice(1)} per game this season`,
    sortKey: "seasonStatPerGame",
    align: "right",
    render: ({ row, market }) => {
      if (!row.season) return <NA why={NO_SEASON} />;
      const value = marketRates(row.season.current, market).perGame;
      return value === null ? <span className="text-slate-500" title={NO_GAMES}>—</span> : <>{value.toFixed(1)}</>;
    },
  },
  perMinute: {
    id: "perMinute",
    group: "season",
    label: (m) => `${STAT[m]}/MIN`,
    title: (m) => `${STAT_WORD[m][0].toUpperCase()}${STAT_WORD[m].slice(1)} per minute played this season`,
    sortKey: "seasonStatPerMinute",
    align: "right",
    render: ({ row, market }) => {
      if (!row.season) return <NA why={NO_SEASON} />;
      const value = marketRates(row.season.current, market).perMinute;
      return value === null ? <span className="text-slate-500" title={NO_GAMES}>—</span> : <>{value.toFixed(2)}</>;
    },
  },
  last5: {
    id: "last5",
    group: "season",
    label: (m) => `L5 ${STAT[m]}`,
    title: (m) => `${STAT_WORD[m][0].toUpperCase()}${STAT_WORD[m].slice(1)} per game over the last five completed games this season`,
    sortKey: "lastFive",
    mobile: true,
    align: "right",
    render: ({ row }) => <RecentCell row={row} window="last5" />,
  },
  last10: {
    id: "last10",
    group: "season",
    label: (m) => `L10 ${STAT[m]}`,
    title: (m) => `${STAT_WORD[m][0].toUpperCase()}${STAT_WORD[m].slice(1)} per game over the last ten completed games this season`,
    sortKey: "lastTen",
    align: "right",
    render: ({ row }) => <RecentCell row={row} window="last10" />,
  },
  lastSeason: {
    id: "lastSeason",
    group: "season",
    label: (m) => `${PREVIOUS} ${PER_GAME[m]}`,
    title: () => "Last regular season, shown on its own and never blended into this season",
    align: "right",
    render: ({ row, market }) => {
      const previous = row.season?.previous;
      if (!row.season) return <NA why={NO_SEASON} />;
      if (!previous) return <NA why="No games last regular season in the data" />;
      const perGame = marketRates(previous, market).perGame;
      return (
        <span title={`${previous.season}, ${gamesLabel(previous.games)}`}>
          {perGame === null ? "—" : perGame.toFixed(1)}
          <span className="ml-1 text-[10px] text-slate-500">{previous.mpg === null ? "" : `${previous.mpg.toFixed(1)} min`}</span>
        </span>
      );
    },
  },
  dvpAllowed: {
    id: "dvpAllowed",
    group: "matchup",
    label: () => "Opp allows",
    title: (m) => `${STAT[m]} the opponent allows per game to the player's estimated primary position, with its rank (1 = allows the most). Estimated positions cover only part of the league's minutes.`,
    sortKey: "dvpAllowed",
    align: "right",
    cellClass: ({ row }) => {
      const tier = tierOf(row);
      return tier ? TIER_CELL[tier] : "";
    },
    render: ({ row, market }) => {
      const { dvp } = row;
      if (dvp.kind !== "ok") return <NA why={dvpWhy(dvp)} />;
      const blended = dvp.comparison.blended;
      if (!blended) return <NA why="No Defense vs. Position data for this opponent" />;
      return (
        <span title={`${row.entry.opponent ?? "Opponent"} allows ${blended.allowedPerGame.toFixed(1)} ${STAT[market]} per game to ${dvp.position}${dvp.isMultiPosition ? " (the player's estimated primary position)" : ""}. Blended: ${Math.round(blended.currentWeight * 100)}% this season. ${BASIS_LABEL[dvp.comparison.sampleBasis]}.`}>
          {blended.allowedPerGame.toFixed(1)}
          <span className="ml-1 text-slate-600">{blended.rank === null ? "#–" : `#${blended.rank}`}</span>
        </span>
      );
    },
  },
  dvpPrior: {
    id: "dvpPrior",
    group: "matchup",
    label: () => `${SEASON_LABEL[PREVIOUS]} DvP`,
    title: () => `${PREVIOUS} allowed per game and rank, estimated primary position`,
    align: "right",
    render: ({ row }) => <DvpSeasonCell row={row.dvp.kind === "ok" ? row.dvp.comparison.prior : null} why={dvpWhy(row.dvp)} />,
  },
  dvpCurrent: {
    id: "dvpCurrent",
    group: "matchup",
    label: () => `${SEASON_LABEL[CURRENT]} DvP`,
    title: () => `${CURRENT} allowed per game and rank, estimated primary position`,
    align: "right",
    render: ({ row }) => <DvpSeasonCell row={row.dvp.kind === "ok" ? row.dvp.comparison.current : null} why={row.dvp.kind === "ok" ? "No games sampled this season yet" : dvpWhy(row.dvp)} />,
  },
  dvpGames: {
    id: "dvpGames",
    group: "matchup",
    label: () => `GP ${SEASON_LABEL[PREVIOUS].slice(2)}/${SEASON_LABEL[CURRENT].slice(2)}`,
    title: () => "Opponent games sampled: last season / this season",
    align: "right",
    render: ({ row }) => (row.dvp.kind === "ok" ? <>{`${row.dvp.comparison.prior?.gamesSampled ?? 0}/${row.dvp.comparison.current?.gamesSampled ?? 0}`}</> : <NA why={dvpWhy(row.dvp)} />),
  },
  matchup: {
    id: "matchup",
    group: "matchup",
    label: () => "Matchup",
    title: () => "Favorable: the opponent ranks 1-10 in allowing this stat to the position. Tough: 21-30. Neutral: 11-20. Estimated positions, blended with last season early in the year.",
    sortKey: "dvpRank",
    mobile: true,
    align: "center",
    cellClass: ({ row }) => {
      const tier = tierOf(row);
      return tier ? TIER_CELL[tier] : "";
    },
    render: ({ row }) => {
      const { dvp } = row;
      if (dvp.kind !== "ok") return <NA why={dvpWhy(dvp)} />;
      const tier = dvp.comparison.tier;
      const blended = dvp.comparison.blended;
      if (!tier || !blended) return <NA why="No rank yet: needs Defense vs. Position data for all 30 teams" />;
      return (
        <span className={cn("inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold", TIER_CHIP[tier])} title={`Rank ${blended.rank} of 30 in allowing this stat to ${dvp.position}. ${BASIS_LABEL[dvp.comparison.sampleBasis]}.`}>
          {TIER_LABEL[tier]}
        </span>
      );
    },
  },
  line: {
    id: "line",
    group: "jkb",
    label: () => "Line",
    title: () => "The posted sportsbook line",
    sortKey: "line",
    align: "right",
    render: ({ row }) => (row.entry.line ? <span className="font-semibold text-slate-900">{row.entry.line.line.toFixed(1)}</span> : <NA why={row.entry.lineWithheldReason ?? "No line"} />),
  },
  overUnder: {
    id: "overUnder",
    group: "jkb",
    label: () => "O / U",
    title: () => "Over and Under prices at the posted line",
    align: "right",
    render: ({ row }) => (row.entry.line ? <span className="whitespace-nowrap">{formatAmerican(row.entry.line.overPrice)} / {formatAmerican(row.entry.line.underPrice)}</span> : <NA why={row.entry.lineWithheldReason ?? "No line"} />),
  },
  jkbProjection: {
    id: "jkbProjection",
    group: "jkb",
    label: () => "JKB proj",
    title: () => "The JKB model's projection for this market. Never changed by your minutes.",
    sortKey: "projection",
    mobile: true,
    align: "right",
    headClass: "bg-blue-100 text-blue-900",
    cellClass: () => "bg-blue-50",
    render: ({ row }) => (row.entry.projection ? <span className="font-bold text-blue-900">{row.entry.projection.value.toFixed(1)}</span> : <NA why={row.entry.projectionUnavailableReason ?? "No projection"} />),
  },
  modelEdge: {
    id: "modelEdge",
    group: "jkb",
    label: () => "JKB − line",
    title: () => "JKB projection minus the posted line; positive leans Over",
    sortKey: "difference",
    align: "right",
    render: ({ row }) => (row.difference === null ? <NA why="Needs both a line and a projection" /> : <span className={cn("font-semibold", diffClass(row.difference))}>{signed(row.difference)}</span>),
  },
  jkbMinutes: {
    id: "jkbMinutes",
    group: "jkb",
    label: () => "JKB min",
    title: () => "The minutes behind the JKB projection",
    sortKey: "jkbMinutes",
    align: "right",
    render: ({ row }) => {
      const minutes = row.entry.projection?.minutes ?? null;
      return minutes !== null ? <>{minutes.toFixed(1)}</> : <NA why="The model gave no minutes for this projection" />;
    },
  },
  userMinutes: {
    id: "userMinutes",
    group: "minutes",
    label: () => "Your min",
    title: () => `Type your own projected minutes, 0-48`,
    sortKey: "userMinutes",
    align: "right",
    headClass: "bg-indigo-50",
    cellClass: () => "bg-indigo-50/40",
    render: ({ row, market, draft, onDraftChange, onReset }) => {
      const info = minutesEditorInfo(row, market);
      return <MinutesEditor name={row.entry.playerName} draft={draft} placeholder={info.placeholder} disabledReason={info.canEdit ? null : "No JKB minutes or season rate to work from for this player"} onChange={onDraftChange} onReset={onReset} />;
    },
  },
  adjustedProjection: {
    id: "adjustedProjection",
    group: "minutes",
    label: () => "Adj proj",
    title: () => "JKB projection × your minutes ÷ JKB minutes: the model's own rate at your minutes",
    sortKey: "adjustedProjection",
    align: "right",
    headClass: "bg-indigo-50",
    cellClass: () => "bg-indigo-50/40",
    render: ({ row }) => {
      const { override, entry } = row;
      if (override.userMinutes === null) return <span className="text-slate-400">—</span>;
      if (override.adjustedProjection === null) return <NA why="Needs a JKB projection with positive minutes to scale" />;
      const jkbMinutes = entry.projection?.minutes ?? null;
      return (
        <>
          <div className="font-semibold text-indigo-900" data-testid="adjusted-value">{override.adjustedProjection.toFixed(1)}</div>
          {jkbMinutes !== null && jkbMinutes > 0 ? <MinutesScale factor={override.userMinutes / jkbMinutes} /> : null}
        </>
      );
    },
  },
  adjustedDifference: {
    id: "adjustedDifference",
    group: "minutes",
    label: () => "Adj − line",
    title: () => "Adjusted projection minus the posted line",
    sortKey: "adjustedDifference",
    align: "right",
    headClass: "bg-indigo-50",
    cellClass: () => "bg-indigo-50/40",
    render: ({ row }) => {
      const { override } = row;
      if (override.userMinutes === null) return <span className="text-slate-400">—</span>;
      return override.adjustedDifference === null ? <NA why="Needs a line and an adjusted projection" /> : <span className={cn("font-semibold", diffClass(override.adjustedDifference))}>{signed(override.adjustedDifference)}</span>;
    },
  },
  seasonRateEstimate: {
    id: "seasonRateEstimate",
    group: "minutes",
    label: () => "Season-rate est",
    title: () => "Your minutes × this season's stat per minute. Not the JKB model: a plain season-rate estimate.",
    sortKey: "seasonRateEstimate",
    align: "right",
    headClass: "bg-amber-50",
    cellClass: () => "bg-amber-50/40",
    render: ({ row }) => {
      const { override, season } = row;
      if (override.userMinutes === null) return <span className="text-slate-400">—</span>;
      if (override.seasonRateEstimate === null) return <NA why="Needs this season's games to get a per-minute rate" />;
      const games = season?.current?.games ?? null;
      const small = games !== null && games < EARLY_SEASON_GAMES;
      return (
        <>
          <div className="font-semibold text-amber-900">{override.seasonRateEstimate.toFixed(1)}</div>
          {games !== null ? (
            <div className="whitespace-nowrap text-[10px] font-normal text-slate-500" title={`Per-minute rate from ${gamesLabel(games)} of ${season?.current?.season}${small ? ": a small sample" : ""}`}>
              on {games} g{small ? " · small sample" : ""}
            </div>
          ) : null}
          {override.seasonRateDifference !== null ? <div className={cn("text-[10px] font-normal", diffClass(override.seasonRateDifference))}>{signed(override.seasonRateDifference)} vs line</div> : null}
        </>
      );
    },
  },
  jkbTriple: {
    id: "jkbTriple",
    group: "jkb",
    label: () => "JKB PTS/REB/AST",
    title: () => "The JKB projection in each market for this game",
    align: "right",
    render: ({ row, market }) => (
      <span className="whitespace-nowrap text-slate-600">
        {(["pts", "reb", "ast"] as const).map((m, i) => (
          <span key={m} className={m === market ? "font-semibold text-slate-900" : ""}>
            {i > 0 ? " / " : ""}
            {row.jkbTriple[m] === null ? "—" : row.jkbTriple[m]?.toFixed(1)}
          </span>
        ))}
      </span>
    ),
  },
  source: {
    id: "source",
    group: "jkb",
    label: () => "Source",
    title: () => "Sportsbook and when the line was captured",
    align: "left",
    render: ({ row }) =>
      row.entry.line ? (
        <span className="whitespace-nowrap text-[10px] text-slate-600">
          {row.entry.line.sportsbook} · {etTime(row.entry.line.capturedAtUtc)} ET
          {row.entry.line.freshness === "stale" ? <span className="ml-1 rounded bg-amber-100 px-1 font-semibold text-amber-800">stale</span> : null}
        </span>
      ) : (
        <span className="text-[10px] text-slate-500" title={row.entry.lineWithheldReason ?? undefined}>{row.entry.lineWithheldReason ?? "no line"}</span>
      ),
  },
};

export const ALIGN_CLASS = { left: "text-left", right: "text-right tabular-nums", center: "text-center" } as const;
