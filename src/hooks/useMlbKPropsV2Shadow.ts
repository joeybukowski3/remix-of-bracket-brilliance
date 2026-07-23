import { useEffect, useMemo, useRef, useState } from "react";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

const SHADOW_URL = "/data/mlb/k-props-v2-shadow.json";
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type KPropsV2ShadowComponent = {
  key: string;
  label: string;
  group: string;
  value: number;
  weight: number;
  normalizedWeight: number;
  contribution: number;
  source: string;
};

export type KPropsV2ShadowRow = {
  key: string;
  slateDate: string;
  game: {
    gameId: number | null;
    gameKey: string | null;
    gameDate: string | null;
    venue: string | null;
    pitcherIsHome: boolean | null;
  };
  pitcher: {
    id: number | null;
    name: string;
    team: string;
    opponent: string;
    handedness: "L" | "R" | null;
  };
  market: {
    kLine: number | null;
    oddsOver: string | null;
    oddsUnder: string | null;
    book: string | null;
    slateDate: string | null;
  };
  legacy: {
    projectedIP: number | null;
    projectedK9: number | null;
    projectedKs: number | null;
    projectionSource: string | null;
    projectionFallbackReason: string | null;
  };
  v2: {
    modelVersion: string;
    projectedStrikeouts: number;
    projectedKRate: number;
    projectedBattersFaced: number | null;
    projectedInnings: number | null;
    pitcherSkillRate: number | null;
    opponentEnvironmentRate: number | null;
    matchupAdjustment: number | null;
    confidence: string;
    components: KPropsV2ShadowComponent[];
    fallbacks: string[];
    warnings: string[];
  };
  comparison: {
    v2MinusLegacyKs: number | null;
    legacyEdgeToLine: number | null;
    v2EdgeToLine: number | null;
  };
  inputs: Record<string, unknown>;
};

export type KPropsV2ShadowArtifact = {
  schemaVersion: number;
  slateDate: string;
  generatedAt: string;
  sourceDates?: Record<string, string>;
  modelVersion: string;
  projectionMode: "shadow";
  rows: KPropsV2ShadowRow[];
  diagnostics?: {
    totalRows?: number;
    v2ComputedRows?: number;
    legacyOnlyRows?: number;
    warnings?: string[];
    [key: string]: unknown;
  };
};

type ShadowIndex = {
  byStableIdentity: Map<string, KPropsV2ShadowRow>;
  byFallbackIdentity: Map<string, KPropsV2ShadowRow>;
  duplicateStableKeys: string[];
  duplicateFallbackKeys: string[];
};

