import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronDown, Clock } from "lucide-react";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import TeamLogo from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchedule, type ScheduleGame } from "@/hooks/useSchedule";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  DEFAULT_STAT_WEIGHTS,
  ELITE_8_PRESET_WEIGHTS,
  buildCanonicalTeams,
  calculateTeamScore,
  findTeamByEspn,
  type StatWeight,
  type Team,
} from "@/data/ncaaTeams";
import { buildPlaceholderBracketSource, buildTournamentMatchups, loadOfficialBracketSource, type BracketSourceConfig } from "@/lib/bracket";
import {
  buildVegasProbabilityComparison,
  formatMoneyline,
  formatProbabilityValue,
  getModelEdgeIntensity,
  type VegasProbabilityComparison,
} from "@/lib/odds";
import { formatRoundedPercent } from "@/lib/numberFormat";

type SortMode = "top-edge" | "smallest-edge" | "game-time" | "model-favorite";

interface BettingBoardEntry {
  game: ScheduleGame;
  away: Team | null;
  home: Team | null;
  tournamentContext: {
    region: string;
    seeds: [number, number];
    route: string;
  } | null;
  modelProbAway: number | null;
  modelProbHome: number | null;
  vegas: VegasProbabilityComparison | null;
  modelFavorite: "away" | "home" | "even";
  edgeValue: number | null;
  edgeSide: "away" | "home" | "even";
  link: string | null;
}

function formatGameTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEdgeClass(points: number | null) {
  const intensity = getModelEdgeIntensity(points);
  if (intensity === "high") return "border-[#7CFF6B] bg-[#7CFF6B]/20 text-[#D8FFD2] shadow-[0_0_18px_rgba(124,255,107,0.35)]";
  if (intensity === "medium") return "border-[#6AF15A] bg-[#6AF15A]/14 text-[#D8FFD2] shadow-[0_0_12px_rgba(106,241,90,0.22)]";
  if (intensity === "low") return "border-[#59D84A] bg-[#59D84A]/10 text-[#D8FFD2]";
  return "border-border bg-secondary/60 text-muted-foreground";
}

function buildEntryLink(game: ScheduleGame, away: Team | null, home: Team | null, tournamentRoute: string | null) {
  if (tournamentRoute) return tournamentRoute;
  if (!away || !home) return null;
  return `/schedule/${game.id}?away=${encodeURIComponent(away.canonicalId)}&home=${encodeURIComponent(home.canonicalId)}`;
}

function sortEntries(entries: BettingBoardEntry[], mode: SortMode) {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    const edgeA = a.edgeValue ?? -1;
    const edgeB = b.edgeValue ?? -1;

    if (mode === "smallest-edge") {
      if (edgeA !== edgeB) return edgeA - edgeB;
    } else if (mode === "game-time") {
      const timeDiff = new Date(a.game.date).getTime() - new Date(b.game.date).getTime();
      if (timeDiff !== 0) return timeDiff;
    } else if (mode === "model-favorite") {
      const favA = Math.max(a.modelProbAway ?? 0, a.modelProbHome ?? 0);
      const favB = Math.max(b.modelProbAway ?? 0, b.modelProbHome ?? 0);
      if (favA !== favB) return favB - favA;
    } else if (edgeA !== edgeB) {
      return edgeB - edgeA;
    }

    if (edgeA !== edgeB) return edgeB - edgeA;
    const dateDiff = new Date(a.game.date).getTime() - new Date(b.game.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.game.name.localeCompare(b.game.name);
  });
  return sorted;
}

