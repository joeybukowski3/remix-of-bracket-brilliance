import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import MatchupAnglesList from "@/components/MatchupAnglesList";
import TeamLogo from "@/components/TeamLogo";
import { Switch } from "@/components/ui/switch";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  DEFAULT_STAT_WEIGHTS,
  ELITE_8_PRESET_WEIGHTS,
  buildCanonicalTeams,
  calculateTeamScore,
  computeHomeInflationMetrics,
  computeQuadRecord,
  findTeamByCanonicalId,
  formatStat,
  getTop50Average,
  getTop50AvgDropOff,
  hasStat,
  type StatWeight,
  type Team,
  type TeamStats,
} from "@/data/ncaaTeams";
import { generateMatchupAngles, getOverallAdvantage } from "@/lib/matchupAngles";
import MatchupStatGroups from "@/components/MatchupStatGroups";
import { useLast10 } from "@/hooks/useLast10";

function percentileToClass(p: number, higherIsBetter: boolean) {
  // p is 0–100; for "lower is better" stats, flip the scale so high percentiles are still good
  const centered = higherIsBetter ? p : 100 - p;

  if (centered >= 90) return "bg-red-900/70 text-red-50";
  if (centered >= 75) return "bg-red-800/60 text-red-50";
  if (centered >= 60) return "bg-red-700/40 text-red-100";
  if (centered >= 50) return "bg-red-600/30 text-red-100";

  if (centered >= 40) return "bg-slate-800/40 text-slate-100";
  if (centered >= 25) return "bg-blue-900/50 text-blue-100";
  if (centered >= 10) return "bg-blue-950/60 text-blue-100";
  return "bg-blue-950/80 text-blue-50";
}

function StatCompareRow({
  label,
  valueA,
  valueB,
  higherIsBetter,
  percentileA,
  percentileB,
}: {
  label: string;
  valueA: number | null;
  valueB: number | null;
  higherIsBetter: boolean;
  percentileA?: number | null;
  percentileB?: number | null;
}) {
  const hasA = hasStat(valueA);
  const hasB = hasStat(valueB);

  const aWins = hasA && hasB && (higherIsBetter ? valueA! > valueB! : valueA! < valueB!);
  const bWins = hasA && hasB && (higherIsBetter ? valueB! > valueA! : valueB! < valueA!);

  const pctA = typeof percentileA === "number" ? Math.max(0, Math.min(100, percentileA)) : null;
  const pctB = typeof percentileB === "number" ? Math.max(0, Math.min(100, percentileB)) : null;

  const classA = pctA != null ? percentileToClass(pctA, higherIsBetter) : "";
  const classB = pctB != null ? percentileToClass(pctB, higherIsBetter) : "";

  return (
    <div className="grid grid-cols-3 items-center py-1.5 border-b border-border/50 last:border-0 text-xs">
      <div className={`flex flex-col items-end px-2 py-1 rounded-l-md tabular-nums font-semibold ${classA || (aWins ? "text-primary" : "text-foreground")}`}>
        <span>{formatStat(valueA)}</span>
        {pctA != null && (
          <span className="text-[10px] opacity-80">
            {pctA.toFixed(0)}th %ile
          </span>
        )}
      </div>
      <div className="text-center text-[11px] font-medium text-muted-foreground px-2">
        {label}
      </div>
      <div className={`flex flex-col items-start px-2 py-1 rounded-r-md tabular-nums font-semibold ${classB || (bWins ? "text-primary" : "text-foreground")}`}>
        <span>{formatStat(valueB)}</span>
        {pctB != null && (
          <span className="text-[10px] opacity-80">
            {pctB.toFixed(0)}th %ile
          </span>
        )}
      </div>
    </div>
  );
}

