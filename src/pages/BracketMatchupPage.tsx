import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import MatchupAnglesList from "@/components/MatchupAnglesList";
import ModelEdgePanel from "@/components/ModelEdgePanel";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import SiteNav from "@/components/SiteNav";
import TeamLogo from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { buildCanonicalTeams, calculateTeamScore, findTeamByEspn, formatStat, hasStat, type Team } from "@/data/ncaaTeams";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { useSchedule } from "@/hooks/useSchedule";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  BUILT_IN_PRESETS,
  buildPlaceholderBracketSource,
  buildTournamentMatchups,
  loadOfficialBracketSource,
  type TournamentMatchup,
} from "@/lib/bracket";
import { generateMatchupAngles, getOverallAdvantage } from "@/lib/matchupAngles";
import { buildVegasProbabilityComparison, findScheduledGameForTeams, resolveScheduledGameMoneylines } from "@/lib/odds";

function SeedPill({ seed }: { seed: number }) {
  return (
    <span className="inline-flex min-w-8 items-center justify-center rounded-md bg-primary/15 px-2 py-1 text-xs font-bold text-primary">
      {seed}
    </span>
  );
}

function StatRow({
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
    <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-3 border-b border-border/50 py-2 last:border-b-0">
      <span className={`text-right text-sm font-semibold tabular-nums ${aWins ? "text-primary" : "text-foreground"}`}>
        {formatStat(valueA)}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={`text-left text-sm font-semibold tabular-nums ${bWins ? "text-primary" : "text-foreground"}`}>
        {formatStat(valueB)}
      </span>
    </div>
  );
}

function TeamSummaryCard({ team, seed, label }: { team: Team; seed: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <TeamLogo name={team.name} logo={team.logo} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SeedPill seed={seed} />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          </div>
          <h2 className="mt-2 text-lg font-bold text-foreground">{team.name}</h2>
          <p className="text-sm text-muted-foreground">
            {team.conference || "Conference unavailable"} | {team.record || "Record unavailable"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-secondary/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Adj OE</p>
          <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.adjOE)}</p>
        </div>
        <div className="rounded-xl bg-secondary/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Adj DE</p>
          <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.adjDE)}</p>
        </div>
        <div className="rounded-xl bg-secondary/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tempo</p>
          <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.tempo)}</p>
        </div>
        <div className="rounded-xl bg-secondary/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">SOS</p>
          <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.sos)}</p>
        </div>
      </div>
    </div>
  );
}

const COMPARISON_ROWS: Array<{ label: string; key: keyof Team["stats"]; higherIsBetter: boolean }> = [
  { label: "Model Score", key: "adjOE", higherIsBetter: true },
  { label: "Offense", key: "adjOE", higherIsBetter: true },
  { label: "Defense", key: "adjDE", higherIsBetter: false },
  { label: "Pace", key: "tempo", higherIsBetter: true },
  { label: "Rebounding", key: "rpg", higherIsBetter: true },
  { label: "Shooting", key: "fgPct", higherIsBetter: true },
  { label: "Strength of Schedule", key: "sos", higherIsBetter: true },
];

function buildTitle(matchup: TournamentMatchup | null) {
  if (!matchup) return "NCAA Tournament Matchup Analysis | Joe Knows Ball";
  return `${matchup.teamA.displayName} vs ${matchup.teamB.displayName} NCAA Tournament Analysis | Joe Knows Ball`;
}

function buildDescription(matchup: TournamentMatchup | null) {
  if (!matchup) {
    return "Advanced NCAA tournament matchup analysis with offense, defense, pace, rebounding, model score, and win probability.";
  }
  return `Advanced NCAA tournament matchup analysis for ${matchup.teamA.displayName} vs ${matchup.teamB.displayName}, including offense, defense, pace, rebounding, model score, and win probability.`;
}

