import { useEffect, useState } from "react";
import { normalizeTournamentPlayerData } from "@/lib/pga/modelEngine";
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { PgaPlayerInput, RawPgaPlayer } from "@/lib/pga/pgaTypes";

export type PgaTournamentPlayersStatus = "loading" | "ready" | "error";

export function usePgaTournamentPlayers(tournament: PgaTournamentConfig) {
  const [players, setPlayers] = useState<PgaPlayerInput[]>([]);
  const [status, setStatus] = useState<PgaTournamentPlayersStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPlayers() {
      try {
        const response = await fetch(tournament.model.dataPath, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load player data (${response.status})`);
        }

        const data = await response.json();
        if (!active) return;
        if (!Array.isArray(data)) {
          throw new Error("Tournament player data is not an array.");
        }

        setPlayers(normalizeTournamentPlayerData(data as RawPgaPlayer[]));
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        setStatus("error");
      }
    }

    setStatus("loading");
    setErrorMessage("");
    setPlayers([]);
    void loadPlayers();

    return () => {
      active = false;
    };
  }, [tournament.slug, tournament.model.dataPath]);

  return { players, status, errorMessage };
}
