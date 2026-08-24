// CFB Model V2 — WU7A Stage-2 read-only shadow fetch hook. Mirrors the
// existing runtime-fetch pattern every other sport already uses (e.g.
// src/hooks/useMlbBvpHistory.ts's `fetch("/data/mlb/...", { cache:
// "no-store" })`). NOT imported by any page or rendered component in this
// WU — see src/data/cfb/v2/shadowProjections.ts's file header for the
// Stage-2/Stage-3 rollout-gate rationale.
//
// Fails safe on every failure mode: missing file (404), network error,
// malformed JSON, and schema/coherence validation failure all resolve to
// status "absent" or "invalid" — never a thrown/uncaught error, never a
// fabricated value.

import { useEffect, useRef, useState } from "react";
import { validateCfbV2PublicArtifact, type CfbV2PublicProjectionArtifact } from "@/data/cfb/v2/shadowProjections";

export type CfbV2ShadowFetchState =
  | { status: "loading" }
  | { status: "absent" }
  | { status: "invalid"; reason: string }
  | { status: "loaded"; artifact: CfbV2PublicProjectionArtifact };

const SHADOW_PROJECTIONS_URL = "/data/cfb/v2/shadow-projections.json";

export function useCfbV2ShadowProjections(expectedSeason?: number): CfbV2ShadowFetchState {
  const [state, setState] = useState<CfbV2ShadowFetchState>({ status: "loading" });
  const requestedSeasonRef = useRef(expectedSeason);
  requestedSeasonRef.current = expectedSeason;

  useEffect(() => {
    let cancelled = false;
    fetch(SHADOW_PROJECTIONS_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          if (!cancelled) setState({ status: "absent" });
          return null;
        }
        return response.json();
      })
      .then((json) => {
        if (cancelled || json === null) return;
        try {
          const artifact = validateCfbV2PublicArtifact(json, requestedSeasonRef.current);
          setState({ status: "loaded", artifact });
        } catch (error) {
          setState({ status: "invalid", reason: error instanceof Error ? error.message : String(error) });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "absent" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
