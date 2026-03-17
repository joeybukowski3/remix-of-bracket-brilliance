import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronDown, Clock } from "lucide-react";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import TeamLogo from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ScheduleGame } from "@/hooks/useSchedule";
import { useUpcomingSchedule } from "@/hooks/useUpcomingSchedule";
import { useLiveOdds, type LiveOddsEvent } from "@/hooks/useLiveOdds";
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

type SortMode = "top-edge" | "smallest-edge" | "game-time" | "model-favorite" | "spread-rank";

interface SpreadRankInfo {
  canonicalId: string;
  gameId: string;
  name: string;
  abbreviation: string;
  logo?: string | null;
  spread: number;
  modelProb: number;
  spreadRank: number;
  modelRank: number;
  poolSize: number;
  /** modelRank − spreadRank; negative = model likes more than Vegas */
  rankDelta: number;
}

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
  homeSpread: number | null;
  awaySpread: number | null;
}

function formatGameTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const label = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (d.toDateString() === today.toDateString()) return `Today — ${label}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow — ${label}`;
  return label;
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

function getSpreadDiscrepancy(entry: BettingBoardEntry, spreadRankMap: Map<string, SpreadRankInfo>): number {
  const gameId = String(entry.game.id);
  const awayRank = entry.away ? spreadRankMap.get(`${gameId}:${entry.away.canonicalId}`) : null;
  const homeRank = entry.home ? spreadRankMap.get(`${gameId}:${entry.home.canonicalId}`) : null;
  return Math.max(awayRank ? Math.abs(awayRank.rankDelta) : 0, homeRank ? Math.abs(homeRank.rankDelta) : 0);
}

function sortEntries(
  entries: BettingBoardEntry[],
  mode: SortMode,
  spreadRankMap: Map<string, SpreadRankInfo> = new Map(),
) {
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
    } else if (mode === "spread-rank") {
      const discA = getSpreadDiscrepancy(a, spreadRankMap);
      const discB = getSpreadDiscrepancy(b, spreadRankMap);
      if (discA !== discB) return discB - discA;
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

function InterpretationBadge({ delta }: { delta: number }) {
  if (delta <= -5)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/25">
        🚨 Model Strong Lean
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
        ✅ Model Slight Lean
      </span>
    );
  if (delta === 0)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-muted-foreground">
        ➖ Aligned
      </span>
    );
  if (delta <= 4)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-green-500/15 text-green-400 border border-green-500/25">
        ⚠️ Vegas Slight Lean
      </span>
    );
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-yellow-400/15 text-yellow-400 border border-yellow-400/25">
      🔥 Vegas Strong Lean
    </span>
  );
}

