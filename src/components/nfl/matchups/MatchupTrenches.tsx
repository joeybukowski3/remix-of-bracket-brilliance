import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import { rankAccentClass } from "@/lib/nfl/rankTier";
import {
  METRIC_NA,
  TRENCH_BATTLES,
  getMetricDef,
  type NflMatchupMetricResolver,
  type NflMatchupMetricValue,
} from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

/**
 * One side of a trench battle.
 *
 * Each side is scaled independently against its own 0-100 win rate — there is
 * deliberately no head-to-head fraction, because a combined split bar would
 * read as a derived matchup score, which this phase does not produce.
 *
 * When the win rate is unavailable the track renders as an explicit dashed
 * "awaiting data" state rather than a zero-width fill that would look like a
 * genuine result of 0%.
 */
function TrenchSide({
  metric,
  teamName,
  metricLabel,
  align,
}: {
  metric: NflMatchupMetricValue | null;
  teamName: string;
  metricLabel: string;
  align: "start" | "end";
}) {
  const isEnd = align === "end";
  const value = metric?.value ?? null;
  const hasValue = value != null && Number.isFinite(value);
  const fill = hasValue ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className={`min-w-0 ${isEnd ? "text-right" : "text-left"}`}>
      <div className={`flex items-center gap-1.5 ${isEnd ? "flex-row-reverse" : ""}`}>
        <span className="truncate text-[10px] font-bold text-slate-500">{teamName}</span>
        <MatchupRankBadge rank={metric?.rank ?? null} />
        <span
          className={`text-[12px] font-black tabular-nums ${hasValue ? "text-slate-900" : "text-slate-400"}`}
        >
          {metric?.formattedValue ?? METRIC_NA}
        </span>
      </div>

      <div
        className={`mt-1 h-1.5 w-full overflow-hidden rounded-full ${
          hasValue ? "bg-slate-100" : "border border-dashed border-slate-300 bg-slate-50"
        }`}
        role="img"
        aria-label={
          hasValue
            ? `${teamName} ${metricLabel}: ${metric?.formattedValue}`
            : `${teamName} ${metricLabel}: unavailable`
        }
      >
        {hasValue && (
          <div
            className={`h-full rounded-full ${rankAccentClass(metric?.rank ?? null)} ${isEnd ? "ml-auto" : ""}`}
            style={{ width: `${fill}%` }}
          />
        )}
      </div>
    </div>
  );
}

function TrenchBattle({
  offenseTeam,
  defenseTeam,
  offenseKey,
  defenseKey,
  label,
  resolver,
}: {
  offenseTeam: NflMatchupTeam;
  defenseTeam: NflMatchupTeam;
  offenseKey: string;
  defenseKey: string;
  label: string;
  resolver: NflMatchupMetricResolver;
}) {
  const offenseDef = getMetricDef(offenseKey);
  const defenseDef = getMetricDef(defenseKey);

  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="mb-1.5 text-center text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TrenchSide
          metric={resolver(offenseTeam.slug, offenseKey)}
          teamName={`${offenseTeam.abbr.toUpperCase()} ${offenseDef?.shortLabel ?? ""}`.trim()}
          metricLabel={offenseDef?.label ?? offenseKey}
          align="start"
        />
        <TrenchSide
          metric={resolver(defenseTeam.slug, defenseKey)}
          teamName={`${defenseTeam.abbr.toUpperCase()} ${defenseDef?.shortLabel ?? ""}`.trim()}
          metricLabel={defenseDef?.label ?? defenseKey}
          align="end"
        />
      </div>
    </div>
  );
}

/** Four line-of-scrimmage battles, two per possession. */
export default function MatchupTrenches({
  matchup,
  resolver,
}: {
  matchup: NflMatchup;
  resolver: NflMatchupMetricResolver;
}) {
  const { away, home } = matchup;

  const possessions = [
    { key: "away", offense: away, defense: home },
    { key: "home", offense: home, defense: away },
  ];

  return (
    <MatchupSection id="trenches" subtitle="Line-of-scrimmage win rates, shown side by side.">
      <div className="space-y-3">
        {possessions.map(({ key, offense, defense }) => (
          <div key={key}>
            <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              {offense.teamName} has the ball
            </h3>
            {/* One battle per row. Side-by-side battles leave roughly 128px per
                side once this section sits in the desktop two-column grid,
                which truncates the team/metric labels. */}
            <div className="grid gap-2">
              {TRENCH_BATTLES.map((battle) => (
                <TrenchBattle
                  key={battle.id}
                  offenseTeam={offense}
                  defenseTeam={defense}
                  offenseKey={battle.offenseKey}
                  defenseKey={battle.defenseKey}
                  label={battle.label}
                  resolver={resolver}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <MatchupPendingNote>
        Win rates come from the ESPN / Next Gen Stats line-of-scrimmage feed, which is not connected
        yet. Each side is scaled independently — no combined trench score is produced.
      </MatchupPendingNote>
    </MatchupSection>
  );
}
