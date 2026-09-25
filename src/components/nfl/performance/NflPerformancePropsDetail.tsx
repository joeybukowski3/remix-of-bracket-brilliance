import type { ReactNode } from "react";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import type { PropsPerformanceRow, SidesPerformanceRow } from "@/types/nfl/performance";
import type { NflYardagePlayerHistoryGame } from "@/lib/nfl/props/types/yardageHistory";
import { DirectionBadge } from "./NflPerformanceDirection";
import { directionTone } from "./directionTone";
import { MatchupIdentity, TeamIdentity } from "./NflPerformanceIdentity";
import { NflResultBadge } from "./NflPerformanceBadges";
import NflPerformancePropsBoxScore from "./NflPerformancePropsBoxScore";
import { PROPS_MARKET_LABEL } from "@/lib/nfl/performance/propsFilters";

function Datum({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-semibold tabular-nums text-slate-800">{children}</dd>
    </div>
  );
}

/** Compact display of graded result and essential pregame context. */
export default function NflPerformancePropsDetail({ row, game, boxScore, boxScoreLoading = false }: { row: PropsPerformanceRow; game?: SidesPerformanceRow; boxScore?: NflYardagePlayerHistoryGame | null; boxScoreLoading?: boolean }) {
  const away = row.detail.home_away === "away" ? row.team : row.opponent;
  const home = row.detail.home_away === "home" ? row.team : row.opponent;
  const final = game?.game_completion_status === "final";
  const historyScore = boxScore?.gameScore;
  const fallbackScore = historyScore?.teamScore != null && historyScore.oppScore != null
    ? row.detail.home_away === "home"
      ? `${away.toUpperCase()} ${formatMetric(historyScore.oppScore, 0)} · ${home.toUpperCase()} ${formatMetric(historyScore.teamScore, 0)}`
      : `${away.toUpperCase()} ${formatMetric(historyScore.teamScore, 0)} · ${home.toUpperCase()} ${formatMetric(historyScore.oppScore, 0)}`
    : "Unavailable";

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
      <section aria-label="Game and box score" className={`rounded-md border p-3 ${directionTone[row.direction].detail}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Game &amp; box score · {PROPS_MARKET_LABEL[row.market]}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-800"><TeamIdentity abbr={row.team} compact /><span>{row.player ?? row.player_id}</span></div>
            <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight text-slate-900">
              {formatMetric(row.actual, 0)} <span className="text-xs font-semibold text-slate-600">{row.market.replace("_yards", "")} yards</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5"><DirectionBadge direction={row.direction} projected /><NflResultBadge result={row.result} /></div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200/80 pt-3 sm:grid-cols-4">
          <Datum label="Market line">{formatMetric(row.line)}</Datum>
          <Datum label="JKB projection">{formatMetric(row.jkb_projection)}</Datum>
          <Datum label="JKB − line">{formatSigned(row.difference)}</Datum>
          <Datum label="Absolute error">{formatMetric(row.absolute_error)}</Datum>
        </dl>

        <NflPerformancePropsBoxScore row={row} game={boxScore ?? null} loading={boxScoreLoading} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-slate-200/80 pt-3 text-xs">
          <div className="min-w-0"><MatchupIdentity away={away} home={home} /><p className="mt-1 text-slate-600">{row.team.toUpperCase()} {row.detail.home_away} · Opponent {row.opponent.toUpperCase()}</p></div>
          <div className="font-semibold tabular-nums text-slate-800"><span className="mr-1.5 font-medium text-slate-500">Final score</span>{final ? `${game.away_team.toUpperCase()} ${formatMetric(game.actual_away_points, 0)} · ${game.home_team.toUpperCase()} ${formatMetric(game.actual_home_points, 0)}` : fallbackScore}</div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200/80 pt-3 sm:grid-cols-4">
          <Datum label="Starter basis">{row.starter_basis.replace(/_/g, " ").toLowerCase()}</Datum>
          <Datum label="Starter rank">{row.detail.starter_rank ?? "—"}</Datum>
          <Datum label="Prediction time">{formatNflMetadataTimestamp(row.detail.prediction_timestamp)}</Datum>
          <Datum label="Model version">{row.model_version}</Datum>
        </dl>
      </section>
    </div>
  );
}
