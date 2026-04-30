import { useEffect, useState } from "react";
import { normalizeTournamentPlayerData } from "@/lib/pga/modelEngine";
import { dedupeDashboardPlayers } from "@/lib/pga/dashboard";
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { PgaPlayerInput, RawPgaPlayer } from "@/lib/pga/pgaTypes";

export function usePgaDashboardUniversePlayers(tournaments: readonly PgaTournamentConfig[]) {
  const [players, setPlayers] = useState<PgaPlayerInput[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPlayers() {
      const uniqueDataPaths = Array.from(new Set(tournaments.map((tournament) => tournament.model.dataPath)));

      try {
        const results = await Promise.allSettled(
          uniqueDataPaths.map(async (dataPath) => {
            const response = await fetch(dataPath, { cache: "no-store" });
            if (!response.ok) {
              throw new Error(`Failed to load ${dataPath} (${response.status})`);
            }

            const data = await response.json();
            if (!Array.isArray(data)) {
              throw new Error(`${dataPath} did not return an array`);
            }

            return normalizeTournamentPlayerData(data as RawPgaPlayer[]);
          }),
        );

        if (!active) return;

        const successfulLoads = results
          .filter((result): result is PromiseFulfilledResult<PgaPlayerInput[]> => result.status === "fulfilled")
          .flatMap((result) => result.value);

        if (successfulLoads.length === 0) {
          const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
          throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error("Unable to load any PGA datasets.");
        }

        setPlayers(dedupeDashboardPlayers(successfulLoads));
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
  }, [tournaments]);

  return { players, status, errorMessage };
}
