import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import MatchupTowerGrid from "@/components/nfl/matchups/MatchupTowerGrid";
import type { MatchupTowerMetricPresentation } from "@/components/nfl/matchups/matchupTowerPresentation";
import type { MatchupMetricTableRow } from "@/components/nfl/matchups/MatchupMetricTable";
import { towerHeightFromRank } from "@/components/nfl/matchups/matchupVisualMath";
import { type MatchupTrenchConfig } from "@/components/nfl/matchups/MatchupTrenchRow";
import { TRENCH_BATTLES, type NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import { deriveMetricComparisonFromRanks } from "@/lib/nfl/matchupRailNormalization";
import {
  collectTrenchPeriodValues,
  formatTrenchValue,
  trenchPairSampleLabel,
} from "@/lib/nfl/trenchMetricsData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";

/**
 * Build one possession's comparison rows.
 *
 * Each line-of-scrimmage battle pairs the team-with-the-ball's blocking metric
 * against the opposing front's disruption metric (Pass Block Win Rate vs the
 * opponent's Pass Rush Win Rate). The two win rates are NOT the same raw
 * statistic, so their percentages are never compared directly and the Edge
 * shows only the advantaged side. Each side's ESPN rank is direction-normalized,
 * so the stronger league position is the stronger side — that is the comparison
 * the row expresses, exactly as before. A missing rank stays neutral.
 *
 * Columns are keyed by SIDE: away team left, home team right, whichever team is
 * on offense for this possession. Only `awayIsOffense` decides which metric key
 * each side reads.
 */
function possessionRows(
  awayTeam: NflMatchupTeam,
  homeTeam: NflMatchupTeam,
  awayIsOffense: boolean,
  trench: MatchupTrenchConfig | undefined
): MatchupMetricTableRow[] {
  const periods = trench?.periods ?? [];
  const periodList: (typeof periods[number] | null)[] = periods.length > 0 ? [...periods] : [null];

  return TRENCH_BATTLES.flatMap((battle) => {
    const awayMetricKey = awayIsOffense ? battle.offenseKey : battle.defenseKey;
    const homeMetricKey = awayIsOffense ? battle.defenseKey : battle.offenseKey;
    const awayValues = trench
      ? collectTrenchPeriodValues(trench.resolve, awayTeam.abbr, awayMetricKey, periods)
      : {};
    const homeValues = trench
      ? collectTrenchPeriodValues(trench.resolve, homeTeam.abbr, homeMetricKey, periods)
      : {};

    return periodList.map((period) => {
      const away = period ? awayValues[period] ?? null : null;
      const home = period ? homeValues[period] ?? null : null;
      const leftRank = away?.espnRank ?? null;
      const rightRank = home?.espnRank ?? null;
      return {
        key: `${battle.id}-${period ?? "na"}`,
        label: battle.label,
        help: battle.help,
        contextLabel: period ? trenchPairSampleLabel(trench?.artifact ?? null, period, { abbr: awayTeam.abbr, value: away }, { abbr: homeTeam.abbr, value: home }) : undefined,
        direction: "higher-is-better" as const,
        away: { value: away?.valuePct ?? null, rank: leftRank, formatted: formatTrenchValue(away) },
        home: { value: home?.valuePct ?? null, rank: rightRank, formatted: formatTrenchValue(home) },
        comparison: deriveMetricComparisonFromRanks(leftRank, rightRank),
      };
    });
  });
}

/**
 * Trenches: line-of-scrimmage battles, two per possession.
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
    { key: "away", awayIsOffense: true, offense: away },
    { key: "home", awayIsOffense: false, offense: home },
  ] as const;

  return (
    <MatchupSection
      id="trenches"
      eyebrow="Line of scrimmage"
      titleAlign="center"
      subtitle="Line-of-scrimmage win rates. Context only — not an input to the JKB spread model."
      bodyClassName="matchup-dense-section-body"
    >
      <div className="space-y-4">
        {possessions.map(({ key, awayIsOffense, offense }) => {
          const awayRole = awayIsOffense ? "Offense" : "Defense";
          const homeRole = awayIsOffense ? "Defense" : "Offense";
          const defense = awayIsOffense ? home : away;
          const metrics: MatchupTowerMetricPresentation[] = possessionRows(away, home, awayIsOffense, trench).map((row) => ({
            id: `${key}-${row.key}`,
            label: row.label,
            contextLabel: row.contextLabel,
            away: {
              team: away,
              color: nflTeamColorFor(away) ?? "#94a3b8",
              identityLabel: `${away.abbr.toUpperCase()} ${awayIsOffense ? "OFF" : "DEF"}`,
              accessibleIdentityLabel: `${away.teamName} ${awayRole.toLowerCase()}`,
              formatted: row.away.formatted,
              rank: row.away.rank,
              heightPercent: towerHeightFromRank(row.away.rank),
            },
            home: {
              team: home,
              color: nflTeamColorFor(home) ?? "#94a3b8",
              identityLabel: `${home.abbr.toUpperCase()} ${awayIsOffense ? "DEF" : "OFF"}`,
              accessibleIdentityLabel: `${home.teamName} ${homeRole.toLowerCase()}`,
              formatted: row.home.formatted,
              rank: row.home.rank,
              heightPercent: towerHeightFromRank(row.home.rank),
            },
          }));
          return (
            <MatchupTowerGrid
              key={key}
              title={`${offense.abbr.toUpperCase()} Offense vs ${defense.abbr.toUpperCase()} Defense`}
              subtitle={`${offense.teamName} has the ball`}
              metrics={metrics}
            />
          );
        })}
      </div>

      <MatchupPendingNote>
        {note ??
          "Trench win rates are ESPN Analytics season-level metrics based on NFL Next Gen Stats tracking data."}{" "}
        Trench data: ESPN Analytics / NFL Next Gen Stats.
      </MatchupPendingNote>
    </MatchupSection>
  );
}
