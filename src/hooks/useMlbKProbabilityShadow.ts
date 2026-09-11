import { useEffect, useMemo, useRef, useState } from "react";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

/**
 * SHADOW / INFORMATIONAL layer (see docs/features/mlb-k.md and
 * docs/models/mlb-k-score.md "Not this"). This hook only READS the additive
 * `k-probability-shadow.json` artifact produced by
 * scripts/generate-mlb-k-probability-shadow.mjs -- it does not touch, and is
 * never consumed by, the projection resolver, K Score, or Best K Prop Bets.
 */
const SHADOW_URL = "/data/mlb/k-probability-shadow.json";
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type KProbabilityLean = "OVER" | "UNDER" | "NEUTRAL";
export type KProbabilityConfidenceGrade = "HIGH" | "MEDIUM" | "LOW";
export type KProbabilityStatus = "computed" | "no_market" | "one_sided_market" | "insufficient_projection" | "declined";

export type KProbabilityShadowRow = {
  key: string;
  slateDate: string | null;
  pitcherId: number | null;
  gameId: number | null;
  pitcher: string | null;
  team: string;
  opponent: string;
  line: number | null;
  overOdds: string | null;
  underOdds: string | null;
  book: string | null;
  projectedKs: number | null;
  projectedKsSource: string | null;
  modelVersion: string;
  simulationCount: number;
  market: {
    overImpliedProbability: number | null;
    underImpliedProbability: number | null;
    overNoVigProbability: number | null;
    underNoVigProbability: number | null;
    overround: number | null;
    twoSided: boolean;
  };
  model: {
    overProbability: number | null;
    underProbability: number | null;
    meanSimulatedKs: number | null;
    medianSimulatedKs: number | null;
    stdevSimulatedKs: number | null;
  };
  edge: {
    overProbabilityEdge: number | null;
    underProbabilityEdge: number | null;
    lean: KProbabilityLean;
    bestProbabilityEdge: number | null;
    bestProbabilitySide: "OVER" | "UNDER" | null;
  };
  confidence: {
    grade: KProbabilityConfidenceGrade | null;
    score: number | null;
    workloadTrust: number | null;
    kRateTrust: number | null;
  };
  diagnostics: {
    ipSd: number | null;
    kPerIpSd: number | null;
    ipSpread: number | null;
    kPerIpSpread: number | null;
    bfPerIP: number | null;
    usedV4Diagnostics: boolean;
  };
  status: KProbabilityStatus;
  statusReason: string | null;
};

export type KProbabilityShadowArtifact = {
  schemaVersion: number;
  slateDate: string | null;
  generatedAt: string;
  modelVersion: string;
  simulationCount: number;
  rows: KProbabilityShadowRow[];
  diagnostics: {
    totalRows: number;
    computedRows: number;
    noMarketRows: number;
    oneSidedMarketRows: number;
    insufficientDataRows: number;
  };
};

