import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import {
  MATCHUP_GROUP_BAND,
  MATCHUP_PANEL_CAPTION,
  MATCHUP_PANEL_TITLE,
} from "@/components/nfl/matchups/matchupTypography";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupComparisonRow from "@/components/nfl/matchups/MatchupComparisonRow";
import MatchupPendingNote, { CONVENTIONAL_STATS_SOURCES } from "@/components/nfl/matchups/MatchupPendingNote";
import {
  UNIT_BATTLE_GROUPS,
  getMetricDef,
  toSideValue,
  type NflMatchupMetricResolver,
} from "@/lib/nfl/matchupMetrics";

import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import MatchupSuccessRateRow from "@/components/nfl/matchups/MatchupSuccessRateRow";
import {
  collectPeriodValues,
  isSuccessRateMetric,
} from "@/lib/nfl/successRateData";
import type { MatchupSuccessRateConfig } from "@/components/nfl/matchups/MatchupUnitComparison";
import MatchupTrenchRow, { type MatchupTrenchConfig } from "@/components/nfl/matchups/MatchupTrenchRow";
import { collectTrenchPeriodValues, isTrenchMetric } from "@/lib/nfl/trenchMetricsData";

type PossessionSide = "away-ball" | "home-ball";

/**
 * A pairing is descriptive when either side is context-only, in which case the
 * row drops quality-tier colouring. Ranks are already direction-aware per side,
 * so a quality pairing colours correctly even though the two sides read in
 * opposite directions (e.g. yards/play gained vs yards/play allowed).
 */
function pairingDirection(offenseKey: string, defenseKey: string) {
  const offense = getMetricDef(offenseKey)?.direction;
  const defense = getMetricDef(defenseKey)?.direction;
  return offense === "context-only" || defense === "context-only" ? ("context-only" as const) : undefined;
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
}: {
  awayTeam: NflMatchupTeam;
  homeTeam: NflMatchupTeam;
  /** Which side has the ball in this panel. Decides roles, never columns. */
  ballSide: "away" | "home";
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
}) {
  /**
   * Columns are keyed by SIDE, not by role: the away team is always the left
   * column and the home team always the right, in both panels, matching every
   * other table on this page. Only the roles flip between panels — panel one
   * reads away Offense vs home Defense, panel two away Defense vs home Offense.
   *
   * Orienting by role instead put the home team on the left in the second
   * panel, so a reader scanning down the page found the sides swapped halfway.
   */
  const awayHasBall = ballSide === "away";
  const awayUnit = awayHasBall ? "Offense" : "Defense";
  const homeUnit = awayHasBall ? "Defense" : "Offense";
  const awayRole = awayHasBall ? "offense" : "defense";
  const homeRole = awayHasBall ? "defense" : "offense";

  /** The metric key each column reads, which is what the role actually selects. */
  const awayKey = (pairing: { offenseKey: string; defenseKey: string }) =>
    awayHasBall ? pairing.offenseKey : pairing.defenseKey;
  const homeKey = (pairing: { offenseKey: string; defenseKey: string }) =>
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
        {UNIT_BATTLE_GROUPS.map((group) => (
          <div key={group.id}>
            {/* Solid dark band: the ink-to-white transition against the rows is
                its own contrast, so it needs no border. Deliberately slate, not
                green/amber/orange/red — those are the rank-tier colours — and
                not blue, which reads as a link elsewhere on this page. */}
            <h4 className={MATCHUP_GROUP_BAND}>
              {group.label}
            </h4>
            {group.pairings.map((pairing) => {
              // Trench pairings follow the ESPN season policy; both sides use
              // the same period so a 2025 value never faces a 2026 one.
              if (trench && isTrenchMetric(pairing.offenseKey)) {
                return (
                  <MatchupTrenchRow
                    key={pairing.id}
                    metricLabel={pairing.label}
                    help={pairing.help}
                    artifact={trench.artifact}
                    periods={trench.periods}
                    awayValues={collectTrenchPeriodValues(trench.resolve, awayTeam.abbr, awayKey(pairing), trench.periods)}
                    homeValues={collectTrenchPeriodValues(trench.resolve, homeTeam.abbr, homeKey(pairing), trench.periods)}
                    awayTeamName={`${awayTeam.teamName} ${awayRole}`}
                    homeTeamName={`${homeTeam.teamName} ${homeRole}`}
                  />
                );
              }
              // Success-rate pairings follow the RBSDM period policy, not the
              // conventional-stat sample controls.
              if (successRate && isSuccessRateMetric(pairing.offenseKey)) {
                return (
                  <MatchupSuccessRateRow
                    key={pairing.id}
                    metricLabel={pairing.label}
                    help={pairing.help}
                    periods={successRate.periods}
                    awayValues={collectPeriodValues(successRate.resolve, awayTeam.abbr, awayKey(pairing), successRate.periods)}
                    homeValues={collectPeriodValues(successRate.resolve, homeTeam.abbr, homeKey(pairing), successRate.periods)}
                    awayTeamName={`${awayTeam.teamName} ${awayRole}`}
                    homeTeamName={`${homeTeam.teamName} ${homeRole}`}
                  />
                );
              }
              return (
                <MatchupComparisonRow
                  key={pairing.id}
                  metricLabel={pairing.label}
                  help={pairing.help}
                  direction={pairingDirection(pairing.offenseKey, pairing.defenseKey)}
                  away={toSideValue(resolver(awayTeam.slug, awayKey(pairing)))}
                  home={toSideValue(resolver(homeTeam.slug, homeKey(pairing)))}
                  awayTeamName={`${awayTeam.teamName} ${awayRole}`}
                  homeTeamName={`${homeTeam.teamName} ${homeRole}`}
                />
              );
            })}
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
  const { away, home } = matchup;

  const options = [
    { value: "away-ball" as const, label: `${away.abbr.toUpperCase()} Ball`, shortLabel: `${away.abbr.toUpperCase()} Ball` },
    { value: "home-ball" as const, label: `${home.abbr.toUpperCase()} Ball`, shortLabel: `${home.abbr.toUpperCase()} Ball` },
  ];

  return (
    <MatchupSection
      id="matchups"
      eyebrow="Unit by unit"
      subtitle="Direct unit comparison. No matchup score or projected advantage is derived."
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
      {/* Full-width stacked panels rather than two-up: the centre metric column
          then has room for "Passing Yards / Attempt" without wrapping. */}
      <div className="space-y-2">
        <div className={side === "away-ball" ? "" : "hidden lg:block"}>
          <PossessionPanel
            awayTeam={away}
            homeTeam={home}
            ballSide="away"
            resolver={resolver}
            successRate={successRate}
            trench={trench}
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
          />
        </div>
      </div>
      <MatchupPendingNote>{CONVENTIONAL_STATS_SOURCES}</MatchupPendingNote>
    </MatchupSection>
  );
}