function HomeAwayRow({
  label,
  home,
  away,
  overall,
  higherIsBetter,
}: {
  label: string;
  home: number | null;
  away: number | null;
  overall: number | null;
  higherIsBetter: boolean;
}) {
  const diff = hasStat(home) && hasStat(away) ? home - away : null;
  const pctDiff = hasStat(diff) && hasStat(overall) && overall !== 0 ? (diff / overall) * 100 : null;
  const isSignificant = hasStat(pctDiff) && Math.abs(pctDiff) > 5;

  return (
    <div className="grid grid-cols-4 items-center py-1.5 border-b border-border/50 last:border-0 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-center tabular-nums text-foreground">{formatStat(home)}</span>
      <span className="text-center tabular-nums text-foreground">{formatStat(away)}</span>
      <span className={`text-right tabular-nums font-semibold ${
        isSignificant
          ? (higherIsBetter ? ((diff ?? 0) > 0 ? "text-destructive" : "text-primary") : ((diff ?? 0) < 0 ? "text-destructive" : "text-primary"))
          : "text-muted-foreground"
      }`}>
        {hasStat(pctDiff) ? `${pctDiff > 0 ? "+" : ""}${pctDiff.toFixed(1)}%` : "—"}
      </span>
    </div>
  );
}

function VsAverageRow({
  label,
  value,
  avg,
  higherIsBetter,
}: {
  label: string;
  value: number | null;
  avg: number | null;
  higherIsBetter: boolean;
}) {
  const diff = hasStat(value) && hasStat(avg) ? value - avg : null;
  const pctDiff = hasStat(diff) && hasStat(avg) && avg !== 0 ? (diff / avg) * 100 : null;
  const isGood = hasStat(diff) ? (higherIsBetter ? diff > 0 : diff < 0) : false;

  return (
    <div className="grid grid-cols-4 items-center py-1.5 border-b border-border/50 last:border-0 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-center tabular-nums text-foreground">{formatStat(value)}</span>
      <span className="text-center tabular-nums text-muted-foreground">{formatStat(avg)}</span>
      <span className={`text-right tabular-nums font-bold ${hasStat(pctDiff) ? (isGood ? "text-primary" : "text-destructive") : "text-muted-foreground"}`}>
        {hasStat(pctDiff) ? `${pctDiff > 0 ? "+" : ""}${pctDiff.toFixed(1)}%` : "—"}
      </span>
    </div>
  );
}

function inflationLabel(label: string) {
  if (label === "home-inflated") return <span className="font-bold text-orange-400">⚠️ Home-Inflated</span>;
  if (label === "road-tested") return <span className="font-bold text-blue-400">💪 Road Tested</span>;
  return <span className="font-bold text-green-400">✅ Stable</span>;
}

