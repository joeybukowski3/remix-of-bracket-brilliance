import { useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, frozenDenseColumn } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { SEASON_LABEL, type DvpRow, type MatchupTier, type SampleBasis } from "@/lib/nba/props/dvp";
import { MAX_USER_MINUTES, MIN_USER_MINUTES, parseMinutesInput, playerOverrideKey, type MinutesDrafts } from "@/lib/nba/props/minutesOverride";
import { formatAmerican, type BoardMarket, type BoardRow, type BoardSortKey, type DvpState, type SortDirection } from "@/lib/nba/props/propsBoard";
import { EARLY_SEASON_GAMES, marketRates, type SeasonColumns } from "@/lib/nba/props/seasonStats";
import { seasonColumnDefs, type SeasonColumnDef } from "@/components/nba/boardLabels";

const TIER_CLASS: Record<MatchupTier, string> = {
  favorable: "bg-emerald-100 text-emerald-800",
  neutral: "bg-slate-100 text-slate-700",
  tough: "bg-rose-100 text-rose-800",
};
const TIER_LABEL: Record<MatchupTier, string> = { favorable: "Allows a lot", neutral: "Middle", tough: "Allows little" };
const BASIS_LABEL: Record<SampleBasis, string> = {
  none: "no sample",
  "prior-led": "mostly last season",
  blending: "blending seasons",
  "current-led": "mostly this season",
};

const NA = ({ why }: { why: string }) => (
  <span className="text-slate-400" title={why}>
    N/A
  </span>
);

/** One decimal with a sign; a value that rounds to zero is "0.0", never a red "-0.0". */
const signed = (n: number): string => (Math.abs(n) < 0.05 ? "0.0" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`);
const etTime = (utc: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(utc));
const diffClass = (d: number | null): string => (d === null ? "" : d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-slate-600");

function DvpSeasonCell({ row, why }: { row: DvpRow | null | undefined; why: string }) {
  if (!row) return <NA why={why} />;
  return (
    <span title={`${row.gamesSampled} games sampled · ${Math.round(row.minutesCoverage * 100)}% of minutes attributed to a position`}>
      {row.allowedPerGame.toFixed(1)}
      <span className="ml-1 text-slate-500">{row.rank === null ? "#–" : `#${row.rank}`}</span>
    </span>
  );
}

const dvpWhy = (dvp: DvpState): string => {
  switch (dvp.kind) {
    case "no-position":
      return `No usable position: ${dvp.reason}`;
    case "no-opponent":
      return "Opponent unknown";
    case "no-dvp-data":
      return "No Defense vs. Position data for this opponent";
    case "ok":
      return "No data for this season";
  }
};

function HeaderButton({ label, sortKey, active, direction, onSort, align = "left" }: { label: string; sortKey: BoardSortKey; active: boolean; direction: SortDirection; onSort: (key: BoardSortKey) => void; align?: "left" | "right" }) {
  return (
    <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wider hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", align === "right" && "w-full justify-end")}>
      {label}
      {active ? direction === "asc" ? <ArrowUp size={10} aria-hidden /> : <ArrowDown size={10} aria-hidden /> : null}
    </button>
  );
}

const gamesLabel = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

function SeasonSampleCell({ season }: { season: SeasonColumns | null }) {
  if (!season) return <NA why="No season statistics for this player on this board" />;
  return (
    <div className="whitespace-nowrap text-left text-[10px] text-slate-600">
      {season.current ? (
        <div title="Completed games before this matchup, did-not-play and zero-minute appearances excluded">
          {season.current.season} · {gamesLabel(season.current.games)}
        </div>
      ) : (
        <div className="text-slate-400">no games yet this season</div>
      )}
      {season.showPrevious && season.previous ? (
        <div className="text-slate-400" title="Last regular season, shown on its own and never blended into this season">
          {season.previous.season} · {gamesLabel(season.previous.games)}
        </div>
      ) : null}
    </div>
  );
}

