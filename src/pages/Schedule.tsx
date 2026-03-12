import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import MatchupAnglesList from "@/components/MatchupAnglesList";
import { useSchedule, type ScheduleGame } from "@/hooks/useSchedule";
import { teams, DEFAULT_STAT_WEIGHTS, ELITE_8_PRESET_WEIGHTS, calculateTeamScore, type StatWeight, type Team } from "@/data/ncaaTeams";
import { generateMatchupAngles, getOverallAdvantage } from "@/lib/matchupAngles";
import { Calendar, ChevronLeft, ChevronRight, Clock, Tv, MapPin, ArrowRight } from "lucide-react";

function findMatchingTeam(espnName: string, espnAbbr: string): Team | null {
  // Try abbreviation match first
  const byAbbr = teams.find(
    (t) => t.abbreviation.toLowerCase() === espnAbbr.toLowerCase()
  );
  if (byAbbr) return byAbbr;

  // Try name includes match
  const nameLower = espnName.toLowerCase();
  const byName = teams.find(
    (t) =>
      nameLower.includes(t.name.toLowerCase().split(" ")[0]) ||
      t.name.toLowerCase().includes(nameLower.split(" ")[0])
  );
  if (byName) return byName;

  return null;
}

function formatGameTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

interface GameCardProps {
  game: ScheduleGame;
  weights: StatWeight[];
}

function GameCard({ game, weights }: GameCardProps) {
  const matchedHome = game.homeTeam ? findMatchingTeam(game.homeTeam.name, game.homeTeam.abbreviation) : null;
  const matchedAway = game.awayTeam ? findMatchingTeam(game.awayTeam.name, game.awayTeam.abbreviation) : null;

  const homeScore = matchedHome ? calculateTeamScore(matchedHome.stats, weights) : null;
  const awayScore = matchedAway ? calculateTeamScore(matchedAway.stats, weights) : null;

  const angles = matchedHome && matchedAway ? generateMatchupAngles(matchedAway, matchedHome) : [];
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

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Advantage banner */}
      {advantage && advantage.team !== "even" && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-center gap-2">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">
            {advantage.margin}:
          </span>
          <span className="text-sm font-bold text-foreground">
            {advantage.team === "teamA"
              ? game.awayTeam?.name
              : game.homeTeam?.name}
          </span>
        </div>
      )}
      {advantage && advantage.team === "even" && (
        <div className="bg-muted/50 border-b border-border px-4 py-2 flex items-center justify-center">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {advantage.margin}
          </span>
        </div>
      )}

      {/* Teams header */}
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

        {/* Team matchup */}
        <div className="grid grid-cols-3 items-center gap-2 mb-4">
          {/* Away team */}
          <div className="text-center">
            <img
              src={game.awayTeam?.logo || "/placeholder.svg"}
              alt={game.awayTeam?.name}
              className="w-12 h-12 object-contain mx-auto mb-1"
              loading="lazy"
            />
            {game.awayTeam?.seed && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-primary/20 text-primary mb-1">
                {game.awayTeam.seed}
              </span>
            )}
            <h3 className="text-sm font-bold text-foreground leading-tight">
              {game.awayTeam?.abbreviation || "TBD"}
            </h3>
            <p className="text-[10px] text-muted-foreground">{game.awayTeam?.record}</p>
            {awayScore !== null && (
              <div className={`text-lg font-bold mt-1 tabular-nums ${
                homeScore !== null && awayScore > homeScore ? "text-primary" : "text-foreground"
              }`}>
                {awayScore.toFixed(1)}
              </div>
            )}
          </div>

          {/* VS / Score */}
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

          {/* Home team */}
          <div className="text-center">
            <img
              src={game.homeTeam?.logo || "/placeholder.svg"}
              alt={game.homeTeam?.name}
              className="w-12 h-12 object-contain mx-auto mb-1"
              loading="lazy"
            />
            {game.homeTeam?.seed && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-primary/20 text-primary mb-1">
                {game.homeTeam.seed}
              </span>
            )}
            <h3 className="text-sm font-bold text-foreground leading-tight">
              {game.homeTeam?.abbreviation || "TBD"}
            </h3>
            <p className="text-[10px] text-muted-foreground">{game.homeTeam?.record}</p>
            {homeScore !== null && (
              <div className={`text-lg font-bold mt-1 tabular-nums ${
                awayScore !== null && homeScore > awayScore ? "text-primary" : "text-foreground"
              }`}>
                {homeScore.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        {/* Quick stat comparison */}
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
              const aWins = row.higherIsBetter ? valA > valB : valA < valB;
              const bWins = row.higherIsBetter ? valB > valA : valB < valA;
              return (
                <div key={row.key} className="grid grid-cols-3 items-center py-0.5">
                  <span className={`text-right tabular-nums text-xs ${aWins ? "text-primary font-semibold" : "text-foreground"}`}>
                    {valA}
                  </span>
                  <span className="text-center text-[10px] text-muted-foreground">{row.label}</span>
                  <span className={`text-left tabular-nums text-xs ${bWins ? "text-primary font-semibold" : "text-foreground"}`}>
                    {valB}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Matchup angles preview */}
        {angles.length > 0 && (
          <div className="border-t border-border pt-3 mb-3">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">
              Top Matchup Angles
            </h4>
            <MatchupAnglesList
              angles={angles}
              teamAName={game.awayTeam?.abbreviation || "Away"}
              teamBName={game.homeTeam?.abbreviation || "Home"}
              initialCount={3}
            />
          </div>
        )}

        {/* Link to full matchup page */}
        {matchedHome && matchedAway && (
          <Link
            to={`/schedule/${game.id}?away=${matchedAway.id}&home=${matchedHome.id}`}
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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showSliders, setShowSliders] = useState(false);

  const dateStr = formatDate(selectedDate);
  const { data: games, isLoading, error } = useSchedule(dateStr);

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((w) => (w.key === key ? { ...w, weight: value } : w)));
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
          <h1 className="text-3xl font-bold text-foreground">Game Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Live schedule with matchup analysis and angles
          </p>
        </div>

        {/* Date picker */}
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
          <button
            onClick={goToToday}
            className="text-sm font-medium text-primary hover:underline"
          >
            Today
          </button>
        </div>

        {/* Weight controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowSliders(!showSliders)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {showSliders ? "Hide" : "Show"} Weight Controls
          </button>
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

        {showSliders && (
          <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
        )}

        {/* Games grid */}
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
              {games.length} game{games.length !== 1 ? "s" : ""} · Games with matching team data show full analysis
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {games.map((game) => (
                <GameCard key={game.id} game={game} weights={weights} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
