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
  findTeamByCanonicalId,
  formatStat,
  getTop50Average,
  hasStat,
  type StatWeight,
  type Team,
  type TeamStats,
} from "@/data/ncaaTeams";
import { generateMatchupAngles, getOverallAdvantage } from "@/lib/matchupAngles";

function StatCompareRow({
  label,
  valueA,
  valueB,
  higherIsBetter,
}: {
  label: string;
  valueA: number | null;
  valueB: number | null;
  higherIsBetter: boolean;
}) {
  const aWins = hasStat(valueA) && hasStat(valueB) && (higherIsBetter ? valueA > valueB : valueA < valueB);
  const bWins = hasStat(valueA) && hasStat(valueB) && (higherIsBetter ? valueB > valueA : valueB < valueA);

  return (
    <div className="grid grid-cols-3 items-center py-2 border-b border-border/50 last:border-0">
      <span className={`text-right tabular-nums font-semibold text-sm ${aWins ? "text-primary" : "text-foreground"}`}>
        {formatStat(valueA)}
      </span>
      <span className="text-center text-xs font-medium text-muted-foreground">{label}</span>
      <span className={`text-left tabular-nums font-semibold text-sm ${bWins ? "text-primary" : "text-foreground"}`}>
        {formatStat(valueB)}
      </span>
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

  const top50Avg = useMemo(() => getTop50Average(teamPool), [teamPool]);

  usePageSeo({
    title: teamA && teamB ? `${teamA.abbreviation} vs ${teamB.abbreviation} Matchup` : "NCAA Matchup Detail",
    description: teamA && teamB
      ? `Review ${teamA.name} versus ${teamB.name} with advanced stats, matchup angles, and team-level comparisons.`
      : "Review NCAA matchup analysis with advanced stat comparisons and game-level insights.",
    path: "/schedule",
    noindex: !teamA || !teamB,
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
