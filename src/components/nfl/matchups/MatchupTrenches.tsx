import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import MatchupTrenchRow, { type MatchupTrenchConfig } from "@/components/nfl/matchups/MatchupTrenchRow";
import { TRENCH_BATTLES, getMetricDef, type NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import { collectTrenchPeriodValues } from "@/lib/nfl/trenchMetricsData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

/**
 * One line-of-scrimmage battle: the team with the ball's blocking metric against
 * the opposing front's matching disruption metric.
 *
 * Periods are always aligned across the pairing — a 2025 blocking value is never
 * shown against a 2026 rush value. No trench score, percentage edge, projected
 * sacks or winner is derived; this stays a factual comparison.
 */
function TrenchBattle({
  offenseTeam,
  defenseTeam,
  offenseKey,
  defenseKey,
  label,
  help,
  trench,
}: {
  offenseTeam: NflMatchupTeam;
  defenseTeam: NflMatchupTeam;
  offenseKey: string;
  defenseKey: string;
  label: string;
  help?: string;
  trench?: MatchupTrenchConfig;
}) {
  const offenseDef = getMetricDef(offenseKey);
  const defenseDef = getMetricDef(defenseKey);
  const periods = trench?.periods ?? [];

  const awayValues = trench
    ? collectTrenchPeriodValues(trench.resolve, offenseTeam.abbr, offenseKey, periods)
    : {};
  const homeValues = trench
    ? collectTrenchPeriodValues(trench.resolve, defenseTeam.abbr, defenseKey, periods)
    : {};

  return (
    <div className="border-t border-slate-100 pt-1.5 first:border-t-0 first:pt-0">
      <div className="mb-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>

      {/* Which team and metric each side represents. */}
      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-end gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:gap-2">
        <div
          title={offenseDef?.help}
          className="truncate text-right text-[9px] font-bold uppercase tracking-wide text-slate-500"
        >
          {offenseTeam.abbr.toUpperCase()} {offenseDef?.shortLabel ?? ""}
        </div>
        <div className="text-center text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
          vs
        </div>
        <div
          title={defenseDef?.help}
          className="truncate text-left text-[9px] font-bold uppercase tracking-wide text-slate-500"
        >
          {defenseTeam.abbr.toUpperCase()} {defenseDef?.shortLabel ?? ""}
        </div>
      </div>

      {periods.length > 0 ? (
        <MatchupTrenchRow
          metricLabel={label}
          help={help}
          showMetricLabel={false}
          artifact={trench?.artifact ?? null}
          periods={periods}
          awayValues={awayValues}
          homeValues={homeValues}
          awayTeamName={`${offenseTeam.teamName} ${offenseDef?.label ?? ""}`.trim()}
          homeTeamName={`${defenseTeam.teamName} ${defenseDef?.label ?? ""}`.trim()}
        />
      ) : (
        <p className="py-2 text-center text-[11px] font-semibold text-slate-400">N/A</p>
      )}
    </div>
  );
}

/**
 * Trenches: four line-of-scrimmage battles, two per possession.
 *
 * Values are ESPN Analytics team win rates (PBWR / RBWR / PRWR / RSWR) built on
 * NFL Next Gen Stats tracking data, shown with ESPN's official ranks. Sacks and
 * other conventional metrics are never substituted here.
 *
 * ESPN publishes cumulative season-to-date figures only, so this section uses
 * its own season-based period policy rather than the conventional Season/Last 5
 * controls, and never produces a Last 5 or Last 8 trench value.
 */
export default function MatchupTrenches({
  matchup,
  trench,
  note,
}: {
  matchup: NflMatchup;
  /** Present only when the generated ESPN artifact loaded. */
  trench?: MatchupTrenchConfig;
  /** Section-level period explanation, rendered once. */
  note?: string;
  /** Retained for API compatibility with the other sections; unused here. */
  resolver?: NflMatchupMetricResolver;
}) {
  const { away, home } = matchup;

  const possessions = [
    { key: "away", offense: away, defense: home },
    { key: "home", offense: home, defense: away },
  ];

  return (
    <MatchupSection
      id="trenches"
      subtitle="Line-of-scrimmage win rates. Context only — not an input to the JKB spread model."
    >
      <div className="space-y-2.5">
        {possessions.map(({ key, offense, defense }) => (
          <div key={key}>
            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {offense.teamName} has the ball
            </h3>
            <div className="grid gap-1.5">
              {TRENCH_BATTLES.map((battle) => (
                <TrenchBattle
                  key={battle.id}
                  offenseTeam={offense}
                  defenseTeam={defense}
                  offenseKey={battle.offenseKey}
                  defenseKey={battle.defenseKey}
                  label={battle.label}
                  help={battle.help}
                  trench={trench}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <MatchupPendingNote>
        {note ??
          "Trench win rates are ESPN Analytics season-level metrics based on NFL Next Gen Stats tracking data."}{" "}
        Trench data: ESPN Analytics / NFL Next Gen Stats.
      </MatchupPendingNote>
    </MatchupSection>
  );
}
