import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaCourseInsightsCard from "@/components/pga/PgaCourseInsightsCard";
import PgaFooterMeta from "@/components/pga/PgaFooterMeta";
import PgaMainHeader from "@/components/pga/PgaMainHeader";
import PgaModelTable from "@/components/pga/PgaModelTable";
import PgaSidebar from "@/components/pga/PgaSidebar";
import PgaTopProjectionsCard from "@/components/pga/PgaTopProjectionsCard";
import { usePgaTournamentPlayers } from "@/hooks/usePgaTournamentPlayers";
import { usePageSeo } from "@/hooks/usePageSeo";
import { areWeightsEqual, buildTournamentMeta, getTopProjections, rankPlayersByScore } from "@/lib/pga/modelEngine";
import { detectActivePreset, getStoredPgaActivePreset, getStoredPgaAppliedWeights, getWeightsForPreset, storePgaActivePreset, storePgaAppliedWeights } from "@/lib/pga/pgaWeights";
import { FEATURED_PGA_TOURNAMENT, getPgaTournamentBySlug } from "@/lib/pga/tournaments";
import { type PgaWeights } from "@/lib/pga/pgaTypes";
import { getTournamentModelPath, getTournamentPicksPath } from "@/lib/pga/tournamentConfig";
import { buildPgaModelTableConfig } from "@/lib/pga/tournamentUi";
import NotFound from "@/pages/NotFound";

