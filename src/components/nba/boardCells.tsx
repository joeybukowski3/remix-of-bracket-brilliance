import { cn } from "@/lib/utils";
import type { DvpRow, MatchupTier, SampleBasis } from "@/lib/nba/props/dvp";
import type { DvpState } from "@/lib/nba/props/propsBoard";
import type { SeasonColumns } from "@/lib/nba/props/seasonStats";

/** Shared pieces of the props table cells: neutral N/A, signed numbers, the matchup chip and the small-sample marker. */

export const TIER_LABEL: Record<MatchupTier, string> = { favorable: "Favorable", neutral: "Neutral", tough: "Tough" };
/**
 * Chip colors: solid green for a favorable matchup, solid red for a tough one. The word, the arrow and the rank always say the
 * same thing, so the color only reinforces it (and never carries it alone for a color-blind reader).
 */
export const TIER_CHIP: Record<MatchupTier, string> = {
  favorable: "bg-emerald-700 text-white ring-1 ring-inset ring-emerald-900/30",
  neutral: "bg-slate-200 text-slate-800 ring-1 ring-inset ring-slate-400/60",
  tough: "bg-rose-700 text-white ring-1 ring-inset ring-rose-900/30",
};
/** Arrows are text, so they read the same in any color vision: up = the opponent allows a lot, down = it allows little. */
export const TIER_GLYPH: Record<MatchupTier, string> = { favorable: "▲", neutral: "●", tough: "▼" };
/** Soft wash behind the Opp L10 and Matchup cells: visible at a glance, never a bright block across the row. */
export const TIER_CELL: Record<MatchupTier, string> = { favorable: "bg-emerald-100", neutral: "bg-slate-50", tough: "bg-rose-100" };
export const BASIS_LABEL: Record<SampleBasis, string> = {
  none: "no sample",
  "prior-led": "mostly last season",
  blending: "blending seasons",
  "current-led": "mostly this season",
};

export function NA({ why }: { why: string }) {
  return (
    <span className="text-slate-500" title={why}>
      N/A
    </span>
  );
}

/** Restrained amber marker for a small sample, with the game count written out so touch and color-blind readers get it too. */
export function LowSample({ why, games, className }: { why: string; games?: number; className?: string }) {
  return (
    <span className={cn("ml-1 whitespace-nowrap text-[10px] font-semibold text-amber-700", className)}>
      <span role="img" aria-label={why} title={why} className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
      {games === undefined ? null : `${games}g`}
    </span>
  );
}

/** One decimal with a sign; a value that rounds to zero is "0.0", never a red "-0.0". */
export const signed = (n: number): string => (Math.abs(n) < 0.05 ? "0.0" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`);
export const etTime = (utc: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(utc));
export const diffClass = (d: number | null): string => (d === null ? "" : d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-slate-600");
export const gamesLabel = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

export function dvpWhy(dvp: DvpState): string {
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
}

export function DvpSeasonCell({ row, why }: { row: DvpRow | null | undefined; why: string }) {
  if (!row) return <NA why={why} />;
  return (
    <span title={`${row.gamesSampled} games sampled · ${Math.round(row.minutesCoverage * 100)}% of minutes attributed to a position`}>
      {row.allowedPerGame.toFixed(1)}
      <span className="ml-1 text-slate-600">{row.rank === null ? "#–" : `#${row.rank}`}</span>
    </span>
  );
}

export function SeasonSampleCell({ season }: { season: SeasonColumns | null }) {
  if (!season) return <NA why="No season statistics for this player on this board" />;
  return (
    <div className={cn("whitespace-nowrap text-left text-[10px] text-slate-600")}>
      {season.current ? (
        <div title="Completed games before this matchup, did-not-play and zero-minute appearances excluded">
          {season.current.season} · {gamesLabel(season.current.games)}
        </div>
      ) : (
        <div className="text-slate-500">no games yet this season</div>
      )}
      {season.showPrevious && season.previous ? (
        <div className="text-slate-500" title="Last regular season, shown on its own and never blended into this season">
          {season.previous.season} · {gamesLabel(season.previous.games)}
        </div>
      ) : null}
    </div>
  );
}
