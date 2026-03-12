import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import MatchupAnglesList from "@/components/MatchupAnglesList";
import { teams, DEFAULT_STAT_WEIGHTS, ELITE_8_PRESET_WEIGHTS, calculateTeamScore, getTop50Average, type StatWeight, type Team, type TeamStats } from "@/data/ncaaTeams";
import { generateMatchupAngles, getOverallAdvantage } from "@/lib/matchupAngles";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";

function StatCompareRow({ label, valueA, valueB, higherIsBetter }: {
  label: string; valueA: number; valueB: number; higherIsBetter: boolean;
}) {
  const aWins = higherIsBetter ? valueA > valueB : valueA < valueB;
  const bWins = higherIsBetter ? valueB > valueA : valueB < valueA;

  return (
    <div className="grid grid-cols-3 items-center py-2 border-b border-border/50 last:border-0">
      <span className={`text-right tabular-nums font-semibold text-sm ${aWins ? "text-primary" : "text-foreground"}`}>
        {valueA}
      </span>
      <span className="text-center text-xs font-medium text-muted-foreground">{label}</span>
      <span className={`text-left tabular-nums font-semibold text-sm ${bWins ? "text-primary" : "text-foreground"}`}>
        {valueB}
      </span>
    </div>
  );
}

function HomeAwayRow({ label, home, away, overall, higherIsBetter }: {
  label: string; home: number; away: number; overall: number; higherIsBetter: boolean;
}) {
  const diff = home - away;
  const pctDiff = overall !== 0 ? ((diff / overall) * 100) : 0;
  const isSignificant = Math.abs(pctDiff) > 5;

  return (
    <div className="grid grid-cols-4 items-center py-1.5 border-b border-border/50 last:border-0 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-center tabular-nums text-foreground">{home}</span>
      <span className="text-center tabular-nums text-foreground">{away}</span>
      <span className={`text-right tabular-nums font-semibold ${
        isSignificant
          ? (higherIsBetter ? (diff > 0 ? "text-destructive" : "text-primary") : (diff < 0 ? "text-destructive" : "text-primary"))
          : "text-muted-foreground"
      }`}>
        {pctDiff > 0 ? "+" : ""}{pctDiff.toFixed(1)}%
      </span>
    </div>
  );
}

function VsAverageRow({ label, value, avg, higherIsBetter }: {
  label: string; value: number; avg: number; higherIsBetter: boolean;
}) {
  const diff = value - avg;
  const pctDiff = avg !== 0 ? ((diff / avg) * 100) : 0;
  const isGood = higherIsBetter ? diff > 0 : diff < 0;

  return (
    <div className="grid grid-cols-4 items-center py-1.5 border-b border-border/50 last:border-0 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-center tabular-nums text-foreground">{value}</span>
      <span className="text-center tabular-nums text-muted-foreground">{avg}</span>
      <span className={`text-right tabular-nums font-bold ${isGood ? "text-primary" : "text-destructive"}`}>
        {pctDiff > 0 ? "+" : ""}{pctDiff.toFixed(1)}%
      </span>
    </div>
  );
}

