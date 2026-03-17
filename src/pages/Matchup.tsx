import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import TeamLogo from "@/components/TeamLogo";
import ModelEdgePanel from "@/components/ModelEdgePanel";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchedule } from "@/hooks/useSchedule";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  DEFAULT_STAT_WEIGHTS,
  buildCanonicalTeams,
  calculateTeamScore,
  computeHomeInflationMetrics,
  computeQuadRecord,
  findTeamByEspn,
  formatStat,
  getTop50Average,
  getTop50AvgDropOff,
  hasStat,
  type StatWeight,
  type Team,
  type TeamStats,
} from "@/data/ncaaTeams";
import { buildPlaceholderBracketSource, buildTournamentMatchups, loadOfficialBracketSource, type BracketSourceConfig } from "@/lib/bracket";
import { buildVegasProbabilityComparison, findScheduledGameForTeams, resolveScheduledGameMoneylines } from "@/lib/odds";
import MatchupStatGroups from "@/components/MatchupStatGroups";

function TeamSelector({
  teams,
  selected,
  onSelect,
  label,
}: {
  teams: Team[];
  selected: Team | null;
  onSelect: (team: Team | null) => void;
  label: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = teams.filter((team) =>
    team.name.toLowerCase().includes(search.toLowerCase()),
  );

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
          {filtered.slice(0, 12).map((team) => (
            <button
              key={team.canonicalId}
              onClick={() => {
                onSelect(team);
                setSearch("");
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors text-foreground flex items-center gap-2"
            >
              <TeamLogo name={team.name} logo={team.logo} className="h-5 w-5" />
              {team.name} <span className="text-muted-foreground">({team.conference})</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <TeamLogo name={selected.name} logo={selected.logo} className="mx-auto mb-2 h-16 w-16" />
          {selected.seed && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold bg-primary/20 text-primary mb-2">
              {selected.seed}
            </span>
          )}
          <h3 className="text-xl font-bold text-foreground">{selected.name}</h3>
          <p className="text-sm text-muted-foreground">{selected.conference} · {selected.record || "Record unavailable"}</p>
          <Link to={`/team/${selected.slug}`} className="block text-xs text-muted-foreground mt-1 hover:underline">
            Team page
          </Link>
          <button onClick={() => onSelect(null)} className="text-xs text-primary mt-2 hover:underline">Change</button>
        </div>
      )}
    </div>
  );
}

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
      <p className="text-[10px] text-muted-foreground mb-3">Shows fallbacks when a split stat is unavailable</p>
      <div className="grid grid-cols-4 items-center pb-2 border-b border-border mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Home</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Away</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Diff</span>
      </div>
      {statKeys.map((stat) => (
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
      {statKeys.map((stat) => (
        <VsAverageRow
          key={stat.key}
          label={stat.label}
          value={team.stats[stat.key]}
          avg={avg[stat.key]}
          higherIsBetter={stat.higherIsBetter}
        />
      ))}
    </div>
  );
}

function inflationLabel(label: string) {
  if (label === "home-inflated") return <span className="font-bold text-orange-400">⚠️ Home-Inflated</span>;
  if (label === "road-tested") return <span className="font-bold text-blue-400">💪 Road Tested</span>;
  return <span className="font-bold text-green-400">✅ Stable</span>;
}

function QuadBadgeRow({ quad, rank }: { quad: ReturnType<typeof computeQuadRecord>; rank: number }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
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
  );
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
        <QuadBadgeRow quad={quad} rank={0} />
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

function formatDateStr(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function TodaySchedulePicker({
  teams,
  onSelectGame,
}: {
  teams: Team[];
  onSelectGame: (away: Team, home: Team) => void;
}) {
  const dateStr = formatDateStr(new Date());
  const { data: games, isLoading } = useSchedule(dateStr);

  const resolvedGames = useMemo(() => {
    if (!games) return [];
    return games.flatMap((game) => {
      if (!game.homeTeam || !game.awayTeam) return [];
      const home = findTeamByEspn(game.homeTeam.name, game.homeTeam.abbreviation, teams);
      const away = findTeamByEspn(game.awayTeam.name, game.awayTeam.abbreviation, teams);
      if (!home || !away) return [];
      return [{ game, home, away }];
    });
  }, [games, teams]);

  const allGames = games ?? [];

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-sm text-muted-foreground animate-pulse">Loading today's games...</p>
      </div>
    );
  }

  if (!allGames.length) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Today's Games</h2>
        <span className="text-xs text-muted-foreground">
          {resolvedGames.length} of {allGames.length} available in matchup tools
        </span>
      </div>

      {resolvedGames.length === 0 ? (
        <p className="text-sm text-muted-foreground">No live games currently resolve to the canonical team pool.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {resolvedGames.map(({ game, home, away }) => (
            <button
              key={game.id}
              onClick={() => onSelectGame(away, home)}
              className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-secondary hover:border-primary/40 transition-colors text-left group"
            >
              <TeamLogo name={away.name} logo={away.logo} className="h-7 w-7" />
              <span className="text-xs font-bold text-foreground">{away.abbreviation}</span>
              <span className="text-[10px] text-muted-foreground font-medium">@</span>
              <TeamLogo name={home.name} logo={home.logo} className="h-7 w-7" />
              <span className="text-xs font-bold text-foreground">{home.abbreviation}</span>
              {game.status !== "Scheduled" && (
                <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                  <Clock className="w-3 h-3" />
                  {game.status}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Matchup() {
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showVsAverage, setShowVsAverage] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("All Regions");
  const [bracketSource, setBracketSource] = useState<BracketSourceConfig>(buildPlaceholderBracketSource());
  const { data: liveTeams = [], isLoading: liveTeamsLoading, error: liveTeamsError } = useLiveTeams();
  const { data: todayGames = [] } = useSchedule(formatDateStr(new Date()));

  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);
  const top50Avg = useMemo(() => getTop50Average(teamPool), [teamPool]);
  const officialMatchups = useMemo(() => buildTournamentMatchups(bracketSource, teamPool), [bracketSource, teamPool]);
  const matchupRegions = useMemo(
    () => ["All Regions", ...new Set(officialMatchups.map((matchup) => matchup.region))],
    [officialMatchups],
  );
  const filteredOfficialMatchups = useMemo(
    () =>
      selectedRegion === "All Regions"
        ? officialMatchups
        : officialMatchups.filter((matchup) => matchup.region === selectedRegion),
    [officialMatchups, selectedRegion],
  );

  useEffect(() => {
    let ignore = false;
    loadOfficialBracketSource().then((payload) => {
      if (!ignore && payload) setBracketSource(payload);
    });
    return () => {
      ignore = true;
    };
  }, []);

  usePageSeo({
    title: "NCAA Matchup Analysis & Advanced Team Metrics | Joe Knows Ball",
    description:
      "Compare NCAA teams using advanced analytics including offensive rating, defensive efficiency, pace, rebounding, and custom model scores.",
    canonical: "https://joeknowsball.com/matchup",
  });

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
  };

  const handleSelectGame = (away: Team, home: Team) => {
    setTeamA(away);
    setTeamB(home);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const totalScore = scoreA + scoreB || 1;
  const modelProbA = scoreA / totalScore;
  const modelProbB = scoreB / totalScore;
  const scheduledGame =
    teamA && teamB ? findScheduledGameForTeams(todayGames, teamA, teamB, teamPool, findTeamByEspn) : null;
  const scheduledMoneylines =
    teamA && teamB ? resolveScheduledGameMoneylines(scheduledGame, teamA, teamB, teamPool, findTeamByEspn) : null;
  const vegasComparison =
    teamA && teamB && scheduledMoneylines
      ? buildVegasProbabilityComparison({
          modelProbA,
          modelProbB,
          moneylineA: scheduledMoneylines.moneylineA,
          moneylineB: scheduledMoneylines.moneylineB,
          sportsbook: scheduledMoneylines.sportsbook,
        })
      : null;

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">NCAA Matchup Analysis</h1>
          <p className="mt-1 text-muted-foreground">Compare any supported NCAA matchup from the full live team pool.</p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Use NCAA matchup analysis, advanced team metrics, and custom model scores to compare offense, defense,
            pace, rebounding, shooting, and split performance for any Division I matchup on the board.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Advanced NCAA Team Metrics</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Review offensive rating, defensive efficiency, pace, and rebounding metrics that power the comparison
              model and support deeper NCAA team analysis.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">NCAA Matchup Breakdown</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Compare live or scheduled opponents, test custom weights, and surface matchup advantages with a clean,
              crawlable NCAA basketball analytics workflow.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Official 2026 NCAA Tournament Matchups</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Browse all 32 official Round of 64 matchup pages with seeds, logos, region context, visible stats, and
                model-driven NCAA tournament analysis.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {filteredOfficialMatchups.length} official matchups
            </span>
          </div>

          <Tabs value={selectedRegion} onValueChange={setSelectedRegion} className="mt-4 space-y-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-secondary/85 p-1">
              {matchupRegions.map((region) => (
                <TabsTrigger key={region} value={region} className="shrink-0">
                  {region}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredOfficialMatchups.map((matchup) => {
              const scoreA = calculateTeamScore(matchup.teamA.team.stats, weights);
              const scoreB = calculateTeamScore(matchup.teamB.team.stats, weights);
              const winProbA = (((scoreA / (scoreA + scoreB || 1)) * 100)).toFixed(0);
              return (
                <Link
                  key={matchup.gameId}
                  to={`/matchup/${matchup.gameId}`}
                  className="rounded-2xl border border-border bg-background/70 p-4 transition-colors hover:border-primary/40 hover:bg-secondary/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{matchup.region}</span>
                    <span className="text-[11px] font-semibold text-primary">{winProbA}% {matchup.teamA.team.abbreviation}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {[matchup.teamA, matchup.teamB].map((side) => (
                      <div key={`${matchup.gameId}-${side.seed}`} className="flex items-center gap-3">
                        <span className="inline-flex min-w-7 items-center justify-center rounded-md bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary">
                          {side.seed}
                        </span>
                        <TeamLogo name={side.displayName} logo={side.team.logo} className="h-8 w-8" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{side.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {side.team.conference || "Conference unavailable"} | {side.team.record || "Record unavailable"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2 rounded-xl bg-card/90 p-3 text-xs">
                    <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-2 text-muted-foreground">
                      <span className="truncate text-left">{matchup.teamA.team.abbreviation}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide">Stat</span>
                      <span className="truncate text-right">{matchup.teamB.team.abbreviation}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-2">
                      <span className="font-semibold text-foreground">{formatStat(matchup.teamA.team.stats.adjOE)}</span>
                      <span className="text-muted-foreground">Off</span>
                      <span className="text-right font-semibold text-foreground">{formatStat(matchup.teamB.team.stats.adjOE)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-2">
                      <span className="font-semibold text-foreground">{formatStat(matchup.teamA.team.stats.adjDE)}</span>
                      <span className="text-muted-foreground">Def</span>
                      <span className="text-right font-semibold text-foreground">{formatStat(matchup.teamB.team.stats.adjDE)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-2">
                      <span className="font-semibold text-foreground">{formatStat(matchup.teamA.team.stats.tempo)}</span>
                      <span className="text-muted-foreground">Pace</span>
                      <span className="text-right font-semibold text-foreground">{formatStat(matchup.teamB.team.stats.tempo)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-2">
                      <span className="font-semibold text-foreground">{formatStat(scoreA)}</span>
                      <span className="text-muted-foreground">Model</span>
                      <span className="text-right font-semibold text-foreground">{formatStat(scoreB)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <TodaySchedulePicker teams={teamPool} onSelectGame={handleSelectGame} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TeamSelector teams={teamPool} selected={teamA} onSelect={setTeamA} label="Team A" />
          <TeamSelector teams={teamPool} selected={teamB} onSelect={setTeamB} label="Team B" />
        </div>

        {liveTeamsLoading ? (
          <div className="rounded-2xl border border-border bg-card/90 p-5 text-sm text-muted-foreground">
            Loading the NCAA team pool and matchup stats.
          </div>
        ) : null}

        {liveTeamsError ? (
          <div className="rounded-2xl border border-border bg-card/90 p-5 text-sm text-muted-foreground">
            Live team data is temporarily unavailable. You can still browse the official tournament matchup pages
            below while the broader matchup pool reloads.
          </div>
        ) : null}

        {!teamA || !teamB ? (
          <div className="rounded-2xl border border-border bg-card/90 p-5">
            <h2 className="text-lg font-semibold text-foreground">Select a Matchup</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose two teams from the selectors above, or open one of the official 2026 tournament matchup cards to
              compare offense, defense, pace, rebounding, and model score side by side.
            </p>
          </div>
        ) : null}

        {teamA && teamB && (
          <>
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

              <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex mb-3">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(scoreA / totalScore) * 100}%` }} />
                <div className="h-full bg-secondary-foreground/30 transition-all duration-500" style={{ width: `${(scoreB / totalScore) * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Teams stay available even when advanced stats are partial. Missing values display as em dashes.
              </p>

              <div className="mb-4">
                <ModelEdgePanel
                  teamAName={teamA.abbreviation}
                  teamBName={teamB.abbreviation}
                  modelProbA={modelProbA}
                  modelProbB={modelProbB}
                  vegas={vegasComparison}
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

              <div className="border-t border-border/50 mt-4 pt-4">
                <MatchupStatGroups teamA={teamA} teamB={teamB} teamPool={teamPool} />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold text-foreground mb-3">Home vs Away Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HomeAwaySplitCard team={teamA} />
                <HomeAwaySplitCard team={teamB} />
              </div>
            </div>

            <RoadReadinessSection teamA={teamA} teamB={teamB} teamPool={teamPool} isNeutralSite={false} />

            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Compare to Top 50 League Average</h2>
                  <p className="text-xs text-muted-foreground">See how each team ranks vs the current all-team ranking pool</p>
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

            <div>
              <h2 className="text-lg font-bold text-foreground mb-3">Custom NCAA Model Weights</h2>
              <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
            </div>
          </>
        )}

        <SeoFooterBlock />
      </div>
    </div>
  );
}
