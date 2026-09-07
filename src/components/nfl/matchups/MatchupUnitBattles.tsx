import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import { MATCHUP_GROUP_BAND, MATCHUP_PANEL_CAPTION, MATCHUP_PANEL_TITLE } from "@/components/nfl/matchups/matchupTypography";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupTabStrip, { type MatchupTabDef } from "@/components/nfl/matchups/MatchupTabStrip";
import NflHeadToHeadMetricRow from "@/components/nfl/matchups/NflHeadToHeadMetricRow";
import MatchupPendingNote, { CONVENTIONAL_STATS_SOURCES } from "@/components/nfl/matchups/MatchupPendingNote";
import {
  UNIT_BATTLE_GROUPS,
  getMetricDef,
  METRIC_NA,
  type NflMetricPairing,
  type NflMatchupMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import { deriveMetricComparisonFromRanks } from "@/lib/nfl/matchupRailNormalization";

import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import {
  SUCCESS_PERIOD_LABELS,
  collectPeriodValues,
  formatSuccessRate,
  isSuccessRateMetric,
} from "@/lib/nfl/successRateData";
import type { MatchupSuccessRateConfig } from "@/components/nfl/matchups/MatchupUnitComparison";
import { type MatchupTrenchConfig } from "@/components/nfl/matchups/MatchupTrenchRow";
import {
  collectTrenchPeriodValues,
  formatTrenchValue,
  isTrenchMetric,
  trenchPeriodLabel,
} from "@/lib/nfl/trenchMetricsData";

type PossessionSide = "away-ball" | "home-ball";

/**
 * A pairing is descriptive when either side is context-only, in which case the
 * row drops quality-tier colouring and asserts no winner. Ranks are already
 * direction-aware per side, so a quality pairing colours and compares correctly
 * even though the two sides read in opposite directions (e.g. yards/play gained
 * vs yards/play allowed).
 */
function pairingIsDescriptive(offenseKey: string, defenseKey: string): boolean {
  return (
    getMetricDef(offenseKey)?.direction === "context-only" ||
    getMetricDef(defenseKey)?.direction === "context-only"
  );
}

/**
 * One side of a possession header: crest, unit name and the role it is playing.
 *
 * The role caption is a restatement of the unit, not a judgement — "Attacking"
 * and "Defending" say who has the ball, and neither is presented as the better
 * position to be in.
 */
function PossessionTeam({
  team,
  side,
  unit,
  align,
}: {
  team: NflMatchupTeam;
  side: "away" | "home";
  unit: "Offense" | "Defense";
  /** Which edge of the header this side sits on. */
  align: "start" | "end";
}) {
  const isEnd = align === "end";

  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${isEnd ? "flex-row-reverse text-right" : ""}`}
    >
      <NflTeamCrest team={team} side={side} size={44} className="matchup-unit-battle__crest" />
      <div className="min-w-0">
        <div className={`truncate ${MATCHUP_PANEL_TITLE}`}>
          <span className="sm:hidden">
            {team.abbr.toUpperCase()} {unit === "Offense" ? "Off" : "Def"}
          </span>
          <span className="hidden sm:inline">
            {team.teamName} {unit}
          </span>
        </div>
        <div className={`mt-0.5 ${MATCHUP_PANEL_CAPTION}`}>
          {unit === "Offense" ? "Attacking" : "Defending"}
        </div>
      </div>
    </div>
  );
}

/**
 * Every comparison row for one attacking-vs-defending pairing.
 *
 * The two sides of a pairing measure opposing sides of the same matchup and do
 * not share a raw unit, so their values are never compared directly. Each side's
 * league rank is direction-normalized, so the better league position is the
 * stronger side — that is the only comparison the advantage caption and rail
 * express, via the shared `NflHeadToHeadMetricRow`. When a rank is unavailable
 * the row shows a neutral "Not compared" rail rather than inventing a winner.
 *
 * Period-based sources (success rate, trench win rates) render one row per
 * visible period with the period carried in the row's context sub-label.
 */
function PairingRows({
  pairing,
  awayTeam,
  homeTeam,
  awayRole,
  homeRole,
  awayMetricKey,
  homeMetricKey,
  resolver,
  successRate,
  trench,
}: {
  pairing: NflMetricPairing;
  awayTeam: NflMatchupTeam;
  homeTeam: NflMatchupTeam;
  awayRole: "offense" | "defense";
  homeRole: "offense" | "defense";
  awayMetricKey: string;
  homeMetricKey: string;
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
}) {
  const common = {
    label: pairing.label,
    help: pairing.help,
    leftTeamName: `${awayTeam.teamName} ${awayRole}`,
    rightTeamName: `${homeTeam.teamName} ${homeRole}`,
    leftTeamAbbr: awayTeam.abbr,
    rightTeamAbbr: homeTeam.abbr,
    leftRawValue: null,
    rightRawValue: null,
  };

  if (trench && isTrenchMetric(pairing.offenseKey)) {
    const awayValues = collectTrenchPeriodValues(trench.resolve, awayTeam.abbr, awayMetricKey, trench.periods);
    const homeValues = collectTrenchPeriodValues(trench.resolve, homeTeam.abbr, homeMetricKey, trench.periods);
    return (
      <>
        {trench.periods.map((period) => {
          const away = awayValues[period] ?? null;
          const home = homeValues[period] ?? null;
          const leftRank = away?.espnRank ?? null;
          const rightRank = home?.espnRank ?? null;
          return (
            <NflHeadToHeadMetricRow
              key={period}
              {...common}
              contextLabel={trenchPeriodLabel(trench.artifact, period).label}
              leftValue={formatTrenchValue(away)}
              rightValue={formatTrenchValue(home)}
              leftRank={leftRank}
              rightRank={rightRank}
              higherIsBetter
              comparison={deriveMetricComparisonFromRanks(leftRank, rightRank)}
            />
          );
        })}
      </>
    );
  }

  if (successRate && isSuccessRateMetric(pairing.offenseKey)) {
    const awayValues = collectPeriodValues(successRate.resolve, awayTeam.abbr, awayMetricKey, successRate.periods);
    const homeValues = collectPeriodValues(successRate.resolve, homeTeam.abbr, homeMetricKey, successRate.periods);
    return (
      <>
        {successRate.periods.map((period) => {
          const away = awayValues[period] ?? null;
          const home = homeValues[period] ?? null;
          const leftRank = away?.rank ?? null;
          const rightRank = home?.rank ?? null;
          return (
            <NflHeadToHeadMetricRow
              key={period}
              {...common}
              contextLabel={SUCCESS_PERIOD_LABELS[period].short}
              leftValue={formatSuccessRate(away)}
              rightValue={formatSuccessRate(home)}
              leftRank={leftRank}
              rightRank={rightRank}
              higherIsBetter
              comparison={deriveMetricComparisonFromRanks(leftRank, rightRank)}
            />
          );
        })}
      </>
    );
  }

  const away = resolver(awayTeam.slug, awayMetricKey);
  const home = resolver(homeTeam.slug, homeMetricKey);
  const leftRank = away?.rank ?? null;
  const rightRank = home?.rank ?? null;
  const descriptive = pairingIsDescriptive(pairing.offenseKey, pairing.defenseKey);
  return (
    <NflHeadToHeadMetricRow
      {...common}
      leftValue={away?.formattedValue ?? METRIC_NA}
      rightValue={home?.formattedValue ?? METRIC_NA}
      leftRank={leftRank}
      rightRank={rightRank}
      higherIsBetter={descriptive ? null : true}
      comparison={descriptive ? "not-comparable" : deriveMetricComparisonFromRanks(leftRank, rightRank)}
    />
  );
}

/**
 * One possession view: away team left, home team right, grouped Overall /
 * Passing / Rushing. Which side has the ball decides the roles the two columns
 * play, never which column they occupy.
 *
 * Straight comparison only — no aggregate matchup score, projected advantage or
 * weighted grade is derived from these pairings.
 */
function PossessionPanel({
  awayTeam,
  homeTeam,
  ballSide,
  resolver,
  successRate,
  trench,
  activeGroup,
}: {
  awayTeam: NflMatchupTeam;
  homeTeam: NflMatchupTeam;
  /** Which side has the ball in this panel. Decides roles, never columns. */
  ballSide: "away" | "home";
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
  /** Which UNIT_BATTLE_GROUPS id the group tabs currently show. */
  activeGroup: string;
}) {
  /**
   * Columns are keyed by SIDE, not by role: the away team is always the left
   * column and the home team always the right, in both panels, matching every
   * other table on this page. Only the roles flip between panels — panel one
   * reads away Offense vs home Defense, panel two away Defense vs home Offense.
   */
  const awayHasBall = ballSide === "away";
  const awayUnit = awayHasBall ? "Offense" : "Defense";
  const homeUnit = awayHasBall ? "Defense" : "Offense";
  const awayRole = awayHasBall ? "offense" : "defense";
  const homeRole = awayHasBall ? "defense" : "offense";

  /** The metric key each column reads, which is what the role actually selects. */
  const awayKey = (pairing: NflMetricPairing) =>
    awayHasBall ? pairing.offenseKey : pairing.defenseKey;
  const homeKey = (pairing: NflMetricPairing) =>
    awayHasBall ? pairing.defenseKey : pairing.offenseKey;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300">
      <div className="matchup-unit-battle__header flex items-center justify-between gap-3 border-b-2 border-slate-300 bg-slate-100 px-3 py-3 sm:px-5 sm:py-4">
        <PossessionTeam team={awayTeam} side="away" unit={awayUnit} align="start" />
        <span className="shrink-0 text-[14px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
          vs
        </span>
        <PossessionTeam team={homeTeam} side="home" unit={homeUnit} align="end" />
      </div>

      <div>
        {UNIT_BATTLE_GROUPS.filter((group) => group.id === activeGroup).map((group) => (
          <div key={group.id}>
            <h4 className={MATCHUP_GROUP_BAND}>{group.label}</h4>
            {group.pairings.map((pairing) => (
              <PairingRows
                key={pairing.id}
                pairing={pairing}
                awayTeam={awayTeam}
                homeTeam={homeTeam}
                awayRole={awayRole}
                homeRole={homeRole}
                awayMetricKey={awayKey(pairing)}
                homeMetricKey={homeKey(pairing)}
                resolver={resolver}
                successRate={successRate}
                trench={trench}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchupUnitBattles({
  matchup,
  resolver,
  successRate,
  trench,
}: {
  matchup: NflMatchup;
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
}) {
  const [side, setSide] = useState<PossessionSide>("away-ball");
  const [activeGroup, setActiveGroup] = useState<string>(UNIT_BATTLE_GROUPS[0].id);
  const { away, home } = matchup;

  const options = [
    { value: "away-ball" as const, label: `${away.abbr.toUpperCase()} Ball`, shortLabel: `${away.abbr.toUpperCase()} Ball` },
    { value: "home-ball" as const, label: `${home.abbr.toUpperCase()} Ball`, shortLabel: `${home.abbr.toUpperCase()} Ball` },
  ];

  const groupTabs: MatchupTabDef[] = UNIT_BATTLE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
  }));

  return (
    <MatchupSection
      id="matchups"
      eyebrow="Unit by unit"
      subtitle="Direct unit comparison, ranked by league position. No matchup score or projected advantage is derived."
      bodyClassName="matchup-dense-section-body"
      headerAside={
        <MatchupSegmentedControl
          options={options}
          value={side}
          onChange={setSide}
          ariaLabel="Possession view"
          size="sm"
          className="lg:hidden"
        />
      }
    >
      <MatchupTabStrip
        tabs={groupTabs}
        activeId={activeGroup}
        onSelect={setActiveGroup}
        ariaLabel="Unit by unit groups"
        className="mb-2"
      />

      <div className="space-y-2">
        <div className={side === "away-ball" ? "" : "hidden lg:block"}>
          <PossessionPanel
            awayTeam={away}
            homeTeam={home}
            ballSide="away"
            resolver={resolver}
            successRate={successRate}
            trench={trench}
            activeGroup={activeGroup}
          />
        </div>
        <div className={side === "home-ball" ? "" : "hidden lg:block"}>
          <PossessionPanel
            awayTeam={away}
            homeTeam={home}
            ballSide="home"
            resolver={resolver}
            successRate={successRate}
            trench={trench}
            activeGroup={activeGroup}
          />
        </div>
      </div>
      <MatchupPendingNote>{CONVENTIONAL_STATS_SOURCES}</MatchupPendingNote>
    </MatchupSection>
  );
}
