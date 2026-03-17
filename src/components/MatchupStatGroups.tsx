import { useMemo } from "react";
import {
  calculateTeamScore,
  computeHomeInflationMetrics,
  computeQuadRecord,
  getTop50AvgDropOff,
  hasStat,
  DEFAULT_STAT_WEIGHTS,
  type Team,
} from "@/data/ncaaTeams";

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
  );
}

function StatGroupRow({
  label,
  valA,
  valB,
  higherIsBetter,
  format = (v: number) => v.toFixed(1),
}: {
  label: string;
  valA: number | null;
  valB: number | null;
  higherIsBetter: boolean;
  format?: (v: number) => string;
}) {
  const aWins = hasStat(valA) && hasStat(valB) && (higherIsBetter ? valA > valB : valA < valB);
  const bWins = hasStat(valA) && hasStat(valB) && (higherIsBetter ? valB > valA : valB < valA);

  return (
    <div className="grid grid-cols-[1fr,auto,1fr] items-center py-1.5 border-b border-border/40 last:border-0 gap-2">
      <span className={`text-right text-xs tabular-nums font-semibold rounded px-1 py-0.5 ${aWins ? "bg-primary/10 text-primary" : "text-foreground"}`}>
        {hasStat(valA) ? format(valA) : "—"}
      </span>
      <span className="text-[10px] text-muted-foreground text-center whitespace-nowrap px-1">{label}</span>
      <span className={`text-left text-xs tabular-nums font-semibold rounded px-1 py-0.5 ${bWins ? "bg-primary/10 text-primary" : "text-foreground"}`}>
        {hasStat(valB) ? format(valB) : "—"}
      </span>
    </div>
  );
}

interface MatchupStatGroupsProps {
  teamA: Team;
  teamB: Team;
  teamPool: Team[];
}