export default function GameDetail() {
  const [searchParams] = useSearchParams();
  const awayId = Number(searchParams.get("away"));
  const homeId = Number(searchParams.get("home"));

  const teamA = teams.find((t) => t.id === awayId) || null;
  const teamB = teams.find((t) => t.id === homeId) || null;

  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showVsAverage, setShowVsAverage] = useState(false);

  const top50Avg = useMemo(() => getTop50Average(), []);

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((w) => (w.key === key ? { ...w, weight: value } : w)));
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
  const angles = generateMatchupAngles(teamA, teamB);
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

  const homeAwayKeys: { label: string; key: keyof TeamStats; higherIsBetter: boolean }[] = [
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

  const vsAvgKeys: { label: string; key: keyof TeamStats; higherIsBetter: boolean }[] = [
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
        <Link
          to="/schedule"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Schedule
        </Link>

        {/* Overall advantage banner */}
        <div className={`rounded-lg p-4 text-center ${
          advantage.team === "even"
            ? "bg-muted/50 border border-border"
            : "bg-primary/10 border border-primary/20"
        }`}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Overall Advantage
          </p>
          <p className="text-xl font-bold text-foreground">
            {advantage.team === "even"
              ? "Essentially Even"
              : `${advantage.team === "teamA" ? teamA.name : teamB.name} — ${advantage.margin}`}
          </p>
        </div>

        {/* Team headers with power scores */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="grid grid-cols-3 items-center mb-4">
            <div className="text-center">
              <img src={teamA.logo} alt={teamA.name} className="w-16 h-16 object-contain mx-auto mb-2" />
              {teamA.seed && (
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold bg-primary/20 text-primary mb-1">
                  {teamA.seed}
                </span>
              )}
              <h2 className="text-lg font-bold text-foreground">{teamA.name}</h2>
              <p className="text-xs text-muted-foreground">{teamA.conference} · {teamA.record}</p>
              <div className={`text-3xl font-bold mt-2 tabular-nums ${scoreA >= scoreB ? "text-primary" : "text-foreground"}`}>
                {scoreA.toFixed(1)}
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-2">POWER SCORE</p>
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${(scoreA / (scoreA + scoreB)) * 100}%` }}
                />
                <div
                  className="h-full bg-secondary-foreground/30 transition-all duration-500"
                  style={{ width: `${(scoreB / (scoreA + scoreB)) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-center">
              <img src={teamB.logo} alt={teamB.name} className="w-16 h-16 object-contain mx-auto mb-2" />
              {teamB.seed && (
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold bg-primary/20 text-primary mb-1">
                  {teamB.seed}
                </span>
              )}
              <h2 className="text-lg font-bold text-foreground">{teamB.name}</h2>
              <p className="text-xs text-muted-foreground">{teamB.conference} · {teamB.record}</p>
              <div className={`text-3xl font-bold mt-2 tabular-nums ${scoreB >= scoreA ? "text-primary" : "text-foreground"}`}>
                {scoreB.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Full stat comparison */}
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

        {/* Matchup Angles */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">Matchup Angles</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Statistical edges relative to opponent and top-50 average
          </p>
          <MatchupAnglesList
            angles={angles}
            teamAName={teamA.abbreviation}
            teamBName={teamB.abbreviation}
            initialCount={5}
          />
        </div>

        {/* Home vs Away Splits */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">Home vs Away Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[teamA, teamB].map((team) => (
              <div key={team.id} className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-bold text-foreground mb-1">{team.abbreviation} Home vs Away</h3>
                <p className="text-[10px] text-muted-foreground mb-3">Red = significant drop on the road</p>
                <div className="grid grid-cols-4 items-center pb-2 border-b border-border mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Home</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Away</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Diff</span>
                </div>
                {homeAwayKeys.map((s) => (
                  <HomeAwayRow
                    key={s.key}
                    label={s.label}
                    home={team.homeStats[s.key] as number}
                    away={team.awayStats[s.key] as number}
                    overall={team.stats[s.key] as number}
                    higherIsBetter={s.higherIsBetter}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Top 50 Average Toggle */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Compare to Top 50 League Average</h2>
              <p className="text-xs text-muted-foreground">See how each team ranks vs the average of the top 50 teams</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{showVsAverage ? "On" : "Off"}</span>
              <Switch checked={showVsAverage} onCheckedChange={setShowVsAverage} />
            </div>
          </div>
          {showVsAverage && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[teamA, teamB].map((team) => (
                <div key={team.id} className="bg-card border border-border rounded-lg p-4">
                  <h3 className="text-sm font-bold text-foreground mb-3">{team.name}</h3>
                  <div className="grid grid-cols-4 items-center pb-2 border-b border-border mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Team</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Top 50</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">+/- %</span>
                  </div>
                  {vsAvgKeys.map((s) => (
                    <VsAverageRow
                      key={s.key}
                      label={s.label}
                      value={team.stats[s.key] as number}
                      avg={top50Avg[s.key] as number}
                      higherIsBetter={s.higherIsBetter}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weight Controls */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">Adjust Weights</h2>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <button
              onClick={() => setWeights(DEFAULT_STAT_WEIGHTS)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Reset Defaults
            </button>
            <button
              onClick={() => setWeights(ELITE_8_PRESET_WEIGHTS)}
              className="text-sm font-semibold px-3 py-1 rounded-md bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
            >
              🏆 2024 Elite 8 Preset
            </button>
          </div>
          <StatSliders weights={weights} onWeightChange={handleWeightChange} />
        </div>
      </div>
    </div>
  );
}