function BettingBoardRow({ entry }: { entry: BettingBoardEntry }) {
  const edgeTeam =
    entry.edgeSide === "away"
      ? entry.away?.abbreviation || entry.game.awayTeam?.abbreviation || "Away"
      : entry.edgeSide === "home"
        ? entry.home?.abbreviation || entry.game.homeTeam?.abbreviation || "Home"
        : "Even";

  const modelText =
    entry.modelProbAway !== null && entry.modelProbHome !== null
      ? `${formatRoundedPercent(entry.modelProbAway * 100)} / ${formatRoundedPercent(entry.modelProbHome * 100)}`
      : "Model unavailable";

  const vegasText = entry.vegas
    ? `${formatProbabilityValue(entry.vegas.teamA.impliedProbability)} / ${formatProbabilityValue(entry.vegas.teamB.impliedProbability)}`
    : "Line unavailable";

  const lineText = entry.vegas
    ? `${formatMoneyline(entry.vegas.teamA.moneyline)} / ${formatMoneyline(entry.vegas.teamB.moneyline)}`
    : "Line unavailable";

  const edgeText =
    entry.edgeValue !== null && entry.edgeSide !== "even"
      ? `${edgeTeam} +${entry.edgeValue.toFixed(1)}%`
      : "No model edge";

  const Wrapper = entry.link ? Link : "div";
  const wrapperProps = entry.link
    ? { to: entry.link }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`grid gap-3 rounded-2xl border border-border bg-card/90 px-4 py-3 transition-colors ${
        entry.link ? "hover:border-primary/40 hover:bg-secondary/50" : ""
      } md:grid-cols-[minmax(0,2.2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),minmax(0,0.9fr),auto] md:items-center`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {entry.tournamentContext ? (
            <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">
              {entry.tournamentContext.region}
            </Badge>
          ) : null}
          {entry.game.status ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {entry.game.status}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo
              name={entry.away?.name || entry.game.awayTeam?.name || "Away"}
              logo={entry.away?.logo || entry.game.awayTeam?.logo}
              className="h-8 w-8"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {entry.away?.name || entry.game.awayTeam?.name || "Away team"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {entry.tournamentContext ? `Seed ${entry.tournamentContext.seeds[0]}` : entry.away?.record || entry.game.awayTeam?.record || "Record unavailable"}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">vs</span>
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo
              name={entry.home?.name || entry.game.homeTeam?.name || "Home"}
              logo={entry.home?.logo || entry.game.homeTeam?.logo}
              className="h-8 w-8"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {entry.home?.name || entry.game.homeTeam?.name || "Home team"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {entry.tournamentContext ? `Seed ${entry.tournamentContext.seeds[1]}` : entry.home?.record || entry.game.homeTeam?.record || "Record unavailable"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Model</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{modelText}</p>
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vegas</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{vegasText}</p>
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Model Edge</p>
        <div className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getEdgeClass(entry.edgeValue)}`}>
          {edgeText}
        </div>
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vegas Line</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{lineText}</p>
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="text-right">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground md:justify-end">
            <Clock className="h-3 w-3" />
            {formatGameTime(entry.game.date)}
          </p>
          {entry.link ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-primary">View Analysis</p>
          ) : (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unavailable</p>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

export default function BettingEdge() {
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showControls, setShowControls] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("top-edge");
  const [selectedPreset, setSelectedPreset] = useState<"default" | "elite">("default");
  const [bracketSource, setBracketSource] = useState<BracketSourceConfig>(buildPlaceholderBracketSource());
  const { data: liveTeams = [] } = useLiveTeams();
  const { data: games = [], isLoading, error } = useSchedule();

  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);
  const officialMatchups = useMemo(() => buildTournamentMatchups(bracketSource, teamPool), [bracketSource, teamPool]);

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
    title: "Betting Edge | NCAA Model vs Vegas Comparison | Joe Knows Ball",
    description:
      "Compare NCAA model probabilities against live Vegas implied odds with dynamic betting edges, sliders, and custom presets.",
    canonical: "https://joeknowsball.com/betting-edge",
  });

  const officialMatchupByGameId = useMemo(
    () => new Map(officialMatchups.map((matchup) => [matchup.gameId, matchup])),
    [officialMatchups],
  );

  const boardEntries = useMemo(() => {
    const entries = games.map((game) => {
      const away = game.awayTeam ? findTeamByEspn(game.awayTeam.name, game.awayTeam.abbreviation, teamPool) : null;
      const home = game.homeTeam ? findTeamByEspn(game.homeTeam.name, game.homeTeam.abbreviation, teamPool) : null;
      const matchup = officialMatchupByGameId.get(String(game.id));

      const scoreAway = away ? calculateTeamScore(away.stats, weights) : null;
      const scoreHome = home ? calculateTeamScore(home.stats, weights) : null;
      const totalScore = (scoreAway ?? 0) + (scoreHome ?? 0);
      const modelProbAway = scoreAway !== null && scoreHome !== null && totalScore > 0 ? scoreAway / totalScore : null;
      const modelProbHome = scoreAway !== null && scoreHome !== null && totalScore > 0 ? scoreHome / totalScore : null;

      const vegas =
        modelProbAway !== null && modelProbHome !== null
          ? buildVegasProbabilityComparison({
              modelProbA: modelProbAway,
              modelProbB: modelProbHome,
              moneylineA: game.odds?.awayMoneyline ?? null,
              moneylineB: game.odds?.homeMoneyline ?? null,
              sportsbook: game.odds?.provider ?? null,
            })
          : null;

      const modelFavorite =
        modelProbAway === null || modelProbHome === null
          ? "even"
          : modelProbAway > modelProbHome
            ? "away"
            : modelProbHome > modelProbAway
              ? "home"
              : "even";

      const edgeSide =
        vegas?.edge.team === "teamA" ? "away" : vegas?.edge.team === "teamB" ? "home" : "even";

      return {
        game,
        away,
        home,
        tournamentContext: matchup
          ? {
              region: `${matchup.region} Region`,
              seeds: [matchup.teamA.seed, matchup.teamB.seed] as [number, number],
              route: `/matchup/${matchup.gameId}`,
            }
          : null,
        modelProbAway,
        modelProbHome,
        vegas,
        modelFavorite,
        edgeValue: vegas?.edge.points ?? null,
        edgeSide,
        link: buildEntryLink(game, away, home, matchup ? `/matchup/${matchup.gameId}` : null),
      } satisfies BettingBoardEntry;
    });

    return sortEntries(entries, sortMode);
  }, [games, officialMatchupByGameId, sortMode, teamPool, weights]);

  const handleWeightChange = (key: string, value: number) => {
    setWeights((current) => current.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
    setSelectedPreset("default");
  };

  const applyPreset = (preset: "default" | "elite") => {
    setSelectedPreset(preset);
    setWeights(preset === "elite" ? ELITE_8_PRESET_WEIGHTS : DEFAULT_STAT_WEIGHTS);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto space-y-5 px-4 py-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Betting Edge</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Compare model probabilities against live Vegas implied odds across all current matchups. Adjust sliders and
            presets to see the board reorder in real time.
          </p>
        </div>

        <section className="sticky top-[73px] z-40 rounded-2xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={selectedPreset} onValueChange={(value) => applyPreset(value as "default" | "elite")}>
                <TabsList className="h-auto rounded-xl bg-secondary/80 p-1">
                  <TabsTrigger value="default">Default Model</TabsTrigger>
                  <TabsTrigger value="elite">2025 Elite 8 Team Rank Preset</TabsTrigger>
                </TabsList>
              </Tabs>
              <button
                onClick={() => setShowControls((current) => !current)}
                className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70"
              >
                {showControls ? "Hide" : "Show"} Sliders <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="bg-transparent text-foreground outline-none"
              >
                <option value="top-edge">Top edge</option>
                <option value="smallest-edge">Smallest edge</option>
                <option value="game-time">Game time</option>
                <option value="model-favorite">Model favorite</option>
              </select>
            </label>
          </div>

          {showControls ? (
            <div className="mt-3">
              <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Live NCAA Edge Board</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Ranked by strongest model edge against live Vegas implied probability.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {boardEntries.length} games
            </span>
          </div>

          <div className="mb-2 hidden grid-cols-[minmax(0,2.2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),minmax(0,0.9fr),auto] gap-3 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
            <span>Matchup</span>
            <span>Model</span>
            <span>Vegas</span>
            <span>Edge</span>
            <span>Line</span>
            <span className="text-right">Time</span>
          </div>

          <div className="space-y-2">
            {isLoading ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                Loading the current betting board.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                Live games are temporarily unavailable.
              </div>
            ) : null}

            {!isLoading && !error && boardEntries.length === 0 ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                No current games are available on the betting board right now.
              </div>
            ) : null}

            {boardEntries.map((entry) => (
              <BettingBoardRow key={entry.game.id} entry={entry} />
            ))}
          </div>
        </section>

        <SeoFooterBlock />
      </div>
    </div>
  );
}
