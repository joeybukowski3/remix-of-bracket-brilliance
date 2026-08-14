import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
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
      <NflTeamCrest team={team} side={side} size={22} />
      <div className="min-w-0">
        <div className="truncate text-[11px] font-bold leading-4 text-slate-900 sm:text-[12px]">
          <span className="sm:hidden">
            {team.abbr.toUpperCase()} {unit === "Offense" ? "Off" : "Def"}
          </span>
          <span className="hidden sm:inline">
            {team.teamName} {unit}
          </span>
        </div>
        <div className="text-[9px] font-bold uppercase leading-3 tracking-[0.08em] text-slate-600">
          {unit === "Offense" ? "Attacking" : "Defending"}
        </div>
      </div>
    </div>
  );
}

/**
 * One possession view: the team with the ball on the left, the opposing defense
 * on the right, grouped Overall / Passing / Rushing.
 *
 * Straight comparison only — no aggregate matchup score, projected advantage or
 * weighted grade is derived from these pairings.
 */
function PossessionPanel({
  offenseTeam,
  defenseTeam,
  offenseSide,
  defenseSide,
  resolver,
  successRate,
  trench,
}: {
  offenseTeam: NflMatchupTeam;
  defenseTeam: NflMatchupTeam;
  /** Which side of the matchup each unit belongs to, for crest tone. */
  offenseSide: "away" | "home";
  defenseSide: "away" | "home";
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <PossessionTeam team={offenseTeam} side={offenseSide} unit="Offense" align="start" />
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
          vs
        </span>
        <PossessionTeam team={defenseTeam} side={defenseSide} unit="Defense" align="end" />
      </div>

      <div className="px-1.5 pb-1.5">
        {UNIT_BATTLE_GROUPS.map((group) => (
          <div key={group.id} className="pt-1.5">
            {/* Solid dark band: the ink-to-white transition against the rows is
                its own contrast, so it needs no border. Deliberately slate, not
                green/amber/orange/red — those are the rank-tier colours — and
                not blue, which reads as a link elsewhere on this page. */}
            <h4 className="mb-1 rounded bg-slate-800 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white">
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
                    awayValues={collectTrenchPeriodValues(trench.resolve, offenseTeam.abbr, pairing.offenseKey, trench.periods)}
                    homeValues={collectTrenchPeriodValues(trench.resolve, defenseTeam.abbr, pairing.defenseKey, trench.periods)}
                    awayTeamName={`${offenseTeam.teamName} offense`}
                    homeTeamName={`${defenseTeam.teamName} defense`}
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
                    awayValues={collectPeriodValues(successRate.resolve, offenseTeam.abbr, pairing.offenseKey, successRate.periods)}
                    homeValues={collectPeriodValues(successRate.resolve, defenseTeam.abbr, pairing.defenseKey, successRate.periods)}
                    awayTeamName={`${offenseTeam.teamName} offense`}
                    homeTeamName={`${defenseTeam.teamName} defense`}
                  />
                );
              }
              return (
                <MatchupComparisonRow
                  key={pairing.id}
                  metricLabel={pairing.label}
                  help={pairing.help}
                  direction={pairingDirection(pairing.offenseKey, pairing.defenseKey)}
                  away={toSideValue(resolver(offenseTeam.slug, pairing.offenseKey))}
                  home={toSideValue(resolver(defenseTeam.slug, pairing.defenseKey))}
                  awayTeamName={`${offenseTeam.teamName} offense`}
                  homeTeamName={`${defenseTeam.teamName} defense`}
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
      <div className="grid gap-3 xl:grid-cols-2">
        <div className={side === "away-ball" ? "" : "hidden lg:block"}>
          <PossessionPanel
            offenseTeam={away}
            defenseTeam={home}
            offenseSide="away"
            defenseSide="home"
            resolver={resolver}
            successRate={successRate}
            trench={trench}
          />
        </div>
        <div className={side === "home-ball" ? "" : "hidden lg:block"}>
          <PossessionPanel
            offenseTeam={home}
            defenseTeam={away}
            offenseSide="home"
            defenseSide="away"
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
