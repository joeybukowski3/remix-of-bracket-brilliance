import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaModelTable from "@/components/pga/PgaModelTable";
import PgaCourseHistoryTable from "@/components/pga/PgaCourseHistoryTable";
import { usePgaTournamentPlayers } from "@/hooks/usePgaTournamentPlayers";
import { usePageSeo } from "@/hooks/usePageSeo";
import { rankPlayersByScore } from "@/lib/pga/modelEngine";
import { getStoredPgaAppliedWeights } from "@/lib/pga/pgaWeights";
import { FEATURED_PGA_TOURNAMENT, getFeaturedPgaHubContext, getPgaTournamentBySlug } from "@/lib/pga/tournaments";
import { getTournamentModelPath, getTournamentModelTablePath } from "@/lib/pga/tournamentConfig";
import { buildPgaModelTableConfig } from "@/lib/pga/tournamentUi";
import NotFound from "@/pages/NotFound";

type TableView = "model" | "courseHistory";

export default function PGAModelTableView() {
  const { tournamentSlug } = useParams();
  const featuredHub = getFeaturedPgaHubContext();
  const requestedTournament = tournamentSlug ? getPgaTournamentBySlug(tournamentSlug) : FEATURED_PGA_TOURNAMENT;
  const tournament = requestedTournament ?? FEATURED_PGA_TOURNAMENT;
  const isMissingTournament = Boolean(tournamentSlug) && !requestedTournament;
  const [activeView, setActiveView] = useState<TableView>("model");

  const { players, status, errorMessage } = usePgaTournamentPlayers(tournament);
  const appliedWeights = useMemo(() => getStoredPgaAppliedWeights(tournament.slug, tournament.model.presets[0].weights), [tournament.slug, tournament.model.presets]);
  const rows = useMemo(
    () => rankPlayersByScore(players, appliedWeights, tournament.manual?.playerAdjustments),
    [players, appliedWeights, tournament.manual?.playerAdjustments],
  );

  const courseHistoryRows = useMemo(
    () => [...rows]
      .filter((r) => r.courseHistoryRounds != null && r.courseHistoryRounds > 0)
      .sort((a, b) => (b.courseHistoryScore ?? -99) - (a.courseHistoryScore ?? -99)),
    [rows],
  );

  const withheldPlayerCount = Math.max(players.length - rows.length, 0);
  const modelPath = tournamentSlug ? getTournamentModelPath(tournament) : featuredHub.modelPath;
  const tablePath = tournamentSlug ? getTournamentModelTablePath(tournament) : `${featuredHub.modelPath}/table`;
  const tableConfig = useMemo(() => buildPgaModelTableConfig(tournament), [tournament]);

  const YEARS = ["2025", "2024", "2023", "2022", "2021"] as const;

  usePageSeo({
    title: `${tournament.name} ${tournament.season} Full Model Table`,
    description: `Full-width ${tournament.name} ${tournament.season} PGA model table with all ranking columns visible.`,
    path: tablePath,
    noindex: true,
  });

  if (isMissingTournament) {
    return <NotFound />;
  }

  const tabs: Array<{ key: TableView; label: string }> = [
    { key: "model", label: "Model Rankings" },
    { key: "courseHistory", label: `${tournament.model.courseHistoryDisplay} History` },
  ];

  return (
    <SiteShell>
      <main className="site-page pb-12 pt-10">
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <section className="surface-card">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                <a href="/pga" className="font-semibold text-emerald-700 hover:underline">⛳ Power Rankings</a>
                <span>›</span>
                <Link to={modelPath} className="text-emerald-700 hover:underline">{tournament.shortName || tournament.name}</Link>
                <span>›</span>
                <span>Full Table</span>
              </div>
              <Link to={modelPath} className="text-sm text-primary transition hover:text-primary/80">
                Back to PGA model dashboard
              </Link>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-foreground">{tournament.name} Full Model Table</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                This view is optimized for scanning the full table with every column visible at once. It uses the most recently applied model weights from the dashboard.
              </p>
              {withheldPlayerCount > 0 ? (
                <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {withheldPlayerCount} field entrants are currently withheld from the scored table because the source feed does not yet provide a complete stat profile for them.
                </p>
              ) : null}

              {/* View tabs */}
              <div className="mt-4 flex gap-1 rounded-lg bg-secondary/50 p-1 w-fit">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveView(tab.key)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                      activeView === tab.key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </section>

            {status === "loading" ? <section className="surface-card"><p className="text-sm text-muted-foreground">Loading full table view...</p></section> : null}
            {status === "error" ? <section className="surface-card"><p className="text-sm text-destructive">Unable to load tournament player data.</p><p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p></section> : null}
            {status === "ready" && activeView === "model" ? <PgaModelTable rows={rows} tableConfig={tableConfig} /> : null}
            {status === "ready" && activeView === "courseHistory" ? (
              <PgaCourseHistoryTable
                rows={courseHistoryRows}
                courseName={tournament.model.courseHistoryDisplay}
                years={YEARS}
              />
            ) : null}
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
