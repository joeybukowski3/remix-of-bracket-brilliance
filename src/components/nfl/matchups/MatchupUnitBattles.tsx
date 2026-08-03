import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupComparisonRow from "@/components/nfl/matchups/MatchupComparisonRow";
import MatchupPendingNote, { CONVENTIONAL_STATS_NOTE } from "@/components/nfl/matchups/MatchupPendingNote";
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
 * One possession view: the team with the ball on the left, the opposing defense
 * on the right, grouped Overall / Passing / Rushing.
 *
 * Straight comparison only — no aggregate matchup score, projected advantage or
 * weighted grade is derived from these pairings.
 */
function PossessionPanel({
  offenseTeam,
  defenseTeam,
  resolver,
  successRate,
  trench,
}: {
  offenseTeam: NflMatchupTeam;
  defenseTeam: NflMatchupTeam;
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-center gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:gap-2">
          <div className="truncate text-right text-[10px] font-black uppercase tracking-wide text-slate-600">
            <span className="sm:hidden">{offenseTeam.abbr.toUpperCase()} Off</span>
            <span className="hidden sm:inline">{offenseTeam.teamName} Offense</span>
          </div>
          <div className="text-center text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
            vs
          </div>
          <div className="truncate text-left text-[10px] font-black uppercase tracking-wide text-slate-600">
            <span className="sm:hidden">{defenseTeam.abbr.toUpperCase()} Def</span>
            <span className="hidden sm:inline">{defenseTeam.teamName} Defense</span>
          </div>
        </div>
      </div>

      <div className="px-2 pb-2">
        {UNIT_BATTLE_GROUPS.map((group) => (
          <div key={group.id} className="pt-2">
            <h4 className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
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
          <PossessionPanel offenseTeam={away} defenseTeam={home} resolver={resolver} successRate={successRate} trench={trench} />
        </div>
        <div className={side === "home-ball" ? "" : "hidden lg:block"}>
          <PossessionPanel offenseTeam={home} defenseTeam={away} resolver={resolver} successRate={successRate} trench={trench} />
        </div>
      </div>
      <MatchupPendingNote>{CONVENTIONAL_STATS_NOTE}</MatchupPendingNote>
    </MatchupSection>
  );
}
