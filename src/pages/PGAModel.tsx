import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteNav from "@/components/SiteNav";
import RBCHeritageModel from "@/components/golf/RBCHeritageModel";
import { usePageSeo } from "@/hooks/usePageSeo";

type Player = {
  "Player Name": string;
};

export default function PGAModel() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  usePageSeo({
    title: "RBC Heritage 2026 PGA Model",
    description: "Interactive RBC Heritage 2026 PGA model with weighted stats, Harbour Town course history, and player form inputs.",
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

        setPlayers(data);
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

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteNav />
        <div className="px-6 py-12">
          <div className="mx-auto max-w-5xl">
            <Link to="/rbc-heritage-2026-picks" className="text-sm text-primary hover:underline">
              Best Bets & Picks
            </Link>
            <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h1 className="text-2xl font-semibold">PGA Tour Model</h1>
              <p className="mt-2 text-sm text-muted-foreground">Loading RBC Heritage model data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteNav />
        <div className="px-6 py-12">
          <div className="mx-auto max-w-5xl">
            <Link to="/rbc-heritage-2026-picks" className="text-sm text-primary hover:underline">
              Best Bets & Picks
            </Link>
            <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h1 className="text-2xl font-semibold">PGA Tour Model</h1>
              <p className="mt-2 text-sm text-destructive">Unable to load `rbc_data.json`.</p>
              <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <RBCHeritageModel players={players} />
    </div>
  );
}
