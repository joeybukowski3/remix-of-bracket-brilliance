import { useMemo, useState } from "react";
import { ArrowRight, Search, Swords } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  CFB_CONFERENCE_ORDER,
  CFB_CONFERENCES,
  CFB_GAMES_2026,
  CFB_PROVENANCE,
  CFB_STATS_2026_HAS_DATA,
  getAllTeams,
} from "@/data/cfb";
import type { CfbConferenceId, CfbTeam } from "@/data/cfb/types";
import { filterByConference, sortRankings } from "@/lib/cfb/rankings";
import {
  createRatingsExplorerContext,
  getRatingsViewDefinition,
  RATINGS_VIEW_DEFINITIONS,
  type RatingsDisplay,
  type RatingsView,
} from "@/lib/cfb/ratingsExplorer";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";
import CollegeFootballRatingsMatrix from "@/components/cfb/CollegeFootballRatingsMatrix";
import CollegeFootballTeamLogo from "@/components/cfb/CollegeFootballTeamLogo";
import { cn } from "@/lib/utils";

type TeamScope = "all" | "top25" | "conference";

function MatchupSnapshot({
  left,
  right,
  allTeams,
  statsSeason,
}: {
  left: CfbTeam;
  right: CfbTeam;
  allTeams: CfbTeam[];
  statsSeason: 2025 | 2026;
}) {
  const context = useMemo(
    () => createRatingsExplorerContext(allTeams, statsSeason),
    [allTeams, statsSeason],
  );
  const statsLabel = `${statsSeason} ${statsSeason === 2025 ? "FINAL" : "season to date"}`;
  // Same registry as the table; metrics repeated across categories (situational) show once.
  const seenKeys = new Set<string>();
  const groups = RATINGS_VIEW_DEFINITIONS.map((definition) => ({
    definition,
    metrics: definition.metrics.filter((metric) => {
      if (seenKeys.has(metric.key)) return false;
      seenKeys.add(metric.key);
      return true;
    }),
  })).filter((group) => group.metrics.length > 0);

  return (
    <div className="mt-4 border-t border-slate-200 pt-4" aria-live="polite">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-900">Team comparison</p>
        <span className="bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
          {CFB_PROVENANCE.label} · advanced stats {statsLabel}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(300px,1.5fr)_minmax(0,1fr)]">
        {[left, right].map((team, index) => (
          <div
            key={team.id}
            data-testid={index === 0 ? "comparison-team-a" : "comparison-team-b"}
            className={cn(
              "flex items-center gap-3",
              index === 1 && "md:col-start-3 md:row-start-1 md:flex-row-reverse md:text-right",
            )}
          >
            <CollegeFootballTeamLogo
              name={team.name}
              logo={team.logo}
              abbreviation={team.abbreviation}
              primaryColor={team.primaryColor}
            />
            <div>
              <p className="font-bold text-slate-950">{team.name}</p>
              <p className="text-xs text-slate-500">JKB #{team.ratings.jkbRank ?? "—"}</p>
            </div>
          </div>
        ))}
        <div className="overflow-hidden border border-slate-200 md:col-start-2 md:row-start-1">
          <table className="w-full text-xs" aria-label="Team comparison">
            {groups.map(({ definition, metrics }) => (
              <tbody key={definition.id} aria-label={`${definition.label} comparison`}>
                <tr className="bg-slate-100">
                  <th colSpan={3} scope="colgroup" className="px-2 py-1.5 text-center text-xs font-black uppercase tracking-wide text-slate-700">
                    {definition.label}
                    {definition.usesSeasonStats && (
                      <span className="ml-2 font-bold text-slate-500">{statsLabel}</span>
                    )}
                  </th>
                </tr>
                {metrics.map((metric) => {
                  const leftRank = metric.readRank(left, context);
                  const rightRank = metric.readRank(right, context);
                  return (
                    <tr key={metric.key} className="border-t border-slate-100">
                      <td className="w-[32%] px-2 py-2 text-right font-bold tabular-nums text-slate-950">
                        {metric.format(metric.readValue(left, context))}
                        {metric.heat && leftRank != null && (
                          <span className="ml-1 text-xs font-medium text-slate-500">FBS #{leftRank}</span>
                        )}
                      </td>
                      <th scope="row" className="w-[36%] bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {metric.shortLabel}
                      </th>
                      <td className="w-[32%] px-2 py-2 font-bold tabular-nums text-slate-950">
                        {metric.format(metric.readValue(right, context))}
                        {metric.heat && rightRank != null && (
                          <span className="ml-1 text-xs font-medium text-slate-500">FBS #{rightRank}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </div>
  );
}

export default function CollegeFootballRankings() {
  const teams = useMemo(() => sortRankings(getAllTeams()), []);
  const [scope, setScope] = useState<TeamScope>("all");
  const [conference, setConference] = useState<CfbConferenceId>("sec");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<RatingsView>("power");
  const [display, setDisplay] = useState<RatingsDisplay>("values");
  const [teamA, setTeamA] = useState(teams[0]?.id ?? "");
  const [teamB, setTeamB] = useState(teams[1]?.id ?? "");
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [quickConference, setQuickConference] = useState<CfbConferenceId>("sec");
  const [topMatchupId, setTopMatchupId] = useState("");
  const [conferenceMatchupId, setConferenceMatchupId] = useState("");

  usePageSeo({
    title: "2026 Power Ratings & Advanced Stats | College Football | Joe Knows Ball",
    description: "JKB College Football team strength, efficiency, schedule, and situational analytics.",
    path: "/college-football/rankings",
  });

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const scheduledFbsGames = useMemo(
    () => CFB_GAMES_2026.filter(
      (game) => teamById.has(game.awayTeamId) && teamById.has(game.homeTeamId),
    ),
    [teamById],
  );
  const topMatchups = scheduledFbsGames.filter(
    (game) => (teamById.get(game.awayTeamId)?.ratings.jkbRank ?? 999) <= 25
      && (teamById.get(game.homeTeamId)?.ratings.jkbRank ?? 999) <= 25,
  );
  const conferenceMatchups = scheduledFbsGames.filter(
    (game) => teamById.get(game.awayTeamId)?.conference === quickConference
      && teamById.get(game.homeTeamId)?.conference === quickConference,
  );
  const filtered = useMemo(() => {
    const scoped = scope === "top25"
      ? teams.filter((team) => (team.ratings.jkbRank ?? 999) <= 25)
      : scope === "conference"
        ? filterByConference(teams, conference)
        : teams;
    const normalized = query.trim().toLowerCase();
    return scoped.filter(
      (team) => !normalized
        || `${team.name} ${team.mascot} ${team.abbreviation}`.toLowerCase().includes(normalized),
    );
  }, [teams, scope, conference, query]);
  const compared = compareIds
    ? [teamById.get(compareIds[0]), teamById.get(compareIds[1])]
    : [];
  const statsSeason = CFB_STATS_2026_HAS_DATA ? 2026 : 2025;
  const activeDefinition = getRatingsViewDefinition(view);

  const chooseGame = (gameId: string, source: "top" | "conference") => {
    const game = scheduledFbsGames.find((item) => item.id === gameId);
    if (!game) return;
    setTopMatchupId(source === "top" ? gameId : "");
    setConferenceMatchupId(source === "conference" ? gameId : "");
    setTeamA(game.awayTeamId);
    setTeamB(game.homeTeamId);
    setCompareIds([game.awayTeamId, game.homeTeamId]);
  };

  return (
    <div className="space-y-5">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-black uppercase tracking-[-0.03em] text-slate-950 sm:text-3xl">
          College Football
        </h1>
        <p className="mt-1 text-base font-bold uppercase tracking-wide text-slate-700">
          2026 Power Ratings &amp; Advanced Stats
        </p>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          JKB team strength, efficiency, schedule and situational analytics.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[100px_minmax(200px,1fr)_160px_220px]">
          <label className="sr-only" htmlFor="cfb-season">Season</label>
          <select id="cfb-season" value="2026" disabled className="h-10 border border-slate-300 bg-slate-100 px-3 text-sm font-bold text-slate-700 disabled:opacity-100">
            <option>2026</option>
          </select>
          <label className="relative block">
            <span className="sr-only">Search teams</span>
            <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search teams…"
              className="h-10 w-full border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label>
            <span className="sr-only">Team field</span>
            <select
              aria-label="Team field"
              value={scope}
              onChange={(event) => setScope(event.target.value as TeamScope)}
              className="h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">All FBS</option>
              <option value="top25">Top 25</option>
              <option value="conference">Conference</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Conference</span>
            <select
              aria-label="Conference"
              value={conference}
              disabled={scope !== "conference"}
              onChange={(event) => setConference(event.target.value as CfbConferenceId)}
              className="h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-500"
            >
              {CFB_CONFERENCE_ORDER.map((id) => (
                <option key={id} value={id}>{CFB_CONFERENCES[id].name}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <nav aria-label="Rating category" className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px">
        {RATINGS_VIEW_DEFINITIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => setView(item.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
              view === item.id
                ? "border-sky-700 text-sky-900"
                : "border-transparent text-slate-500 hover:text-slate-900",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section aria-labelledby="compare-heading" className="border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Swords aria-hidden className="h-4 w-4 text-sky-800" />
          <h2 id="compare-heading" className="text-sm font-black uppercase tracking-wide text-slate-950">
            Compare Teams
          </h2>
        </div>
        <div className="mt-3 grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
          <select aria-label="Team A" value={teamA} onChange={(event) => setTeamA(event.target.value)} className="h-10 border border-slate-300 bg-white px-3 text-sm font-semibold">
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <span className="text-center text-xs font-black uppercase tracking-widest text-slate-500">vs</span>
          <select aria-label="Team B" value={teamB} onChange={(event) => setTeamB(event.target.value)} className="h-10 border border-slate-300 bg-white px-3 text-sm font-semibold">
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <button
            type="button"
            disabled={!teamA || !teamB || teamA === teamB}
            onClick={() => setCompareIds([teamA, teamB])}
            className="inline-flex h-10 items-center justify-center gap-2 bg-[#071b36] px-5 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Compare <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 lg:grid-cols-2">
          <label className="grid gap-1 sm:grid-cols-[125px_1fr] sm:items-center">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Top 25 matchups</span>
            <select
              aria-label="Top 25 matchups"
              value={topMatchupId}
              onChange={(event) => {
                chooseGame(event.target.value, "top");
              }}
              className="h-9 border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="" disabled>Select matchup…</option>
              {topMatchups.map((game) => (
                <option key={game.id} value={game.id}>
                  {teamById.get(game.awayTeamId)?.shortName} vs {teamById.get(game.homeTeamId)?.shortName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
            <select
              aria-label="Quick matchup conference"
              value={quickConference}
              onChange={(event) => {
                setQuickConference(event.target.value as CfbConferenceId);
                setConferenceMatchupId("");
              }}
              className="h-9 border border-slate-300 bg-white px-2 text-xs font-semibold"
            >
              {CFB_CONFERENCE_ORDER.map((id) => (
                <option key={id} value={id}>{CFB_CONFERENCES[id].shortName}</option>
              ))}
            </select>
            <select
              aria-label="Conference matchup"
              value={conferenceMatchupId}
              onChange={(event) => {
                chooseGame(event.target.value, "conference");
              }}
              className="h-9 border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="" disabled>Select conference matchup…</option>
              {conferenceMatchups.map((game) => (
                <option key={game.id} value={game.id}>
                  {teamById.get(game.awayTeamId)?.shortName} vs {teamById.get(game.homeTeamId)?.shortName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {compared[0] && compared[1] && (
          <MatchupSnapshot
            left={compared[0]}
            right={compared[1]}
            allTeams={teams}
            statsSeason={statsSeason}
          />
        )}
      </section>

      <section aria-labelledby="ratings-table-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="ratings-table-heading" className="text-lg font-black text-slate-950">
                {activeDefinition.label}
              </h2>
              {activeDefinition.usesSeasonStats && (
                <span className="bg-slate-200 px-2 py-1 text-xs font-black uppercase tracking-wide text-slate-800">
                  {statsSeason} {statsSeason === 2025 ? "FINAL" : "season to date"} stats
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Showing {filtered.length} team{filtered.length === 1 ? "" : "s"}
              {!activeDefinition.usesSeasonStats && ` · ${CFB_PROVENANCE.label}`}
            </p>
          </div>
          <div role="group" aria-label="Display values or ranks" className="inline-flex border border-slate-300 bg-slate-100 p-0.5">
            {(["values", "ranks"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={display === option}
                onClick={() => setDisplay(option)}
                className={cn(
                  "min-h-9 px-3 py-1.5 text-xs font-bold uppercase tracking-wide",
                  display === option ? "bg-[#071b36] text-white" : "text-slate-600 hover:text-slate-950",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <CollegeFootballRatingsMatrix
          teams={filtered}
          allTeams={teams}
          view={view}
          display={display}
          statsSeason={statsSeason}
        />
        <p className="text-xs leading-5 text-slate-500">
          Cell color reflects national FBS rank; green indicates stronger performance and red indicates weaker performance. Missing values remain neutral and unranked.
          {activeDefinition.usesSeasonStats && statsSeason === 2025 && " These are 2025 final statistics, not 2026 current-season results."}
        </p>
      </section>

      <CollegeFootballDataNotice kind="ratings" />
    </div>
  );
}