function SeasonValueCell({ season, def }: { season: SeasonColumns | null; def: SeasonColumnDef }) {
  if (!season) return <NA why="No season statistics for this player on this board" />;
  const current = season.current ? def.pick(season.current) : null;
  const previous = season.showPrevious && season.previous ? def.pick(season.previous) : null;
  return (
    <>
      <div className={cn("tabular-nums", current === null ? "text-slate-400" : "text-slate-900")} title={season.current ? `${season.current.season}, ${gamesLabel(season.current.games)}` : "No games this season yet"}>
        {current === null ? "—" : current.toFixed(def.digits)}
      </div>
      {previous !== null && season.previous ? (
        <div className="whitespace-nowrap text-[10px] text-slate-400" title={`${season.previous.season}, ${gamesLabel(season.previous.games)} (shown separately)`}>
          {season.previous.season.slice(2)}: {previous.toFixed(def.digits)}
        </div>
      ) : null}
    </>
  );
}

export interface PropsBoardTableProps {
  rows: BoardRow[];
  sortKey: BoardSortKey;
  direction: SortDirection;
  onSort: (key: BoardSortKey) => void;
  market: BoardMarket;
  marketLabel: string;
  drafts: MinutesDrafts;
  onDraftChange: (key: string, text: string) => void;
  onReset: (key: string) => void;
  /** True when any row has season statistics (a private preview board). */
  showSeason: boolean;
}

/** How far the viewer's minutes are from the JKB minutes; amber when the scaling is large, so a typo is visible. */
const LARGE_SCALE_UP = 1.5;
const LARGE_SCALE_DOWN = 0.5;
function MinutesScale({ factor }: { factor: number }) {
  const large = factor > LARGE_SCALE_UP || factor < LARGE_SCALE_DOWN;
  return (
    <div className={cn("whitespace-nowrap text-[10px] font-normal", large ? "font-semibold text-amber-700" : "text-slate-500")} title={large ? "Large change from the JKB minutes: check the minutes you typed" : "Your minutes relative to the JKB minutes"}>
      × {factor.toFixed(2)} JKB min
    </div>
  );
}

function MinutesEditor({ name, draft, placeholder, disabledReason, onChange, onReset }: { name: string; draft: string; placeholder: string; disabledReason: string | null; onChange: (text: string) => void; onReset: () => void }) {
  const parsed = parseMinutesInput(draft);
  // The message waits for the field to be left, so a half-typed "." or "-" does not flash an alert; the value is never applied meanwhile.
  const [touched, setTouched] = useState(false);
  const invalid = parsed.kind === "invalid" && touched;
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-testid="minutes-input"
          aria-label={`Your projected minutes for ${name}, ${MIN_USER_MINUTES} to ${MAX_USER_MINUTES}`}
          ref={inputRef}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          placeholder={placeholder}
          value={draft}
          disabled={disabledReason !== null}
          title={disabledReason ?? `Your minutes (${MIN_USER_MINUTES}-${MAX_USER_MINUTES}, one decimal). Leave blank to use the JKB minutes.`}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={cn("h-8 w-16 rounded border px-1.5 text-right text-[12px] tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50", invalid ? "border-red-400 bg-red-50 text-red-800" : "border-slate-300 bg-white text-slate-900")}
        />
        <button
          type="button"
          data-testid="reset-minutes"
          aria-label={`Reset minutes for ${name}`}
          title="Reset to the JKB minutes"
          onClick={() => {
            onReset();
            setTouched(false);
            inputRef.current?.focus();
          }}
          disabled={draft === ""}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:invisible"
        >
          <RotateCcw size={13} aria-hidden />
        </button>
      </div>
      {invalid ? (
        <span id={errorId} role="alert" className="max-w-[9rem] text-right text-[10px] font-semibold text-red-700">
          {parsed.kind === "invalid" ? parsed.reason : null}
        </span>
      ) : null}
    </div>
  );
}

