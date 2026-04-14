import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaCourseInsightsCard from "@/components/pga/PgaCourseInsightsCard";
import PgaCustomizationPanel from "@/components/pga/PgaCustomizationPanel";
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
  RBC_HERITAGE_WEIGHTS,
  storePgaAppliedWeights,
} from "@/lib/pga/pgaWeights";

export default function PGAModel() {
  const [players, setPlayers] = useState<RawPgaPlayer[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftWeights, setDraftWeights] = useState<PgaWeights>(() => getStoredPgaAppliedWeights());
  const [appliedWeights, setAppliedWeights] = useState<PgaWeights>(() => getStoredPgaAppliedWeights());
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

  // Lock body scroll when full-page table is open
  useEffect(() => {
    if (isFullPage) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isFullPage]);

  const rows = useMemo(() => rankPlayersByScore(players, appliedWeights), [players, appliedWeights]);
  const topProjections = useMemo(() => getTopProjections(rows), [rows]);
  const meta = useMemo(() => buildTournamentMeta(players.length), [players.length]);
  const hasDraftChanges = useMemo(
    () => !areWeightsEqual(draftWeights, appliedWeights),
    [draftWeights, appliedWeights]
  );

  function applyDraftWeights() {
    setAppliedWeights({ ...draftWeights });
  }

  function resetToPreset() {
    setDraftWeights({ ...RBC_HERITAGE_WEIGHTS });
    setAppliedWeights({ ...RBC_HERITAGE_WEIGHTS });
  }

  function updateWeight(key: keyof PgaWeights, value: number) {
    setDraftWeights((current) => ({ ...current, [key]: value }));
  }

  // ── Loading / error states ────────────────────────────────────────────
  if (status === "loading") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-[32px] bg-card p-8 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
            <Link to="/pga/rbc-heritage-2026-picks" className="text-sm text-primary transition hover:text-primary/80">
              RBC Heritage best bets
            </Link>
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
            <Link to="/pga/rbc-heritage-2026-picks" className="text-sm text-primary transition hover:text-primary/80">
              RBC Heritage best bets
            </Link>
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
        {/* Full-page header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-[-0.02em] text-foreground">
              Harbour Town Model
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {rows.length} golfers
            </span>
            {hasDraftChanges && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Unsaved weight changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasDraftChanges && (
              <button
                type="button"
                onClick={applyDraftWeights}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Apply Weights
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFullPage(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
              </svg>
              Exit Full Page
            </button>
          </div>
        </div>

        {/* Full-page body: sliders left, table right */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Compact weight panel */}
          <div className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-card p-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Model Weights
            </p>
            <PgaCustomizationPanel
              draftWeights={draftWeights}
              appliedWeights={appliedWeights}
              onWeightChange={updateWeight}
              onApply={applyDraftWeights}
              onReset={resetToPreset}
            />
          </div>

          {/* Full-width scrollable table */}
          <div className="min-w-0 flex-1 overflow-auto p-4">
            <PgaModelTable rows={rows} isFullPage />
          </div>
        </div>
      </div>
    );
  }

  // ── Normal dashboard layout ───────────────────────────────────────────
  const mainContent = (
    <div className="space-y-6">
      <PgaMainHeader meta={meta} />

      {/* Top section: projections + course insights side by side */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PgaTopProjectionsCard rows={topProjections} />
        <PgaCourseInsightsCard />
      </div>

      {/* Model table with full-page toggle */}
      <PgaModelTable
        rows={rows}
        onExpandFullPage={() => setIsFullPage(true)}
      />

      <PgaFooterMeta />
    </div>
  );

  return (
    <SiteShell>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
            <section className="order-1 min-w-0 xl:order-2">{mainContent}</section>
            <aside className="order-2 xl:order-1 xl:sticky xl:top-24 xl:self-start">
              <PgaSidebar />
            </aside>
            <aside className="order-3 min-w-0">
              <PgaCustomizationPanel
                draftWeights={draftWeights}
                appliedWeights={appliedWeights}
                onWeightChange={updateWeight}
                onApply={applyDraftWeights}
                onReset={resetToPreset}
              />
            </aside>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
