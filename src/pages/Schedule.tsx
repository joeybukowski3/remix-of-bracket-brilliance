import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpDown, Calendar, ChevronLeft, ChevronRight, Clock, Tv } from "lucide-react";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import MatchupAnglesList from "@/components/MatchupAnglesList";
import TeamLogo from "@/components/TeamLogo";
import { useSchedule, type ScheduleGame } from "@/hooks/useSchedule";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  DEFAULT_STAT_WEIGHTS,
  ELITE_8_PRESET_WEIGHTS,
  buildCanonicalTeams,
  calculateTeamScore,
  findTeamByEspn,
  formatStat,
  hasStat,
  type StatWeight,
  type Team,
} from "@/data/ncaaTeams";
import { generateMatchupAngles, getOverallAdvantage } from "@/lib/matchupAngles";

type SortBy = "time" | "rank" | "edge" | "conference";

function formatGameTime(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatDisplayDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);

  const diff = (compare.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function GameCard({
  game,
  weights,
  teamPool,
}: {
  game: ScheduleGame;
  weights: StatWeight[];
  teamPool: Team[];
}) {
  const matchedHome = game.homeTeam ? findTeamByEspn(game.homeTeam.name, game.homeTeam.abbreviation, teamPool) : null;
  const matchedAway = game.awayTeam ? findTeamByEspn(game.awayTeam.name, game.awayTeam.abbreviation, teamPool) : null;

  const homeScore = matchedHome ? calculateTeamScore(matchedHome.stats, weights) : null;
  const awayScore = matchedAway ? calculateTeamScore(matchedAway.stats, weights) : null;
  const canAnalyze = Boolean(matchedHome && matchedAway);

  const angles = matchedHome && matchedAway ? generateMatchupAngles(matchedAway, matchedHome, teamPool) : [];
  const advantage = matchedHome && matchedAway ? getOverallAdvantage(matchedAway, matchedHome, angles) : null;

  const statRows: { label: string; key: keyof Team["stats"]; higherIsBetter: boolean }[] = [
    { label: "PPG", key: "ppg", higherIsBetter: true },
    { label: "Opp PPG", key: "oppPpg", higherIsBetter: false },
    { label: "FG%", key: "fgPct", higherIsBetter: true },
    { label: "3PT%", key: "threePct", higherIsBetter: true },
    { label: "RPG", key: "rpg", higherIsBetter: true },
    { label: "Adj OE", key: "adjOE", higherIsBetter: true },
    { label: "Adj DE", key: "adjDE", higherIsBetter: false },
  ];

  const renderCoverage = (team: Team | null) => {
    if (!team) return "Metadata only";
    if (team.statsCoverage === "full") return "Full stats";
    if (team.statsCoverage === "partial") return "Partial stats";
    return "Metadata only";
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {advantage && (
        <div className={`px-4 py-2 flex items-center justify-center gap-2 border-b ${
          advantage.team === "even"
            ? "bg-muted/50 border-border"
            : "bg-primary/10 border-primary/20"
        }`}>
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {advantage.team === "even"
              ? advantage.margin
              : `${advantage.margin}: ${advantage.team === "teamA" ? game.awayTeam?.name : game.homeTeam?.name}`}
          </span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{formatGameTime(game.date)}</span>
            {game.broadcast && (
              <>
                <Tv className="w-3 h-3 ml-2" />
                <span>{game.broadcast}</span>
              </>
            )}
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            game.completed
              ? "bg-muted text-muted-foreground"
              : game.status === "In Progress"
              ? "bg-primary/20 text-primary animate-pulse"
              : "bg-secondary text-secondary-foreground"
          }`}>
            {game.status}
          </span>
        </div>

        <div className="grid grid-cols-3 items-center gap-2 mb-4">
          <div className="text-center">
            <TeamLogo name={game.awayTeam?.name || "Away team"} logo={game.awayTeam?.logo} className="mx-auto mb-1 h-12 w-12" />
            {game.awayTeam?.seed && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-primary/20 text-primary mb-1">
                {game.awayTeam.seed}
              </span>
            )}
            <h3 className="text-sm font-bold text-foreground leading-tight">{game.awayTeam?.abbreviation || "TBD"}</h3>
            <p className="text-[10px] text-muted-foreground">{matchedAway?.record || game.awayTeam?.record || "Record unavailable"}</p>
            {awayScore !== null && (
              <div className={`text-lg font-bold mt-1 tabular-nums ${homeScore !== null && awayScore > homeScore ? "text-primary" : "text-foreground"}`}>
                {awayScore.toFixed(1)}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{renderCoverage(matchedAway)}</p>
          </div>

          <div className="text-center">
            {game.completed || game.status === "In Progress" ? (
              <div className="text-xl font-bold text-foreground">
                {game.awayTeam?.score} - {game.homeTeam?.score}
              </div>
            ) : (
              <span className="text-lg font-bold text-muted-foreground">VS</span>
            )}
            {homeScore !== null && awayScore !== null && (
              <p className="text-[10px] text-muted-foreground mt-1">POWER SCORE</p>
            )}
          </div>

          <div className="text-center">
            <TeamLogo name={game.homeTeam?.name || "Home team"} logo={game.homeTeam?.logo} className="mx-auto mb-1 h-12 w-12" />
            {game.homeTeam?.seed && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-primary/20 text-primary mb-1">
                {game.homeTeam.seed}
              </span>
            )}
            <h3 className="text-sm font-bold text-foreground leading-tight">{game.homeTeam?.abbreviation || "TBD"}</h3>
            <p className="text-[10px] text-muted-foreground">{matchedHome?.record || game.homeTeam?.record || "Record unavailable"}</p>
            {homeScore !== null && (
              <div className={`text-lg font-bold mt-1 tabular-nums ${awayScore !== null && homeScore > awayScore ? "text-primary" : "text-foreground"}`}>
                {homeScore.toFixed(1)}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{renderCoverage(matchedHome)}</p>
          </div>
        </div>

        {matchedHome && matchedAway && (
          <div className="border-t border-border pt-3 mb-3">
            <div className="grid grid-cols-3 items-center text-[10px] font-semibold text-muted-foreground uppercase mb-1">
              <span className="text-right">{matchedAway.abbreviation}</span>
              <span className="text-center">Stat</span>
              <span className="text-left">{matchedHome.abbreviation}</span>
            </div>
            {statRows.map((row) => {
              const valA = matchedAway.stats[row.key];
              const valB = matchedHome.stats[row.key];
              const aWins = hasStat(valA) && hasStat(valB) && (row.higherIsBetter ? valA > valB : valA < valB);
              const bWins = hasStat(valA) && hasStat(valB) && (row.higherIsBetter ? valB > valA : valB < valA);
              return (
                <div key={row.key} className="grid grid-cols-3 items-center py-0.5">
                  <span className={`text-right tabular-nums text-xs ${aWins ? "text-primary font-semibold" : "text-foreground"}`}>
                    {formatStat(valA)}
                  </span>
                  <span className="text-center text-[10px] text-muted-foreground">{row.label}</span>
                  <span className={`text-left tabular-nums text-xs ${bWins ? "text-primary font-semibold" : "text-foreground"}`}>
                    {formatStat(valB)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {angles.length > 0 && (
          <div className="border-t border-border pt-3 mb-3">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Top Matchup Angles</h4>
            <MatchupAnglesList
              angles={angles}
              teamAName={game.awayTeam?.abbreviation || "Away"}
              teamBName={game.homeTeam?.abbreviation || "Home"}
              initialCount={3}
            />
          </div>
        )}

        {canAnalyze && matchedAway && matchedHome && (
          <Link
            to={`/schedule/${game.id}?away=${encodeURIComponent(matchedAway.canonicalId)}&home=${encodeURIComponent(matchedHome.canonicalId)}`}
            className="flex items-center justify-center gap-2 w-full py-2 mt-2 rounded-md bg-secondary hover:bg-secondary/80 text-sm font-medium text-foreground transition-colors"
          >
            Full Analysis <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Schedule() {
  usePageSeo({
    title: "NCAA Game Analysis & Daily Matchup Breakdown | Joe Knows Ball",
    description:
      "Track live and upcoming NCAA basketball games with matchup breakdowns, advanced team analytics, and daily slate analysis across Division I.",
    canonical: "https://joeknowsball.com/schedule",
  });

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showSliders, setShowSliders] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const { data: liveTeams = [] } = useLiveTeams();

  const dateStr = formatDate(selectedDate);
  const { data: games, isLoading, error } = useSchedule(dateStr);

  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);

  const sortedGames = useMemo(() => {
    if (!games) return [];
    const withMeta = games.map((game) => {
      const matchedHome = game.homeTeam ? findTeamByEspn(game.homeTeam.name, game.homeTeam.abbreviation, teamPool) : null;
      const matchedAway = game.awayTeam ? findTeamByEspn(game.awayTeam.name, game.awayTeam.abbreviation, teamPool) : null;
      const homeScore = matchedHome ? calculateTeamScore(matchedHome.stats, weights) : 0;
      const awayScore = matchedAway ? calculateTeamScore(matchedAway.stats, weights) : 0;
      const topScore = Math.max(homeScore, awayScore);
      const total = homeScore + awayScore;
      const edgeAbs = total > 0 ? Math.abs(homeScore - awayScore) / total : 0;
      const conference = matchedAway?.conference || matchedHome?.conference || "ZZZ";
      return { game, topScore, edgeAbs, conference };
    });

    return [...withMeta].sort((a, b) => {
      switch (sortBy) {
        case "time": {
          const ta = a.game.date ? new Date(a.game.date).getTime() : Infinity;
          const tb = b.game.date ? new Date(b.game.date).getTime() : Infinity;
          return ta - tb;
        }
        case "rank":
          return b.topScore - a.topScore;
        case "edge":
          return b.edgeAbs - a.edgeAbs;
        case "conference":
          return a.conference.localeCompare(b.conference);
        default:
          return 0;
      }
    });
  }, [games, teamPool, weights, sortBy]);

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
  };

  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  const goToToday = () => setSelectedDate(new Date());

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">NCAA Game Analysis &amp; Daily Matchup Breakdown</h1>
          <p className="text-muted-foreground mt-1">Live schedule with full matchup coverage across the visible NCAA slate.</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
            Review live and upcoming NCAA basketball games with schedule context, team strength indicators, advanced
            efficiency metrics, and matchup-specific angles that help explain the current slate.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">NCAA Analytics for the Daily Slate</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Surface daily NCAA analysis, team strength signals, and advanced stats for upcoming games without relying
              on charts alone.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Matchup Breakdown and Team Metrics</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Every available game card includes crawlable matchup text, team metrics, and quick-glance analysis for
              NCAA basketball betting and tournament research.
            </p>
          </div>
        </section>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            <button onClick={prevDay} className="p-2 hover:bg-secondary rounded-md transition-colors">
              <ChevronLeft className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex items-center gap-2 px-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground min-w-[100px] text-center">
                {formatDisplayDate(selectedDate)}
              </span>
            </div>
            <button onClick={nextDay} className="p-2 hover:bg-secondary rounded-md transition-colors">
              <ChevronRight className="w-4 h-4 text-foreground" />
            </button>
          </div>
          <button onClick={goToToday} className="text-sm font-medium text-primary hover:underline">
            Today
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowSliders(!showSliders)} className="text-sm font-medium text-primary hover:underline">
            {showSliders ? "Hide" : "Show"} Weight Controls
          </button>
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

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowUpDown className="w-3 h-3" />
            Sort by:
          </div>
          {(
            [
              { value: "time", label: "Game Time", icon: Clock },
              { value: "rank", label: "Top Ranked", icon: null },
              { value: "edge", label: "Biggest Edge", icon: null },
              { value: "conference", label: "Conference", icon: null },
            ] as { value: SortBy; label: string; icon: typeof Clock | null }[]
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setSortBy(value)}
              className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-colors ${
                sortBy === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>

        {showSliders && <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Loading schedule...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
            <p className="text-sm text-destructive">Failed to load schedule. Please try again.</p>
          </div>
        )}

        {games && games.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground">No games scheduled for this date</p>
            <button onClick={goToToday} className="text-sm text-primary hover:underline mt-2">
              Go to today
            </button>
          </div>
        )}

        {games && games.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              {games.length} game{games.length !== 1 ? "s" : ""} | Any resolvable live matchup is available in
              analysis, even with partial stat coverage
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {sortedGames.map(({ game }) => (
                <GameCard key={game.id} game={game} weights={weights} teamPool={teamPool} />
              ))}
            </div>
          </div>
        )}
        <SeoFooterBlock />
      </div>
    </div>
  );
}
