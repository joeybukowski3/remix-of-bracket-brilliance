import { useEffect, useState } from "react";
import type { EpaArtifact } from "@/lib/nfl/epaData";
import { EPA_ARTIFACT_PATH } from "@/lib/nfl/epaData";
import type { SuccessRatesArtifact } from "@/lib/nfl/successRateData";
import { SUCCESS_RATES_ARTIFACT_PATH } from "@/lib/nfl/successRateData";
import type { ProductionAllowedArtifact } from "@/lib/nfl/productionAllowedData";
import { PRODUCTION_ALLOWED_ARTIFACT_PATH } from "@/lib/nfl/productionAllowedData";

type TeamsArtifact = { teams: readonly { abbr: string; nflverseAbbr: string }[] };

type State = {
  loading: boolean;
  /** Per-source failures never block the others -- each artifact is an independent failure domain, same convention as useNflYardageMarket. */
  errors: readonly string[];
  epa: EpaArtifact | null;
  success: SuccessRatesArtifact | null;
  productionAllowed: ProductionAllowedArtifact | null;
  abbrToNflverseAbbr: ReadonlyMap<string, string>;
};

const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} unavailable (${response.status}).`);
  return (await response.json()) as T;
}

/**
 * Loads the three canonical NFL matchup authorities the Yardage Props Review
 * table draws opponent context from: EPA, Success Rate and the shared
 * opponent-production-allowed artifact, plus teams.json for the
 * abbr -> nflverseAbbr map production-allowed lookups need. Each artifact is
 * an independent failure domain -- one missing artifact degrades only its
 * own columns to N/A, never the whole page.
 */
export function useNflYardageOpponentContext(): State {
  const [state, setState] = useState<State>({
    loading: true,
    errors: [],
    epa: null,
    success: null,
    productionAllowed: null,
    abbrToNflverseAbbr: EMPTY_MAP,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, errors: [] }));

    Promise.allSettled([
      fetchJson<EpaArtifact>(EPA_ARTIFACT_PATH),
      fetchJson<SuccessRatesArtifact>(SUCCESS_RATES_ARTIFACT_PATH),
      fetchJson<ProductionAllowedArtifact>(PRODUCTION_ALLOWED_ARTIFACT_PATH),
      fetchJson<TeamsArtifact>("/data/nfl/teams.json"),
    ]).then(([epaResult, successResult, productionResult, teamsResult]) => {
      if (cancelled) return;

      const errors: string[] = [];
      const epa = epaResult.status === "fulfilled" ? epaResult.value : null;
      if (epaResult.status === "rejected") errors.push("EPA context unavailable this run.");
      const success = successResult.status === "fulfilled" ? successResult.value : null;
      if (successResult.status === "rejected") errors.push("Success Rate context unavailable this run.");
      const productionAllowed = productionResult.status === "fulfilled" ? productionResult.value : null;
      if (productionResult.status === "rejected") errors.push("Opponent yards-allowed context unavailable this run.");

      const abbrToNflverseAbbr =
        teamsResult.status === "fulfilled"
          ? new Map(teamsResult.value.teams.map((t) => [t.abbr, t.nflverseAbbr]))
          : EMPTY_MAP;
      if (teamsResult.status === "rejected") errors.push("Team abbreviation map unavailable this run.");

      setState({ loading: false, errors, epa, success, productionAllowed, abbrToNflverseAbbr });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
