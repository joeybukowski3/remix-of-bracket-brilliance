import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflDfsUploadPanel from "@/components/nfl/dfs/NflDfsUploadPanel";
import NflDfsSlateSummary from "@/components/nfl/dfs/NflDfsSlateSummary";
import NflDfsAnalyzerTable from "@/components/nfl/dfs/NflDfsAnalyzerTable";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useWeeklyFantasyProjectionArtifact } from "@/hooks/useWeeklyFantasyProjectionArtifact";
import { useWeeklyFantasyResearchArtifact } from "@/hooks/useWeeklyFantasyResearchArtifact";
import { resolveNflWeekSelection } from "@/lib/nfl/weekSelection";
import { WEEKLY_RANKINGS_SEASON } from "@/lib/fantasy/weeklyRankings";
import { getSeoMeta } from "@/lib/seo";
import { assessDfsSlateCompatibility } from "@/lib/nfl/dfs/artifactCompatibility";
import { isDraftKingsOffensiveRow, resolveOffensiveIdentity } from "@/lib/nfl/dfs/identity";
import { assessDfsResearch } from "@/lib/nfl/dfs/research";
import { buildDfsSlateAnalysis, enrichDfsSlateAnalysis } from "@/lib/nfl/dfs/slateAnalyzer";
import type { DraftKingsNflClassicParseResult } from "@/lib/nfl/dfs/contracts";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";

const EMPTY_PROJECTION_ROWS: readonly WeeklyFantasyProjectionProductionRow[] = [];

export default function NFLDfsContestAnalyzer() {
  const seo = getSeoMeta("nfl-dfs");
  usePageSeo({ title: seo.title, description: seo.description, path: seo.path, noindex: seo.noindex ?? false });

  const [searchParams, setSearchParams] = useSearchParams();
  const season = useNflSeasonData(WEEKLY_RANKINGS_SEASON);
  const games = season.data?.games;
  const teams = season.data?.teams ?? [];
  const weekSelection = useMemo(() => resolveNflWeekSelection(games ?? [], { search: searchParams }), [games, searchParams]);
  const weeks = weekSelection.availableWeeks;
  const week = weekSelection.week;
  const selectedWeek = week ?? weeks[0] ?? 1;

  const projection = useWeeklyFantasyProjectionArtifact(WEEKLY_RANKINGS_SEASON, selectedWeek);
  const research = useWeeklyFantasyResearchArtifact(WEEKLY_RANKINGS_SEASON, selectedWeek);

  const [parseResult, setParseResult] = useState<DraftKingsNflClassicParseResult | null>(null);

  const projectionArtifact = projection.status === "ready" ? projection.artifact : null;
  const researchArtifact = research.status === "ready" ? research.artifact : null;
  const projectionRows = useMemo<readonly WeeklyFantasyProjectionProductionRow[]>(() => {
    if (!projectionArtifact) return EMPTY_PROJECTION_ROWS;
    return [...projectionArtifact.rows.QB, ...projectionArtifact.rows.RB, ...projectionArtifact.rows.WR, ...projectionArtifact.rows.TE];
  }, [projectionArtifact]);

  const enrichedAnalysis = useMemo(() => {
    if (!parseResult?.accepted) return null;
    const dkRows = parseResult.rows;
    const offensiveResolutions = dkRows.filter(isDraftKingsOffensiveRow).map((row) => resolveOffensiveIdentity(row, projectionRows));
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows, teams });
    const researchAssessment = assessDfsResearch(projectionRows, researchArtifact, WEEKLY_RANKINGS_SEASON, selectedWeek);
    const compatibility = assessDfsSlateCompatibility({
      dkRows,
      selectedSeason: WEEKLY_RANKINGS_SEASON,
      selectedWeek,
      projectionArtifact,
      researchArtifact,
      canonicalGames: games ?? [],
      offensiveIdentityResolutions: offensiveResolutions,
    });
    return enrichDfsSlateAnalysis(analysis, researchAssessment, compatibility);
  }, [parseResult, projectionRows, teams, researchArtifact, projectionArtifact, games, selectedWeek]);

  if (week === null) {
    return (
      <>
        <NflPageHeader eyebrow="Fantasy · DFS" title="NFL DFS Contest Analyzer" description="No regular-season schedule is available yet." />
        <section role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">No regular-season schedule is available yet.</section>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <NflPageHeader
        eyebrow="Fantasy · DFS Contest Analyzer"
        title="NFL DFS Contest Analyzer"
        description="Upload a DraftKings NFL Classic salary CSV to compare DK pricing with Joe Knows Ball weekly Full PPR projections and research."
      >
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span>Week</span>
          <select
            aria-label="Select week"
            value={week}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              next.set("week", event.target.value);
              setSearchParams(next);
            }}
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900"
          >
            {(weeks.length > 0 ? weeks : [week]).map((option) => <option key={option} value={option}>Week {option}</option>)}
          </select>
        </label>
      </NflPageHeader>

      {!enrichedAnalysis && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Analyzing against <strong className="text-slate-900">JKB Week {selectedWeek}</strong> Full PPR projections.
        </p>
      )}

      <NflDfsUploadPanel onResult={setParseResult} />

      {enrichedAnalysis && (
        <>
          <NflDfsSlateSummary analysis={enrichedAnalysis} season={WEEKLY_RANKINGS_SEASON} week={selectedWeek} />
          <NflDfsAnalyzerTable rows={enrichedAnalysis.rows} />
        </>
      )}
    </div>
  );
}
