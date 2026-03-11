import { useState, useMemo } from "react";
import SiteNav from "@/components/SiteNav";
import { teams, DEFAULT_STAT_WEIGHTS, calculateTeamScore, getTop50Average, type StatWeight, type Team, type TeamStats } from "@/data/ncaaTeams";
import StatSliders from "@/components/StatSliders";
import { Switch } from "@/components/ui/switch";

function TeamSelector({ selected, onSelect, label }: { selected: Team | null; onSelect: (t: Team) => void; label: string }) {
  const [search, setSearch] = useState("");
  const filtered = teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type="text"
        placeholder="Search teams..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {search && !selected && (
        <div className="max-h-48 overflow-y-auto border border-border rounded-md bg-card">
          {filtered.slice(0, 10).map((t) => (
            <button
              key={t.id}
              onClick={() => { onSelect(t); setSearch(""); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors text-foreground flex items-center gap-2"
            >
              <img src={t.logo} alt={t.name} className="w-5 h-5 object-contain shrink-0" loading="lazy" />
              {t.name} <span className="text-muted-foreground">({t.conference})</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <img src={selected.logo} alt={selected.name} className="w-16 h-16 object-contain mx-auto mb-2" />
          {selected.seed && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold bg-primary/20 text-primary mb-2">
              {selected.seed}
            </span>
          )}
          <h3 className="text-xl font-bold text-foreground">{selected.name}</h3>
          <p className="text-sm text-muted-foreground">{selected.conference} · {selected.record}</p>
          <button onClick={() => onSelect(null as any)} className="text-xs text-primary mt-2 hover:underline">Change</button>
        </div>
      )}
    </div>
  );
}

interface StatCompareRowProps {
  label: string;
  valueA: number;
  valueB: number;
  higherIsBetter: boolean;
}

function StatCompareRow({ label, valueA, valueB, higherIsBetter }: StatCompareRowProps) {
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

function HomeAwaySplitCard({ team }: { team: Team }) {
  const statKeys: { label: string; key: keyof TeamStats; higherIsBetter: boolean }[] = [
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

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-bold text-foreground mb-1">{team.abbreviation} Home vs Away</h3>
      <p className="text-[10px] text-muted-foreground mb-3">Red = significant drop on the road</p>
      <div className="grid grid-cols-4 items-center pb-2 border-b border-border mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Home</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Away</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Diff</span>
      </div>
      {statKeys.map((s) => (
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
  );
}

function VsAverageCard({ team, avg }: { team: Team; avg: TeamStats }) {
  const statKeys: { label: string; key: keyof TeamStats; higherIsBetter: boolean }[] = [
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
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{team.name}</h3>
      <div className="grid grid-cols-4 items-center pb-2 border-b border-border mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Team</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Top 50</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">+/- %</span>
      </div>
      {statKeys.map((s) => (
        <VsAverageRow
          key={s.key}
          label={s.label}
          value={team.stats[s.key] as number}
          avg={avg[s.key] as number}
          higherIsBetter={s.higherIsBetter}
        />
      ))}
    </div>
  );
}

export default function Matchup() {
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showVsAverage, setShowVsAverage] = useState(false);

  const top50Avg = useMemo(() => getTop50Average(), []);

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((w) => (w.key === key ? { ...w, weight: value } : w)));
  };

  const scoreA = teamA ? calculateTeamScore(teamA.stats, weights) : 0;
  const scoreB = teamB ? calculateTeamScore(teamB.stats, weights) : 0;

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

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Game Analysis</h1>
          <p className="text-muted-foreground mt-1">Compare two teams head-to-head</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TeamSelector selected={teamA} onSelect={setTeamA} label="Team A" />
          <TeamSelector selected={teamB} onSelect={setTeamB} label="Team B" />
        </div>

        {teamA && teamB && (
          <>
            {/* Power Score Comparison */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="grid grid-cols-3 items-center mb-4">
                <div className="text-right">
                  <span className={`text-3xl font-bold ${scoreA >= scoreB ? "text-primary" : "text-foreground"}`}>
                    {scoreA.toFixed(1)}
                  </span>
                </div>
                <div className="text-center text-sm font-medium text-muted-foreground">POWER SCORE</div>
                <div className="text-left">
                  <span className={`text-3xl font-bold ${scoreB >= scoreA ? "text-primary" : "text-foreground"}`}>
                    {scoreB.toFixed(1)}
                  </span>
                </div>
              </div>

              <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex mb-6">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${(scoreA / (scoreA + scoreB)) * 100}%` }}
                />
                <div
                  className="h-full bg-secondary-foreground/30 transition-all duration-500"
                  style={{ width: `${(scoreB / (scoreA + scoreB)) * 100}%` }}
                />
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

            {/* Home vs Away Splits */}
            <div>
              <h2 className="text-lg font-bold text-foreground mb-3">Home vs Away Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HomeAwaySplitCard team={teamA} />
                <HomeAwaySplitCard team={teamB} />
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
                  <VsAverageCard team={teamA} avg={top50Avg} />
                  <VsAverageCard team={teamB} avg={top50Avg} />
                </div>
              )}
            </div>

            {/* Weight Controls */}
            <div>
              <h2 className="text-lg font-bold text-foreground mb-3">Adjust Weights</h2>
              <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
