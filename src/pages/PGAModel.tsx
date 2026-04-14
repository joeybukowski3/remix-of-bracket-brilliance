import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaCourseInsightsCard from "@/components/pga/PgaCourseInsightsCard";
import PgaCustomizationPanel from "@/components/pga/PgaCustomizationPanel";
import PgaDashboardLayout from "@/components/pga/PgaDashboardLayout";
import PgaFooterMeta from "@/components/pga/PgaFooterMeta";
import PgaMainHeader from "@/components/pga/PgaMainHeader";
import PgaModelTable from "@/components/pga/PgaModelTable";
import PgaRecalculateBar from "@/components/pga/PgaRecalculateBar";
import PgaSidebar from "@/components/pga/PgaSidebar";
import PgaTopProjectionsCard from "@/components/pga/PgaTopProjectionsCard";
import PgaTopStats from "@/components/pga/PgaTopStats";
import { usePageSeo } from "@/hooks/usePageSeo";
import { areWeightsEqual, buildTournamentMeta, getTopProjections, rankPlayersByScore } from "@/lib/pga/pgaModelHelpers";
import type { PgaWeights, RawPgaPlayer } from "@/lib/pga/pgaTypes";
import { RBC_HERITAGE_WEIGHTS } from "@/lib/pga/pgaWeights";

export default function PGAModel() {
  const [players, setPlayers] = useState<RawPgaPlayer[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftWeights, setDraftWeights] = useState<PgaWeights>({ ...RBC_HERITAGE_WEIGHTS });
  const [appliedWeights, setAppliedWeights] = useState<PgaWeights>({ ...RBC_HERITAGE_WEIGHTS });

  usePageSeo({
    title: "RBC Heritage 2026 PGA Model Picks",
    description: "Interactive PGA model picks for RBC Heritage 2026 with weighted stats, Harbour Town course history, and form-driven rankings.",
    path: "/pga/model",
  });

  useEffect(() => {
    let active = true;

    async function loadPlayers() {
      try {
        const response = await fetch("/rbc_data.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load RBC data (${response.status})`);
        }

        const data = await response.json();
        if (!active) return;
        if (!Array.isArray(data)) {
          throw new Error("RBC data is not an array.");
        }

        setPlayers(data as RawPgaPlayer[]);
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        setStatus("error");
      }
    }

    loadPlayers();

    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => rankPlayersByScore(players, appliedWeights), [players, appliedWeights]);
  const topProjections = useMemo(() => getTopProjections(rows), [rows]);
  const meta = useMemo(() => buildTournamentMeta(players.length), [players.length]);
  const hasDraftChanges = useMemo(() => !areWeightsEqual(draftWeights, appliedWeights), [draftWeights, appliedWeights]);

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

  const mainContent = (
    <div className="space-y-6">
      <PgaMainHeader meta={meta} />
      <PgaTopStats meta={meta} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PgaTopProjectionsCard rows={topProjections} />
        <PgaCourseInsightsCard />
      </div>
      <PgaRecalculateBar onApply={applyDraftWeights} onReset={resetToPreset} hasDraftChanges={hasDraftChanges} />
      <PgaModelTable rows={rows} />
      <PgaFooterMeta />
    </div>
  );

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
            <p className="mt-2 text-sm text-destructive">Unable to load `rbc_data.json`.</p>
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
            <Link to="/pga/rbc-heritage-2026-picks" className="text-sm text-primary transition hover:text-primary/80">
              PGA Picks
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">PGA Model Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">The model loaded, but there are no golfers in the current dataset.</p>
          </div>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PgaDashboardLayout
        sidebar={<PgaSidebar />}
        main={mainContent}
        panel={
          <PgaCustomizationPanel
            draftWeights={draftWeights}
            appliedWeights={appliedWeights}
            onWeightChange={updateWeight}
            onApply={applyDraftWeights}
            onReset={resetToPreset}
          />
        }
      />
    </SiteShell>
  );
}
