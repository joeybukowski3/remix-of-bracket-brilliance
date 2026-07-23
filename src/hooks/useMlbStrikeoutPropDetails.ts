import { useEffect, useRef, useState } from "react";
// @ts-expect-error -- plain JS module, no type declarations
import {
  buildStrikeoutPropDetailKey,
  buildStrikeoutPropStableKey,
  buildStrikeoutPropStableKeys,
} from "../../scripts/lib/mlb-strikeout-prop-details-core.mjs";

export type StrikeoutPropStartRow = {
  date: string | null;
  opponent: string | null;
  inningsPitched: number | string | null;
  strikeouts: number | null;
};

export type PitcherStartDetail = StrikeoutPropStartRow & {
  gamePk?: number | null;
  season?: number | null;
  opponentId?: number | null;
  opponentAbbr?: string | null;
  isHome?: boolean | null;
  site?: "home" | "away" | null;
  outsRecorded?: number | null;
  hitsAllowed?: number | null;
  pitchCount?: number | null;
  battersFaced?: number | null;
  gamesStarted?: number | null;
};

export type PitcherLastFiveSummary = {
  gamesUsed: number;
  totalOuts: number | null;
  averageInningsOuts: number | null;
  totalStrikeouts: number | null;
  averageStrikeouts: number | null;
  totalHitsAllowed: number | null;
  hitsPerNine: number | null;
  strikeoutsPerNine: number | null;
  averagePitchCount: number | null;
};

export type PitcherVenueTotals = {
  gamesUsed: number;
  totalOuts: number | null;
  inningsPitched: string | null;
  strikeouts: number | null;
  hitsAllowed: number | null;
};

export type PitcherVenueSplit = {
  site: "home" | "away";
  season: PitcherVenueTotals;
  lastFiveAtSite: PitcherVenueTotals;
};

export type StrikeoutDetailCompleteness = {
  recentStartsRequested: number;
  recentStartsFound: number;
  rowsWithHitsAllowed: number;
  rowsWithPitchCount: number;
  rowsWithSite: number;
  homeSeasonGames: number;
  awaySeasonGames: number;
  homeLastFiveGames: number;
  awayLastFiveGames: number;
  duplicateGameLogs?: number;
  warnings: string[];
};

export type StrikeoutPropOpponentGameRow = {
  date: string | null;
  opponent: string | null;
  opposingStartingPitcher: string | null;
  opposingStarterInningsPitched: number | string | null;
  opposingStarterStrikeouts: number | null;
  teamTotalStrikeouts: number | null;
};

export type StrikeoutPropDetail = {
  key: string;
  legacyKey?: string;
  stableKey?: string | null;
  stableKeys?: string[];
  slateDate?: string | null;
  gamePk?: number | null;
  pitcherId?: number | null;
  teamId?: number | null;
  opponentId?: number | null;
  pitcher: string;
  team: string;
  opponent: string;
  gameDate: string | null;
  pitcherLastFiveStarts: PitcherStartDetail[];
  pitcherRecentStarts?: PitcherStartDetail[];
  pitcherLastFiveSummary?: PitcherLastFiveSummary | null;
  pitcherVenueSplits?: { home: PitcherVenueSplit; away: PitcherVenueSplit } | null;
  opponentLastFiveGames: StrikeoutPropOpponentGameRow[];
  sourceWarnings?: string[];
  completeness?: StrikeoutDetailCompleteness | null;
  generatedAt: string;
  source: string;
};

type DetailsPayload = {
  generatedAt?: string;
  source?: string;
  date?: string;
  details?: StrikeoutPropDetail[];
};

type State = {
  loading: boolean;
  fileUnavailable: boolean;
  detailsByKey: Map<string, StrikeoutPropDetail>;
  detailsDate: string | null;
};

const POLL_INTERVAL_MS = 10 * 60 * 1000;

type StrikeoutPropRowIdentity = {
  pitcher: string;
  team: string;
  opponent: string;
  gamePk?: number | null;
  gameId?: number | null;
  pitcherId?: number | null;
  teamId?: number | null;
  opponentId?: number | null;
};

export function keyForStrikeoutPropRow(row: StrikeoutPropRowIdentity, gameDate: string | null) {
  return stableKeyForStrikeoutPropRow(row, gameDate)
    ?? buildStrikeoutPropDetailKey({ pitcher: row.pitcher, team: row.team, opponent: row.opponent, gameDate });
}

