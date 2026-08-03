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
}: {
  offenseTeam: NflMatchupTeam;
  defenseTeam: NflMatchupTeam;
  resolver: NflMatchupMetricResolver;
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
            {group.pairings.map((pairing) => (
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
}: {
  matchup: NflMatchup;
  resolver: NflMatchupMetricResolver;
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
          <PossessionPanel offenseTeam={away} defenseTeam={home} resolver={resolver} />
        </div>
        <div className={side === "home-ball" ? "" : "hidden lg:block"}>
          <PossessionPanel offenseTeam={home} defenseTeam={away} resolver={resolver} />
        </div>
      </div>
      <MatchupPendingNote>{CONVENTIONAL_STATS_NOTE}</MatchupPendingNote>
    </MatchupSection>
  );
}
