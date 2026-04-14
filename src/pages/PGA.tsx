import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RBCHeritageModel from "@/components/golf/RBCHeritageModel";

type Player = {
  "Player Name": string;
};

export default function PGA() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

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
      <div className="min-h-screen bg-neutral-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-5xl">
          <Link to="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            Back to home
          </Link>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h1 className="text-2xl font-bold">PGA Tour</h1>
            <p className="mt-2 text-sm text-neutral-400">Loading RBC Heritage model data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-neutral-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-5xl">
          <Link to="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            Back to home
          </Link>
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <h1 className="text-2xl font-bold">PGA Tour</h1>
            <p className="mt-2 text-sm text-red-200">Unable to load `rbc_data.json`.</p>
            <p className="mt-1 text-sm text-red-100/80">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return <RBCHeritageModel players={players} />;
}
