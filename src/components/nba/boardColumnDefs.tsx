import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DVP_SEASONS, SEASON_LABEL } from "@/lib/nba/props/dvp";
import { formatAmerican, type BoardMarket, type BoardRow, type BoardSortKey } from "@/lib/nba/props/propsBoard";
import { RECENT_WINDOWS, EARLY_SEASON_GAMES, marketRates, recentPerGame, type RecentAverages } from "@/lib/nba/props/seasonStats";
import type { ColumnId } from "@/lib/nba/props/boardColumns";
import { MinutesEditor, MinutesScale } from "@/components/nba/MinutesEditor";
import { BASIS_LABEL, DvpSeasonCell, LowSample, NA, SeasonSampleCell, TIER_CELL, TIER_CHIP, TIER_GLYPH, TIER_LABEL, diffClass, dvpWhy, etTime, gamesLabel, signed } from "@/components/nba/boardCells";
import { shortDate, type OpponentLastTen, type PlayerLastTen } from "@/lib/nba/props/recentForm";

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
  /** Shown from the lg breakpoint (1024px) up instead of md: a tablet has no room for every default column, and the expanded row carries this one. */
  fromLarge?: boolean;
  /** Player identity and free text read left; every numeric column is centered, header and values alike. */
  align?: "left" | "center";
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
const STALE_OPPONENT_BOARD = "This board was built before opponent last-ten sequences existed; rebuild the private preview board to add them";
const STALE_BOARD = "This board was built before last-five averages existed; rebuild the private preview board to add them";

const tierOf = (row: BoardRow) => (row.dvp.kind === "ok" ? row.dvp.comparison.tier : null);

/** The minutes input's availability for a row: needs a JKB projection with minutes, or a season rate to scale. */
export function minutesEditorInfo(row: BoardRow, market: BoardMarket): { jkbMinutes: number | null; canEdit: boolean; placeholder: string } {
  const jkbMinutes = row.entry.projection?.minutes ?? null;
  const seasonPerMinute = marketRates(row.season?.current ?? null, market).perMinute;
  const canEdit = (jkbMinutes !== null && jkbMinutes > 0 && row.entry.projection !== null) || seasonPerMinute !== null;
  return { jkbMinutes, canEdit, placeholder: jkbMinutes !== null ? jkbMinutes.toFixed(1) : "min" };
}

const fmtResult = (value: number | null): string => (value === null ? "–" : Number.isInteger(value) ? String(value) : value.toFixed(1));

/** ". Oldest to newest: Oct 12 vs NYK 21, ..." for a hover; empty when the board carries no game-by-game results. */
function resultsTitle(view: PlayerLastTen, market: BoardMarket): string {
  if (view.status !== "ok") return "";
  return `. ${STAT[market]} by game, oldest to newest: ${view.points.map((p) => `${shortDate(p.date)} ${p.versus} ${fmtResult(p.value)}`).join("; ")}`;
}

function OpponentL10Cell({ row, market }: { row: BoardRow; market: BoardMarket }) {
  const l10 = row.opponentL10;
  const opponent = row.entry.opponent ?? "The opponent";
  if (l10.status === "stale") return <NA why={STALE_OPPONENT_BOARD} />;
  if (l10.status === "no-position") return <NA why="No estimated position for this player, so there is no opponent-vs-position window" />;
  if (l10.status === "no-opponent") return <NA why="Opponent unknown" />;
  if (l10.status === "none" || l10.average === null) return <span className="text-slate-500" title={`${opponent} has no completed game this season with opposing minutes attributed to a position`}>—</span>;
  const position = row.dvp.kind === "ok" ? row.dvp.position : "this position";
  return (
    <span className="inline-flex flex-col items-center md:inline md:flex-none" title={opponentTitle(l10, opponent, position, market)}>
      {l10.average.toFixed(1)}
      {l10.isSmallSample ? <LowSample why={`Only ${gamesLabel(l10.games)} of ${opponent}'s season so far`} games={l10.games} className="max-md:ml-0" /> : null}
    </span>
  );
}