export default function PropsBoardTable({ rows, sortKey, direction, onSort, market, marketLabel, drafts, onDraftChange, onReset, showSeason }: PropsBoardTableProps) {
  const ariaSort = (key: BoardSortKey) => (sortKey === key ? (direction === "asc" ? "ascending" : "descending") : "none");
  const header = "border-b border-slate-200 px-3 py-2";
  const num = "px-3 py-1.5 text-right tabular-nums";
  const seasonDefs = seasonColumnDefs(market);
  const sortable = (key: BoardSortKey, label: string, extra = "", title?: string) => (
    <th scope="col" aria-sort={ariaSort(key)} title={title} className={`${header} text-right ${extra}`}>
      <HeaderButton label={label} sortKey={key} active={sortKey === key} direction={direction} onSort={onSort} align="right" />
    </th>
  );
  const columnCount = 15 + (showSeason ? 1 + seasonDefs.length : 0);
  return (
    <DenseTableScroller label={`${marketLabel} player props with sportsbook lines, JKB projections, season averages, your minutes and Defense vs. Position`} className="rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1500px] border-separate border-spacing-0 text-[11px] sm:text-[12px]" data-testid="props-board-table">
        <thead>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            <th scope="col" aria-sort={ariaSort("player")} className={frozenDenseColumn({ isHeader: true, surface: "bg-slate-100", className: `${header} border-r text-left` })}>
              <HeaderButton label="Player" sortKey="player" active={sortKey === "player"} direction={direction} onSort={onSort} />
            </th>
            {sortable("userMinutes", "Your min", "bg-indigo-50", `Type your own projected minutes, ${MIN_USER_MINUTES}-${MAX_USER_MINUTES}`)}
            {sortable("line", "Line")}
            {sortable("projection", "JKB proj", "", "The JKB model's projection for this market. Never changed by your minutes.")}
            {sortable("jkbMinutes", "JKB min", "", "The minutes behind the JKB projection")}
            {sortable("difference", "JKB − line", "", "JKB projection minus the posted line; positive leans Over")}
            {sortable("adjustedProjection", "Adj proj", "bg-indigo-50", "JKB projection × your minutes ÷ JKB minutes: the model's own rate at your minutes")}
            {sortable("adjustedDifference", "Adj − line", "bg-indigo-50", "Adjusted projection minus the posted line")}
            {sortable("seasonRateEstimate", "Season-rate est", "bg-amber-50", "Your minutes × this season's stat per minute. Not the JKB model: a plain season-rate estimate.")}
            <th scope="col" className={`${header} text-right`} title="The JKB projection in each market for this game">
              JKB PTS/REB/AST
            </th>
            {showSeason ? (
              <>
                <th scope="col" className={`${header} text-left`} title="Which season the figures are from and how many games they cover">
                  Season sample
                </th>
                {seasonDefs.map((def) => sortable(def.sortKey, def.label, "", `${def.title}, this season to date`))}
              </>
            ) : null}
            <th scope="col" className={`${header} text-right`}>
              {SEASON_LABEL["2025-26"]} DvP
            </th>
            <th scope="col" className={`${header} text-right`}>
              {SEASON_LABEL["2026-27"]} DvP
            </th>
            <th scope="col" className={`${header} text-right`} title="Games sampled: last season / this season">
              GP {SEASON_LABEL["2025-26"].slice(2)}/{SEASON_LABEL["2026-27"].slice(2)}
            </th>
            <th scope="col" aria-sort={ariaSort("dvpRank")} className={`${header} text-left`}>
              <HeaderButton label="Matchup" sortKey="dvpRank" active={sortKey === "dvpRank"} direction={direction} onSort={onSort} />
            </th>
            <th scope="col" className={`${header} text-left`}>
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-8 text-center text-slate-500">
                No {marketLabel} props match these filters.
              </td>
            </tr>
          ) : null}
          {rows.map(({ entry, difference, dvp, season, override, jkbTriple }) => {
            const comparison = dvp.kind === "ok" ? dvp.comparison : null;
            const tier = comparison?.tier ?? null;
            const key = playerOverrideKey(entry);
            const jkbMinutes = entry.projection?.minutes ?? null;
            const seasonPerMinute = marketRates(season?.current ?? null, market).perMinute;
            const canEdit = (jkbMinutes !== null && jkbMinutes > 0 && entry.projection !== null) || seasonPerMinute !== null;
            const active = override.userMinutes !== null;
            return (
              <tr key={entry.entryKey} className={DENSE_TABLE_ROW}>
                <th scope="row" className={frozenDenseColumn({ surface: "bg-white", className: "border-r border-slate-100 px-3 py-1.5 text-left font-medium text-slate-900" })}>
                  <div className="whitespace-nowrap">{entry.playerName}</div>
                  <div className="whitespace-nowrap text-[10px] font-normal text-slate-500">
                    {entry.team ?? "—"} {entry.opponent ? `vs ${entry.opponent}` : ""} ·{" "}
                    {entry.positionLabel ? (
                      <span title={dvp.kind === "ok" && dvp.isMultiPosition ? `Multi-position label; DvP uses ${dvp.position}. Estimated, not verified minutes at a position.` : "Estimated position from depth charts and rotation roles, not verified minutes at a position."}>
                        {entry.positionLabel}
                        {dvp.kind === "ok" && dvp.isMultiPosition ? ` → ${dvp.position}` : ""} <span className="text-slate-400">(est.)</span>
                      </span>
                    ) : (
                      <span title="No estimated position for this player">pos N/A</span>
                    )}
                  </div>
                </th>
                <td className={cn(num, "bg-indigo-50/40")}>
                  <MinutesEditor
                    name={entry.playerName}
                    draft={drafts[key] ?? ""}
                    placeholder={jkbMinutes !== null ? jkbMinutes.toFixed(1) : "min"}
                    disabledReason={canEdit ? null : "No JKB minutes or season rate to work from for this player"}
                    onChange={(text) => onDraftChange(key, text)}
                    onReset={() => onReset(key)}
                  />
                </td>
                <td className={num}>
                  {entry.line ? (
                    <>
                      <div className="font-semibold text-slate-900">{entry.line.line.toFixed(1)}</div>
                      <div className="whitespace-nowrap text-[10px] text-slate-500">
                        O {formatAmerican(entry.line.overPrice)} / U {formatAmerican(entry.line.underPrice)}
                      </div>
                    </>
                  ) : (
                    <NA why={entry.lineWithheldReason ?? "No line"} />
                  )}
                </td>
                <td className={num} data-testid="jkb-projection">
                  {entry.projection ? <div className="font-semibold text-slate-900">{entry.projection.value.toFixed(1)}</div> : <NA why={entry.projectionUnavailableReason ?? "No projection"} />}
                </td>
                <td className={cn(num, "text-slate-600")} data-testid="jkb-minutes">
                  {jkbMinutes !== null ? jkbMinutes.toFixed(1) : <NA why="The model gave no minutes for this projection" />}
                </td>
                <td className={cn(num, "font-semibold", diffClass(difference))} data-testid="jkb-difference">
                  {difference === null ? <NA why="Needs both a line and a projection" /> : signed(difference)}
                </td>
                <td className={cn(num, "bg-indigo-50/40")} data-testid="adjusted-projection">
                  {!active ? <span className="text-slate-300">—</span> : override.adjustedProjection !== null ? (
                    <>
                      <div className="font-semibold text-indigo-900">{override.adjustedProjection.toFixed(1)}</div>
                      {jkbMinutes !== null && jkbMinutes > 0 && override.userMinutes !== null ? <MinutesScale factor={override.userMinutes / jkbMinutes} /> : null}
                    </>
                  ) : (
                    <NA why="Needs a JKB projection with positive minutes to scale" />
                  )}
                </td>
                <td className={cn(num, "bg-indigo-50/40 font-semibold", diffClass(override.adjustedDifference))} data-testid="adjusted-difference">
                  {!active ? <span className="font-normal text-slate-300">—</span> : override.adjustedDifference !== null ? signed(override.adjustedDifference) : <NA why="Needs a line and an adjusted projection" />}
                </td>
                <td className={cn(num, "bg-amber-50/40")} data-testid="season-rate-estimate">
                  {!active ? (
                    <span className="text-slate-300">—</span>
                  ) : override.seasonRateEstimate !== null ? (
                    <>
                      <div className="font-semibold text-amber-900">{override.seasonRateEstimate.toFixed(1)}</div>
                      {season?.current ? (
                        <div className="whitespace-nowrap text-[10px] font-normal text-slate-500" title={`Per-minute rate from ${season.current.games} ${season.current.games === 1 ? "game" : "games"} of ${season.current.season}${season.current.games < EARLY_SEASON_GAMES ? ": a small sample" : ""}`}>
                          on {season.current.games} g{season.current.games < EARLY_SEASON_GAMES ? " · small sample" : ""}
                        </div>
                      ) : null}
                      {override.seasonRateDifference !== null ? <div className={cn("text-[10px] font-normal", diffClass(override.seasonRateDifference))}>{signed(override.seasonRateDifference)} vs line</div> : null}
                    </>
                  ) : (
                    <NA why="Needs this season's games to get a per-minute rate" />
                  )}
                </td>
                <td className={cn(num, "whitespace-nowrap text-slate-600")} data-testid="jkb-triple">
                  {(["pts", "reb", "ast"] as const).map((m, i) => (
                    <span key={m} className={m === market ? "font-semibold text-slate-900" : ""}>
                      {i > 0 ? " / " : ""}
                      {jkbTriple[m] === null ? "—" : jkbTriple[m]?.toFixed(1)}
                    </span>
                  ))}
                </td>
                {showSeason ? (
                  <>
                    <td className="px-3 py-1.5 text-left" data-testid="season-sample">
                      <SeasonSampleCell season={season} />
                    </td>
                    {seasonDefs.map((def) => (
                      <td key={def.sortKey} className={num} data-testid={`season-${def.label.toLowerCase().replace("/", "-")}`}>
                        <SeasonValueCell season={season} def={def} />
                      </td>
                    ))}
                  </>
                ) : null}
                <td className={num}>
                  <DvpSeasonCell row={comparison?.prior} why={dvpWhy(dvp)} />
                </td>
                <td className={num}>
                  <DvpSeasonCell row={comparison?.current} why={dvp.kind === "ok" ? "No games sampled this season yet" : dvpWhy(dvp)} />
                </td>
                <td className={cn(num, "text-slate-600")}>{comparison ? `${comparison.prior?.gamesSampled ?? 0}/${comparison.current?.gamesSampled ?? 0}` : <NA why={dvpWhy(dvp)} />}</td>
                <td className="px-3 py-1.5 text-left">
                  {comparison?.blended && tier ? (
                    <span title={`Blended allowed ${comparison.blended.allowedPerGame.toFixed(1)} (${Math.round(comparison.blended.currentWeight * 100)}% this season). ${BASIS_LABEL[comparison.sampleBasis]}.`}>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", TIER_CLASS[tier])}>{TIER_LABEL[tier]}</span>
                      <span className="ml-1 tabular-nums text-slate-600">#{comparison.blended.rank}</span>
                      <span className="ml-1 text-[10px] text-slate-500">{BASIS_LABEL[comparison.sampleBasis]}</span>
                    </span>
                  ) : (
                    <NA why={dvpWhy(dvp)} />
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-left text-[10px] text-slate-500">
                  {entry.line ? (
                    <>
                      {entry.line.sportsbook} · {etTime(entry.line.capturedAtUtc)} ET
                      {entry.line.freshness === "stale" ? <span className="ml-1 rounded bg-amber-100 px-1 font-semibold text-amber-800">stale</span> : null}
                    </>
                  ) : (
                    <span title={entry.lineWithheldReason ?? undefined}>{entry.lineWithheldReason ?? "no line"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}
