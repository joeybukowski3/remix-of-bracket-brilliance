import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaCourseInsightsCard from "@/components/pga/PgaCourseInsightsCard";
import PgaFooterMeta from "@/components/pga/PgaFooterMeta";
import PgaMainHeader from "@/components/pga/PgaMainHeader";
import PgaModelTable from "@/components/pga/PgaModelTable";
import PgaSidebar from "@/components/pga/PgaSidebar";
import PgaTopProjectionsCard from "@/components/pga/PgaTopProjectionsCard";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  areWeightsEqual,
  buildTournamentMeta,
  getTopProjections,
  rankPlayersByScore,
} from "@/lib/pga/pgaModelHelpers";
import type { PgaWeights, RawPgaPlayer } from "@/lib/pga/pgaTypes";
import {
  getStoredPgaAppliedWeights,
  getStoredPgaActivePreset,
  getWeightsForPreset,
  detectActivePreset,
  PGA_PRESETS,
  type PgaPresetKey,
  RBC_HERITAGE_WEIGHTS,
  storePgaAppliedWeights,
  storePgaActivePreset,
} from "@/lib/pga/pgaWeights";

export default function PGAModel() {
  const initialWeights = useMemo(() => getStoredPgaAppliedWeights(), []);
  const initialPreset = useMemo(
    () => detectActivePreset(initialWeights) ?? getStoredPgaActivePreset() ?? "balanced",
    [initialWeights],
  );
  const [players, setPlayers] = useState<RawPgaPlayer[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftWeights, setDraftWeights] = useState<PgaWeights>(initialWeights);
  const [appliedWeights, setAppliedWeights] = useState<PgaWeights>(initialWeights);
  const [selectedPreset, setSelectedPreset] = useState<PgaPresetKey>(initialPreset);
  const [isFullPage, setIsFullPage] = useState(false);

  usePageSeo({
    title: "RBC Heritage 2026 PGA Model Picks",
    description:
      "Interactive PGA model picks for RBC Heritage 2026 with weighted stats, Harbour Town course history, and form-driven rankings.",
    path: "/pga/model",
  });

  useEffect(() => {
    let active = true;
    async function loadPlayers() {
      try {
        const response = await fetch("/rbc_data.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load RBC data (${response.status})`);
        const data = await response.json();
        if (!active) return;
        if (!Array.isArray(data)) throw new Error("RBC data is not an array.");
        setPlayers(data as RawPgaPlayer[]);
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        setStatus("error");
      }
    }
    loadPlayers();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    storePgaAppliedWeights(appliedWeights);
  }, [appliedWeights]);

  useEffect(() => {
    const detectedPreset = detectActivePreset(appliedWeights);
    storePgaActivePreset(detectedPreset ?? selectedPreset);
  }, [appliedWeights, selectedPreset]);

  // Lock body scroll in full-page mode
  useEffect(() => {
    document.body.style.overflow = isFullPage ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullPage]);

  const rows = useMemo(() => rankPlayersByScore(players, appliedWeights), [players, appliedWeights]);
  const topProjections = useMemo(() => getTopProjections(rows), [rows]);
  const meta = useMemo(() => buildTournamentMeta(players.length), [players.length]);
  const hasDraftChanges = useMemo(() => !areWeightsEqual(draftWeights, appliedWeights), [draftWeights, appliedWeights]);
  const activePreset = useMemo(() => detectActivePreset(appliedWeights), [appliedWeights]);
  const draftPreset = useMemo(() => detectActivePreset(draftWeights), [draftWeights]);

  function applyDraftWeights() {
    setAppliedWeights({ ...draftWeights });
    const detectedPreset = detectActivePreset(draftWeights);
    if (detectedPreset) {
      setSelectedPreset(detectedPreset);
    }
  }
  function resetToPreset() {
    setDraftWeights({ ...RBC_HERITAGE_WEIGHTS });
    setAppliedWeights({ ...RBC_HERITAGE_WEIGHTS });
    setSelectedPreset("balanced");
  }
  function updateWeight(key: keyof PgaWeights, value: number) {
    setDraftWeights((current) => ({ ...current, [key]: value }));
  }
  function selectPreset(preset: PgaPresetKey) {
    const nextWeights = getWeightsForPreset(preset);
    setSelectedPreset(preset);
    setDraftWeights(nextWeights);
    setAppliedWeights(nextWeights);
  }

  // ── Loading state ─────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-[32px] bg-card p-8 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
            <Link to="/pga/rbc-heritage-2026-picks" className="text-sm text-primary transition hover:text-primary/80">RBC Heritage best bets</Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">PGA Model Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">Loading RBC Heritage model data...</p>
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
            <Link to="/pga/rbc-heritage-2026-picks" className="text-sm text-primary transition hover:text-primary/80">RBC Heritage best bets</Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">PGA Model Dashboard</h1>
            <p className="mt-2 text-sm text-destructive">Unable to load rbc_data.json.</p>
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

  // ── Full-page table overlay ───────────────────────────────────────────
  if (isFullPage) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {/* Full-page topbar */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-[-0.02em] text-foreground">Harbour Town Model</span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{rows.length} golfers</span>
            {hasDraftChanges && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Unsaved weight changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasDraftChanges && (
              <button type="button" onClick={applyDraftWeights} className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                Apply Weights
              </button>
            )}
            <button type="button" onClick={() => setIsFullPage(false)} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
              </svg>
              Exit Full Page
            </button>
          </div>
        </div>

        {/* Full-page body */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <PgaModelTable
            rows={rows}
            isFullPage
            draftWeights={draftWeights}
            appliedWeights={appliedWeights}
            selectedPreset={selectedPreset}
            activePreset={activePreset}
            draftPreset={draftPreset}
            presetOptions={Object.entries(PGA_PRESETS).map(([key, preset]) => ({
              key: key as PgaPresetKey,
              label: preset.label,
              description: preset.description,
            }))}
            onPresetSelect={selectPreset}
            onWeightChange={updateWeight}
            onApply={applyDraftWeights}
            onReset={resetToPreset}
          />
        </div>
      </div>
    );
  }

  // ── Normal dashboard ──────────────────────────────────────────────────
  const mainContent = (
    <div className="space-y-6">
      <PgaMainHeader meta={meta} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PgaTopProjectionsCard rows={topProjections} />
        <PgaCourseInsightsCard />
      </div>
      {/* Table receives weight props so sliders render above it */}
      <PgaModelTable
        rows={rows}
        onExpandFullPage={() => setIsFullPage(true)}
        draftWeights={draftWeights}
        appliedWeights={appliedWeights}
        selectedPreset={selectedPreset}
        activePreset={activePreset}
        draftPreset={draftPreset}
        presetOptions={Object.entries(PGA_PRESETS).map(([key, preset]) => ({
          key: key as PgaPresetKey,
          label: preset.label,
          description: preset.description,
        }))}
        onPresetSelect={selectPreset}
        onWeightChange={updateWeight}
        onApply={applyDraftWeights}
        onReset={resetToPreset}
      />
      <PgaFooterMeta />
    </div>
  );

  return (
    <SiteShell>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          {/* Removed the right-side customization panel — sliders now live in the table */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
            <section className="order-1 min-w-0 xl:order-2">{mainContent}</section>
            <aside className="order-2 xl:order-1 xl:sticky xl:top-24 xl:self-start">
              <PgaSidebar />
            </aside>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