export default function BracketMatchupPage() {
  const { matchupId = "" } = useParams();
  const { data: liveTeams = [] } = useLiveTeams();
  const { data: todayGames = [] } = useSchedule();
  const { data: liveOdds = [] } = useLiveOdds();
  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);
  const [source, setSource] = useState(buildPlaceholderBracketSource());

  useEffect(() => {
    let ignore = false;
    loadOfficialBracketSource().then((payload) => {
      if (!ignore && payload) setSource(payload);
    });
    return () => {
      ignore = true;
    };
  }, []);

  const matchup = useMemo(
    () => buildTournamentMatchups(source, teamPool).find((entry) => entry.gameId === matchupId) ?? null,
    [matchupId, source, teamPool],
  );

  usePageSeo({
    title: buildTitle(matchup),
    description: buildDescription(matchup),
    canonical: `https://joeknowsball.com/matchup/${matchupId}`,
    noindex: !matchup,
  });

  const weights = BUILT_IN_PRESETS[0].weights;

  if (!matchup) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <div className="container mx-auto space-y-6 px-4 py-8">
          <h1 className="text-3xl font-bold text-foreground">NCAA Tournament Matchup Analysis</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Review NCAA tournament matchup analysis with advanced offense, defense, pace, rebounding, and model score
            comparisons for the official 2026 bracket.
          </p>
          <div className="rounded-2xl border border-border bg-card/95 p-5 text-sm text-muted-foreground">
            This tournament matchup was not found. Return to the official matchup board to browse all first-round NCAA
            bracket analysis pages.
          </div>
          <Link to="/matchup" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to official matchup board
          </Link>
        </div>
      </div>
    );
  }

  const scoreA = calculateTeamScore(matchup.teamA.team.stats, weights);
  const scoreB = calculateTeamScore(matchup.teamB.team.stats, weights);
  const totalScore = scoreA + scoreB || 1;
  const winProbA = ((scoreA / totalScore) * 100).toFixed(1);
  const winProbB = ((scoreB / totalScore) * 100).toFixed(1);
  const singleTeamMatchup = !matchup.teamA.isPlayIn && !matchup.teamB.isPlayIn;
  const angles = singleTeamMatchup ? generateMatchupAngles(matchup.teamA.team, matchup.teamB.team, teamPool) : [];
  const advantage = singleTeamMatchup ? getOverallAdvantage(matchup.teamA.team, matchup.teamB.team, angles) : null;
  const scheduledGame = singleTeamMatchup
    ? findScheduledGameForTeams(todayGames, matchup.teamA.team, matchup.teamB.team, teamPool, findTeamByEspn)
    : null;
  const scheduledMoneylines = singleTeamMatchup
    ? resolveScheduledGameMoneylines(scheduledGame, matchup.teamA.team, matchup.teamB.team, teamPool, findTeamByEspn)
    : null;

  // Resolve moneylines: ESPN schedule odds first, then live Odds API as fallback
  let moneylineA = scheduledMoneylines?.moneylineA ?? null;
  let moneylineB = scheduledMoneylines?.moneylineB ?? null;
  let vegasBook = scheduledMoneylines?.sportsbook ?? null;
  if (singleTeamMatchup && moneylineA === null && moneylineB === null && liveOdds.length > 0) {
    const idA = matchup.teamA.team.canonicalId;
    const idB = matchup.teamB.team.canonicalId;
    const liveMatch = liveOdds
      .map((e) => ({
        e,
        homeTeam: findTeamByEspn(e.homeTeam, "", teamPool),
        awayTeam: findTeamByEspn(e.awayTeam, "", teamPool),
      }))
      .find(
        ({ homeTeam, awayTeam }) =>
          (homeTeam?.canonicalId === idA && awayTeam?.canonicalId === idB) ||
          (homeTeam?.canonicalId === idB && awayTeam?.canonicalId === idA),
      );
    if (liveMatch) {
      const isSwapped = liveMatch.homeTeam?.canonicalId === idB;
      moneylineA = isSwapped ? liveMatch.e.homeMoneyline : liveMatch.e.awayMoneyline;
      moneylineB = isSwapped ? liveMatch.e.awayMoneyline : liveMatch.e.homeMoneyline;
      vegasBook = liveMatch.e.sportsbook;
    }
  }

  const vegasComparison =
    singleTeamMatchup && (moneylineA !== null || moneylineB !== null)
      ? buildVegasProbabilityComparison({
          modelProbA: scoreA / totalScore,
          modelProbB: scoreB / totalScore,
          moneylineA,
          moneylineB,
          sportsbook: vegasBook,
        })
      : null;
  const playInSide = matchup.teamA.isPlayIn ? matchup.teamA : matchup.teamB.isPlayIn ? matchup.teamB : null;
  const fixedSide = matchup.teamA.isPlayIn ? matchup.teamB : matchup.teamA;

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto space-y-6 px-4 py-8">
        <Link to="/matchup" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to all official matchups
        </Link>

        <section className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{matchup.region} Region</Badge>
            <Badge variant="secondary">Official 2026 Round of 64</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-foreground">{matchup.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            NCAA tournament analysis for {matchup.teamA.displayName} vs {matchup.teamB.displayName}, with advanced team
            metrics, model projections, visible stat comparisons, and tournament context from the official 2026 bracket.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr,auto,1fr]">
          <TeamSummaryCard team={matchup.teamA.team} seed={matchup.teamA.seed} label={matchup.region} />
          <div className="flex items-center justify-center">
            <div className="rounded-2xl border border-border bg-secondary/70 px-4 py-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Model Win Probability</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{winProbA}% / {winProbB}%</p>
            </div>
          </div>
          <TeamSummaryCard team={matchup.teamB.team} seed={matchup.teamB.seed} label={matchup.region} />
        </section>

        {singleTeamMatchup ? (
          <ModelEdgePanel
            teamAName={matchup.teamA.team.abbreviation}
            teamBName={matchup.teamB.team.abbreviation}
            modelProbA={scoreA / totalScore}
            modelProbB={scoreB / totalScore}
            vegas={vegasComparison}
          />
        ) : null}

        <section className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">Model Summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Compact NCAA matchup analysis with offense, defense, pace, rebounding, shooting, and schedule strength.
              </p>
            </div>
            {advantage && (
              <Badge variant={advantage.team === "even" ? "outline" : "default"}>
                {advantage.team === "even" ? "Essentially even" : `${advantage.team === "teamA" ? matchup.teamA.displayName : matchup.teamB.displayName} edge`}
              </Badge>
            )}
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${(scoreA / totalScore) * 100}%` }} />
          </div>

          <div className="mt-5 space-y-1">
            {COMPARISON_ROWS.map((row) => (
              <StatRow
                key={row.label}
                label={row.label}
                valueA={row.label === "Model Score" ? scoreA : matchup.teamA.team.stats[row.key]}
                valueB={row.label === "Model Score" ? scoreB : matchup.teamB.team.stats[row.key]}
                higherIsBetter={row.higherIsBetter}
              />
            ))}
          </div>
        </section>

        {playInSide ? (
          <section className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-foreground">Possible Opponent Breakdown</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              This official first-round matchup includes a First Four winner. Joe Knows Ball keeps the bracket slot live
              and shows both possible opponents so the tournament path remains fully visible before the play-in result is final.
            </p>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {playInSide.options.map((team) => {
                const optionScore = calculateTeamScore(team.stats, weights);
                const optionWinProb = (((calculateTeamScore(fixedSide.team.stats, weights)) / ((calculateTeamScore(fixedSide.team.stats, weights)) + optionScore || 1)) * 100).toFixed(1);
                return (
                  <div key={team.canonicalId} className="rounded-2xl border border-border bg-secondary/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <TeamLogo name={team.name} logo={team.logo} className="h-10 w-10" />
                        <div>
                          <p className="font-semibold text-foreground">{fixedSide.displayName} vs {team.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {matchup.region} style matchup | {fixedSide.seed} vs {playInSide.seed}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">{optionWinProb}% {fixedSide.displayName}</Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-background/80 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{team.name} Adj OE</p>
                        <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.adjOE)}</p>
                      </div>
                      <div className="rounded-xl bg-background/80 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{team.name} Adj DE</p>
                        <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.adjDE)}</p>
                      </div>
                      <div className="rounded-xl bg-background/80 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{team.name} Pace</p>
                        <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.tempo)}</p>
                      </div>
                      <div className="rounded-xl bg-background/80 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{team.name} SOS</p>
                        <p className="mt-1 font-semibold text-foreground">{formatStat(team.stats.sos)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {singleTeamMatchup && angles.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-foreground">Matchup Angles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Category-by-category NCAA tournament matchup edges drawn from the current advanced metrics pipeline.
            </p>
            <div className="mt-4">
              <MatchupAnglesList
                angles={angles}
                teamAName={matchup.teamA.team.abbreviation}
                teamBName={matchup.teamB.team.abbreviation}
                initialCount={6}
              />
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
          <h2 className="text-xl font-bold text-foreground">Continue Exploring</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to="/bracket" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Open live bracket <ChevronRight className="h-4 w-4" />
            </Link>
            <Link to="/matchup" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground">
              Browse all tournament matchups <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <SeoFooterBlock />
      </div>
    </div>
  );
}
