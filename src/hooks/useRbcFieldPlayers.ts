import { useEffect, useState } from "react";
import type { RawPgaPlayer } from "@/lib/pga/pgaTypes";

export type RbcFieldPlayersStatus = "loading" | "ready" | "error";

export function useRbcFieldPlayers() {
  const [players, setPlayers] = useState<RawPgaPlayer[]>([]);
  const [status, setStatus] = useState<RbcFieldPlayersStatus>("loading");
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

  return { players, status, errorMessage };
}