function RoadReadinessSection({
  teamA,
  teamB,
  teamPool,
  isNeutralSite,
}: {
  teamA: Team;
  teamB: Team;
  teamPool: Team[];
  isNeutralSite: boolean;
}) {
  const avgDropOff = useMemo(() => getTop50AvgDropOff(teamPool), [teamPool]);
  const inflationA = useMemo(() => computeHomeInflationMetrics(teamA, avgDropOff), [teamA, avgDropOff]);
  const inflationB = useMemo(() => computeHomeInflationMetrics(teamB, avgDropOff), [teamB, avgDropOff]);

  const sortedPool = useMemo(
    () => [...teamPool].sort((a, b) => calculateTeamScore(b.stats, DEFAULT_STAT_WEIGHTS) - calculateTeamScore(a.stats, DEFAULT_STAT_WEIGHTS)),
    [teamPool],
  );
  const rankA = sortedPool.findIndex((t) => t.canonicalId === teamA.canonicalId) + 1 || sortedPool.length;
  const rankB = sortedPool.findIndex((t) => t.canonicalId === teamB.canonicalId) + 1 || sortedPool.length;
  const quadA = computeQuadRecord(teamA, rankA, sortedPool.length);
  const quadB = computeQuadRecord(teamB, rankB, sortedPool.length);

  const renderTeamCard = (team: Team, inflation: ReturnType<typeof computeHomeInflationMetrics>, quad: ReturnType<typeof computeQuadRecord>) => (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TeamLogo name={team.name} logo={team.logo} className="h-7 w-7" />
        <h3 className="font-bold text-foreground text-sm">{team.abbreviation}</h3>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="grid grid-cols-2 gap-x-3 py-1 border-b border-border/50">
          <span className="text-muted-foreground">Home Net Eff</span>
          <span className="text-right tabular-nums font-semibold">{inflation.netEffHome.toFixed(1)}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 py-1 border-b border-border/50">
          <span className="text-muted-foreground">Away Net Eff</span>
          <span className="text-right tabular-nums font-semibold">{inflation.netEffAway.toFixed(1)}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 py-1 border-b border-border/50">
          <span className="text-muted-foreground">Drop-Off (Δ)</span>
          <span className={`text-right tabular-nums font-semibold ${inflation.dropOff > 8 ? "text-orange-400" : inflation.dropOff < 0 ? "text-blue-400" : "text-muted-foreground"}`}>
            {inflation.dropOff > 0 ? "+" : ""}{inflation.dropOff.toFixed(1)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 py-1">
          <span className="text-muted-foreground">Inflation Score</span>
          <span className="text-right">{inflationLabel(inflation.label)}</span>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Resume</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold bg-yellow-400/15 text-yellow-400 border border-yellow-400/30">
            Q1 {quad.q1.wins}-{quad.q1.losses}
          </span>
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
            Q2 {quad.q2.wins}-{quad.q2.losses}
          </span>
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
            Q3 {quad.q3.wins}-{quad.q3.losses}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-lg font-bold text-foreground">Road Readiness &amp; Resume</h2>
        {isNeutralSite && (
          <span className="text-xs text-muted-foreground italic">
            Neutral site — away efficiency is the stronger predictor here.
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderTeamCard(teamA, inflationA, quadA)}
        {renderTeamCard(teamB, inflationB, quadB)}
      </div>
    </div>
  );
}

export default function GameDetail() {
  const [searchParams] = useSearchParams();
  const awayId = searchParams.get("away") ?? "";
  const homeId = searchParams.get("home") ?? "";
  const { data: liveTeams = [] } = useLiveTeams();

  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);
  const teamA = findTeamByCanonicalId(awayId, teamPool);
  const teamB = findTeamByCanonicalId(homeId, teamPool);

  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showVsAverage, setShowVsAverage] = useState(false);
  const { data: last10Data } = useLast10();
  const l10Map = last10Data?.teams ?? {};

  function l10Color(wins: number): string {
    if (wins >= 8) return "text-green-400";
    if (wins >= 5) return "text-foreground";
    return "text-amber-400";
  }

  const top50Avg = useMemo(() => getTop50Average(teamPool), [teamPool]);

  usePageSeo({
    title: teamA && teamB ? `${teamA.abbreviation} vs ${teamB.abbreviation} Matchup` : "NCAA Matchup Detail",
    description: teamA && teamB
      ? `Review ${teamA.name} versus ${teamB.name} with advanced stats, matchup angles, and team-level comparisons.`
      : "Review NCAA matchup analysis with advanced stat comparisons and game-level insights.",
    path: "/schedule",
  });

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
  };

  if (!teamA || !teamB) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-lg text-muted-foreground">Team data not found for this matchup.</p>
          <Link to="/schedule" className="text-primary hover:underline text-sm mt-4 inline-block">
            Back to Schedule
          </Link>
        </div>
      </div>
    );
  }

  const scoreA = calculateTeamScore(teamA.stats, weights);
  const scoreB = calculateTeamScore(teamB.stats, weights);
  const totalScore = scoreA + scoreB || 1;
  const angles = generateMatchupAngles(teamA, teamB, teamPool);
  const advantage = getOverallAdvantage(teamA, teamB, angles);

  const statRows: { label: string; key: keyof Team["stats"]; higherIsBetter: boolean }[] = [
    { label: "PPG", key: "ppg", higherIsBetter: true },
    { label: "Opp PPG", key: "oppPpg", higherIsBetter: false },
    { label: "FG%", key: "fgPct", higherIsBetter: true },
    { label: "3PT%", key: "threePct", higherIsBetter: true },
    { label: "FT%", key: "ftPct", higherIsBetter: true },
    { label: "RPG", key: "rpg", higherIsBetter: true },
    { label: "APG", key: "apg", higherIsBetter: true },
    { label: "SPG", key: "spg", higherIsBetter: true },
    { label: "BPG", key: "bpg", higherIsBetter: true },
    { label: "TPG", key: "tpg", higherIsBetter: false },
    { label: "SOS", key: "sos", higherIsBetter: true },
    { label: "Adj OE", key: "adjOE", higherIsBetter: true },
    { label: "Adj DE", key: "adjDE", higherIsBetter: false },
    { label: "Tempo", key: "tempo", higherIsBetter: true },
  ];

  const splitRows: { label: string; key: keyof TeamStats; higherIsBetter: boolean }[] = [
    { label: "PPG", key: "ppg", higherIsBetter: true },
    { label: "Opp PPG", key: "oppPpg", higherIsBetter: false },
    { label: "FG%", key: "fgPct", higherIsBetter: true },
    { label: "3PT%", key: "threePct", higherIsBetter: true },
    { label: "RPG", key: "rpg", higherIsBetter: true },
    { label: "APG", key: "apg", higherIsBetter: true },
    { label: "TPG", key: "tpg", higherIsBetter: false },
    { label: "Adj OE", key: "adjOE", higherIsBetter: true },
    { label: "Adj DE", key: "adjDE", higherIsBetter: false },
  ];

  const avgRows: { label: string; key: keyof TeamStats; higherIsBetter: boolean }[] = [
    { label: "PPG", key: "ppg", higherIsBetter: true },
    { label: "Opp PPG", key: "oppPpg", higherIsBetter: false },
    { label: "FG%", key: "fgPct", higherIsBetter: true },
    { label: "3PT%", key: "threePct", higherIsBetter: true },
    { label: "FT%", key: "ftPct", higherIsBetter: true },
    { label: "RPG", key: "rpg", higherIsBetter: true },
    { label: "APG", key: "apg", higherIsBetter: true },
    { label: "SPG", key: "spg", higherIsBetter: true },
    { label: "BPG", key: "bpg", higherIsBetter: true },
    { label: "TPG", key: "tpg", higherIsBetter: false },
    { label: "SOS", key: "sos", higherIsBetter: true },
    { label: "Adj OE", key: "adjOE", higherIsBetter: true },
    { label: "Adj DE", key: "adjDE", higherIsBetter: false },
    { label: "Tempo", key: "tempo", higherIsBetter: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <Link to="/schedule" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Schedule
        </Link>

        <div className={`rounded-lg p-4 text-center ${
          advantage.team === "even"
            ? "bg-muted/50 border border-border"
            : "bg-primary/10 border border-primary/20"
        }`}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Overall Advantage</p>
          <p className="text-xl font-bold text-foreground">
            {advantage.team === "even" ? "Essentially Even" : `${advantage.team === "teamA" ? teamA.name : teamB.name} - ${advantage.margin}`}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="grid grid-cols-3 items-center mb-4">
            <div className="text-center">
              <TeamLogo name={teamA.name} logo={teamA.logo} className="mx-auto mb-2 h-16 w-16" />
              {teamA.seed && (
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold bg-primary/20 text-primary mb-1">
                  {teamA.seed}
                </span>
              )}
              <h2 className="text-lg font-bold text-foreground">
                <Link to={`/team/${teamA.slug}`} className="hover:underline">{teamA.name}</Link>
              </h2>
              <p className="text-xs text-muted-foreground">{teamA.conference} · {teamA.record || "Record unavailable"}</p>
              {teamA.espnId && l10Map[teamA.espnId] && (
                <p className={`text-xs font-semibold mt-0.5 ${l10Color(l10Map[teamA.espnId].wins)}`}>
                  L10: {l10Map[teamA.espnId].wins}-{l10Map[teamA.espnId].losses}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {teamA.statsCoverage === "full" ? "Full stats" : teamA.statsCoverage === "partial" ? "Partial stats" : "Metadata only"}
              </p>
              <div className={`text-3xl font-bold mt-2 tabular-nums ${scoreA >= scoreB ? "text-primary" : "text-foreground"}`}>
                {scoreA.toFixed(1)}
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-2">POWER SCORE</p>
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(scoreA / totalScore) * 100}%` }} />
                <div className="h-full bg-secondary-foreground/30 transition-all duration-500" style={{ width: `${(scoreB / totalScore) * 100}%` }} />
              </div>
            </div>
            <div className="text-center">
              <TeamLogo name={teamB.name} logo={teamB.logo} className="mx-auto mb-2 h-16 w-16" />
              {teamB.seed && (
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold bg-primary/20 text-primary mb-1">
                  {teamB.seed}
                </span>
              )}
              <h2 className="text-lg font-bold text-foreground">
                <Link to={`/team/${teamB.slug}`} className="hover:underline">{teamB.name}</Link>
              </h2>
              <p className="text-xs text-muted-foreground">{teamB.conference} · {teamB.record || "Record unavailable"}</p>
              {teamB.espnId && l10Map[teamB.espnId] && (
                <p className={`text-xs font-semibold mt-0.5 ${l10Color(l10Map[teamB.espnId].wins)}`}>
                  L10: {l10Map[teamB.espnId].wins}-{l10Map[teamB.espnId].losses}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {teamB.statsCoverage === "full" ? "Full stats" : teamB.statsCoverage === "partial" ? "Partial stats" : "Metadata only"}
              </p>
              <div className={`text-3xl font-bold mt-2 tabular-nums ${scoreB >= scoreA ? "text-primary" : "text-foreground"}`}>
                {scoreB.toFixed(1)}
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="grid grid-cols-3 items-center text-xs font-semibold text-muted-foreground uppercase mb-2">
              <span className="text-right">{teamA.abbreviation}</span>
              <span className="text-center">Stat</span>
              <span className="text-left">{teamB.abbreviation}</span>
            </div>
            {statRows.map((row) => (
              <StatCompareRow
                key={row.key}
                label={row.label}
                valueA={teamA.stats[row.key]}
                valueB={teamB.stats[row.key]}
                higherIsBetter={row.higherIsBetter}
              />
            ))}

            <div className="border-t border-border/50 mt-4 pt-4">
              <MatchupStatGroups teamA={teamA} teamB={teamB} teamPool={teamPool} />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">Matchup Angles</h2>
          <p className="text-xs text-muted-foreground mb-4">Advanced stat categories appear wherever both teams have the necessary coverage</p>
          <MatchupAnglesList angles={angles} teamAName={teamA.abbreviation} teamBName={teamB.abbreviation} initialCount={5} />
        </div>

        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">Home vs Away Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[teamA, teamB].map((team) => (
              <div key={team.canonicalId} className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-bold text-foreground mb-1">{team.abbreviation} Home vs Away</h3>
                <p className="text-[10px] text-muted-foreground mb-3">Missing split stats stay visible as em dashes</p>
                <div className="grid grid-cols-4 items-center pb-2 border-b border-border mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Home</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Away</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Diff</span>
                </div>
                {splitRows.map((stat) => (
                  <HomeAwayRow
                    key={stat.key}
                    label={stat.label}
                    home={team.homeStats[stat.key]}
                    away={team.awayStats[stat.key]}
                    overall={team.stats[stat.key]}
                    higherIsBetter={stat.higherIsBetter}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <RoadReadinessSection teamA={teamA} teamB={teamB} teamPool={teamPool} isNeutralSite={false} />

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Compare to Top 50 League Average</h2>
              <p className="text-xs text-muted-foreground">See how each team ranks vs the current all-team pool</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{showVsAverage ? "On" : "Off"}</span>
              <Switch checked={showVsAverage} onCheckedChange={setShowVsAverage} />
            </div>
          </div>
          {showVsAverage && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[teamA, teamB].map((team) => (
                <div key={team.canonicalId} className="bg-card border border-border rounded-lg p-4">
                  <h3 className="text-sm font-bold text-foreground mb-3">{team.name}</h3>
                  <div className="grid grid-cols-4 items-center pb-2 border-b border-border mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Team</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Top 50</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">+/- %</span>
                  </div>
                  {avgRows.map((stat) => (
                    <VsAverageRow
                      key={stat.key}
                      label={stat.label}
                      value={team.stats[stat.key]}
                      avg={top50Avg[stat.key]}
                      higherIsBetter={stat.higherIsBetter}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">Adjust Weights</h2>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <button onClick={() => setWeights(DEFAULT_STAT_WEIGHTS)} className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Reset Defaults
            </button>
            <button
              onClick={() => setWeights(ELITE_8_PRESET_WEIGHTS)}
              className="text-sm font-semibold px-3 py-1 rounded-md bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
            >
              2025 Elite 8 Team Rank Preset
            </button>
          </div>
          <StatSliders weights={weights} onWeightChange={handleWeightChange} />
        </div>
      </div>
    </div>
  );
}