export default function MatchupStatGroups({ teamA, teamB, teamPool }: MatchupStatGroupsProps) {
  const avgDropOff = useMemo(() => getTop50AvgDropOff(teamPool), [teamPool]);
  const infA = useMemo(() => computeHomeInflationMetrics(teamA, avgDropOff), [teamA, avgDropOff]);
  const infB = useMemo(() => computeHomeInflationMetrics(teamB, avgDropOff), [teamB, avgDropOff]);

  const sortedPool = useMemo(
    () => [...teamPool].sort((a, b) => calculateTeamScore(b.stats, DEFAULT_STAT_WEIGHTS) - calculateTeamScore(a.stats, DEFAULT_STAT_WEIGHTS)),
    [teamPool],
  );

  const rankA = sortedPool.findIndex((t) => t.canonicalId === teamA.canonicalId) + 1 || sortedPool.length;
  const rankB = sortedPool.findIndex((t) => t.canonicalId === teamB.canonicalId) + 1 || sortedPool.length;
  const quadA = useMemo(() => computeQuadRecord(teamA, rankA, sortedPool.length), [teamA, rankA, sortedPool.length]);
  const quadB = useMemo(() => computeQuadRecord(teamB, rankB, sortedPool.length), [teamB, rankB, sortedPool.length]);

  const netEffA = hasStat(teamA.stats.adjOE) && hasStat(teamA.stats.adjDE) ? teamA.stats.adjOE - teamA.stats.adjDE : null;
  const netEffB = hasStat(teamB.stats.adjOE) && hasStat(teamB.stats.adjDE) ? teamB.stats.adjOE - teamB.stats.adjDE : null;

  const pct = (v: number) => `${v.toFixed(1)}%`;
  const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

  const colHeader = (
    <div className="grid grid-cols-[1fr,auto,1fr] pb-1 border-b border-border mb-0.5 gap-2">
      <span className="text-right text-[10px] font-semibold text-muted-foreground">{teamA.abbreviation}</span>
      <span className="text-[10px] font-semibold text-muted-foreground text-center px-1">Stat</span>
      <span className="text-left text-[10px] font-semibold text-muted-foreground">{teamB.abbreviation}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Efficiency Ratings */}
      <div>
        <SectionHeader label="Efficiency Ratings" />
        {colHeader}
        <StatGroupRow label="Adj. Off. Eff" valA={teamA.stats.adjOE} valB={teamB.stats.adjOE} higherIsBetter />
        <StatGroupRow label="Adj. Def. Eff" valA={teamA.stats.adjDE} valB={teamB.stats.adjDE} higherIsBetter={false} />
        <StatGroupRow label="Net Efficiency" valA={netEffA} valB={netEffB} higherIsBetter />
        <StatGroupRow label="Home Net Eff" valA={infA.netEffHome} valB={infB.netEffHome} higherIsBetter />
        <StatGroupRow label="Away Net Eff" valA={infA.netEffAway} valB={infB.netEffAway} higherIsBetter />
        <StatGroupRow label="Drop-Off (Δ)" valA={infA.dropOff} valB={infB.dropOff} higherIsBetter={false} format={signed} />
        <StatGroupRow label="Inflation Score" valA={infA.homeInflationScore} valB={infB.homeInflationScore} higherIsBetter={false} format={signed} />
        <StatGroupRow label="SOS" valA={teamA.stats.sos} valB={teamB.stats.sos} higherIsBetter />
        <StatGroupRow label="Tempo" valA={teamA.stats.tempo} valB={teamB.stats.tempo} higherIsBetter />
      </div>

      {/* Scoring & Defense */}
      <div>
        <SectionHeader label="Scoring & Defense" />
        <StatGroupRow label="FG%" valA={teamA.stats.fgPct} valB={teamB.stats.fgPct} higherIsBetter format={pct} />
        <StatGroupRow label="3PT%" valA={teamA.stats.threePct} valB={teamB.stats.threePct} higherIsBetter format={pct} />
        <StatGroupRow label="FT%" valA={teamA.stats.ftPct} valB={teamB.stats.ftPct} higherIsBetter format={pct} />
        <StatGroupRow label="RPG" valA={teamA.stats.rpg} valB={teamB.stats.rpg} higherIsBetter />
        <StatGroupRow label="TOV/G" valA={teamA.stats.tpg} valB={teamB.stats.tpg} higherIsBetter={false} />
        <StatGroupRow label="Opp PPG" valA={teamA.stats.oppPpg} valB={teamB.stats.oppPpg} higherIsBetter={false} />
      </div>

      {/* Four Factors (Estimated) */}
      <div>
        <SectionHeader label="Four Factors (est.)" />
        <p className="text-[9px] text-muted-foreground/70 mb-1 italic">Approximated from available stats</p>
        <StatGroupRow label="eFG% (est.)" valA={teamA.stats.fgPct} valB={teamB.stats.fgPct} higherIsBetter format={pct} />
        <StatGroupRow label="Def Eff (↓=better)" valA={teamA.stats.adjDE} valB={teamB.stats.adjDE} higherIsBetter={false} />
        <StatGroupRow label="TOV/G" valA={teamA.stats.tpg} valB={teamB.stats.tpg} higherIsBetter={false} />
        <StatGroupRow label="RPG (ORB proxy)" valA={teamA.stats.rpg} valB={teamB.stats.rpg} higherIsBetter />
        <StatGroupRow label="FT%" valA={teamA.stats.ftPct} valB={teamB.stats.ftPct} higherIsBetter format={pct} />
        <StatGroupRow label="3PT% (3PAr proxy)" valA={teamA.stats.threePct} valB={teamB.stats.threePct} higherIsBetter format={pct} />
      </div>

      {/* Tournament Resume */}
      <div>
        <SectionHeader label="Tournament Resume" />
        <div className="grid grid-cols-2 gap-3 mt-1">
          {[
            { team: teamA, quad: quadA },
            { team: teamB, quad: quadB },
          ].map(({ team, quad }) => (
            <div key={team.canonicalId} className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground">{team.abbreviation}</p>
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-yellow-400/15 text-yellow-400 border border-yellow-400/25">
                  Q1 {quad.q1.wins}-{quad.q1.losses}
                </span>
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground">
                  Q2 {quad.q2.wins}-{quad.q2.losses}
                </span>
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground">
                  Q3 {quad.q3.wins}-{quad.q3.losses}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
