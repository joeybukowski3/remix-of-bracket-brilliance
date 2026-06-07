import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaCourseInsightsCard from "@/components/pga/PgaCourseInsightsCard";
import PgaFooterMeta from "@/components/pga/PgaFooterMeta";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import PgaMainHeader from "@/components/pga/PgaMainHeader";
import PgaModelTable from "@/components/pga/PgaModelTable";
import PgaSidebar from "@/components/pga/PgaSidebar";
import PgaTopProjectionsCard from "@/components/pga/PgaTopProjectionsCard";
import { usePgaTournamentPlayers } from "@/hooks/usePgaTournamentPlayers";
import { usePageSeo } from "@/hooks/usePageSeo";
import { areWeightsEqual, buildTournamentMeta, getTopProjections, rankPlayersByScore } from "@/lib/pga/modelEngine";
import { detectActivePreset, getStoredPgaActivePreset, getStoredPgaAppliedWeights, getWeightsForPreset, storePgaActivePreset, storePgaAppliedWeights } from "@/lib/pga/pgaWeights";
import { FEATURED_PGA_TOURNAMENT, getFeaturedPgaHubContext, getPgaTournamentBySlug } from "@/lib/pga/tournaments";
import { type PgaWeights } from "@/lib/pga/pgaTypes";
import { getTournamentModelPath, getTournamentPicksPath } from "@/lib/pga/tournamentConfig";
import { buildPgaModelTableConfig } from "@/lib/pga/tournamentUi";
import NotFound from "@/pages/NotFound";

