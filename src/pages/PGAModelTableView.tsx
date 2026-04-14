import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaModelTable from "@/components/pga/PgaModelTable";
import { usePageSeo } from "@/hooks/usePageSeo";
import { rankPlayersByScore } from "@/lib/pga/pgaModelHelpers";
import type { RawPgaPlayer } from "@/lib/pga/pgaTypes";
import { getStoredPgaAppliedWeights } from "@/lib/pga/pgaWeights";

export default function PGAModelTableView() {
  const [players, setPlayers] = useState<RawPgaPlayer[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const appliedWeights = useMemo(() => getStoredPgaAppliedWeights(), []);

  usePageSeo({
    title: "RBC Heritage 2026 Full Model Table",
    description: "Full-width RBC Heritage 2026 PGA model table with all ranking columns visible.",
    path: "/pga/model/table",
    noindex: true,
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

  return (
    <SiteShell>
      <main className="site-page pb-12 pt-10">
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <section className="surface-card">
              <Link to="/pga/model" className="text-sm text-primary transition hover:text-primary/80">
                Back to PGA model dashboard
              </Link>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-foreground">RBC Heritage Full Model Table</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                This view is optimized for scanning the full table with every column visible at once. It uses the most recently applied model weights from the dashboard.
              </p>
            </section>

            {status === "loading" ? (
              <section className="surface-card">
                <p className="text-sm text-muted-foreground">Loading full table view...</p>
              </section>
            ) : null}

            {status === "error" ? (
              <section className="surface-card">
                <p className="text-sm text-destructive">Unable to load `rbc_data.json`.</p>
                <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
              </section>
            ) : null}

            {status === "ready" ? (
              <PgaModelTable rows={rows} tableLink={{ href: "/pga/model", label: "Back to Dashboard" }} />
            ) : null}
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
