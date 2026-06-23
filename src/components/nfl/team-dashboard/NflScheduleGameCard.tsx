import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { NFL_GUIDE_TEAM_BY_ABBR, type NflGuideTeam } from "@/lib/nfl/guide2026";
import type { NflScheduleGame } from "@/lib/nfl/teamSchedule";
import type { WarrenSharpWeeklyRestEdge } from "@/lib/nfl/warrenSharpSchedule2026";

type MatchupTone = "advantage" | "disadvantage" | "even" | "neutral";

export default function NflScheduleGameCard({
  team,
  game,
  fallbackWeek,
  restEdge,
}: {
  team: NflGuideTeam;
  game: NflScheduleGame;
  fallbackWeek: number;
  restEdge: WarrenSharpWeeklyRestEdge | null;
}) {
  const opponent = NFL_GUIDE_TEAM_BY_ABBR.get(game.opponentAbbr);
  const opponentName = opponent?.team ?? game.opponentName;
  const date = game.date ? new Date(game.date) : null;
  const dateText = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : game.status;
  const isAway = game.homeAway === "away";
  const offenseEdge = opponent ? team.offPct - opponent.defPct : null;
  const defenseEdge = opponent ? team.defPct - opponent.offPct : null;

  return (
    <article className={`border-b border-r p-5 transition-colors ${isAway ? "border-blue-100 bg-blue-50/80" : "border-slate-100 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-blue-600">
            Week {game.week ?? fallbackWeek}
          </div>
          {isAway && (
            <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-700">
              Away
            </span>
          )}
          {restEdge && <RestEdgeBadge days={restEdge.restEdgeDays} />}
        </div>
        <div className="text-xs font-bold text-slate-400">{game.result ?? game.status}</div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <img src={nflLogoUrl(game.opponentAbbr)} alt="" className="h-9 w-9 object-contain" />
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {isAway ? "at" : game.homeAway === "neutral" ? "vs · neutral" : "vs"}
          </div>
          {opponent ? (
            <Link
              to={`/nfl/guide/team/${opponent.slug}`}
              className="text-lg font-black text-slate-900 hover:text-blue-700 hover:underline"
            >
              {opponentName}
            </Link>
          ) : (
            <div className="text-lg font-black text-slate-900">{opponentName}</div>
          )}
        </div>
      </div>

      <div className="mt-3 text-xs leading-5 text-slate-500">
        {dateText}{game.venue ? ` · ${game.venue}` : ""}
      </div>

      {opponent && (
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label={`Model matchup ratings against ${opponentName}`}>
          <MatchupMetric
            label="Opponent power"
            value={`#${opponent.powerRank}`}
            detail={`${formatModelRating(opponent.ovrPct)} overall`}
            tone="neutral"
          />
          <MatchupMetric
            label="Offense edge"
            value={formatModelRating(offenseEdge)}
            detail={getEdgeLabel(offenseEdge)}
            tone={getEdgeTone(offenseEdge)}
          />
          <MatchupMetric
            label="Defense edge"
            value={formatModelRating(defenseEdge)}
            detail={getEdgeLabel(defenseEdge)}
            tone={getEdgeTone(defenseEdge)}
          />
        </div>
      )}
    </article>
  );
}

function RestEdgeBadge({ days }: { days: number }) {
  const classes = days > 0
    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : days < 0
      ? "border-red-200 bg-red-100 text-red-700"
      : "border-slate-200 bg-slate-100 text-slate-600";
  const label = days === 0 ? "Even rest" : `Rest ${days > 0 ? "+" : ""}${days}d`;

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${classes}`}>
      {label}
    </span>
  );
}

function MatchupMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: MatchupTone;
}) {
  const classes = tone === "advantage"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : tone === "disadvantage"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "even"
        ? "border-slate-200 bg-slate-50 text-slate-700"
        : "border-blue-200/70 bg-white/80 text-slate-900";

  return (
    <div className={`min-w-0 rounded-lg border px-2 py-2.5 text-center ${classes}`}>
      <div className="truncate text-[8px] font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-sm font-black tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[9px] font-bold opacity-75">{detail}</div>
    </div>
  );
}

function formatModelRating(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function getEdgeTone(value: number | null): MatchupTone {
  if (value == null || !Number.isFinite(value)) return "neutral";
  if (value > 0) return "advantage";
  if (value < 0) return "disadvantage";
  return "even";
}

function getEdgeLabel(value: number | null) {
  const tone = getEdgeTone(value);
  if (tone === "advantage") return "Advantage";
  if (tone === "disadvantage") return "Disadvantage";
  if (tone === "even") return "Even";
  return "Unavailable";
}