export type KPropsV2ShadowState = {
  loading: boolean;
  enabled: boolean;
  status: "idle" | "loading" | "valid" | "missing" | "invalid" | "stale";
  artifact: KPropsV2ShadowArtifact | null;
  warnings: string[];
  diagnostics: {
    duplicateStableKeys: string[];
    duplicateFallbackKeys: string[];
  };
  findShadowRow: (row: PitcherStrikeoutTeamRow) => KPropsV2ShadowRow | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function normalizeToken(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeTeam(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function getPublicRowDate(row: PitcherStrikeoutTeamRow, slateDate: string | null) {
  return slateDate ?? null;
}

function stableKey(gameId: number | null | undefined, pitcherId: number | null | undefined) {
  if (!Number.isInteger(gameId) || !Number.isInteger(pitcherId)) return null;
  return `${gameId}|${pitcherId}`;
}

function rowStableKey(row: PitcherStrikeoutTeamRow) {
  return stableKey(row.gameId ?? null, row.pitcherId ?? null);
}

function shadowStableKey(row: KPropsV2ShadowRow) {
  return stableKey(row.game.gameId ?? null, row.pitcher.id ?? null);
}

function fallbackKey(parts: { pitcher: string | null | undefined; team: string | null | undefined; opponent: string | null | undefined; gameKey: string | null | undefined; date: string | null | undefined }) {
  const pitcher = normalizeToken(parts.pitcher);
  const team = normalizeTeam(parts.team);
  const opponent = normalizeTeam(parts.opponent);
  const gameKey = normalizeToken(parts.gameKey);
  const date = parts.date && DATE_RE.test(parts.date) ? parts.date : "";
  if (!pitcher || !team || !opponent || (!gameKey && !date)) return null;
  return `${pitcher}|${team}|${opponent}|${gameKey}|${date}`;
}

function shadowGameDate(row: KPropsV2ShadowRow) {
  const value = row.game.gameDate;
  if (!value) return row.slateDate;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? row.slateDate;
}

export function validateKPropsV2ShadowPayload(payload: unknown, publicSlateDate: string | null): { artifact: KPropsV2ShadowArtifact | null; status: KPropsV2ShadowState["status"]; warnings: string[] } {
  const warnings: string[] = [];
  if (!isRecord(payload)) return { artifact: null, status: "invalid", warnings: ["Shadow artifact is not an object."] };
  if (payload.projectionMode !== "shadow") return { artifact: null, status: "invalid", warnings: ["Shadow artifact projectionMode is not shadow."] };
  if (!isFiniteNumber(payload.schemaVersion)) return { artifact: null, status: "invalid", warnings: ["Shadow artifact schemaVersion is missing or invalid."] };
  if (typeof payload.slateDate !== "string" || !DATE_RE.test(payload.slateDate)) return { artifact: null, status: "invalid", warnings: ["Shadow artifact slateDate is missing or invalid."] };
  if (publicSlateDate && payload.slateDate !== publicSlateDate) return { artifact: null, status: "stale", warnings: [`Shadow artifact slate ${payload.slateDate} does not match public slate ${publicSlateDate}.`] };
  if (typeof payload.generatedAt !== "string" || Number.isNaN(Date.parse(payload.generatedAt))) return { artifact: null, status: "invalid", warnings: ["Shadow artifact generatedAt is missing or invalid."] };
  if (typeof payload.modelVersion !== "string" || !payload.modelVersion.trim()) return { artifact: null, status: "invalid", warnings: ["Shadow artifact modelVersion is missing."] };
  if (!Array.isArray(payload.rows)) return { artifact: null, status: "invalid", warnings: ["Shadow artifact rows are missing."] };

  const rows: KPropsV2ShadowRow[] = [];
  payload.rows.forEach((row, index) => {
    if (!isRecord(row) || !isRecord(row.game) || !isRecord(row.pitcher) || !isRecord(row.legacy) || !isRecord(row.v2) || !isRecord(row.comparison)) {
      warnings.push(`Shadow row ${index} has an invalid shape.`);
      return;
    }
    if (typeof row.key !== "string" || typeof row.slateDate !== "string" || row.slateDate !== payload.slateDate) {
      warnings.push(`Shadow row ${index} has invalid identity fields.`);
      return;
    }
    if (typeof row.pitcher.name !== "string" || typeof row.pitcher.team !== "string" || typeof row.pitcher.opponent !== "string") {
      warnings.push(`Shadow row ${index} has invalid pitcher fields.`);
      return;
    }
    if (!isNullableFiniteNumber(row.legacy.projectedKs) || !isNullableFiniteNumber(row.legacy.projectedIP) || !isNullableFiniteNumber(row.legacy.projectedK9)) {
      warnings.push(`Shadow row ${index} has invalid legacy projection fields.`);
      return;
    }
    if (!isFiniteNumber(row.v2.projectedStrikeouts) || !isFiniteNumber(row.v2.projectedKRate) || !isNullableFiniteNumber(row.v2.projectedBattersFaced) || !isNullableFiniteNumber(row.v2.projectedInnings)) {
      warnings.push(`Shadow row ${index} has invalid V2 projection fields.`);
      return;
    }
    if (typeof row.v2.modelVersion !== "string" || typeof row.v2.confidence !== "string" || !Array.isArray(row.v2.components) || !Array.isArray(row.v2.fallbacks) || !Array.isArray(row.v2.warnings)) {
      warnings.push(`Shadow row ${index} has invalid V2 explanation fields.`);
      return;
    }
    if (!isNullableFiniteNumber(row.comparison.v2MinusLegacyKs) || !isNullableFiniteNumber(row.comparison.legacyEdgeToLine) || !isNullableFiniteNumber(row.comparison.v2EdgeToLine)) {
      warnings.push(`Shadow row ${index} has invalid comparison fields.`);
      return;
    }
    if (!isStringOrNull(row.game.gameKey) || !isStringOrNull(row.game.gameDate) || !isStringOrNull(row.game.venue) || (row.game.pitcherIsHome !== null && typeof row.game.pitcherIsHome !== "boolean")) {
      warnings.push(`Shadow row ${index} has invalid game fields.`);
      return;
    }
    rows.push(row as KPropsV2ShadowRow);
  });

  return {
    artifact: {
      schemaVersion: payload.schemaVersion,
      slateDate: payload.slateDate,
      generatedAt: payload.generatedAt,
      sourceDates: isRecord(payload.sourceDates) ? payload.sourceDates as Record<string, string> : undefined,
      modelVersion: payload.modelVersion,
      projectionMode: "shadow",
      rows,
      diagnostics: isRecord(payload.diagnostics) ? payload.diagnostics as KPropsV2ShadowArtifact["diagnostics"] : undefined,
    },
    status: "valid",
    warnings,
  };
}

function insertUnique(map: Map<string, KPropsV2ShadowRow>, duplicates: string[], key: string | null, row: KPropsV2ShadowRow) {
  if (!key) return;
  if (map.has(key)) {
    map.delete(key);
    if (!duplicates.includes(key)) duplicates.push(key);
    return;
  }
  if (!duplicates.includes(key)) map.set(key, row);
}

export function buildKPropsV2ShadowIndex(artifact: KPropsV2ShadowArtifact | null): ShadowIndex {
  const byStableIdentity = new Map<string, KPropsV2ShadowRow>();
  const byFallbackIdentity = new Map<string, KPropsV2ShadowRow>();
  const duplicateStableKeys: string[] = [];
  const duplicateFallbackKeys: string[] = [];
  if (!artifact) return { byStableIdentity, byFallbackIdentity, duplicateStableKeys, duplicateFallbackKeys };
  for (const row of artifact.rows) {
    insertUnique(byStableIdentity, duplicateStableKeys, shadowStableKey(row), row);
    insertUnique(
      byFallbackIdentity,
      duplicateFallbackKeys,
      fallbackKey({
        pitcher: row.pitcher.name,
        team: row.pitcher.team,
        opponent: row.pitcher.opponent,
        gameKey: row.game.gameKey,
        date: shadowGameDate(row),
      }),
      row,
    );
  }
  return { byStableIdentity, byFallbackIdentity, duplicateStableKeys, duplicateFallbackKeys };
}

export function findKPropsV2ShadowRow(row: PitcherStrikeoutTeamRow, artifact: KPropsV2ShadowArtifact | null, publicSlateDate: string | null): KPropsV2ShadowRow | null {
  const index = buildKPropsV2ShadowIndex(artifact);
  const stable = rowStableKey(row);
  if (stable) {
    const match = index.byStableIdentity.get(stable) ?? null;
    if (match && normalizeTeam(match.pitcher.team) === normalizeTeam(row.team) && normalizeTeam(match.pitcher.opponent) === normalizeTeam(row.opponent)) return match;
    return null;
  }
  const fallback = fallbackKey({
    pitcher: row.pitcher,
    team: row.team,
    opponent: row.opponent,
    gameKey: row.gameKey,
    date: getPublicRowDate(row, publicSlateDate),
  });
  return fallback ? index.byFallbackIdentity.get(fallback) ?? null : null;
}

export function useMlbKPropsV2Shadow(enabled: boolean, publicSlateDate: string | null): KPropsV2ShadowState {
  const [state, setState] = useState<Omit<KPropsV2ShadowState, "findShadowRow">>({
    loading: enabled,
    enabled,
    status: enabled ? "loading" : "idle",
    artifact: null,
    warnings: [],
    diagnostics: { duplicateStableKeys: [], duplicateFallbackKeys: [] },
  });
  const lastGeneratedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, enabled: false, status: "idle", artifact: null, warnings: [], diagnostics: { duplicateStableKeys: [], duplicateFallbackKeys: [] } });
      return;
    }
    let active = true;

    async function load() {
      try {
        const response = await fetch(SHADOW_URL, { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setState({ loading: false, enabled: true, status: "missing", artifact: null, warnings: [`Shadow artifact request failed with HTTP ${response.status}.`], diagnostics: { duplicateStableKeys: [], duplicateFallbackKeys: [] } });
          return;
        }
        const payload = await response.json() as unknown;
        if (!active) return;
        const result = validateKPropsV2ShadowPayload(payload, publicSlateDate);
        if (result.artifact?.generatedAt && result.artifact.generatedAt === lastGeneratedAt.current) return;
        lastGeneratedAt.current = result.artifact?.generatedAt ?? null;
        const index = buildKPropsV2ShadowIndex(result.artifact);
        const artifactWarnings = result.artifact?.diagnostics?.warnings ?? [];
        setState({
          loading: false,
          enabled: true,
          status: result.status,
          artifact: result.status === "valid" ? result.artifact : null,
          warnings: [...result.warnings, ...artifactWarnings],
          diagnostics: { duplicateStableKeys: index.duplicateStableKeys, duplicateFallbackKeys: index.duplicateFallbackKeys },
        });
      } catch {
        if (!active) return;
        setState({ loading: false, enabled: true, status: "missing", artifact: null, warnings: ["Shadow artifact could not be loaded."], diagnostics: { duplicateStableKeys: [], duplicateFallbackKeys: [] } });
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled, publicSlateDate]);

  const index = useMemo(() => buildKPropsV2ShadowIndex(state.artifact), [state.artifact]);
  const findShadowRowForState = (row: PitcherStrikeoutTeamRow) => {
    const stable = rowStableKey(row);
    if (stable) {
      const match = index.byStableIdentity.get(stable) ?? null;
      if (match && normalizeTeam(match.pitcher.team) === normalizeTeam(row.team) && normalizeTeam(match.pitcher.opponent) === normalizeTeam(row.opponent)) return match;
      return null;
    }
    const fallback = fallbackKey({ pitcher: row.pitcher, team: row.team, opponent: row.opponent, gameKey: row.gameKey, date: getPublicRowDate(row, publicSlateDate) });
    return fallback ? index.byFallbackIdentity.get(fallback) ?? null : null;
  };

  return { ...state, findShadowRow: findShadowRowForState };
}