/** The plain-language reading of the Opp L10 figure, for a hover and for the detail panel's caption. */
export function opponentTitle(l10: OpponentLastTen, opponent: string, position: string, market: BoardMarket): string {
  const coverage = l10.coverage === null ? "" : ` ${Math.round(l10.coverage * 100)}% of opposing minutes were attributed to a position.`;
  return `${opponent} allowed ${l10.average?.toFixed(1) ?? "—"} ${STAT[market]} per game to ${position} (estimated position) over its last ${gamesLabel(l10.games)}, one opposing game at a time.${coverage}`;
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
  const results = window === "last10" ? resultsTitle(row.playerL10, entry.market) : "";
  return (
    <span title={`Last ${size} completed games this season: ${gamesLabel(averages.games)}, did-not-play and zero-minute games excluded${results}`}>
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
    align: "center",
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
    align: "center",
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
    fromLarge: true,
    sortKey: "seasonStatPerMinute",
    align: "center",
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
    align: "center",
    render: ({ row }) => <RecentCell row={row} window="last5" />,
  },
  last10: {
    id: "last10",
    group: "season",
    label: (m) => `L10 ${STAT[m]}`,
    title: (m) => `${STAT_WORD[m][0].toUpperCase()}${STAT_WORD[m].slice(1)} per game over the last ten completed games this season`,
    sortKey: "lastTen",
    align: "center",
    render: ({ row }) => <RecentCell row={row} window="last10" />,
  },
  oppLast10: {
    id: "oppLast10",
    group: "matchup",
    label: (m) => `Opp L10 ${STAT[m]}`,
    title: (m) => `${STAT_WORD[m][0].toUpperCase()}${STAT_WORD[m].slice(1)} the opponent allowed per game to the player's estimated position over the opponent's last ten completed games this season. Ten opponent games, not ten player-games.`,
    sortKey: "oppLastTen",
    align: "center",
    // No green/red wash here: the tier is the season-long blended rank, which this ten-game figure may disagree with. The Matchup column carries it, with a word, an arrow and the rank.
    render: ({ row, market }) => <OpponentL10Cell row={row} market={market} />,
  },
  lastSeason: {
    id: "lastSeason",
    group: "season",
    label: (m) => `${PREVIOUS} ${PER_GAME[m]}`,
    title: () => "Last regular season, shown on its own and never blended into this season",
    align: "center",
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
    align: "center",
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
    align: "center",
    render: ({ row }) => <DvpSeasonCell row={row.dvp.kind === "ok" ? row.dvp.comparison.prior : null} why={dvpWhy(row.dvp)} />,
  },
  dvpCurrent: {
    id: "dvpCurrent",
    group: "matchup",
    label: () => `${SEASON_LABEL[CURRENT]} DvP`,
    title: () => `${CURRENT} allowed per game and rank, estimated primary position`,
    align: "center",
    render: ({ row }) => <DvpSeasonCell row={row.dvp.kind === "ok" ? row.dvp.comparison.current : null} why={row.dvp.kind === "ok" ? "No games sampled this season yet" : dvpWhy(row.dvp)} />,
  },
  dvpGames: {
    id: "dvpGames",
    group: "matchup",
    label: () => `GP ${SEASON_LABEL[PREVIOUS].slice(2)}/${SEASON_LABEL[CURRENT].slice(2)}`,
    title: () => "Opponent games sampled: last season / this season",
    align: "center",
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
        <span className={cn("inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold", TIER_CHIP[tier])} title={`Rank ${blended.rank} of 30 in allowing this stat to ${dvp.position}. ${BASIS_LABEL[dvp.comparison.sampleBasis]}.`}>
          <span aria-hidden>{TIER_GLYPH[tier]} </span>
          {/* On a phone the arrow and rank carry the reading and the word is for screen readers: the table has no room for both. */}
          <span className="max-md:sr-only">{TIER_LABEL[tier]}</span>
          {blended.rank === null ? "" : <span>{` #${blended.rank}`}</span>}
        </span>
      );
    },
  },
  line: {
    id: "line",
    group: "jkb",
    label: () => "Vegas Line",
    title: (m) => `The posted sportsbook line for ${STAT_WORD[m]}, when a permitted, current line is available; N/A otherwise. Never invented or carried over from another market.`,
    sortKey: "line",
    mobile: true,
    align: "center",
    render: ({ row }) => {
      const { line } = row.entry;
      if (!line) return <NA why={row.entry.lineWithheldReason ?? "No line"} />;
      return (
        <span className="font-semibold text-slate-900" data-testid="vegas-line-value" title={`${line.sportsbook}, ${line.line.toFixed(1)}`}>
          {line.line.toFixed(1)}
          {line.freshness === "stale" ? <LowSample why="This line is stale" /> : null}
        </span>
      );
    },
  },
  overUnder: {
    id: "overUnder",
    group: "jkb",
    label: () => "O / U",
    title: () => "Over and Under prices at the posted line",
    align: "center",
    render: ({ row }) => (row.entry.line ? <span className="whitespace-nowrap">{formatAmerican(row.entry.line.overPrice)} / {formatAmerican(row.entry.line.underPrice)}</span> : <NA why={row.entry.lineWithheldReason ?? "No line"} />),
  },
  jkbProjection: {
    id: "jkbProjection",
    group: "jkb",
    label: () => "JKB proj",
    title: () => "The JKB model's projection for this market. Never changed by your minutes.",
    sortKey: "projection",
    mobile: true,
    align: "center",
    headClass: "border-b-blue-400 bg-blue-900 text-white",
    cellClass: () => "border-x border-blue-200 bg-blue-50",
    render: ({ row }) => (row.entry.projection ? <span className="inline-block min-w-[2.5rem] rounded bg-blue-900 px-1.5 py-0.5 text-center font-bold tabular-nums text-white md:min-w-[2.75rem] md:px-2" data-testid="jkb-value">{row.entry.projection.value.toFixed(1)}</span> : <NA why={row.entry.projectionUnavailableReason ?? "No projection"} />),
  },
  modelEdge: {
    id: "modelEdge",
    group: "jkb",
    label: () => "JKB − line",
    title: () => "JKB projection minus the posted line; positive leans Over",
    sortKey: "difference",
    align: "center",
    render: ({ row }) => (row.difference === null ? <NA why="Needs both a line and a projection" /> : <span className={cn("font-semibold", diffClass(row.difference))}>{signed(row.difference)}</span>),
  },
  jkbMinutes: {
    id: "jkbMinutes",
    group: "jkb",
    label: () => "JKB min",
    title: () => "The minutes behind the JKB projection",
    sortKey: "jkbMinutes",
    align: "center",
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
    align: "center",
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
    align: "center",
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
    align: "center",
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
    align: "center",
    headClass: "bg-teal-50 text-teal-900",
    cellClass: () => "bg-teal-50/60",
    render: ({ row }) => {
      const { override, season } = row;
      if (override.userMinutes === null) return <span className="text-slate-400">—</span>;
      if (override.seasonRateEstimate === null) return <NA why="Needs this season's games to get a per-minute rate" />;
      const games = season?.current?.games ?? null;
      const small = games !== null && games < EARLY_SEASON_GAMES;
      return (
        <>
          <div className="font-semibold text-teal-900">{override.seasonRateEstimate.toFixed(1)}</div>
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
    align: "center",
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

/** Tabular numerals keep decimals lined up even though the columns are centered. */
export const ALIGN_CLASS = { left: "text-left", center: "text-center tabular-nums" } as const;