export type KProbabilityShadowState = {
  loading: boolean;
  /**
   * "valid" is the only status where `artifact` is non-null -- every other
   * status means "render as unavailable" (STEP 9 / production-readiness
   * requirement: the UI must never silently show a probability artifact for
   * a different slate, or a structurally broken payload). "stale" and
   * "invalid" additionally surface a small maintainer-visible indicator (see
   * MlbStrikeoutProps.tsx) since those two specifically mean "data exists
   * but is not trustworthy", as opposed to "missing" (nothing generated
   * yet, the normal pre-generation state) or "loading".
   */
  status: "loading" | "valid" | "missing" | "invalid" | "stale";
  artifact: KProbabilityShadowArtifact | null;
  findProbabilityRow: (row: PitcherStrikeoutTeamRow) => KProbabilityShadowRow | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableKey(gameId: number | null | undefined, pitcherId: number | null | undefined) {
  if (!Number.isInteger(gameId) || !Number.isInteger(pitcherId)) return null;
  return `${gameId}|${pitcherId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Structural validation -- rejects a truncated/garbage/pre-schema payload
 * rather than rendering partial or misdated rows. Mirrors
 * validateKPropsV2ShadowPayload's rigor (useMlbKPropsV2Shadow.ts) rather than
 * the looser "has a rows array" check this hook shipped with initially.
 */
function isUsableArtifact(payload: unknown): payload is KProbabilityShadowArtifact {
  if (!isRecord(payload)) return false;
  if (!isFiniteNumber(payload.schemaVersion)) return false;
  if (typeof payload.slateDate !== "string" || !DATE_RE.test(payload.slateDate)) return false;
  if (typeof payload.generatedAt !== "string" || Number.isNaN(Date.parse(payload.generatedAt))) return false;
  if (typeof payload.modelVersion !== "string" || !payload.modelVersion.trim()) return false;
  if (!Array.isArray(payload.rows)) return false;
  return payload.rows.every((row) => isRecord(row) && typeof row.status === "string");
}

/**
 * Pure resolver: payload + the page's own current slate date -> a status and
 * (only for "valid") the usable artifact. Exported so the stale/invalid/
 * missing-artifact contract can be unit-tested directly, the same way
 * validateKPropsV2ShadowPayload is tested in useMlbKPropsV2Shadow.test.ts,
 * without mocking fetch/React state.
 */
export function resolveKProbabilityShadowPayload(
  payload: unknown,
  publicSlateDate: string | null,
): { status: Exclude<KProbabilityShadowState["status"], "loading">; artifact: KProbabilityShadowArtifact | null } {
  if (!isUsableArtifact(payload)) return { status: "invalid", artifact: null };
  const isStale = Boolean(publicSlateDate && payload.slateDate !== publicSlateDate);
  if (isStale) return { status: "stale", artifact: null };
  return { status: "valid", artifact: payload };
}

function buildIndex(artifact: KProbabilityShadowArtifact | null): Map<string, KProbabilityShadowRow> {
  const index = new Map<string, KProbabilityShadowRow>();
  if (!artifact) return index;
  for (const row of artifact.rows) {
    const key = stableKey(row.gameId, row.pitcherId);
    if (key) index.set(key, row);
  }
  return index;
}

/**
 * Fetches and validates the K probability shadow artifact, exposing a
 * `findProbabilityRow` lookup keyed the same way `useMlbKPropsV2Shadow` keys
 * its own shadow join (gameId+pitcherId), so a caller can attach both shadow
 * layers to the same `PitcherStrikeoutTeamRow` without extra plumbing.
 */
export function useMlbKProbabilityShadow(publicSlateDate: string | null): KProbabilityShadowState {
  const [artifact, setArtifact] = useState<KProbabilityShadowArtifact | null>(null);
  const [status, setStatus] = useState<KProbabilityShadowState["status"]>("loading");
  const [loading, setLoading] = useState(true);
  const lastGeneratedAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(SHADOW_URL, { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setLoading(false);
          setStatus("missing");
          setArtifact(null);
          return;
        }
        const payload = (await response.json()) as unknown;
        if (!active) return;
        // Staleness/validity MUST be resolved against the CURRENT
        // publicSlateDate before the generatedAt dedupe check below, never
        // after -- otherwise a first load that races ahead of the page's
        // own slate date (publicSlateDate still null) can cache a "valid"
        // verdict for an artifact that a moment later, once publicSlateDate
        // resolves, would actually be stale, and the dedupe would then skip
        // re-evaluating it on the next unchanged poll. This is exactly the
        // "never silently show a stale artifact for a different slate"
        // requirement.
        const resolved = resolveKProbabilityShadowPayload(payload, publicSlateDate);
        const generatedAt = resolved.artifact?.generatedAt ?? null;
        if (resolved.status === "valid" && generatedAt === lastGeneratedAt.current) {
          setLoading(false);
          return;
        }
        lastGeneratedAt.current = generatedAt;
        setLoading(false);
        setStatus(resolved.status);
        setArtifact(resolved.artifact);
      } catch {
        if (!active) return;
        setLoading(false);
        setStatus("missing");
        setArtifact(null);
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [publicSlateDate]);

  const index = useMemo(() => buildIndex(artifact), [artifact]);

  const findProbabilityRow = (row: PitcherStrikeoutTeamRow): KProbabilityShadowRow | null => {
    const key = stableKey(row.gameId ?? null, row.pitcherId ?? null);
    return key ? index.get(key) ?? null : null;
  };

  return { loading, status, artifact, findProbabilityRow };
}