export default function PGAModel() {
  usePageSeo(getSeoMeta("pga-model"));
  const { tournamentSlug } = useParams();
  const featuredHub = getFeaturedPgaHubContext();
  const requestedTournament = tournamentSlug ? getPgaTournamentBySlug(tournamentSlug) : FEATURED_PGA_TOURNAMENT;
  const tournament = requestedTournament ?? FEATURED_PGA_TOURNAMENT;
  const isMissingTournament = Boolean(tournamentSlug) && !requestedTournament;

  const { players, status, errorMessage } = usePgaTournamentPlayers(tournament);

  // Load the permanent, reliable model config (presets + weights) from a static JSON file.
  // This allows the sliders + preset dropdown to be driven by the official tournament formulas
  // even when the full player dataset is not yet available.
  const [modelConfig, setModelConfig] = useState<any>(null);
  const [modelConfigLoaded, setModelConfigLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadModelConfig() {
      try {
        const configPath = `/data/pga/${tournament.slug}-model-config.json`;
        const res = await fetch(configPath, { cache: "no-store" });
        if (!res.ok) throw new Error("Model config not found");
        const data = await res.json();
        if (active) setModelConfig(data);
      } catch {
        if (active) setModelConfig(null);
      } finally {
        if (active) setModelConfigLoaded(true);
      }
    }
    void loadModelConfig();
    return () => { active = false; };
  }, [tournament.slug]);

  // Always have a safe set of presets so the sliders and dropdown can render.
  // Prefer the permanent JSON config; fall back to the embedded tournament data as placeholder.
  const activePresets = (modelConfig?.presets?.length ? modelConfig.presets : (tournament.model?.presets || [])) as any[];

  const defaultWeights = (activePresets[0]?.weights ?? tournament.model.presets[0].weights) as PgaWeights;

  const initialWeights = useMemo(() => getStoredPgaAppliedWeights(tournament.slug, defaultWeights), [tournament.slug, defaultWeights]);
  const initialPreset = useMemo(
    () => detectActivePreset(initialWeights, activePresets) ?? getStoredPgaActivePreset(tournament.slug, activePresets) ?? activePresets[0]?.key,
    [initialWeights, tournament.slug, activePresets],
  );

  const [draftWeights, setDraftWeights] = useState<PgaWeights>(initialWeights);
  const [appliedWeights, setAppliedWeights] = useState<PgaWeights>(initialWeights);
  const [selectedPreset, setSelectedPreset] = useState(initialPreset);
  const [isFullPage, setIsFullPage] = useState(false);

  // Track whether we've applied the real config from the JSON so we can
  // keep the loading screen up until the state is fully consistent.
  const hasAppliedRealConfig = useRef(false);
  const [realConfigApplied, setRealConfigApplied] = useState(false);

  useEffect(() => {
    if (modelConfigLoaded && modelConfig && !hasAppliedRealConfig.current) {
      const realPresets = modelConfig.presets || [];
      if (realPresets.length > 0) {
        const defaultKey = realPresets[0].key;
        const newWeights = getWeightsForPreset(realPresets, defaultKey);
        setDraftWeights(newWeights);
        setAppliedWeights(newWeights);
        setSelectedPreset(defaultKey);
        hasAppliedRealConfig.current = true;
        setRealConfigApplied(true);
      }
    }
  }, [modelConfigLoaded, modelConfig]);

  const picksPath = tournamentSlug ? getTournamentPicksPath(tournament) : featuredHub.picksPath;
  const modelPath = tournamentSlug ? getTournamentModelPath(tournament) : featuredHub.modelPath;

  usePageSeo({
    title: `${tournament.name} ${tournament.season} PGA Model Picks`,
    description: `Interactive PGA model picks for ${tournament.name} ${tournament.season} with weighted stats, course history, and form-driven rankings.`,
    path: modelPath,
    noindex: tournament.indexable === false,
  });

  useEffect(() => {
    storePgaAppliedWeights(tournament.slug, appliedWeights);
  }, [appliedWeights, tournament.slug]);

  useEffect(() => {
    const detectedPreset = detectActivePreset(appliedWeights, activePresets);
    storePgaActivePreset(tournament.slug, detectedPreset ?? selectedPreset);
  }, [appliedWeights, selectedPreset, tournament.slug, activePresets]);

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
  const activePreset = useMemo(() => detectActivePreset(appliedWeights, activePresets), [appliedWeights, activePresets]);
  const draftPreset = useMemo(() => detectActivePreset(draftWeights, activePresets), [draftWeights, activePresets]);
  const tableConfig = useMemo(() => buildPgaModelTableConfig(tournament), [tournament]);
  if (isMissingTournament) {
    return <NotFound />;
  }

  function applyDraftWeights() {
    setAppliedWeights({ ...draftWeights });
    const detectedPreset = detectActivePreset(draftWeights, activePresets);
    if (detectedPreset) {
      setSelectedPreset(detectedPreset);
    }
  }

  function resetToPreset() {
    const nextWeights = { ...defaultWeights };
    setDraftWeights(nextWeights);
    setAppliedWeights(nextWeights);
    setSelectedPreset(activePresets[0]?.key);
  }

  function updateWeight(key: keyof PgaWeights, value: number) {
    setDraftWeights((current) => ({ ...current, [key]: value }));
  }

  function selectPreset(presetKey: string) {
    const nextWeights = getWeightsForPreset(activePresets, presetKey);
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
            <a href="/pga" className="text-sm text-primary transition hover:text-primary/80">← Back to Power Rankings</a>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">PGA Model Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The detailed tournament model data for {tournament.shortName || tournament.name} isn't available right now.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorMessage || "The weekly field export for this event hasn't been processed yet."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href="/pga" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                Back to Power Rankings
              </a>
              <a href="/pga/best-bets" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
                View Best Bets
              </a>
            </div>
          </div>
        </div>
      </SiteShell>
    );
  }

  // Simplified for reliability: always render the full model page.
  // We use the embedded tournament presets (or the loaded JSON if available) as "placeholder"
  // configuration so the sliders and preset dropdown work immediately.
  // The table will show whatever player data exists (real or starter/placeholder).


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
            presetOptions={activePresets}
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">

            {/* ── Sidebar: nav + top picks + course insights ── */}
            <aside className="order-2 xl:order-1 xl:sticky xl:top-6 xl:self-start space-y-4">
              <PgaSidebar hubPath={featuredHub.hubPath} picksPath={picksPath} modelPath={modelPath} />
              <PgaTopProjectionsCard rows={topProjections} />
              <PgaCourseInsightsCard insights={tournament.model.courseInsights} />
            </aside>

            {/* ── Main: breadcrumb → header → model table ── */}
            <section className="order-1 min-w-0 xl:order-2">
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <a href="/pga" className="font-semibold text-emerald-700 hover:underline">⛳ Power Rankings</a>
                  <span>›</span>
                  <span>{tournament.shortName || tournament.name}</span>
                </div>
                <PgaMainHeader meta={meta} />

                {withheldPlayerCount > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card px-4 py-3 text-xs text-muted-foreground">
                    {withheldPlayerCount} field entrants excluded — stat profiles not yet available.
                  </div>
                )}

                {players.length === 0 && status === "ready" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    Player data not loaded yet. Sliders and presets are functional — rankings appear once field data is available.
                  </div>
                )}

                <PgaModelTable
                  rows={rows}
                  tableConfig={tableConfig}
                  onExpandFullPage={() => setIsFullPage(true)}
                  draftWeights={draftWeights}
                  appliedWeights={appliedWeights}
                  selectedPreset={selectedPreset}
                  activePreset={activePreset}
                  draftPreset={draftPreset}
                  presetOptions={activePresets}
                  onPresetSelect={selectPreset}
                  onWeightChange={updateWeight}
                  onApply={applyDraftWeights}
                  onReset={resetToPreset}
                />
                <PgaFooterMeta hubPath={featuredHub.hubPath} tournamentPath={picksPath} tournamentLabel={tournament.shortName} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