export default function PGAModel() {
  const { tournamentSlug } = useParams();
  const requestedTournament = tournamentSlug ? getPgaTournamentBySlug(tournamentSlug) : FEATURED_PGA_TOURNAMENT;
  const tournament = requestedTournament ?? FEATURED_PGA_TOURNAMENT;
  const isMissingTournament = Boolean(tournamentSlug) && !requestedTournament;

  const defaultWeights = tournament.model.presets[0].weights;
  const initialWeights = useMemo(() => getStoredPgaAppliedWeights(tournament.slug, defaultWeights), [tournament.slug, defaultWeights]);
  const initialPreset = useMemo(
    () => detectActivePreset(initialWeights, tournament.model.presets) ?? getStoredPgaActivePreset(tournament.slug, tournament.model.presets) ?? tournament.model.presets[0].key,
    [initialWeights, tournament.slug, tournament.model.presets],
  );

  const { players, status, errorMessage } = usePgaTournamentPlayers(tournament);
  const [draftWeights, setDraftWeights] = useState<PgaWeights>(initialWeights);
  const [appliedWeights, setAppliedWeights] = useState<PgaWeights>(initialWeights);
  const [selectedPreset, setSelectedPreset] = useState(initialPreset);
  const [isFullPage, setIsFullPage] = useState(false);

  usePageSeo({
    title: `${tournament.name} ${tournament.season} PGA Model Picks`,
    description: `Interactive PGA model picks for ${tournament.name} ${tournament.season} with weighted stats, course history, and form-driven rankings.`,
    path: getTournamentModelPath(tournament),
    noindex: tournament.indexable === false,
  });

  useEffect(() => {
    storePgaAppliedWeights(tournament.slug, appliedWeights);
  }, [appliedWeights, tournament.slug]);

  useEffect(() => {
    const detectedPreset = detectActivePreset(appliedWeights, tournament.model.presets);
    storePgaActivePreset(tournament.slug, detectedPreset ?? selectedPreset);
  }, [appliedWeights, selectedPreset, tournament.slug, tournament.model.presets]);

  useEffect(() => {
    document.body.style.overflow = isFullPage ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullPage]);

  const rows = useMemo(
    () => rankPlayersByScore(players, appliedWeights, tournament.manual?.playerAdjustments),
    [players, appliedWeights, tournament.manual?.playerAdjustments],
  );
  const withheldPlayerCount = Math.max(players.length - rows.length, 0);
  const topProjections = useMemo(() => getTopProjections(rows, tournament), [rows, tournament]);
  const meta = useMemo(() => buildTournamentMeta(tournament, players.length), [tournament, players.length]);
  const hasDraftChanges = useMemo(() => !areWeightsEqual(draftWeights, appliedWeights), [draftWeights, appliedWeights]);
  const activePreset = useMemo(() => detectActivePreset(appliedWeights, tournament.model.presets), [appliedWeights, tournament.model.presets]);
  const draftPreset = useMemo(() => detectActivePreset(draftWeights, tournament.model.presets), [draftWeights, tournament.model.presets]);
  const tableConfig = useMemo(() => buildPgaModelTableConfig(tournament), [tournament]);
  const picksPath = getTournamentPicksPath(tournament);
  const modelPath = getTournamentModelPath(tournament);

  if (isMissingTournament) {
    return <NotFound />;
  }

  function applyDraftWeights() {
    setAppliedWeights({ ...draftWeights });
    const detectedPreset = detectActivePreset(draftWeights, tournament.model.presets);
    if (detectedPreset) {
      setSelectedPreset(detectedPreset);
    }
  }

  function resetToPreset() {
    const nextWeights = { ...defaultWeights };
    setDraftWeights(nextWeights);
    setAppliedWeights(nextWeights);
    setSelectedPreset(tournament.model.presets[0].key);
  }

  function updateWeight(key: keyof PgaWeights, value: number) {
    setDraftWeights((current) => ({ ...current, [key]: value }));
  }

  function selectPreset(presetKey: string) {
    const nextWeights = getWeightsForPreset(tournament.model.presets, presetKey);
    setSelectedPreset(presetKey);
    setDraftWeights(nextWeights);
    setAppliedWeights(nextWeights);
  }

  if (status === "loading") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-[32px] bg-card p-8 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
            <a href={picksPath} className="text-sm text-primary transition hover:text-primary/80">PGA best bets</a>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">PGA Model Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">Loading {tournament.shortName} model data...</p>
          </div>
        </div>
      </SiteShell>
    );
  }

  if (status === "error") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-[32px] bg-card p-8 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
            <a href={picksPath} className="text-sm text-primary transition hover:text-primary/80">PGA best bets</a>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">PGA Model Dashboard</h1>
            <p className="mt-2 text-sm text-destructive">Unable to load tournament player data.</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      </SiteShell>
    );
  }

  if (status === "ready" && players.length === 0) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-[32px] bg-card p-8 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">PGA Model Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">The model loaded, but there are no golfers in the current dataset.</p>
          </div>
        </div>
      </SiteShell>
    );
  }

  if (isFullPage) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-[-0.02em] text-foreground">{tournament.model.courseHistoryDisplay} Model</span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{rows.length} golfers</span>
            {hasDraftChanges ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Unsaved weight changes
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {hasDraftChanges ? (
              <button type="button" onClick={applyDraftWeights} className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                Apply Weights
              </button>
            ) : null}
            <button type="button" onClick={() => setIsFullPage(false)} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent">
              Exit Full Page
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <PgaModelTable
            rows={rows}
            tableConfig={tableConfig}
            isFullPage
            draftWeights={draftWeights}
            appliedWeights={appliedWeights}
            selectedPreset={selectedPreset}
            activePreset={activePreset}
            draftPreset={draftPreset}
            presetOptions={tournament.model.presets}
            onPresetSelect={selectPreset}
            onWeightChange={updateWeight}
            onApply={applyDraftWeights}
            onReset={resetToPreset}
          />
        </div>
      </div>
    );
  }

  return (
    <SiteShell>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
            <section className="order-1 min-w-0 xl:order-2">
              <div className="space-y-6">
                <PgaMainHeader meta={meta} />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <PgaTopProjectionsCard rows={topProjections} />
                  <PgaCourseInsightsCard insights={tournament.model.courseInsights} />
                </div>
                {withheldPlayerCount > 0 ? (
                  <div className="rounded-[24px] border border-border/60 bg-card px-5 py-4 text-sm leading-7 text-muted-foreground shadow-[0_10px_24px_hsl(var(--foreground)/0.04)]">
                    {withheldPlayerCount} field entrants are currently excluded from the scored model because the active source feed does not yet provide a usable stat profile for them. They remain part of the tracked field, but they are not allowed to distort rankings with fake fallback values.
                  </div>
                ) : null}
                <PgaModelTable
                  rows={rows}
                  tableConfig={tableConfig}
                  onExpandFullPage={() => setIsFullPage(true)}
                  draftWeights={draftWeights}
                  appliedWeights={appliedWeights}
                  selectedPreset={selectedPreset}
                  activePreset={activePreset}
                  draftPreset={draftPreset}
                  presetOptions={tournament.model.presets}
                  onPresetSelect={selectPreset}
                  onWeightChange={updateWeight}
                  onApply={applyDraftWeights}
                  onReset={resetToPreset}
                />
                <PgaFooterMeta tournamentPath={picksPath} tournamentLabel={tournament.shortName} />
              </div>
            </section>
            <aside className="order-2 xl:order-1 xl:sticky xl:top-24 xl:self-start">
              <PgaSidebar picksPath={picksPath} modelPath={modelPath} />
            </aside>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