function SpreadRankingsTable({ entries }: { entries: SpreadRankInfo[] }) {
  const fmtSpread = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
  const poolSize = entries[0]?.poolSize ?? entries.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {["Team", "Spread", "Spread Rank", "Model Rank", "Δ Rank", "Interpretation"].map((h, i) => (
              <th
                key={h}
                className={`pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${i === 0 ? "text-left" : i === 5 ? "text-left pl-3" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(({ canonicalId, gameId, name, abbreviation, logo, spread, spreadRank, modelRank, rankDelta }) => (
            <tr key={`${gameId}:${canonicalId}`} className="border-b border-border/40 last:border-0">
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <TeamLogo name={name} logo={logo} className="h-5 w-5 shrink-0" />
                  <span className="font-medium">{abbreviation}</span>
                </div>
              </td>
              <td className="py-2 text-right tabular-nums">{fmtSpread(spread)}</td>
              <td className="py-2 text-right tabular-nums">#{spreadRank} <span className="text-muted-foreground/60">of {poolSize}</span></td>
              <td className="py-2 text-right tabular-nums">#{modelRank} <span className="text-muted-foreground/60">of {poolSize}</span></td>
              <td
                className={`py-2 text-right tabular-nums font-semibold ${
                  rankDelta < 0 ? "text-purple-400" : rankDelta > 0 ? "text-green-400" : "text-muted-foreground"
                }`}
              >
                {rankDelta > 0 ? `+${rankDelta}` : rankDelta}
              </td>
              <td className="py-2 pl-3">
                <InterpretationBadge delta={rankDelta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbabilityRow({
  logo,
  name,
  abbr,
  prob,
  isFavored,
}: {
  logo?: string | null;
  name: string;
  abbr: string;
  prob: string;
  isFavored: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${isFavored ? "font-bold text-primary" : "text-muted-foreground/70"}`}>
      <TeamLogo name={name} logo={logo} className="h-4 w-4 shrink-0" />
      <span className="text-[11px] flex-1 min-w-0 truncate">{abbr}</span>
      <span className="text-[11px] tabular-nums shrink-0">{prob}</span>
    </div>
  );
}

function BettingBoardRow({
  entry,
  spreadRankMap,
}: {
  entry: BettingBoardEntry;
  spreadRankMap: Map<string, SpreadRankInfo>;
}) {
  const [spreadExpanded, setSpreadExpanded] = useState(false);

  const edgeTeam =
    entry.edgeSide === "away"
      ? entry.away?.abbreviation || entry.game.awayTeam?.abbreviation || "Away"
      : entry.edgeSide === "home"
        ? entry.home?.abbreviation || entry.game.homeTeam?.abbreviation || "Home"
        : "Even";

  const lineText = entry.vegas
    ? `${formatMoneyline(entry.vegas.teamA.moneyline)} / ${formatMoneyline(entry.vegas.teamB.moneyline)}`
    : "Line unavailable";

  const edgeText =
    entry.edgeValue !== null && entry.edgeSide !== "even"
      ? `${edgeTeam} +${entry.edgeValue.toFixed(1)}%`
      : "No model edge";

  const awayAbbr = entry.away?.abbreviation || entry.game.awayTeam?.abbreviation || "Away";
  const homeAbbr = entry.home?.abbreviation || entry.game.homeTeam?.abbreviation || "Home";
  const awayLogo = entry.away?.logo || entry.game.awayTeam?.logo;
  const homeLogo = entry.home?.logo || entry.game.homeTeam?.logo;
  const awayName = entry.away?.name || entry.game.awayTeam?.name || "Away";
  const homeName = entry.home?.name || entry.game.homeTeam?.name || "Home";

  const modelAwayProb = entry.modelProbAway ?? 0;
  const modelHomeProb = entry.modelProbHome ?? 0;
  const vegasAwayProb = entry.vegas?.teamA.impliedProbability ?? 0;
  const vegasHomeProb = entry.vegas?.teamB.impliedProbability ?? 0;

  const edgeModelProb = entry.edgeSide === "away" ? entry.modelProbAway : entry.modelProbHome;
  const edgeVegasProb =
    entry.edgeSide === "away" ? entry.vegas?.teamA.impliedProbability : entry.vegas?.teamB.impliedProbability;

  const gameId = String(entry.game.id);
  const awayRank = entry.away ? spreadRankMap.get(`${gameId}:${entry.away.canonicalId}`) : null;
  const homeRank = entry.home ? spreadRankMap.get(`${gameId}:${entry.home.canonicalId}`) : null;
  const hasSpreadData = awayRank !== null || homeRank !== null;

  const mainGridClass =
    "grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2.2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),minmax(0,0.9fr),auto] md:items-center";

  const mainContent = (
    <>
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
                {entry.tournamentContext
                  ? `Seed ${entry.tournamentContext.seeds[0]}`
                  : entry.away?.record || entry.game.awayTeam?.record || "Record unavailable"}
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
                {entry.tournamentContext
                  ? `Seed ${entry.tournamentContext.seeds[1]}`
                  : entry.home?.record || entry.game.homeTeam?.record || "Record unavailable"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Model</p>
        {entry.modelProbAway !== null && entry.modelProbHome !== null ? (
          <div className="space-y-1">
            <ProbabilityRow
              logo={awayLogo}
              name={awayName}
              abbr={awayAbbr}
              prob={formatRoundedPercent(modelAwayProb * 100)}
              isFavored={modelAwayProb >= modelHomeProb}
            />
            <ProbabilityRow
              logo={homeLogo}
              name={homeName}
              abbr={homeAbbr}
              prob={formatRoundedPercent(modelHomeProb * 100)}
              isFavored={modelHomeProb > modelAwayProb}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Unavailable</p>
        )}
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Vegas</p>
        {entry.vegas ? (
          <div className="space-y-1">
            <ProbabilityRow
              logo={awayLogo}
              name={awayName}
              abbr={awayAbbr}
              prob={formatProbabilityValue(entry.vegas.teamA.impliedProbability)}
              isFavored={vegasAwayProb >= vegasHomeProb}
            />
            <ProbabilityRow
              logo={homeLogo}
              name={homeName}
              abbr={homeAbbr}
              prob={formatProbabilityValue(entry.vegas.teamB.impliedProbability)}
              isFavored={vegasHomeProb > vegasAwayProb}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Unavailable</p>
        )}
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Model Edge</p>
        <div className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getEdgeClass(entry.edgeValue)}`}>
          {edgeText}
        </div>
        {entry.vegas && edgeModelProb !== null && edgeVegasProb !== null && entry.edgeSide !== "even" && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Model {formatRoundedPercent(edgeModelProb * 100)} · Vegas {formatProbabilityValue(edgeVegasProb)}
          </p>
        )}
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
    </>
  );

  return (
    <div
      className={`rounded-2xl border border-border bg-card/90 overflow-hidden transition-colors ${
        entry.link ? "hover:border-primary/40" : ""
      }`}
    >
      {entry.link ? (
        <Link to={entry.link} className={`${mainGridClass} hover:bg-secondary/40 transition-colors`}>
          {mainContent}
        </Link>
      ) : (
        <div className={mainGridClass}>{mainContent}</div>
      )}

      {hasSpreadData && (
        <>
          <button
            onClick={() => setSpreadExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 border-t border-border/20 px-4 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary/20"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-150 ${spreadExpanded ? "rotate-180" : ""}`}
            />
            Spread Analysis
          </button>
          {spreadExpanded && (
            <div className="border-t border-border/30 bg-secondary/15 px-4 py-4">
              <div className="grid grid-cols-2 gap-6">
                {(
                  [
                    { rank: awayRank, abbr: awayAbbr, logo: awayLogo, name: awayName },
                    { rank: homeRank, abbr: homeAbbr, logo: homeLogo, name: homeName },
                  ] as const
                ).map(({ rank, abbr, logo, name }) =>
                  rank ? (
                    <div key={abbr} className="flex flex-col items-center gap-2 text-center">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo name={name} logo={logo} className="h-5 w-5 shrink-0" />
                        <span className="text-sm font-bold text-foreground">{abbr}</span>
                      </div>
                      <div className="space-y-1 w-full">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Spread</span>
                          <span className="tabular-nums font-semibold text-foreground">
                            {rank.spread > 0 ? `+${rank.spread.toFixed(1)}` : rank.spread.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Spread Rank</span>
                          <span className="tabular-nums font-semibold text-foreground">
                            #{rank.spreadRank} <span className="text-muted-foreground/60 font-normal">of {rank.poolSize}</span>
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Model Rank</span>
                          <span className="tabular-nums font-semibold text-foreground">
                            #{rank.modelRank} <span className="text-muted-foreground/60 font-normal">of {rank.poolSize}</span>
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Δ Rank</span>
                          <span
                            className={`tabular-nums font-bold text-sm ${
                              rank.rankDelta < 0
                                ? "text-purple-400"
                                : rank.rankDelta > 0
                                  ? "text-green-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {rank.rankDelta > 0 ? `+${rank.rankDelta}` : rank.rankDelta}
                          </span>
                        </div>
                      </div>
                      <InterpretationBadge delta={rank.rankDelta} />
                    </div>
                  ) : (
                    <div key={abbr} className="flex items-center justify-center text-xs text-muted-foreground">
                      No spread data for {abbr}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BettingEdge() {
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showControls, setShowControls] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("top-edge");
  const [selectedPreset, setSelectedPreset] = useState<"default" | "elite">("default");
  const [showSpreadRankings, setShowSpreadRankings] = useState(false);
  const [bracketSource, setBracketSource] = useState<BracketSourceConfig>(buildPlaceholderBracketSource());
  const { data: liveTeams = [] } = useLiveTeams();
  const { games, isLoading, error } = useUpcomingSchedule(7);
  const { data: liveOdds = [] } = useLiveOdds();

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

  // Pre-resolve Odds API team names to canonical IDs once, then reference cheaply per game
  const resolvedOddsEvents = useMemo(
    () =>
      liveOdds
        .map((event) => ({
          event,
          homeCanonicalId: findTeamByEspn(event.homeTeam, "", teamPool)?.canonicalId ?? null,
          awayCanonicalId: findTeamByEspn(event.awayTeam, "", teamPool)?.canonicalId ?? null,
        }))
        .filter(
          (r): r is { event: LiveOddsEvent; homeCanonicalId: string; awayCanonicalId: string } =>
            r.homeCanonicalId !== null && r.awayCanonicalId !== null,
        ),
    [liveOdds, teamPool],
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

      // Prefer ESPN schedule odds; fall back to The Odds API when lines are missing
      let moneylineAway: number | null = game.odds?.awayMoneyline ?? null;
      let moneylineHome: number | null = game.odds?.homeMoneyline ?? null;
      let oddsProvider: string | null = game.odds?.provider ?? null;
      let awaySpread: number | null = null;
      let homeSpread: number | null = null;

      // Always look up live odds to get spreads; also fill in moneylines if ESPN didn't have them
      if (away && home) {
        const liveMatch = resolvedOddsEvents.find(
          (r) =>
            (r.homeCanonicalId === home.canonicalId && r.awayCanonicalId === away.canonicalId) ||
            (r.homeCanonicalId === away.canonicalId && r.awayCanonicalId === home.canonicalId),
        );
        if (liveMatch) {
          // Odds API may list teams in either order — swap-correct so our away/home align
          const isSwapped = liveMatch.homeCanonicalId === away.canonicalId;
          if (moneylineAway === null || moneylineHome === null) {
            moneylineAway = isSwapped ? liveMatch.event.homeMoneyline : liveMatch.event.awayMoneyline;
            moneylineHome = isSwapped ? liveMatch.event.awayMoneyline : liveMatch.event.homeMoneyline;
            oddsProvider = liveMatch.event.sportsbook;
          }
          awaySpread = isSwapped ? liveMatch.event.homeSpread : liveMatch.event.awaySpread;
          homeSpread = isSwapped ? liveMatch.event.awaySpread : liveMatch.event.homeSpread;
        }
      }

      const vegas =
        modelProbAway !== null && modelProbHome !== null
          ? buildVegasProbabilityComparison({
              modelProbA: modelProbAway,
              modelProbB: modelProbHome,
              moneylineA: moneylineAway,
              moneylineB: moneylineHome,
              sportsbook: oddsProvider,
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
        homeSpread,
        awaySpread,
      } satisfies BettingBoardEntry;
    });

    return entries;
  }, [games, officialMatchupByGameId, resolvedOddsEvents, teamPool, weights]);

  const spreadRankMap = useMemo(() => {
    // Step 1: Flatten all board entries with BOTH spreads valid into game-sides
    type Side = {
      gameId: string;
      canonicalId: string;
      name: string;
      abbreviation: string;
      logo?: string | null;
      spread: number;
      modelProb: number;
    };
    const sides: Side[] = [];
    for (const entry of boardEntries) {
      if (entry.awaySpread === null || entry.homeSpread === null) continue;
      if (entry.away && entry.modelProbAway !== null) {
        sides.push({
          gameId: String(entry.game.id),
          canonicalId: entry.away.canonicalId,
          name: entry.away.name,
          abbreviation: entry.away.abbreviation,
          logo: entry.away.logo,
          spread: entry.awaySpread,
          modelProb: entry.modelProbAway,
        });
      }
      if (entry.home && entry.modelProbHome !== null) {
        sides.push({
          gameId: String(entry.game.id),
          canonicalId: entry.home.canonicalId,
          name: entry.home.name,
          abbreviation: entry.home.abbreviation,
          logo: entry.home.logo,
          spread: entry.homeSpread,
          modelProb: entry.modelProbHome,
        });
      }
    }
    if (sides.length === 0) return new Map<string, SpreadRankInfo>();

    const poolSize = sides.length;

    // Step 2: Rank by modelProb descending (rank 1 = model's biggest favorite)
    const byModelProb = [...sides].sort((a, b) => b.modelProb - a.modelProb);
    const modelRankByKey = new Map<string, number>();
    byModelProb.forEach((side, idx) => {
      modelRankByKey.set(`${side.gameId}:${side.canonicalId}`, idx + 1);
    });

    // Step 3: Rank by spread ascending (rank 1 = most negative spread = Vegas's biggest favorite)
    const bySpread = [...sides].sort((a, b) => a.spread - b.spread);
    const spreadRankByKey = new Map<string, number>();
    bySpread.forEach((side, idx) => {
      spreadRankByKey.set(`${side.gameId}:${side.canonicalId}`, idx + 1);
    });

    // Step 4: Build final map keyed by gameId:canonicalId
    const map = new Map<string, SpreadRankInfo>();
    for (const side of sides) {
      const key = `${side.gameId}:${side.canonicalId}`;
      const modelRank = modelRankByKey.get(key) ?? poolSize;
      const spreadRank = spreadRankByKey.get(key) ?? poolSize;
      map.set(key, {
        canonicalId: side.canonicalId,
        gameId: side.gameId,
        name: side.name,
        abbreviation: side.abbreviation,
        logo: side.logo,
        spread: side.spread,
        modelProb: side.modelProb,
        spreadRank,
        modelRank,
        poolSize,
        rankDelta: modelRank - spreadRank,
      });
    }
    return map;
  }, [boardEntries]);

  const spreadRankEntries = useMemo(
    () => [...spreadRankMap.values()].sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta)),
    [spreadRankMap],
  );

  const displayGroups = useMemo(() => {
    const allSorted = sortEntries(boardEntries, sortMode, spreadRankMap);

    // Only show date group headers when sorting by game time
    if (sortMode === "game-time") {
      const byDate = new Map<string, BettingBoardEntry[]>();
      for (const entry of allSorted) {
        const dateKey = new Date(entry.game.date).toDateString();
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(entry);
      }
      return Array.from(byDate.entries())
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .map(([dateKey, entries]) => ({
          label: getDateGroupLabel(dateKey) as string | null,
          entries,
        }));
    }

    // All other modes: global flat list, no date group headers
    return [{ label: null as string | null, entries: allSorted }];
  }, [boardEntries, sortMode, spreadRankMap]);

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
                <option value="spread-rank">Spread vs. Model</option>
              </select>
            </label>
          </div>

          {showControls ? (
            <div className="mt-3">
              <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
            </div>
          ) : null}
        </section>

        {spreadRankEntries.length > 0 && (
          <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
            <button
              onClick={() => setShowSpreadRankings((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <div className="text-left">
                <h2 className="text-lg font-semibold text-foreground">Spread vs. Model Rankings</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Vegas spread rank vs. model win probability rank — {spreadRankEntries[0]?.poolSize ?? spreadRankEntries.length} sides with active lines
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${showSpreadRankings ? "rotate-180" : ""}`}
              />
            </button>
            {showSpreadRankings && (
              <div className="mt-4">
                <SpreadRankingsTable entries={spreadRankEntries} />
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Upcoming NCAA Edge Board</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Ranked by strongest model edge against live Vegas implied probability.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {boardEntries.length} games
            </span>
          </div>

          {boardEntries.length > 0 ? (
            <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs font-medium text-primary">
              Click on any game to use custom sliders and see updated model projections.
            </div>
          ) : null}

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
                Loading upcoming games...
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                Live games are temporarily unavailable.
              </div>
            ) : null}

            {!isLoading && !error && boardEntries.length === 0 ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                No upcoming games found for the next 7 days. Check back closer to game time.
              </div>
            ) : null}

            {displayGroups.map(({ label, entries }, groupIdx) => (
              <div key={label ?? groupIdx}>
                {label && (
                  <div className="mb-2 mt-4 first:mt-0 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {label}
                  </div>
                )}
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <BettingBoardRow key={entry.game.id} entry={entry} spreadRankMap={spreadRankMap} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <SeoFooterBlock />
      </div>
    </div>
  );
}