export function stableKeyForStrikeoutPropRow(row: Pick<StrikeoutPropRowIdentity, "gamePk" | "gameId" | "pitcherId" | "teamId" | "opponentId">, slateDate: string | null) {
  return buildStrikeoutPropStableKey({
    slateDate,
    gamePk: row.gamePk ?? row.gameId,
    pitcherId: row.pitcherId,
    teamId: row.teamId,
    opponentId: row.opponentId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsableDetail(value: unknown): value is StrikeoutPropDetail {
  if (!isRecord(value)) return false;
  return typeof value.key === "string"
    && typeof value.pitcher === "string"
    && typeof value.team === "string"
    && typeof value.opponent === "string"
    && Array.isArray(value.pitcherLastFiveStarts)
    && Array.isArray(value.opponentLastFiveGames);
}

function addCandidate(candidates: Map<string, Set<StrikeoutPropDetail>>, key: string | null | undefined, detail: StrikeoutPropDetail) {
  if (!key) return;
  const owners = candidates.get(key) ?? new Set<StrikeoutPropDetail>();
  owners.add(detail);
  candidates.set(key, owners);
}

export function buildStrikeoutPropDetailsByKey(details: StrikeoutPropDetail[]) {
  const stableCandidates = new Map<string, Set<StrikeoutPropDetail>>();
  const legacyCandidates = new Map<string, Set<StrikeoutPropDetail>>();

  for (const detail of details.filter(isUsableDetail)) {
    const derivedStableKeys = buildStrikeoutPropStableKeys({
      slateDate: detail.slateDate ?? detail.gameDate,
      gamePk: detail.gamePk,
      pitcherId: detail.pitcherId,
      teamId: detail.teamId,
      opponentId: detail.opponentId,
    }) as string[];
    const stableKeys = new Set([
      ...(Array.isArray(detail.stableKeys) ? detail.stableKeys : []),
      detail.stableKey,
      ...derivedStableKeys,
    ].filter((key): key is string => typeof key === "string" && key.length > 0));
    for (const key of stableKeys) addCandidate(stableCandidates, key, detail);

    const derivedLegacyKey = buildStrikeoutPropDetailKey({
      pitcher: detail.pitcher,
      team: detail.team,
      opponent: detail.opponent,
      gameDate: detail.slateDate ?? detail.gameDate,
    });
    const legacyKeys = new Set([detail.legacyKey, derivedLegacyKey]);
    if (!stableKeys.has(detail.key)) legacyKeys.add(detail.key);
    for (const key of legacyKeys) addCandidate(legacyCandidates, key, detail);
  }

  const detailsByKey = new Map<string, StrikeoutPropDetail>();
  for (const [key, owners] of stableCandidates) {
    if (owners.size === 1) detailsByKey.set(key, owners.values().next().value as StrikeoutPropDetail);
  }
  for (const [key, owners] of legacyCandidates) {
    if (owners.size === 1 && !detailsByKey.has(key)) detailsByKey.set(key, owners.values().next().value as StrikeoutPropDetail);
  }
  return detailsByKey;
}

export function useMlbStrikeoutPropDetails() {
  const [state, setState] = useState<State>({ loading: true, fileUnavailable: false, detailsByKey: new Map(), detailsDate: null });
  const lastGeneratedAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/data/mlb/strikeout-prop-details.json", { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setState({ loading: false, fileUnavailable: true, detailsByKey: new Map(), detailsDate: null });
          return;
        }
        const payload = (await response.json()) as DetailsPayload;
        if (!active) return;
        const generatedAt = payload?.generatedAt ?? null;
        if (generatedAt && generatedAt === lastGeneratedAt.current) return;
        lastGeneratedAt.current = generatedAt;
        const details = Array.isArray(payload?.details) ? payload.details.filter(isUsableDetail) : [];
        const detailsByKey = buildStrikeoutPropDetailsByKey(details);
        setState({ loading: false, fileUnavailable: false, detailsByKey, detailsDate: payload?.date ?? null });
      } catch {
        if (!active) return;
        setState({ loading: false, fileUnavailable: true, detailsByKey: new Map(), detailsDate: null });
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return state;
}
