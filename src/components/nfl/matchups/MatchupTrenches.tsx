import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import NflHeadToHeadMetricRow from "@/components/nfl/matchups/NflHeadToHeadMetricRow";
import { type MatchupTrenchConfig } from "@/components/nfl/matchups/MatchupTrenchRow";
import { TRENCH_BATTLES, type NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import { deriveMetricComparisonFromRanks } from "@/lib/nfl/matchupRailNormalization";
import {
  collectTrenchPeriodValues,
  formatTrenchValue,
  trenchPeriodLabel,
} from "@/lib/nfl/trenchMetricsData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

/**
 * One line-of-scrimmage battle: the team with the ball's blocking metric against
 * the opposing front's matching disruption metric (e.g. Pass Block Win Rate vs
 * the opponent's Pass Rush Win Rate).
 *
 * The two win rates are not the same raw statistic, so their percentages are
 * never compared directly. Each side's league rank is direction-normalized, so
 * the stronger league position is the stronger side of the matchup — that is the
 * only comparison the row's advantage caption and rail express. When a rank is
 * missing the row falls back to its neutral "not compared" state.
 *
 * Periods are always aligned across the pairing — a 2025 blocking value is never
 * shown against a 2026 rush value. No trench score, percentage edge or projected
 * sacks is derived.
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
  const periods = trench?.periods ?? [];

  const awayValues = trench
    ? collectTrenchPeriodValues(trench.resolve, offenseTeam.abbr, offenseKey, periods)
    : {};
  const homeValues = trench
    ? collectTrenchPeriodValues(trench.resolve, defenseTeam.abbr, defenseKey, periods)
    : {};

  // A missing artifact or an unavailable season still renders the row, with N/A
  // values and a neutral rail — never a hidden pairing or a fabricated winner.
  const periodList: (typeof periods[number] | null)[] = periods.length > 0 ? [...periods] : [null];

  return (
    <>
      {periodList.map((period) => {
        const away = period ? awayValues[period] ?? null : null;
        const home = period ? homeValues[period] ?? null : null;
        const leftRank = away?.espnRank ?? null;
        const rightRank = home?.espnRank ?? null;
        return (
          <NflHeadToHeadMetricRow
            key={`${offenseKey}-${period ?? "na"}`}
            label={label}
            contextLabel={period ? trenchPeriodLabel(trench?.artifact ?? null, period).label : undefined}
            help={help}
            leftValue={formatTrenchValue(away)}
            rightValue={formatTrenchValue(home)}
            leftRank={leftRank}
            rightRank={rightRank}
            leftRawValue={null}
            rightRawValue={null}
            higherIsBetter
            comparison={deriveMetricComparisonFromRanks(leftRank, rightRank)}
            leftTeamName={`${offenseTeam.teamName} offense`}
            rightTeamName={`${defenseTeam.teamName} defense`}
            leftTeamAbbr={offenseTeam.abbr}
            rightTeamAbbr={defenseTeam.abbr}
          />
        );
      })}
    </>
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
      eyebrow="Line of scrimmage"
      subtitle="Line-of-scrimmage win rates. Context only — not an input to the JKB spread model."
      bodyClassName="matchup-dense-section-body"
    >
      <div className="space-y-2.5">
        {possessions.map(({ key, offense, defense }) => (
          <div key={key}>
            <h3 className="matchup-trenches__possession mb-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
              <span className="sr-only">{offense.teamName} has the ball</span>
              <span aria-hidden className="flex items-center gap-1.5">
                <NflTeamCrest team={offense} side={key === "away" ? "away" : "home"} size={24} />
                <span><span className="sm:hidden">{offense.abbr.toUpperCase()}</span><span className="hidden sm:inline">{offense.teamName}</span> offense</span>
              </span>
              <span aria-hidden className="text-slate-400">vs</span>
              <span aria-hidden className="flex flex-row-reverse items-center gap-1.5 text-right">
                <NflTeamCrest team={defense} side={key === "away" ? "home" : "away"} size={24} />
                <span><span className="sm:hidden">{defense.abbr.toUpperCase()}</span><span className="hidden sm:inline">{defense.teamName}</span> defense</span>
              </span>
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
