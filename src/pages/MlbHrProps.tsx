import { Fragment, useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import RelatedTools from "@/components/mlb/RelatedTools";
import { FreshnessStatus } from "@/components/mlb/FreshnessStatus";
import { MlbParkFactorsStrip } from "@/components/mlb/MlbParkFactorsStrip";
import SportsbookBar from "@/components/SportsbookBar";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { usePitcherRegression } from "@/hooks/usePitcherRegression";
import { evaluateSinCityHitter } from "@/lib/mlb/mlbHrFilter";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { keyForBvpRow, useMlbBvpHistory } from "@/hooks/useMlbBvpHistory";
import MlbBvpHistoryPanel, { AvgVsPitcherCell, MlbBvpHistoryPanelLoading, MlbBvpHistoryPanelUnavailable } from "@/components/mlb/MlbBvpHistoryPanel";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { cn } from "@/lib/utils";
import { getParkFactors } from "@/lib/mlb/mlbParkFactors";
import { resolveKPropStatus, type KPropStatus } from "@/lib/mlb/kPropStatus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type HrDashboardGame = {
  gameKey: string;
  matchup: string;
  awayTeam: string;
  homeTeam: string;
  stadium: string;
  roofType: string;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: string;
  conditions: string;
  parkFactor: number;
};

export type HrDashboardPitcher = {
  gameKey: string;
  /** Canonical numeric MLB gamePk. `gameKey` (e.g. "MIL@PIT") is a display/grouping alias only. Doubleheader games share a gameKey, so `gameId` is the only safe per-game join key. */
  gameId: number | null;
  pitcher: string;
  pitcherId: number | null;
  team: string;
  opponent: string;
  hand: string;
  ballpark: string;
  parkFactor: number;
  xera: number | null;
  hardHitRate: number | null;
  flyBallRate: number | null;
  barrelRate: number | null;
  kRate: number | null;
  bbRate: number | null;
  whiffRate: number | null;
  last7HR: number;
  hrPerStart: number | null;
  hrVs: number;
  hitsVs: number;
  kVs: number;
  kLine?: number | null;
  kOddsOver?: string | null;
  kOddsUnder?: string | null;
  kOddsBook?: string | null;
  projectedIP?: number | null;
  projectedK9?: number | null;
  projectedKs?: number | null;
  workloadRole?: string | null;
  projectionSource?: string | null;
  projectionFallbackReason?: string | null;
  publicRecommendationEligible?: boolean;
  legacyProjectedIP?: number | null;
  legacyProjectedKs?: number | null;
  candidateProjectedIP?: number | null;
  candidateProjectedKs?: number | null;
  effectiveProjectedIP?: number | null;
  effectiveProjectedKs?: number | null;
  workloadConfidenceGrade?: string | null;
  workloadConfidenceScore?: number | null;
  workloadFlags?: string[];
};

export type HrLineupStatus = "confirmed" | "projected" | "unknown";

export type HrDashboardBatter = {
  gameKey: string;
  /** Canonical numeric MLB player id. Null when upstream could not resolve one — never fabricated. */
  playerId: number | null;
  /** Canonical numeric MLB gamePk. `gameKey` (e.g. "MIL@PIT") is a display/grouping alias only. */
  gameId: number | null;
  lineupStatus: HrLineupStatus;
  battingOrder: number | null;
  starterConfirmed: boolean | null;
  position: string | null;
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  opposingPitcherId: number | null;
  pitcherHand: string;
  ballpark: string;
  parkFactor: number;
  atBats: number | null;
  barrelRate: number | null;
  hardHitRate: number | null;
  exitVelo: number | null;
  iso: number | null;
  hrFBRatio: number | null;
  pullRate: number | null;
  xba: number | null;
  kRate: number | null;
  bbRate: number | null;
  whiffRate: number | null;
  last7HR: number;
  last30HR: number;
  opposingPitcherHrVs: number | null;
  opposingPitcherHitsVs: number | null;
  opposingPitcherKVs: number | null;
  weatherBoost: number | null;
  hrScore: number;
  hrScoreRank: number;
  adjustedHrScore?: number;
  pitcherXera?: number | null;
  pitcherRegressionScore?: number | null;
  pitcherFlyBallRate?: number | null;
  bats?: "L" | "R" | "S" | null;
  hrLine?: number | null;
  hrOddsYes?: string | null;     // sportsbook anytime HR odds e.g. "+350"
  hrOddsNo?: string | null;      // sportsbook no HR odds e.g. "-450"
  hrOddsBook?: string | null;
  /** Raw market-implied probability from sportsbook odds. NOT de-vigged unless both sides are present. NOT a model probability. */
  marketImpliedProbability?: number | null;
  qualityRank?: number | null;
  marketRank?: number | null;
  rankDifference?: number | null;
  /** "unavailable" (no odds) | "uncalibrated" (odds exist, but no validated probability mapping exists yet) */
  valueStatus?: "unavailable" | "uncalibrated" | null;
  modelVersion?: string | null;
  confidenceLevel?: "high" | "medium" | "low" | "incomplete" | null;
  confidenceReasons?: string[];
  dataCompletenessPercent?: number | null;
  explanation?: string | null;
  /** @deprecated Fabricated value-edge field removed per model audit. Always null. Do not use in UI, sorting, or filtering. */
  hrValueEdge?: number | null;
  /** @deprecated Alias for marketImpliedProbability, kept for backward compatibility only. */
  hrImplied?: number | null;
  angleTags: string[];
  // ── Phase 1 shadow-only fields (computed client-side by the analytics
  //    bridge engine; never used for sorting, best bets, Sin City, or any
  //    public recommendation; NOT probabilities) ──────────────────────────
  shadowAbsoluteScore?: number | null;
  shadowScoreStatus?: "ok" | "suppressed";
  shadowSlateRank?: number | null;
  shadowCompleteness?: number;
  shadowConfidence?: number;
  shadowContributions?: import("@/lib/mlb/analytics/types").MetricContribution[];
  shadowNormalizedMetrics?: Record<string, number>;
  shadowMissingMetrics?: string[];
};

export type HrGameEnvironment = {
  gameKey: string;
  matchup: string;
  ballpark: string;
  gameHrEnvironmentScore: number | null;
  parkFactor: number | null;
  weatherEffect: number | null;
  starterVulnerability: number | null;
  qualifyingHitterCount: number;
  avgQualifyingHitterScore: number | null;
};

/** The generator's next scheduled run for today's slate (see getNextRunAt() in generate-mlb-hr-props.mjs). Both fields are always written together or the whole value is null -- there is no partial form. */
export type HrDashboardNextRunAt = {
  time: string;
  label: string;
};

/**
 * A game the generator excluded from `games`/`pitchers`/`batters` because at
 * least one side's starting pitcher hadn't been announced yet (see the
 * `pendingGames.push(...)` call in generate-mlb-hr-props.mjs). Only
 * `matchup` is required; the remaining fields mirror exactly what the
 * generator writes and are omitted rather than fabricated when absent.
 */
export type HrDashboardPendingGame = {
  matchup: string;
  gameKey?: string;
  gameId?: number | null;
  venue?: string;
  officialGameDate?: string;
  gameStartTime?: string;
  gameNumber?: number | null;
  doubleHeader?: string | null;
  missingPitcherSide?: string[];
};

export type HrDashboardPayload = {
  date: string;
  generatedAt: string;
  modelVersion?: string;
  games: HrDashboardGame[];
  pitchers: HrDashboardPitcher[];
  batters: HrDashboardBatter[];
  gameEnvironments?: HrGameEnvironment[];
  /** Phase 1 shadow bridge-score version metadata. Additive; UI ignores it. */
  shadowMeta?: import("@/lib/mlb/analytics/shadow").HrShadowMeta;
  nextRunAt: HrDashboardNextRunAt | null;
  pendingGames: HrDashboardPendingGame[];
};

export type HrPropPick = {
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  hrScoreRank: number;
  topStats: string[];
  bullets: string[];
};

type PickTier = "Best Bet" | "Value Play" | "Longshot" | "Unknown";

export type HrBestBetsPayload = {
  date: string;
  generatedAt: string;
  slatePreview?: { slateOverview: string; modelNote: string } | null;
  bestBets: HrPropPick[];
  valueBets: HrPropPick[];
  longshots: HrPropPick[];
};

type SortDirection = "asc" | "desc";
type TabKey = "pitchers" | "batters" | "matchups";
type MatchupLens = "best" | "hr" | "strikeout";
type PitcherSortKey = "pitcher" | "gameKey" | "parkFactor" | "xera" | "hardHitRate" | "barrelRate" | "kRate" | "bbRate" | "whiffRate" | "flyBallRate" | "hrVs" | "hitsVs" | "kVs" | "last7HR" | "hrPerStart";
type BatterSortKey = "hrScoreRank" | "player" | "team" | "opposingPitcher" | "parkFactor" | "kRate" | "bbRate" | "barrelRate" | "hardHitRate" | "xba" | "whiffRate" | "last7HR" | "last30HR" | "opposingPitcherHrVs" | "hrScore" | "hrScore" | "pitcherXera" | "pitcherFlyBallRate";
type MatchupSortKey = "rank" | "player" | "team" | "opposingPitcher" | "parkFactor" | "hrScore" | "opposingPitcherHrVs" | "opposingPitcherHitsVs" | "opposingPitcherKVs" | "hrTargetScore" | "bestMatchupScore" | "strikeoutMatchupScore" | "barrelRate" | "hardHitRate" | "xba" | "kRate" | "whiffRate";
type StrikeoutSortKey = "rank" | "pitcher" | "team" | "opponent" | "parkFactor" | "pitcherKRate" | "pitcherWhiffRate" | "pitcherKVs" | "opponentTeamKRate" | "opponentTeamWhiffRate" | "opponentTeamXba" | "strikeoutMatchupScore";

type HeatRange = { low: number; high: number };
type HeatIntent = "warm" | "cool" | "balance";
type HeatWeight = "primary" | "secondary";
type HeatStyleOptions = { intent?: HeatIntent; weight?: HeatWeight; invert?: boolean };
type PitcherHeatKey =
  | "xera"
  | "hardHitRate"
  | "barrelRate"
  | "kRate"
  | "bbRate"
  | "whiffRate"
  | "hrVs"
  | "hitsVs"
  | "kVs";
type BatterHeatKey =
  | "kRate"
  | "bbRate"
  | "barrelRate"
  | "hardHitRate"
  | "xba"
  | "whiffRate"
  | "last7HR"
  | "last30HR"
  | "opposingPitcherHrVs"
  | "hrScore";
type StrikeoutHeatKey =
  | "pitcherKRate"
  | "pitcherWhiffRate"
  | "pitcherKVs"
  | "opponentTeamKRate"
  | "opponentTeamWhiffRate"
  | "opponentTeamXba"
  | "strikeoutMatchupScore";

export type ParkSidebarRow = {
  key: string;
  matchup: string;
  awayTeam: string;
  homeTeam: string;
  stadium: string;
  parkFactor: number;
  hrPerGame: number | null;
  roofType: string;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: string;
  conditions: string;
};

export type PitcherVsBatterRow = {
  rank: number;
  gameKey: string;
  /** Canonical numeric MLB gamePk, passed through from the joined batter row. Null when upstream could not resolve one -- never fabricated. Doubleheader-safe; `gameKey` alone is not. */
  gameId: number | null;
  player: string;
  /** Display-only identity passthrough for joining historical batter-vs-pitcher context at render time. Never used in scoring, ranking, filtering, or sorting. */
  playerId: number | null;
  team: string;
  opposingPitcher: string;
  /** Display-only identity passthrough -- see playerId above. */
  opposingPitcherId: number | null;
  park: string;
  parkFactor: number;
  hrScore: number;
  opposingPitcherHrVs: number;
  opposingPitcherHitsVs: number;
  opposingPitcherKVs: number;
  hrTargetScore: number;
  bestMatchupScore: number;
  strikeoutMatchupScore: number;
  batterPowerScore: number;
  pitcherVulnerabilityScore: number;
  contextScore: number;
  barrelRate: number | null;
  hardHitRate: number | null;
  xba: number | null;
  kRate: number | null;
  whiffRate: number | null;
  pitcherBarrelRate: number | null;
  pitcherHardHitRate: number | null;
  pitcherKRate: number | null;
  pitcherFlyBallRate: number | null;
  windBlowingOut: boolean;
  angleTags: string[];
};

export type PitcherStrikeoutTeamRow = {
  rank: number;
  gameKey: string;
  /** Canonical numeric MLB gamePk, passed through from the pitcher's raw row. Null when upstream could not resolve one -- never fabricated. Doubleheader-safe; `gameKey` alone is not. */
  gameId: number | null;
  /** Canonical numeric MLB pitcher id, passed through from the pitcher's raw row. */
  pitcherId: number | null;
  pitcher: string;
  team: string;
  opponent: string;
  park: string;
  parkFactor: number;
  pitcherKRate: number | null;
  pitcherWhiffRate: number | null;
  pitcherKVs: number;
  opponentTeamKRate: number | null;
  opponentTeamWhiffRate: number | null;
  opponentTeamXba: number | null;
  pitcherKSkillScore: number;
  opponentTeamStrikeoutScore: number;
  strikeoutMatchupScore: number;
  whyItRanksWell: string;
  role?: string;
  projectedIP?: number | null;
  projectedK9?: number | null;
  projectedKs?: number | null;
  kLine?: number | null;
  kAdjustment?: number;
  kOddsOver?: string | null;
  kOddsUnder?: string | null;
  kOddsBook?: string | null;
  workloadRole?: string | null;
  projectionSource?: string | null;
  projectionFallbackReason?: string | null;
  publicRecommendationEligible?: boolean;
  legacyProjectedIP?: number | null;
  legacyProjectedKs?: number | null;
  candidateProjectedIP?: number | null;
  candidateProjectedKs?: number | null;
  effectiveProjectedIP?: number | null;
  effectiveProjectedKs?: number | null;
  workloadConfidenceGrade?: string | null;
  workloadConfidenceScore?: number | null;
  workloadFlags?: string[];
  /**
   * Precomputed by buildPitcherStrikeoutRows for display/debugging (e.g.
   * the Low Confidence table's exclusion badge). Optional and NOT the
   * source of truth for eligibility gating -- kPropBestBets.ts,
   * selectTopSocialKRows, and selectTopKValuePlays all call
   * resolveKPropStatus(row) fresh instead of trusting this field, so a
   * row built by a path that doesn't set it (e.g. an ad-hoc fixture, or
   * MlbGameDetail.tsx's no-data social fallback) is still classified
   * correctly rather than silently defaulting to eligible.
   */
  kProjectionStatus?: KPropStatus;
  kProjectionStatusReasons?: string[];
};

export const DEFAULT_TAB: TabKey = "batters";
export const DEFAULT_PITCHER_SORT = { key: "hrVs" as PitcherSortKey, direction: "desc" as SortDirection };
export const DEFAULT_BATTER_SORT = { key: "hrScore" as BatterSortKey, direction: "desc" as SortDirection };
export const DEFAULT_MATCHUP_SORT = { key: "bestMatchupScore" as MatchupSortKey, direction: "desc" as SortDirection };

const DASH = "--";
const ESPN_TEAM_ABBR: Record<string, string> = {
  AZ: "ari", ATH: "oak", WSH: "wsh", CWS: "chw", KCR: "kc",
  SDP: "sd", SFG: "sf", TBR: "tb", NYY: "nyy", NYM: "nym",
  LAD: "lad", LAA: "laa", BOS: "bos", CHC: "chc", CIN: "cin",
  CLE: "cle", COL: "col", DET: "det", HOU: "hou", MIA: "mia",
  MIL: "mil", MIN: "min", PHI: "phi", PIT: "pit", SEA: "sea",
  STL: "stl", TEX: "tex", TOR: "tor", ATL: "atl", BAL: "bal",
};

// ââ helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function normalizeText(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function normalizeTeamValue(v: unknown) { return normalizeText(v).toUpperCase(); }
function normalizeNumber(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function normalizeStringList(v: unknown) {
  return Array.isArray(v) ? v.map((e) => normalizeText(e)).filter(Boolean) : [];
}

function isStarterPlaceholder(value: unknown) {
  const normalized = normalizeText(value).toUpperCase();
  return !normalized || normalized === "TBD" || normalized === "TBA" || normalized === "TO BE ANNOUNCED" || normalized === "TO BE DETERMINED";
}

/**
 * Canonical MLB ids must be positive integers. Anything else (missing,
 * non-numeric, fractional, zero/negative) is represented as null —
 * unavailable — matching the generator, which warns and keeps the row
 * rather than fabricating an id.
 */
function normalizeCanonicalMlbId(v: unknown): number | null {
  const n = normalizeNumber(v);
  return n != null && Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeLineupStatus(v: unknown): HrLineupStatus {
  const s = normalizeText(v).toLowerCase();
  return s === "confirmed" || s === "projected" ? s : "unknown";
}

/** Batting order slot (1–9). Out-of-range or missing values are unavailable. */
function normalizeBattingOrder(v: unknown): number | null {
  const n = normalizeNumber(v);
  return n != null && Number.isInteger(n) && n >= 1 && n <= 9 ? n : null;
}

function normalizeGame(entry: unknown): HrDashboardGame | null {
  if (!isRecord(entry)) return null;
  const g = {
    gameKey: normalizeText(entry.gameKey),
    matchup: normalizeText(entry.matchup),
    awayTeam: normalizeTeamValue(entry.awayTeam),
    homeTeam: normalizeTeamValue(entry.homeTeam),
    stadium: normalizeText(entry.stadium) || "Unknown Venue",
    roofType: normalizeText(entry.roofType) || "Unknown",
    temperature: normalizeNumber(entry.temperature),
    precipitation: normalizeNumber(entry.precipitation),
    windSpeed: normalizeNumber(entry.windSpeed),
    windDirection: normalizeText(entry.windDirection) || DASH,
    conditions: normalizeText(entry.conditions) || DASH,
    parkFactor: normalizeNumber(entry.parkFactor),
  };
  if (!g.gameKey || !g.awayTeam || !g.homeTeam || g.parkFactor == null) return null;
  return g as HrDashboardGame;
}

function normalizePitcher(entry: unknown): HrDashboardPitcher | null {
  if (!isRecord(entry)) return null;
  const p = {
    gameKey: normalizeText(entry.gameKey),
    gameId: normalizeCanonicalMlbId(entry.gameId),
    pitcher: normalizeText(entry.pitcher),
    pitcherId: normalizeNumber(entry.pitcherId),
    team: normalizeTeamValue(entry.team),
    opponent: normalizeTeamValue(entry.opponent),
    hand: normalizeText(entry.hand) || "R",
    ballpark: normalizeText(entry.ballpark) || "Unknown Venue",
    parkFactor: normalizeNumber(entry.parkFactor),
    xera: normalizeNumber(entry.xera),
    hardHitRate: normalizeNumber(entry.hardHitRate),
    flyBallRate: normalizeNumber(entry.flyBallRate),
    last7HR: normalizeNumber(entry.last7HR) ?? 0,
    hrPerStart: normalizeNumber(entry.hrPerStart) ?? null,
    barrelRate: normalizeNumber(entry.barrelRate),
    kRate: normalizeNumber(entry.kRate),
    bbRate: normalizeNumber(entry.bbRate),
    whiffRate: normalizeNumber(entry.whiffRate),
    hrVs: normalizeNumber(entry.hrVs),
    hitsVs: normalizeNumber(entry.hitsVs),
    kVs: normalizeNumber(entry.kVs),
    kLine: normalizeNumber(entry.kLine),
    kOddsOver: normalizeText(entry.kOddsOver) || null,
    kOddsUnder: normalizeText(entry.kOddsUnder) || null,
    kOddsBook: normalizeText(entry.kOddsBook) || null,
    projectedIP: normalizeNumber(entry.projectedIP),
    projectedK9: normalizeNumber(entry.projectedK9),
    projectedKs: normalizeNumber(entry.projectedKs),
    workloadRole: normalizeText(entry.workloadRole) || null,
    projectionSource: normalizeText(entry.projectionSource) || null,
    projectionFallbackReason: normalizeText(entry.projectionFallbackReason) || null,
    // Missing/older cached payloads predate this field -- treat as eligible
    // (matches the pre-existing, unfiltered behavior) rather than silently
    // hiding every pitcher the moment this field is absent.
    publicRecommendationEligible: isRecord(entry) && "publicRecommendationEligible" in entry
      ? entry.publicRecommendationEligible !== false
      : true,
    legacyProjectedIP: normalizeNumber(entry.legacyProjectedIP),
    legacyProjectedKs: normalizeNumber(entry.legacyProjectedKs),
    candidateProjectedIP: normalizeNumber(entry.candidateProjectedIP),
    candidateProjectedKs: normalizeNumber(entry.candidateProjectedKs),
    effectiveProjectedIP: normalizeNumber(entry.effectiveProjectedIP),
    effectiveProjectedKs: normalizeNumber(entry.effectiveProjectedKs),
    workloadConfidenceGrade: normalizeText(entry.workloadConfidenceGrade) || null,
    workloadConfidenceScore: normalizeNumber(entry.workloadConfidenceScore),
    workloadFlags: normalizeStringList(entry.workloadFlags),
  };
  if (!p.pitcher || !p.team || !p.opponent || p.hrVs == null || p.hitsVs == null || p.kVs == null) return null;
  return p as HrDashboardPitcher;
}

function normalizeBatter(entry: unknown): HrDashboardBatter | null {
  if (!isRecord(entry)) return null;
  const b = {
    gameKey: normalizeText(entry.gameKey),
    playerId: normalizeCanonicalMlbId(entry.playerId),
    gameId: normalizeCanonicalMlbId(entry.gameId),
    lineupStatus: normalizeLineupStatus(entry.lineupStatus),
    battingOrder: normalizeBattingOrder(entry.battingOrder),
    starterConfirmed: typeof entry.starterConfirmed === "boolean" ? entry.starterConfirmed : null,
    position: normalizeText(entry.position) || null,
    player: normalizeText(entry.player),
    team: normalizeTeamValue(entry.team),
    opponent: normalizeTeamValue(entry.opponent),
    opposingPitcher: normalizeText(entry.opposingPitcher) || "TBD",
    opposingPitcherId: normalizeCanonicalMlbId(entry.opposingPitcherId),
    pitcherHand: normalizeText(entry.pitcherHand) || "R",
    ballpark: normalizeText(entry.ballpark) || "Unknown Venue",
    parkFactor: normalizeNumber(entry.parkFactor),
    atBats: normalizeNumber(entry.atBats),
    barrelRate: normalizeNumber(entry.barrelRate),
    hardHitRate: normalizeNumber(entry.hardHitRate),
    exitVelo: normalizeNumber(entry.exitVelo),
    iso: normalizeNumber(entry.iso),
    hrFBRatio: normalizeNumber(entry.hrFBRatio),
    pullRate: normalizeNumber(entry.pullRate),
    xba: normalizeNumber(entry.xba),
    kRate: normalizeNumber(entry.kRate),
    bbRate: normalizeNumber(entry.bbRate),
    whiffRate: normalizeNumber(entry.whiffRate),
    last7HR: normalizeNumber(entry.last7HR),
    last30HR: normalizeNumber(entry.last30HR),
    opposingPitcherHrVs: normalizeNumber(entry.opposingPitcherHrVs),
    opposingPitcherHitsVs: normalizeNumber(entry.opposingPitcherHitsVs),
    opposingPitcherKVs: normalizeNumber(entry.opposingPitcherKVs),
    weatherBoost: normalizeNumber(entry.weatherBoost),
    hrScore: normalizeNumber(entry.hrScore),
    hrScoreRank: normalizeNumber(entry.hrScoreRank),
    angleTags: normalizeStringList(entry.angleTags).slice(0, 3),
    hrLine: normalizeNumber(entry.hrLine),
    hrOddsYes: normalizeText(entry.hrOddsYes) || null,
    hrOddsNo: normalizeText(entry.hrOddsNo) || null,
    hrOddsBook: normalizeText(entry.hrOddsBook) || null,
    marketImpliedProbability: normalizeNumber(entry.marketImpliedProbability) ?? null,
    qualityRank: normalizeNumber(entry.qualityRank) ?? null,
    marketRank: normalizeNumber(entry.marketRank) ?? null,
    rankDifference: normalizeNumber(entry.rankDifference) ?? null,
    valueStatus: (["unavailable", "uncalibrated"].includes(String(entry.valueStatus ?? "")) ? String(entry.valueStatus) as "unavailable" | "uncalibrated" : null),
    modelVersion: normalizeText(entry.modelVersion) || null,
    confidenceLevel: (["high", "medium", "low", "incomplete"].includes(String(entry.confidenceLevel ?? "")) ? String(entry.confidenceLevel) as "high" | "medium" | "low" | "incomplete" : null),
    confidenceReasons: normalizeStringList(entry.confidenceReasons),
    dataCompletenessPercent: normalizeNumber(entry.dataCompletenessPercent) ?? null,
    explanation: normalizeText(entry.explanation) || null,
    hrValueEdge: null, // deprecated -- never read from source, always null
    hrImplied: normalizeNumber(entry.marketImpliedProbability) ?? null, // backward-compatible alias
    pitcherXera: normalizeNumber(entry.pitcherXera) ?? null,
    pitcherRegressionScore: normalizeNumber(entry.pitcherRegressionScore) ?? null,
    pitcherFlyBallRate: normalizeNumber(entry.pitcherFlyBallRate) ?? null,
    bats: (["L","R","S"].includes(String(entry.bats ?? "")) ? String(entry.bats) as "L"|"R"|"S" : null),
  };
  if (!b.player || !b.team || !b.opponent || b.hrScore == null || b.hrScoreRank == null) return null;
  return b as HrDashboardBatter;
}

/** Rejects a missing/null/non-object value and any object missing either non-empty string field -- the generator never writes a partial nextRunAt (see getNextRunAt() in generate-mlb-hr-props.mjs), so a partial value here is malformed, not a legitimately smaller shape. */
function normalizeNextRunAt(value: unknown): HrDashboardNextRunAt | null {
  if (!isRecord(value)) return null;
  const time = normalizeText(value.time);
  const label = normalizeText(value.label);
  if (!time || !label) return null;
  return { time, label };
}

/** Only `matchup` is required; every other field is copied only when present so a future generator field addition/removal degrades gracefully instead of invalidating the whole entry. */
function normalizePendingGame(entry: unknown): HrDashboardPendingGame | null {
  if (!isRecord(entry)) return null;
  const matchup = normalizeText(entry.matchup);
  if (!matchup) return null;
  return {
    matchup,
    gameKey: normalizeText(entry.gameKey) || undefined,
    gameId: normalizeNumber(entry.gameId),
    venue: normalizeText(entry.venue) || undefined,
    officialGameDate: normalizeText(entry.officialGameDate) || undefined,
    gameStartTime: normalizeText(entry.gameStartTime) || undefined,
    gameNumber: normalizeNumber(entry.gameNumber),
    doubleHeader: normalizeText(entry.doubleHeader) || undefined,
    missingPitcherSide: normalizeStringList(entry.missingPitcherSide),
  };
}

export function normalizeHrDashboardPayload(value: unknown): HrDashboardPayload | null {
  if (Array.isArray(value)) {
    return {
      date: "", generatedAt: "", games: [], pitchers: [],
      batters: value.map(normalizeBatter).filter((e): e is HrDashboardBatter => Boolean(e)),
      nextRunAt: null,
      pendingGames: [],
    };
  }
  if (!isRecord(value)) return null;
  const gameEnvironments = Array.isArray(value.gameEnvironments)
    ? value.gameEnvironments.filter(isRecord).map((g): HrGameEnvironment => ({
        gameKey: normalizeText(g.gameKey),
        matchup: normalizeText(g.matchup),
        ballpark: normalizeText(g.ballpark),
        gameHrEnvironmentScore: g.gameHrEnvironmentScore == null ? null : (normalizeNumber(g.gameHrEnvironmentScore) ?? null),
        parkFactor: g.parkFactor == null ? null : (normalizeNumber(g.parkFactor) ?? null),
        weatherEffect: g.weatherEffect == null ? null : (normalizeNumber(g.weatherEffect) ?? null),
        starterVulnerability: g.starterVulnerability == null ? null : (normalizeNumber(g.starterVulnerability) ?? null),
        qualifyingHitterCount: normalizeNumber(g.qualifyingHitterCount) ?? 0,
        avgQualifyingHitterScore: g.avgQualifyingHitterScore == null ? null : (normalizeNumber(g.avgQualifyingHitterScore) ?? null),
      }))
    : [];
  return {
    date: normalizeText(value.date),
    generatedAt: normalizeText(value.generatedAt),
    modelVersion: normalizeText(value.modelVersion) || undefined,
    games: Array.isArray(value.games) ? value.games.map(normalizeGame).filter((e): e is HrDashboardGame => Boolean(e)) : [],
    pitchers: Array.isArray(value.pitchers) ? value.pitchers.map(normalizePitcher).filter((e): e is HrDashboardPitcher => Boolean(e)) : [],
    batters: Array.isArray(value.batters) ? value.batters.map(normalizeBatter).filter((e): e is HrDashboardBatter => Boolean(e)) : [],
    gameEnvironments,
    nextRunAt: normalizeNextRunAt(value.nextRunAt),
    pendingGames: Array.isArray(value.pendingGames) ? value.pendingGames.map(normalizePendingGame).filter((e): e is HrDashboardPendingGame => Boolean(e)) : [],
  };
}

export function normalizeHrPropRows(value: unknown) {
  return normalizeHrDashboardPayload(value)?.batters ?? [];
}

export function normalizeHrBestBetsPayload(value: unknown): HrBestBetsPayload | null {
  if (!isRecord(value)) return null;
  const normalizePick = (entry: unknown): HrPropPick | null => {
    if (!isRecord(entry)) return null;
    const player = normalizeText(entry.player);
    const team = normalizeTeamValue(entry.team);
    const opponent = normalizeTeamValue(entry.opponent ?? entry.opp);
    const opposingPitcher = normalizeText(entry.opposingPitcher) || "TBD";
    const hrScoreRank = normalizeNumber(entry.hrScoreRank);
    if (!player || !team || !opponent || hrScoreRank == null) return null;
    return { player, team, opponent, opposingPitcher, hrScoreRank, topStats: normalizeStringList(entry.topStats).slice(0, 2), bullets: normalizeStringList(entry.bullets).slice(0, 2) };
  };
  const normalizePickList = (entry: unknown) => Array.isArray(entry) ? entry.map(normalizePick).filter((p): p is HrPropPick => Boolean(p)) : [];
  const slatePreview = isRecord(value.slatePreview) ? { slateOverview: normalizeText(value.slatePreview.slateOverview), modelNote: normalizeText(value.slatePreview.modelNote) } : null;
  return {
    date: normalizeText(value.date),
    generatedAt: normalizeText(value.generatedAt),
    slatePreview: slatePreview?.slateOverview && slatePreview?.modelNote ? slatePreview : null,
    bestBets: normalizePickList(value.bestBets),
    valueBets: normalizePickList(value.valueBets),
    longshots: normalizePickList(value.longshots),
  };
}

function quantile(values: number[], pct: number) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * pct;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function buildHeatRanges<T extends Record<string, unknown>>(rows: T[], keys: string[]) {
  return Object.fromEntries(keys.map((k) => {
    const vals = rows.map((r) => Number(r[k])).filter((v) => Number.isFinite(v));
    return [k, { low: quantile(vals, 0.1) ?? 0, high: quantile(vals, 0.9) ?? 0 } as HeatRange];
  })) as Record<string, HeatRange>;
}

const BATTER_TABLE_HEAT_CONFIG: Record<BatterHeatKey, HeatStyleOptions> = {
  kRate: { intent: "balance", weight: "secondary", invert: true },
  bbRate: { intent: "balance", weight: "secondary" },
  barrelRate: { intent: "balance", weight: "secondary" },
  hardHitRate: { intent: "balance", weight: "secondary" },
  xba: { intent: "balance", weight: "secondary" },
  whiffRate: { intent: "balance", weight: "secondary", invert: true },
  last7HR: { intent: "balance", weight: "secondary" },
  last30HR: { intent: "balance", weight: "secondary" },
  opposingPitcherHrVs: { intent: "warm", weight: "primary" },
  hrScore: { intent: "warm", weight: "primary" },
};

const PITCHER_TABLE_HEAT_CONFIG: Record<PitcherHeatKey, HeatStyleOptions> = {
  xera: { intent: "balance", weight: "secondary", invert: true },
  hardHitRate: { intent: "balance", weight: "secondary", invert: true },
  barrelRate: { intent: "balance", weight: "secondary", invert: true },
  kRate: { intent: "balance", weight: "secondary" },
  bbRate: { intent: "balance", weight: "secondary", invert: true },
  whiffRate: { intent: "balance", weight: "secondary" },
  hrVs: { intent: "balance", weight: "primary", invert: true },
  hitsVs: { intent: "balance", weight: "primary", invert: true },
  kVs: { intent: "balance", weight: "primary" },
};

const STRIKEOUT_TABLE_HEAT_CONFIG: Record<StrikeoutHeatKey, HeatStyleOptions> = {
  pitcherKRate: { intent: "balance", weight: "secondary" },
  pitcherWhiffRate: { intent: "balance", weight: "secondary" },
  pitcherKVs: { intent: "balance", weight: "primary" },
  opponentTeamKRate: { intent: "balance", weight: "secondary" },
  opponentTeamWhiffRate: { intent: "balance", weight: "secondary" },
  opponentTeamXba: { intent: "balance", weight: "secondary", invert: true },
  strikeoutMatchupScore: { intent: "balance", weight: "primary" },
};

export function buildHeatStatRanges(rows: HrDashboardBatter[]) {
  const ranges = buildHeatRanges(rows, ["barrelRate","hardHitRate","xba","kRate","bbRate","whiffRate","opposingPitcherHrVs","hrScore"]);
  return {
    ...ranges,
    last7HR: { low: 0, high: 5 },
    last30HR: { low: 0, high: 10 },
  };
}
function buildPitcherHeatRanges(rows: HrDashboardPitcher[]) {
  return buildHeatRanges(rows, ["xera","hardHitRate","flyBallRate","barrelRate","kRate","bbRate","whiffRate","hrVs","hitsVs","kVs"]);
}
function buildMatchupHeatRanges(rows: PitcherVsBatterRow[]) {
  return buildHeatRanges(rows, ["hrScore","opposingPitcherHrVs","opposingPitcherHitsVs","opposingPitcherKVs","hrTargetScore","bestMatchupScore","strikeoutMatchupScore","barrelRate","hardHitRate","xba","kRate","whiffRate"]);
}
function buildStrikeoutHeatRanges(rows: PitcherStrikeoutTeamRow[]) {
  return buildHeatRanges(rows, ["pitcherKRate","pitcherWhiffRate","pitcherKVs","opponentTeamKRate","opponentTeamWhiffRate","opponentTeamXba","strikeoutMatchupScore"]);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRange(value: number | null | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) return null;
  if (max <= min) return null;
  return clamp(((Number(value) - min) / (max - min)) * 100, 0, 100);
}

function weightedAverageAvailable(entries: Array<{ value: number | null; weight: number }>) {
  let weightedTotal = 0;
  let totalWeight = 0;
  entries.forEach(({ value, weight }) => {
    if (value == null || !Number.isFinite(value) || weight <= 0) return;
    weightedTotal += value * weight;
    totalWeight += weight;
  });
  if (!totalWeight) return null;
  return weightedTotal / totalWeight;
}

function getDefaultMatchupSortForLens(lens: MatchupLens) {
  if (lens === "hr") return { key: "hrTargetScore" as MatchupSortKey, direction: "desc" as SortDirection };
  if (lens === "strikeout") return { key: "strikeoutMatchupScore" as MatchupSortKey, direction: "desc" as SortDirection };
  return DEFAULT_MATCHUP_SORT;
}

export function getHeatCellStyle(
  value: number | null | undefined,
  range: HeatRange | undefined,
  options?: HeatStyleOptions,
): React.CSSProperties | undefined {
  if (!Number.isFinite(value) || !range || !Number.isFinite(range.low) || !Number.isFinite(range.high) || range.high <= range.low) return undefined;

  const intent = options?.intent ?? "balance";
  const weight = options?.weight ?? "secondary";
  const mid = (range.low + range.high) / 2;
  const den = Math.max((range.high - range.low) / 2, 0.0001);
  const norm = Math.max(-1, Math.min(1, (value! - mid) / den));
  const magnitude = Math.abs(norm);

  const neutralCutoff = weight === "primary" ? 0.16 : 0.48;
  const tintCutoff = weight === "primary" ? 0.42 : 0.70;
  const fillCutoff = weight === "primary" ? 0.76 : 0.90;
  if (magnitude < neutralCutoff) return undefined;

  const warm = weight === "primary"
    ? { text: "#7f1d1d", softFill: "rgba(220, 38, 38, 0.07)", strongFill: "rgba(220, 38, 38, 0.15)" }
    : { text: "#7f1d1d", softFill: "rgba(220, 38, 38, 0.05)", strongFill: "rgba(220, 38, 38, 0.09)" };
  const cool = weight === "primary"
    ? { text: "#1d4ed8", softFill: "rgba(37, 99, 235, 0.08)", strongFill: "rgba(37, 99, 235, 0.16)" }
    : { text: "#1d4ed8", softFill: "rgba(37, 99, 235, 0.05)", strongFill: "rgba(37, 99, 235, 0.10)" };
  const directionalNorm = options?.invert ? norm * -1 : norm;
  const palette = intent === "balance" ? (directionalNorm >= 0 ? warm : cool) : intent === "cool" ? cool : warm;

  if (magnitude >= fillCutoff) {
    return { backgroundColor: palette.strongFill, color: palette.text, fontWeight: 700 };
  }
  if (magnitude >= tintCutoff) {
    return { backgroundColor: palette.softFill, color: palette.text, fontWeight: 600 };
  }
  return { color: palette.text, fontWeight: 600 };
}

/** Gradient-background stat cell: green=elite, white=average, blue=below avg */
function GradCell({ value, display, avg, spread, higherBetter = true }: {
  value: number | null | undefined; display: string; avg: number; spread: number; higherBetter?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return <span className="text-[11px] text-slate-300">—</span>;
  const d = ((value - avg) / spread) * (higherBetter ? 1 : -1);
  const c = Math.max(-1, Math.min(1, d));
  const abs = Math.abs(c);
  // White/neutral baseline — only color truly notable outliers
  let bg = "transparent"; let col = "#374151";
  if (c > 0) {
    // Green only kicks in above 50th percentile equivalents
    if (abs > 0.80) { bg = "#15803d"; col = "#fff"; }           // top ~10%: dark green
    else if (abs > 0.55) { bg = "#22c55e"; col = "#fff"; }      // top ~20%: green
    else if (abs > 0.35) { bg = "rgba(22,163,74,0.18)"; col = "#15803d"; } // top ~35%: soft green tint
    // 0–0.35: white/transparent — average range, no color
  } else if (c < 0) {
    if (abs > 0.80) { bg = "#2563eb"; col = "#fff"; }           // bottom ~10%: blue
    else if (abs > 0.55) { bg = "rgba(59,130,246,0.45)"; col = "#1e3a8a"; } // bottom ~20%
    else if (abs > 0.35) { bg = "rgba(59,130,246,0.14)"; col = "#1e40af"; } // bottom ~35%: soft blue
  }
  return <span className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ backgroundColor: bg, color: col }}>{display}</span>;
}

/** Score pill: green=elite only, white=average, blue=below avg */
function StatScorePill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-400">—</span>;
  const v = Number(value);
  let bg = "rgba(148,163,184,0.15)"; let col = "#475569";
  if (v >= 72)      { bg = "#15803d"; col = "#fff"; }            // elite
  else if (v >= 65) { bg = "#22c55e"; col = "#fff"; }            // strong
  else if (v >= 58) { bg = "rgba(22,163,74,0.18)"; col = "#15803d"; } // above avg tint only
  // 50–57: neutral gray — no color
  else if (v < 50)  { const op = Math.min(0.10 + (50 - v) / 50 * 0.30, 0.40); bg = `rgba(59,130,246,${op})`; col = "#1e40af"; }
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums" style={{ backgroundColor: bg, color: col }}>{v.toFixed(1)}</span>;
}

function getBatterTableHeatStyle(
  stat: BatterHeatKey,
  value: number | null | undefined,
  ranges: Record<string, HeatRange>,
) {
  return getHeatCellStyle(value, ranges[stat], BATTER_TABLE_HEAT_CONFIG[stat]);
}

function getPitcherTableHeatStyle(
  stat: PitcherHeatKey,
  value: number | null | undefined,
  ranges: Record<string, HeatRange>,
) {
  return getHeatCellStyle(value, ranges[stat], PITCHER_TABLE_HEAT_CONFIG[stat]);
}

function getStrikeoutTableHeatStyle(
  stat: StrikeoutHeatKey,
  value: number | null | undefined,
  ranges: Record<string, HeatRange>,
) {
  return getHeatCellStyle(value, ranges[stat], STRIKEOUT_TABLE_HEAT_CONFIG[stat]);
}

function formatDateLabel(v?: string) {
  if (!v) return "";
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d);
}
function formatPercent(v: number | null | undefined, digits = 1) { return Number.isFinite(v) ? `${Number(v).toFixed(digits)}%` : DASH; }
function formatNumber(v: number | null | undefined, digits = 1) { return Number.isFinite(v) ? Number(v).toFixed(digits) : DASH; }
function formatDecimal(v: number | null | undefined, digits = 3) { return Number.isFinite(v) ? Number(v).toFixed(digits) : DASH; }
function getEspnTeamLogo(team?: string, dark = false) {
  const t = normalizeTeamValue(team) || "TBD";
  const folder = dark ? "500-dark" : "500";
  return `https://a.espncdn.com/i/teamlogos/mlb/${folder}/${ESPN_TEAM_ABBR[t] ?? t.toLowerCase()}.png`;
}

export function getParkFactorTone(value: number) {
  if (value >= 1.10) return "bg-green-500 text-white";
  if (value >= 1.04) return "bg-green-200 text-green-900";
  if (value <= 0.93) return "bg-blue-500 text-white";
  if (value <= 0.97) return "bg-blue-200 text-blue-900";
  return "bg-slate-200 text-slate-700";
}

export function getWindArrow(dir: string): string {
  const d = dir.trim().toUpperCase();
  const map: Record<string, string> = {
    N: "↓", NNE: "↓", NE: "↙", ENE: "←", E: "←", ESE: "←",
    SE: "↖", SSE: "↑", S: "↑", SSW: "↑", SW: "↗", WSW: "→",
    W: "→", WNW: "→", NW: "↘", NNW: "↓",
  };
  return map[d] ?? "";
}

function getScorePillTone(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "bg-slate-300 text-slate-700";
  if (value! >= 80) return "bg-emerald-500 text-white";
  if (value! >= 60) return "bg-sky-500 text-white";
  if (value! >= 40) return "bg-amber-400 text-white";
  return "bg-slate-300 text-slate-700";
}

function getPickTierClasses(tier: PickTier) {
  if (tier === "Best Bet") return "border-l-[3px] border-emerald-500";
  if (tier === "Value Play") return "border-l-[3px] border-amber-400";
  if (tier === "Longshot") return "border-l-[3px] border-purple-400";
  return "border-l-[3px] border-slate-300";
}

function getSparkFillClass(value: number | null | undefined, maxValue: number) {
  if (!Number.isFinite(value) || maxValue <= 0) return "bg-slate-300";
  const pct = (Number(value) / maxValue) * 100;
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-sky-500";
  if (pct >= 40) return "bg-amber-400";
  return "bg-slate-300";
}

export function buildParkSidebarRows(games: HrDashboardGame[]): ParkSidebarRow[] {
  return [...games].map((g) => {
    const factors = getParkFactors(g.stadium);
    return {
      key: g.gameKey, matchup: g.matchup, awayTeam: g.awayTeam, homeTeam: g.homeTeam,
      stadium: g.stadium, parkFactor: g.parkFactor,
      hrPerGame: factors?.hrPerGame ?? null,
      roofType: g.roofType, temperature: g.temperature, precipitation: g.precipitation,
      windSpeed: g.windSpeed, windDirection: g.windDirection, conditions: g.conditions,
    };
  }).sort((a, b) => b.parkFactor - a.parkFactor || a.matchup.localeCompare(b.matchup));
}

export function buildSlateSummary(pitchers: HrDashboardPitcher[], batters: HrDashboardBatter[], games: HrDashboardGame[]): SlateSummary {
  const strongestParks = buildParkSidebarRows(games)
    .slice(0, 2)
    .map((game) => `${game.stadium} (${game.parkFactor.toFixed(2)})`)
    .join(" • ");
  const topArm = [...pitchers].sort((left, right) => right.hrVs - left.hrVs)[0];
  const topBat = [...batters].sort((left, right) => right.hrScore - left.hrScore)[0];

  return {
    strongestParks: strongestParks || "No park context available",
    topArm: topArm ? `${topArm.pitcher} • HR VS ${topArm.hrVs.toFixed(1)}` : "No starter edge available",
    topBat: topBat ? `${topBat.player} • HR ${topBat.hrScore.toFixed(1)}` : "No batter edge available",
    hitterCount: batters.length,
  };
}

// ── Ballpark CF bearing (degrees from N, clockwise) ─────────────────────────
// The "CF bearing" is the compass direction a ball must travel to reach center
// field from home plate. Wind "blows out" when the wind direction is within
// ±75° of this bearing (wind pushing toward the outfield).
// Source: stadium orientations from publicly known field layouts.
const CF_BEARING: Record<string, number> = {
  "Truist Park": 35,          // ATL — CF toward NE
  "Oriole Park at Camden Yards": 55,  // BAL — CF toward NE
  "Fenway Park": 95,          // BOS — CF roughly E
  "Wrigley Field": 45,        // CHC — CF toward NE, SW wind blows out
  "Guaranteed Rate Field": 5, // CWS — CF toward N
  "Great American Ball Park": 20, // CIN — CF toward NNE
  "Progressive Field": 30,    // CLE — CF toward NNE
  "Coors Field": 15,          // COL — CF toward NNE
  "Comerica Park": 330,       // DET — CF toward NNW
  "Minute Maid Park": 25,     // HOU — retractable, irrelevant when closed
  "Kauffman Stadium": 10,     // KC — CF toward N
  "Dodger Stadium": 330,      // LAD — CF toward NNW
  "Angel Stadium": 30,        // LAA — CF toward NNE
  "loanDepot park": 20,       // MIA — retractable
  "American Family Field": 5, // MIL — retractable
  "Target Field": 350,        // MIN — CF toward N
  "Citi Field": 5,            // NYM — CF toward N
  "Yankee Stadium": 25,       // NYY — CF toward NNE
  "Oakland Coliseum": 350,    // ATH — CF toward N
  "Citizens Bank Park": 40,   // PHI — CF toward NE
  "PNC Park": 355,            // PIT — CF toward N
  "Petco Park": 340,          // SD — CF toward NNW
  "Oracle Park": 310,         // SF — CF toward NW (McCovey Cove end)
  "T-Mobile Park": 350,       // SEA — retractable
  "Busch Stadium": 5,         // STL — CF toward N
  "Tropicana Field": 0,       // TB — dome, irrelevant
  "Globe Life Field": 350,    // TEX — retractable
  "Rogers Centre": 15,        // TOR — retractable
  "Nationals Park": 5,        // WSH — CF toward N
  "Chase Field": 350,         // ARI — retractable
};

const RETRACTABLE_PARKS = new Set([
  "Minute Maid Park", "loanDepot park", "American Family Field",
  "T-Mobile Park", "Globe Life Field", "Rogers Centre", "Chase Field",
  "Tropicana Field",
]);

function isWindBlowingOut(stadium: string, roofType: string, windDirection: string, windSpeed: number | null): boolean {
  if (!windDirection || windDirection === "—" || windDirection === "CALM") return false;
  if (roofType === "Dome") return false;
  if (roofType === "Retractable" || RETRACTABLE_PARKS.has(stadium)) return false;
  if ((windSpeed ?? 0) < 4) return false; // too light to matter

  const cfBearing = CF_BEARING[stadium];
  if (cfBearing == null) return false;

  // Convert compass abbreviation to degrees
  const COMPASS: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5,
    SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  const windDeg = COMPASS[windDirection.toUpperCase()];
  if (windDeg == null) return false;

  // Wind "blows out" when wind direction is within ±75° of CF bearing
  const diff = Math.abs(((windDeg - cfBearing) + 540) % 360 - 180);
  return diff <= 75;
}

export function buildPitcherVsBatterRows(
  batters: HrDashboardBatter[],
  games: HrDashboardGame[],
  pitchers: HrDashboardPitcher[] = [],
) {
  const gameByKey = new Map(games.map((g) => [g.gameKey, g]));
  const pitcherById = new Map(pitchers.filter((pitcher) => pitcher.pitcherId != null).map((pitcher) => [pitcher.pitcherId as number, pitcher]));
  const pitcherByGameAndName = new Map(
    pitchers
      .filter((pitcher) => pitcher.gameKey && pitcher.pitcher)
      .map((pitcher) => [`${pitcher.gameKey}|${pitcher.pitcher.toLowerCase()}`, pitcher] as const),
  );

  return [...batters].map((b) => {
    const game = gameByKey.get(b.gameKey);
    const pitcher =
      (b.opposingPitcherId != null ? pitcherById.get(b.opposingPitcherId) : null)
      ?? pitcherByGameAndName.get(`${b.gameKey}|${b.opposingPitcher.toLowerCase()}`)
      ?? null;

    const hrVs = b.opposingPitcherHrVs ?? pitcher?.hrVs ?? 0;
    const hitsVs = b.opposingPitcherHitsVs ?? pitcher?.hitsVs ?? 0;
    const kVs = b.opposingPitcherKVs ?? pitcher?.kVs ?? 0;
    const batterPowerScore = weightedAverageAvailable([
      { value: normalizeRange(b.hrScore, 35, 85), weight: 0.5 },
      { value: normalizeRange(b.barrelRate, 4, 22), weight: 0.2 },
      { value: normalizeRange(b.hardHitRate, 28, 60), weight: 0.2 },
      { value: normalizeRange(b.hrFBRatio, 4, 28), weight: 0.1 },
    ]) ?? normalizeRange(b.hrScore, 35, 85) ?? 0;

    const pitcherVulnerabilityScore = weightedAverageAvailable([
      { value: normalizeRange(hrVs, 20, 85), weight: 0.3 },
      { value: normalizeRange(pitcher?.xera, 2.5, 6.5), weight: 0.25 },
      { value: normalizeRange(pitcher?.flyBallRate, 22, 48), weight: 0.2 },
      { value: normalizeRange(pitcher?.barrelRate, 3, 14), weight: 0.15 },
      { value: normalizeRange(pitcher?.hardHitRate, 28, 50), weight: 0.1 },
    ]) ?? normalizeRange(hrVs, 20, 85) ?? 0;

    const contextScore = weightedAverageAvailable([
      { value: normalizeRange(game?.parkFactor ?? b.parkFactor, 0.8, 1.3), weight: 0.7 },
      { value: normalizeRange(b.weatherBoost, -8, 8), weight: 0.2 },
    ]) ?? normalizeRange(game?.parkFactor ?? b.parkFactor, 0.8, 1.3) ?? 0;

    const pitcherBoostMultiplier = clamp(0.85 + 0.25 * (pitcherVulnerabilityScore / 100), 0.9, 1.08);
    const hrTargetScore = Number((batterPowerScore * pitcherBoostMultiplier + 0.15 * contextScore).toFixed(1));
    const bestMatchupScore = Number((
      0.65 * hrTargetScore
      + 0.2 * (normalizeRange(hitsVs, 20, 85) ?? 0)
      + 0.15 * contextScore
    ).toFixed(1));
    const strikeoutMatchupScore = Number((
      weightedAverageAvailable([
        { value: normalizeRange(kVs, 15, 85), weight: 0.55 },
        { value: normalizeRange(b.kRate, 10, 38), weight: 0.3 },
        { value: normalizeRange(b.whiffRate, 12, 42), weight: 0.15 },
      ]) ?? 0
    ).toFixed(1));

    return {
      rank: 0, gameKey: b.gameKey, gameId: b.gameId ?? null, player: b.player, playerId: b.playerId, team: b.team,
      opposingPitcher: b.opposingPitcher, opposingPitcherId: b.opposingPitcherId, park: game?.stadium ?? b.ballpark,
      parkFactor: game?.parkFactor ?? b.parkFactor, hrScore: b.hrScore,
      opposingPitcherHrVs: hrVs,
      opposingPitcherHitsVs: hitsVs,
      opposingPitcherKVs: kVs,
      hrTargetScore,
      bestMatchupScore,
      strikeoutMatchupScore,
      batterPowerScore: Number(batterPowerScore.toFixed(1)),
      pitcherVulnerabilityScore: Number(pitcherVulnerabilityScore.toFixed(1)),
      contextScore: Number(contextScore.toFixed(1)),
      barrelRate: b.barrelRate, hardHitRate: b.hardHitRate, xba: b.xba, kRate: b.kRate, whiffRate: b.whiffRate,
      pitcherBarrelRate: pitcher?.barrelRate ?? null,
      pitcherHardHitRate: pitcher?.hardHitRate ?? null,
      pitcherKRate: pitcher?.kRate ?? null,
      pitcherFlyBallRate: pitcher?.flyBallRate ?? null,
      windBlowingOut: isWindBlowingOut(game?.stadium ?? b.ballpark, game?.roofType ?? "", game?.windDirection ?? "—", game?.windSpeed ?? null),
      angleTags: b.angleTags,
    };
  }).sort((a, b) =>
    b.bestMatchupScore - a.bestMatchupScore
    || b.hrScore - a.hrScore
    || (Number(b.barrelRate) - Number(a.barrelRate))
    || a.player.localeCompare(b.player))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function averageNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value) => Number.isFinite(value)).map((value) => Number(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function pickDeterministicVariant(options: string[], seed: number) {
  if (!options.length) return "";
  return options[Math.abs(seed) % options.length];
}

function buildStrikeoutWhyText(row: {
  rank: number;
  strikeoutMatchupScore: number;
  pitcherKSkillScore: number;
  pitcherKRate: number | null;
  pitcherWhiffRate: number | null;
  pitcherKVs: number;
  opponentTeamKRate: number | null;
  opponentTeamWhiffRate: number | null;
  opponentTeamXba: number | null;
}) {
  const drivers: Array<{ strength: number; text: string; family: "pitcher" | "team" | "contact" }> = [];

  if (row.pitcherKVs >= 72) drivers.push({ strength: 98, text: "elite pitcher K VS", family: "pitcher" });
  else if (row.pitcherKVs >= 62) drivers.push({ strength: 88, text: "strong pitcher K VS", family: "pitcher" });
  else if (row.pitcherKVs >= 52) drivers.push({ strength: 75, text: "solid pitcher K VS", family: "pitcher" });

  if (row.pitcherKRate != null) {
    if (row.pitcherKRate >= 30) drivers.push({ strength: 94, text: "a true bat-missing K%", family: "pitcher" });
    else if (row.pitcherKRate >= 26) drivers.push({ strength: 80, text: "above-average strikeout rate", family: "pitcher" });
  }

  if (row.pitcherWhiffRate != null) {
    if (row.pitcherWhiffRate >= 30) drivers.push({ strength: 90, text: "elite whiff ability", family: "pitcher" });
    else if (row.pitcherWhiffRate >= 27) drivers.push({ strength: 76, text: "strong whiff profile", family: "pitcher" });
  }

  if (row.opponentTeamKRate != null) {
    if (row.opponentTeamKRate >= 27) drivers.push({ strength: 92, text: "a high-strikeout lineup", family: "team" });
    else if (row.opponentTeamKRate >= 24) drivers.push({ strength: 78, text: "meaningful team K tendency", family: "team" });
    else if (row.opponentTeamKRate <= 20.5) drivers.push({ strength: 58, text: "limited team K tendency", family: "team" });
  }

  if (row.opponentTeamWhiffRate != null) {
    if (row.opponentTeamWhiffRate >= 29) drivers.push({ strength: 86, text: "a swing-and-miss lineup", family: "team" });
    else if (row.opponentTeamWhiffRate >= 26) drivers.push({ strength: 72, text: "above-average team whiff", family: "team" });
  }

  if (row.opponentTeamXba != null) {
    if (row.opponentTeamXba <= 0.232) drivers.push({ strength: 84, text: "below-average team xBA", family: "contact" });
    else if (row.opponentTeamXba <= 0.242) drivers.push({ strength: 70, text: "suppressed contact quality", family: "contact" });
    else if (row.opponentTeamXba >= 0.265) drivers.push({ strength: 60, text: "firmer contact quality", family: "contact" });
  }

  const top = [...drivers].sort((left, right) => right.strength - left.strength);
  const uniqueTop = top.filter((driver, index) => top.findIndex((candidate) => candidate.text === driver.text) === index);
  const primary = uniqueTop[0];
  const secondary = uniqueTop.find((driver) => driver.family !== primary?.family) ?? uniqueTop[1];
  const tertiary = uniqueTop.find((driver) => driver !== primary && driver !== secondary && driver.family === "contact");
  const seed = Math.max(0, row.rank - 1);

  if (!primary) {
    return "Balanced strikeout setup from current pitcher and opponent-team inputs.";
  }

  if (row.strikeoutMatchupScore >= 60) {
    if (primary.family === "pitcher" && secondary) {
      return pickDeterministicVariant([
        `Strong K indicators meet ${secondary.text}.`,
        `Pitcher K skill carries the grade here, with ${secondary.text} helping.`,
        `Bat-missing ability leads this spot, and ${secondary.text} keeps it elevated.`,
        `This matchup is driven by pitcher K skill, with ${secondary.text} adding support.`,
      ], seed);
    }
    if (primary.family === "team" && secondary) {
      return pickDeterministicVariant([
        `Opponent strikeout tendency boosts the matchup, and ${secondary.text} helps.`,
        `Lineup swing-and-miss risk sets the tone here, with ${secondary.text} in support.`,
        `This spot leans on ${primary.text}, while ${secondary.text} keeps it favorable.`,
        `Team-level K risk leads the case, and ${secondary.text} adds lift.`,
      ], seed);
    }
  }

  if (row.strikeoutMatchupScore >= 52) {
    if (primary.family === "pitcher" && secondary && tertiary) {
      return pickDeterministicVariant([
        `Above-average K indicators pair with ${secondary.text} and ${tertiary.text}.`,
        `This spot is driven by pitcher skill, with ${secondary.text} and ${tertiary.text} supporting it.`,
        `Pitcher-side strikeout ability stands out here, while ${secondary.text} and ${tertiary.text} help.`,
        `K skill is the main reason this lands well, with ${secondary.text} and ${tertiary.text} adding support.`,
      ], seed);
    }
    if (primary.family === "team" && secondary) {
      return pickDeterministicVariant([
        `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} boosts this matchup, with ${secondary.text} supporting it.`,
        `This matchup gets a lift from ${primary.text}, and ${secondary.text} helps.`,
        `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is the clearest edge, while ${secondary.text} adds support.`,
        `Team-level swing-and-miss risk drives this spot, with ${secondary.text} helping.`,
      ], seed);
    }
  }

  if (secondary && secondary.text === "firmer contact quality") {
    return pickDeterministicVariant([
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} helps here, but firmer contact quality keeps it out of the top tier.`,
      `There is some strikeout appeal here, but firmer contact quality limits the ceiling.`,
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is useful, though firmer contact quality tempers the spot.`,
    ], seed);
  }

  if (secondary) {
    return pickDeterministicVariant([
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is the main driver, with ${secondary.text} adding support.`,
      `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} carries the matchup, and ${secondary.text} helps.`,
      `The clearest edge is ${primary.text}, with ${secondary.text} keeping the spot viable.`,
    ], seed);
  }

  return pickDeterministicVariant([
    `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is doing most of the work in this strikeout spot.`,
    `${primary.text.charAt(0).toUpperCase()}${primary.text.slice(1)} is the clearest reason this matchup holds up.`,
    `Most of the strikeout case here comes from ${primary.text}.`,
  ], seed);
}

export function buildPitcherStrikeoutRows(
  batters: HrDashboardBatter[],
  games: HrDashboardGame[],
  pitchers: HrDashboardPitcher[] = [],
) {
  const gameByKey = new Map(games.map((game) => [game.gameKey, game]));
  const battersByGameAndTeam = new Map<string, HrDashboardBatter[]>();

  batters.forEach((batter) => {
    const key = `${batter.gameKey}|${batter.team}`;
    const existing = battersByGameAndTeam.get(key);
    if (existing) existing.push(batter);
    else battersByGameAndTeam.set(key, [batter]);
  });

  const rows = [...pitchers]
    .map((pitcher) => {
      const opponentBatters = battersByGameAndTeam.get(`${pitcher.gameKey}|${pitcher.opponent}`) ?? [];
      const game = gameByKey.get(pitcher.gameKey);
      // The current HR props page payload does not include lineup slot or projected-PA weights,
      // so the opponent-team strikeout lens uses stable slate-level averages from the hitters
      // already attached to this game/team instead of inventing a weighting model here.
      // If the route payload later exposes batting-order slot or projected PA, this is the
      // place to swap these flat averages for lineup-weighted team aggregates.
      const opponentTeamKRate = averageNullable(opponentBatters.map((batter) => batter.kRate));
      const opponentTeamWhiffRate = averageNullable(opponentBatters.map((batter) => batter.whiffRate));
      const opponentTeamXba = averageNullable(opponentBatters.map((batter) => batter.xba));

      const pitcherKSkillScore = weightedAverageAvailable([
        { value: normalizeRange(pitcher.kVs, 15, 85), weight: 0.5 },
        { value: normalizeRange(pitcher.kRate, 15, 35), weight: 0.3 },
        { value: normalizeRange(pitcher.whiffRate, 15, 35), weight: 0.2 },
      ]) ?? normalizeRange(pitcher.kVs, 15, 85) ?? 0;

      const opponentTeamStrikeoutScore = weightedAverageAvailable([
        { value: normalizeRange(opponentTeamKRate, 14, 28), weight: 0.5 },
        { value: normalizeRange(opponentTeamWhiffRate, 18, 36), weight: 0.3 },
        { value: 100 - (normalizeRange(opponentTeamXba, 0.21, 0.29) ?? 50), weight: 0.2 },
      ]) ?? weightedAverageAvailable([
        { value: normalizeRange(opponentTeamKRate, 14, 28), weight: 0.6 },
        { value: normalizeRange(opponentTeamWhiffRate, 18, 36), weight: 0.4 },
      ]) ?? 0;

      const strikeoutMatchupScore = Number((weightedAverageAvailable([
        { value: pitcherKSkillScore, weight: 0.4 },
        { value: normalizeRange(opponentTeamKRate, 14, 28), weight: 0.3 },
        { value: normalizeRange(opponentTeamWhiffRate, 18, 36), weight: 0.2 },
        { value: 100 - (normalizeRange(opponentTeamXba, 0.21, 0.29) ?? 50), weight: 0.1 },
      ]) ?? 0).toFixed(1));

      return {
        rank: 0,
        gameKey: pitcher.gameKey,
        gameId: pitcher.gameId ?? null,
        pitcherId: pitcher.pitcherId ?? null,
        pitcher: pitcher.pitcher,
        team: pitcher.team,
        opponent: pitcher.opponent,
        park: game?.stadium ?? pitcher.ballpark,
        parkFactor: game?.parkFactor ?? pitcher.parkFactor,
        pitcherKRate: pitcher.kRate,
        pitcherWhiffRate: pitcher.whiffRate,
        pitcherKVs: pitcher.kVs,
        opponentTeamKRate,
        opponentTeamWhiffRate,
        opponentTeamXba,
        pitcherKSkillScore: Number(pitcherKSkillScore.toFixed(1)),
        opponentTeamStrikeoutScore: Number(opponentTeamStrikeoutScore.toFixed(1)),
        strikeoutMatchupScore,
        whyItRanksWell: "",
        kLine: pitcher.kLine ?? null,
        kOddsOver: pitcher.kOddsOver ?? null,
        kOddsUnder: pitcher.kOddsUnder ?? null,
        kOddsBook: pitcher.kOddsBook ?? null,
        projectedIP: pitcher.projectedIP ?? null,
        projectedK9: pitcher.projectedK9 ?? null,
        projectedKs: pitcher.projectedKs ?? null,
        workloadRole: pitcher.workloadRole ?? null,
        projectionSource: pitcher.projectionSource ?? null,
        projectionFallbackReason: pitcher.projectionFallbackReason ?? null,
        publicRecommendationEligible: pitcher.publicRecommendationEligible ?? true,
        legacyProjectedIP: pitcher.legacyProjectedIP ?? null,
        legacyProjectedKs: pitcher.legacyProjectedKs ?? null,
        candidateProjectedIP: pitcher.candidateProjectedIP ?? null,
        candidateProjectedKs: pitcher.candidateProjectedKs ?? null,
        effectiveProjectedIP: pitcher.effectiveProjectedIP ?? null,
        effectiveProjectedKs: pitcher.effectiveProjectedKs ?? null,
        workloadConfidenceGrade: pitcher.workloadConfidenceGrade ?? null,
        workloadConfidenceScore: pitcher.workloadConfidenceScore ?? null,
        workloadFlags: pitcher.workloadFlags ?? [],
      };
    })
    .sort((left, right) =>
      right.strikeoutMatchupScore - left.strikeoutMatchupScore
      || right.pitcherKSkillScore - left.pitcherKSkillScore
      || right.opponentTeamStrikeoutScore - left.opponentTeamStrikeoutScore
      || left.pitcher.localeCompare(right.pitcher));

  return rows.map((row, index) => {
    const rank = index + 1;
    const { status, reasons } = resolveKPropStatus(row);
    return {
      ...row,
      rank,
      whyItRanksWell: buildStrikeoutWhyText({
        rank,
        strikeoutMatchupScore: row.strikeoutMatchupScore,
        pitcherKSkillScore: row.pitcherKSkillScore,
        pitcherKRate: row.pitcherKRate,
        pitcherWhiffRate: row.pitcherWhiffRate,
        pitcherKVs: row.pitcherKVs,
        opponentTeamKRate: row.opponentTeamKRate,
        opponentTeamWhiffRate: row.opponentTeamWhiffRate,
        opponentTeamXba: row.opponentTeamXba,
      }),
      kProjectionStatus: status,
      kProjectionStatusReasons: reasons,
    };
  });
}

function buildStrikeoutReasonTags(row: {
  parkFactor: number;
  pitcherKRate: number | null;
  pitcherKSkillScore: number;
  pitcherWhiffRate: number | null;
  opponentTeamKRate: number | null;
  opponentTeamWhiffRate: number | null;
  opponentTeamXba: number | null;
}, opponentKSampleSize: number) {
  const tags: string[] = [];

  if ((row.opponentTeamKRate ?? 0) >= 26) tags.push("High-K opponent");
  else if ((row.opponentTeamKRate ?? 0) >= 23) tags.push("Above-average opponent K%");

  if (row.pitcherKSkillScore >= 72 || (row.pitcherKRate ?? 0) >= 28 || (row.pitcherWhiffRate ?? 0) >= 31) {
    tags.push("Strong K pitcher");
  } else if (row.pitcherKSkillScore >= 58) {
    tags.push("Solid K pitcher");
  }

  if ((row.opponentTeamWhiffRate ?? 0) >= 29) tags.push("Swing-and-miss lineup");
  if ((row.opponentTeamXba ?? 1) <= 0.235) tags.push("Weak contact lineup");
  if (row.parkFactor <= 0.97) tags.push("Pitcher-friendly park");
  if (opponentKSampleSize <= 4) tags.push("Small-sample lineup");

  return tags.slice(0, 3);
}

export function buildPitcherStrikeoutMatchupRows(
  pitchers: HrDashboardPitcher[],
  batters: HrDashboardBatter[],
  games: HrDashboardGame[],
) {
  const detailedRows = buildPitcherStrikeoutRows(batters, games, pitchers);
  const opponentSampleByGameAndTeam = new Map<string, number>();

  batters.forEach((batter) => {
    const key = `${batter.gameKey}|${batter.team}`;
    opponentSampleByGameAndTeam.set(key, (opponentSampleByGameAndTeam.get(key) ?? 0) + 1);
  });

  return detailedRows.map((row) => {
    const opponentKSampleSize = opponentSampleByGameAndTeam.get(`${row.gameKey}|${row.opponent}`) ?? 0;

    return {
      rank: row.rank,
      gameKey: row.gameKey,
      gameId: row.gameId,
      pitcherId: row.pitcherId,
      pitcher: row.pitcher,
      team: row.team,
      opponent: row.opponent,
      park: row.park,
      parkFactor: row.parkFactor,
      opponentTeamKRate: row.opponentTeamKRate,
      opponentKSampleSize,
      pitcherKAbilityScore: row.pitcherKSkillScore,
      kRate: row.pitcherKRate,
      whiffRate: row.pitcherWhiffRate,
      kMatchupScore: row.strikeoutMatchupScore,
      reasonTags: buildStrikeoutReasonTags(row, opponentKSampleSize),
      kLine: row.kLine,
      kOddsOver: row.kOddsOver,
      kOddsUnder: row.kOddsUnder,
      kOddsBook: row.kOddsBook,
    };
  });
}

export function buildTbdGameKeySet(pitchers: HrDashboardPitcher[], batters: HrDashboardBatter[]) {
  const gameKeys = new Set<string>();
  pitchers.forEach((pitcher) => {
    if (pitcher.gameKey && isStarterPlaceholder(pitcher.pitcher)) {
      gameKeys.add(pitcher.gameKey);
    }
  });
  batters.forEach((batter) => {
    if (batter.gameKey && isStarterPlaceholder(batter.opposingPitcher)) {
      gameKeys.add(batter.gameKey);
    }
  });
  return gameKeys;
}

export function buildTbdFootnotes(
  tbdGameKeys: Set<string>,
  games: HrDashboardGame[],
  pitchers: HrDashboardPitcher[],
  batters: HrDashboardBatter[],
) {
  if (!tbdGameKeys.size) return [];
  const gameByKey = new Map(games.map((game) => [game.gameKey, game]));
  const fallbackMatchupByKey = new Map<string, string>();
  pitchers.forEach((pitcher) => {
    if (!pitcher.gameKey || fallbackMatchupByKey.has(pitcher.gameKey)) return;
    if (pitcher.team && pitcher.opponent) fallbackMatchupByKey.set(pitcher.gameKey, `${pitcher.team} @ ${pitcher.opponent}`);
  });
  batters.forEach((batter) => {
    if (!batter.gameKey || fallbackMatchupByKey.has(batter.gameKey)) return;
    if (batter.team && batter.opponent) fallbackMatchupByKey.set(batter.gameKey, `${batter.team} @ ${batter.opponent}`);
  });
  return [...tbdGameKeys]
    .map((gameKey) => gameByKey.get(gameKey)?.matchup || fallbackMatchupByKey.get(gameKey) || gameKey)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function sortPitchers(rows: HrDashboardPitcher[], key: PitcherSortKey, dir: SortDirection) {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    const base = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
    return dir === "asc" ? base : -base;
  });
}
export function sortBatters(rows: HrDashboardBatter[], key: BatterSortKey, dir: SortDirection) {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    const base = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
    return dir === "asc" ? base : -base;
  });
}
function sortMatchups(rows: PitcherVsBatterRow[], key: MatchupSortKey, dir: SortDirection) {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    const base = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
    return dir === "asc" ? base : -base;
  });
}

function sortStrikeoutRows(rows: PitcherStrikeoutTeamRow[], key: StrikeoutSortKey, dir: SortDirection) {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    const base = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
    return dir === "asc" ? base : -base;
  });
}

function makeSortIndicator(active: boolean, dir: SortDirection) {
  if (!active) return "";
  return dir === "asc" ? " ↑" : " ↓";
}

// ââ colour helpers (inline-style based) âââââââââââââââââââââââââââââââââââââ

function parkFactorStyle(v: number): React.CSSProperties {
  if (v >= 1.15) return { backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, display: "inline-block" };
  if (v <= 0.9)  return { backgroundColor: "#e0f2fe", color: "#075985", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, display: "inline-block" };
  return { backgroundColor: "#f1f5f9", color: "#475569", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, display: "inline-block" };
}

function scorePillStyle(v: number | null | undefined): React.CSSProperties {
  const base: React.CSSProperties = { borderRadius: 999, padding: "2px 6px", fontSize: 12, fontWeight: 700, display: "inline-block", minWidth: 52, textAlign: "center", border: "1px solid rgba(148,163,184,0.18)", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
  if (!Number.isFinite(v)) return { ...base, backgroundColor: "#cbd5e1", color: "#475569", borderColor: "rgba(148,163,184,0.22)" };
  if (v! >= 80) return { ...base, backgroundColor: "#10b981", color: "#ffffff", borderColor: "rgba(16,185,129,0.28)" };
  if (v! >= 60) return { ...base, backgroundColor: "#0ea5e9", color: "#ffffff", borderColor: "rgba(14,165,233,0.28)" };
  if (v! >= 40) return { ...base, backgroundColor: "#fbbf24", color: "#ffffff", borderColor: "rgba(251,191,36,0.28)" };
  return { ...base, backgroundColor: "#cbd5e1", color: "#475569", borderColor: "rgba(148,163,184,0.22)" };
}

// ââ sub-components âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function TeamLogoBadge({ team, size = 24, showLabel = true, dark = false }: { team?: string; size?: number; showLabel?: boolean; dark?: boolean }) {
  const [failed, setFailed] = useState(false);
  const t = normalizeTeamValue(team) || "TBD";
  const colors = getMlbTeamColors(t);
  if (failed) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#fff", backgroundColor: colors.primary, minWidth: size }}>
        {t}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <img src={getEspnTeamLogo(t, dark)} alt={`${t} logo`} width={size} height={size} style={{ objectFit: "contain" }} loading="lazy" onError={() => setFailed(true)} />
      {showLabel && <span style={{ fontSize: 13, fontWeight: 500, color: "#475569" }}>{t}</span>}
    </span>
  );
}

export function ScorePill({ value, label }: { value: number | null | undefined; label?: string }) {
  if (!Number.isFinite(value)) return <span style={{ color: "#94a3b8" }}>{DASH}</span>;
  return <span style={scorePillStyle(value)}>{label ?? Number(value).toFixed(1)}</span>;
}

function AngleTag({ tag }: { tag: string }) {
  return (
    <span style={{ borderRadius: 999, backgroundColor: "#f1f5f9", padding: "2px 8px", fontSize: 11, fontWeight: 600, color: "#475569" }}>{tag}</span>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ borderRadius: 12, border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", padding: "8px 12px", fontSize: 13, color: "#0f172a", outline: "none", minWidth: 220 }}
    />
  );
}

function GameSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: Array<{ label: string; value: string }>; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ borderRadius: 12, border: "1px solid #cbd5e1", backgroundColor: "#fff", padding: "8px 12px", fontSize: 13, color: "#0f172a", outline: "none" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function DataLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600" aria-label="Table color legend">
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-green-600" aria-hidden="true" /><span>Stronger relative values use green highlights.</span></span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-blue-500" aria-hidden="true" /><span>Weaker relative values use cooler blue highlights.</span></span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-200" aria-hidden="true" /><span>Neutral values remain subdued.</span></span>
      <span>Colors are comparative within the current slate and metric.</span>
    </div>
  );
}

function StatSpark({
  value,
  maxValue,
}: {
  value: number | null | undefined;
  maxValue: number;
}) {
  const width = Number.isFinite(value) ? Math.min((Number(value) / maxValue) * 100, 100) : 0;

  return (
    <div className="mt-1 h-1 rounded-full bg-slate-100">
      <div
        className={cn("h-1 rounded-full", getSparkFillClass(value, maxValue))}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function PickCard({ pick, row, tier = "Unknown" }: { pick: HrPropPick; row?: HrDashboardBatter; tier?: PickTier }) {
  const teamColor = getMlbTeamColors(pick.team).primary;

  return (
    <article className={cn("rounded-2xl border border-slate-200 bg-white p-3 shadow-sm", getPickTierClasses(tier))}>
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl px-2 py-1.5" style={{ backgroundColor: `${teamColor}12` }}>
          <div className="text-base font-bold text-slate-900">{pick.player}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <TeamLogoBadge team={pick.team} />
            <span>vs</span>
            <TeamLogoBadge team={pick.opponent} />
          </div>
        </div>
        <ScorePill value={row?.hrScore ?? null} label={`#${pick.hrScoreRank}`} />
      </div>

      <div className="mt-3 text-sm text-slate-600">
        Pitcher: {pick.opposingPitcher}{row?.pitcherHand ? ` (${row.pitcherHand})` : ""}
      </div>
      {row ? (
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-slate-400">Barrel%</div>
            <div className="mt-0.5 font-semibold text-slate-900">{formatPercent(row.barrelRate)}</div>
            <StatSpark value={row.barrelRate} maxValue={25} />
          </div>
          <div>
            <div className="text-slate-400">Hard Hit%</div>
            <div className="mt-0.5 font-semibold text-slate-900">{formatPercent(row.hardHitRate)}</div>
            <StatSpark value={row.hardHitRate} maxValue={60} />
          </div>
          <div>
            <div className="text-slate-400">HR Score</div>
            <div className="mt-0.5 font-semibold text-slate-900">{formatNumber(row.hrScore, 1)}</div>
            <StatSpark value={row.hrScore} maxValue={100} />
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pick.topStats.map((stat) => (
          <span key={`${pick.player}-${stat}`} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{stat}</span>
        ))}
      </div>
      <ul className="mt-3 space-y-0.5 text-xs text-slate-700">
        {pick.bullets.map((bullet) => <li key={`${pick.player}-${bullet}`}>• {bullet}</li>)}
      </ul>
      <div className="mt-3 text-xs text-slate-400">{row?.ballpark ?? "Ballpark TBD"}</div>
    </article>
  );
}

function ThBtn({ onClick, children, style }: { onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "inherit", fontWeight: "inherit", color: "inherit", textAlign: "left", ...style }}>
      {children}
    </button>
  );
}

function HeaderHelp({ label, description }: { label: string; description: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          title={description}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-black normal-case tracking-normal text-slate-500 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-3 text-left normal-case tracking-normal">
        <div className="text-xs font-bold text-slate-900">{label}</div>
        <p className="mt-1 text-xs font-normal leading-5 text-slate-600">{description}</p>
      </PopoverContent>
    </Popover>
  );
}

// ââ main component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** Shared xERA color-tier lookup -- used by both the desktop table cell and the mobile metric grid so the thresholds never drift apart. */
function getXeraToneStyle(x: number): { bg: string; text: string } {
  if (x <= 3.0) return { bg: "#172554", text: "#60a5fa" };
  if (x <= 3.5) return { bg: "#1e3a8a", text: "#93c5fd" };
  if (x <= 4.0) return { bg: "#dbeafe", text: "#1d4ed8" };
  if (x <= 4.5) return { bg: "#f1f5f9", text: "#64748b" };
  if (x <= 5.0) return { bg: "#dcfce7", text: "#15803d" };
  if (x <= 5.5) return { bg: "#166534", text: "#86efac" };
  return { bg: "#14532d", text: "#bbf7d0" };
}

/** Shared pitcher-regression color-tier lookup -- used by both the desktop table cell and the mobile metric grid so the thresholds never drift apart. */
function getRegressionToneStyle(s: number): { bg: string; text: string; label: string } {
  if (s >= 3) return { bg: "#14532d", text: "#bbf7d0", label: "↑" };
  if (s >= 0.5) return { bg: "#dcfce7", text: "#15803d", label: "↑" };
  if (s > -0.5) return { bg: "#f1f5f9", text: "#64748b", label: "—" };
  if (s > -3) return { bg: "#dbeafe", text: "#1d4ed8", label: "↓" };
  return { bg: "#1e3a8a", text: "#93c5fd", label: "↓↓" };
}

/** Shared batter angle-tag fallback -- used by both the desktop table cell and the mobile metric grid so the thresholds never drift apart. */
function getBatterAngleTags(row: Pick<HrDashboardBatter, "angleTags" | "barrelRate" | "hardHitRate" | "last7HR" | "last30HR" | "opposingPitcherHrVs">): string[] {
  if (row.angleTags.length) return row.angleTags;
  if (row.barrelRate != null && row.barrelRate >= 15) return ["Barrel edge"];
  if (row.hardHitRate != null && row.hardHitRate >= 52) return ["Hard hit edge"];
  if (row.last7HR != null && row.last7HR >= 2) return ["Hot streak"];
  if (row.last30HR != null && row.last30HR >= 6) return ["Power trend"];
  if (row.opposingPitcherHrVs != null && row.opposingPitcherHrVs >= 65) return ["Weak arm"];
  return [];
}

/** Compact labeled tile for the mobile "HR Model Metrics" expand grid -- mirrors MlbBvpHistoryPanel's StatTile styling for visual consistency between the two expanded grids. */
function MetricTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 flex items-center gap-1">{children}</div>
    </div>
  );
}

export default function MlbHrProps() {
  usePageSeo(getSeoMeta("mlb-hr-props"));
  // Use the shared hook so HR/K/hit tables and game matchups always read from
  // the same data source and poll together every 10 minutes.
  const { dashboard, bestBets, status } = useMlbPropsData();
  // Display-only batter-vs-pitcher history (career + trailing-5Y PA/H/AVG/HR),
  // joined at render time by (batter id, opposing pitcher id). Never read by
  // hrScore, matchup scores, rankings, filters, or sorting anywhere below.
  const { loading: bvpHistoryLoading, fileUnavailable: bvpHistoryUnavailable, historyByKey: bvpHistoryByKey } = useMlbBvpHistory();
  const [bvpExpandedBatterKey, setBvpExpandedBatterKey] = useState<string | null>(null);
  const [bvpExpandedMatchupKey, setBvpExpandedMatchupKey] = useState<string | null>(null);
  /** Mobile-only expand toggle for the Strikeout Matchup lens's compact rows -- there is no batter-vs-pitcher panel for a team-level strikeout row, so this tracks expansion locally instead of reusing bvpExpandedMatchupKey. */
  const [expandedStrikeoutRowKey, setExpandedStrikeoutRowKey] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  /** Below the `lg` breakpoint (1024px): compact expandable-row layout instead of the desktop data tables. Rendered via JS branch (not CSS display toggling) so only one copy of each row ever sits in the DOM. */
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [activeMatchupLens, setActiveMatchupLens] = useState<MatchupLens>("best");
  const [pitcherSortKey, setPitcherSortKey] = useState<PitcherSortKey>(DEFAULT_PITCHER_SORT.key);
  const [pitcherSortDirection, setPitcherSortDirection] = useState<SortDirection>(DEFAULT_PITCHER_SORT.direction);
  const [batterSortKey, setBatterSortKey] = useState<BatterSortKey>(DEFAULT_BATTER_SORT.key);
  const [batterSortDirection, setBatterSortDirection] = useState<SortDirection>(DEFAULT_BATTER_SORT.direction);
  const [matchupSortKey, setMatchupSortKey] = useState<MatchupSortKey>(DEFAULT_MATCHUP_SORT.key);
  const [matchupSortDirection, setMatchupSortDirection] = useState<SortDirection>(DEFAULT_MATCHUP_SORT.direction);
  const [strikeoutSortKey, setStrikeoutSortKey] = useState<StrikeoutSortKey>("strikeoutMatchupScore");
  const [strikeoutSortDirection, setStrikeoutSortDirection] = useState<SortDirection>("desc");
  const [pitcherSearch, setPitcherSearch] = useState("");
  const [batterSearch, setBatterSearch] = useState("");
  const [matchupSearch, setMatchupSearch] = useState("");
  const [pitcherGameFilter, setPitcherGameFilter] = useState("all");
  const [batterGameFilter, setBatterGameFilter] = useState("all");
  const [matchupGameFilter, setMatchupGameFilter] = useState("all");
  const [hrFilterActive, setHrFilterActive] = useState(false);

  usePageSeo({
    title: "MLB HR Props Today 2026 — Home Run Model & Rankings | Joe Knows Ball",
    description: "Daily MLB home run prop rankings built from barrel rate, exit velocity, park factors, and pitcher HR vulnerability. Free HR prop model with Statcast power metrics updated every day.",
    path: "/mlb/hr-props",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.joeknowsball.com/" },
          { "@type": "ListItem", position: 2, name: "MLB", item: "https://www.joeknowsball.com/mlb" },
          { "@type": "ListItem", position: 3, name: "MLB HR Props", item: "https://www.joeknowsball.com/mlb/hr-props" },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "How does the MLB HR prop model work?",
            acceptedAnswer: { "@type": "Answer", text: "The HR Quality Score ranks batters using barrel rate, hard hit rate, exit velocity, park factor, and opposing pitcher HR vulnerability. It is a relative matchup-quality ranking, not a calibrated probability. Higher scores indicate a stronger HR-favorable matchup profile relative to other batters on the slate." },
          },
          {
            "@type": "Question",
            name: "What is a good HR Quality Score?",
            acceptedAnswer: { "@type": "Answer", text: "Scores of 65 or higher represent strong matchup profiles relative to the rest of the slate. Scores between 58 and 65 are above-average. Scores below 50 indicate below-average matchup conditions for HR props. This is a ranking score, not a probability of hitting a home run." },
          },
        ],
      },
    ],
  });

  useEffect(() => {
    const syncMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setIsCompactLayout(window.innerWidth < 1024);
    };

    syncMobile();
    window.addEventListener("resize", syncMobile);
    return () => window.removeEventListener("resize", syncMobile);
  }, []);

  const allGames = dashboard?.games ?? [];
  const allPitchers = dashboard?.pitchers ?? [];
  const allBatters = dashboard?.batters ?? [];
  const tbdGameKeys = useMemo(() => buildTbdGameKeySet(allPitchers, allBatters), [allBatters, allPitchers]);
  const gameEnvironments = useMemo(
    () => (dashboard?.gameEnvironments ?? []).filter((g) => !tbdGameKeys.has(g.gameKey)),
    [dashboard, tbdGameKeys],
  );
  const games = useMemo(() => allGames.filter((game) => !tbdGameKeys.has(game.gameKey)), [allGames, tbdGameKeys]);
  const pitchers = useMemo(
    () => allPitchers.filter((pitcher) => !tbdGameKeys.has(pitcher.gameKey) && !isStarterPlaceholder(pitcher.pitcher)),
    [allPitchers, tbdGameKeys],
  );
  const { data: pitcherRegressionData } = usePitcherRegression();

  // Build a live regression lookup: id->score and name->score
  // This enriches batter rows when the generator wrote stale zero values
  const regressionByIdOrName = useMemo(() => {
    const byId = new Map<number, number>();
    const byName = new Map<string, number>();
    for (const p of pitcherRegressionData) {
      if (p.pitcherId != null) byId.set(p.pitcherId, p.regressionScore);
      byName.set(p.name.toLowerCase().trim(), p.regressionScore);
    }
    return { byId, byName };
  }, [pitcherRegressionData]);

  // Enrich batter rows with live regression scores
  const enrichedBatters = useMemo(() => {
    if (pitcherRegressionData.length === 0) return allBatters;
    return allBatters.map((b) => {
      const fromId = b.opposingPitcherId != null ? regressionByIdOrName.byId.get(b.opposingPitcherId) : undefined;
      const fromName = regressionByIdOrName.byName.get((b.opposingPitcher ?? "").toLowerCase().trim());
      const live = fromId ?? fromName;
      if (live === undefined) return b;
      return { ...b, pitcherRegressionScore: live };
    });
  }, [allBatters, pitcherRegressionData, regressionByIdOrName]);

  const batters = useMemo(
    () => enrichedBatters.filter((batter) => !tbdGameKeys.has(batter.gameKey) && !isStarterPlaceholder(batter.opposingPitcher)),
    [enrichedBatters, tbdGameKeys],
  );
  const tbdFootnotes = useMemo(() => buildTbdFootnotes(tbdGameKeys, allGames, allPitchers, allBatters), [allBatters, allGames, allPitchers, tbdGameKeys]);
  const parkRows = useMemo(() => buildParkSidebarRows(games), [games]);
  const slateSummary = useMemo(() => buildSlateSummary(pitchers, batters, games), [pitchers, batters, games]);
  const pitcherHeat = useMemo(() => buildPitcherHeatRanges(pitchers), [pitchers]);
  const batterHeat = useMemo(() => buildHeatStatRanges(batters), [batters]);
  const matchupRows = useMemo(() => buildPitcherVsBatterRows(batters, games, pitchers), [batters, games, pitchers]);
  const matchupHeat = useMemo(() => buildMatchupHeatRanges(matchupRows), [matchupRows]);
  const strikeoutRows = useMemo(() => buildPitcherStrikeoutRows(batters, games, pitchers), [batters, games, pitchers]);
  const strikeoutHeat = useMemo(() => buildStrikeoutHeatRanges(strikeoutRows), [strikeoutRows]);
  const batterLookup = useMemo(() => new Map(batters.map((row) => [`${row.player}|${row.team}|${row.opponent}`, row])), [batters]);
  const hasHrOdds = useMemo(() => batters.some(b => b.hrOddsYes != null), [batters]);
  const visibleBestBets = useMemo(
    () => bestBets?.bestBets.filter((pick) => !isStarterPlaceholder(pick.opposingPitcher) && batterLookup.has(`${pick.player}|${pick.team}|${pick.opponent}`)) ?? [],
    [bestBets, batterLookup],
  );
  const bestBetKeys = useMemo(() => new Set(bestBets?.bestBets.map((pick) => `${pick.player}|${pick.team}|${pick.opponent}`) ?? []), [bestBets]);
  const valueBetKeys = useMemo(() => new Set(bestBets?.valueBets.map((pick) => `${pick.player}|${pick.team}|${pick.opponent}`) ?? []), [bestBets]);
  const longshotKeys = useMemo(() => new Set(bestBets?.longshots.map((pick) => `${pick.player}|${pick.team}|${pick.opponent}`) ?? []), [bestBets]);

  const gameOptions = useMemo(
    () => [{ label: "All games", value: "all" }, ...games.map((game) => ({ label: game.matchup, value: game.gameKey }))],
    [games],
  );

  const filteredPitchers = useMemo(() => {
    const query = pitcherSearch.trim().toLowerCase();
    const rows = pitchers.filter((row) => {
      if (pitcherGameFilter !== "all" && row.gameKey !== pitcherGameFilter) return false;
      if (!query) return true;
      return [
        row.pitcher,
        row.team,
        row.opponent,
        row.ballpark,
      ].some((value) => value.toLowerCase().includes(query));
    });
    return sortPitchers(rows, pitcherSortKey, pitcherSortDirection);
  }, [pitcherGameFilter, pitcherSearch, pitcherSortDirection, pitcherSortKey, pitchers]);

  const gameByKey = useMemo(() => new Map(games.map((g) => [g.gameKey, g])), [games]);

  // Sin City filter — uses canonical evaluateSinCityHitter from mlbHrFilter
  const applyHrFilter = useCallback((
    row: { gameKey: string; barrelRate?: number | null; hardHitRate?: number | null; exitVelo?: number | null;
           pullRate?: number | null; ballpark?: string; },
  ) => {
    if (!hrFilterActive) return true;
    const game = gameByKey.get(row.gameKey);
    const evaluation = evaluateSinCityHitter({
      barrelRate: row.barrelRate,
      pullRate: row.pullRate,
      hardHitRate: row.hardHitRate,
      exitVelo: row.exitVelo,
      stadium: row.ballpark ?? game?.stadium,
      roofType: (row as any).roofType ?? game?.roofType,
      windDirection: (row as any).windDirection ?? game?.windDirection,
      windSpeed: (row as any).windSpeed ?? game?.windSpeed,
    });
    return evaluation.qualifies;
  }, [hrFilterActive, gameByKey]);

  const filteredBatters = useMemo(() => {
    const query = batterSearch.trim().toLowerCase();
    const rows = batters.filter((row) => {
      if (batterGameFilter !== "all" && row.gameKey !== batterGameFilter) return false;
      // Minimum 50 AB when data is available
      if (row.atBats != null && row.atBats < 50) return false;
      // Barrel rate sanity cap — >25% is a small-sample artifact (no MLB player sustains this)
      if (row.barrelRate != null && row.barrelRate > 25) return false;
      if (!applyHrFilter(row)) return false;
      if (!query) return true;
      return [
        row.player,
        row.team,
        row.opposingPitcher,
        row.ballpark,
      ].some((value) => value.toLowerCase().includes(query));
    });
    return sortBatters(rows, batterSortKey, batterSortDirection);
  }, [applyHrFilter, batterGameFilter, batterSearch, batterSortDirection, batterSortKey, batters]);

  const filteredMatchups = useMemo(() => {
    const query = matchupSearch.trim().toLowerCase();
    const rows = matchupRows.filter((row) => {
      if (matchupGameFilter !== "all" && row.gameKey !== matchupGameFilter) return false;
      if (!applyHrFilter(row)) return false;
      if (!query) return true;
      return [
        row.player,
        row.team,
        row.opposingPitcher,
        row.park,
      ].some((value) => value.toLowerCase().includes(query));
    });
    return sortMatchups(rows, matchupSortKey, matchupSortDirection);
  }, [applyHrFilter, matchupGameFilter, matchupRows, matchupSearch, matchupSortDirection, matchupSortKey]);

  const filteredStrikeoutRows = useMemo(() => {
    const query = matchupSearch.trim().toLowerCase();
    const rows = strikeoutRows.filter((row) => {
      if (matchupGameFilter !== "all" && row.gameKey !== matchupGameFilter) return false;
      if (!query) return true;
      return [
        row.pitcher,
        row.team,
        row.opponent,
        row.park,
      ].some((value) => value.toLowerCase().includes(query));
    });
    return sortStrikeoutRows(rows, strikeoutSortKey, strikeoutSortDirection);
  }, [matchupGameFilter, matchupSearch, strikeoutRows, strikeoutSortDirection, strikeoutSortKey]);

  useEffect(() => {
    const next = getDefaultMatchupSortForLens(activeMatchupLens);
    if (activeMatchupLens === "strikeout") {
      setStrikeoutSortKey("strikeoutMatchupScore");
      setStrikeoutSortDirection("desc");
      return;
    }
    setMatchupSortKey(next.key);
    setMatchupSortDirection(next.direction);
  }, [activeMatchupLens]);

  const topMatchupCards = activeMatchupLens === "strikeout" ? filteredStrikeoutRows.slice(0, 4) : filteredMatchups.slice(0, 4);
  const hasData = allGames.length > 0 || allPitchers.length > 0 || allBatters.length > 0 || tbdFootnotes.length > 0;
  const matchupSectionCopy = activeMatchupLens === "best"
    ? "Balanced overall hitter-vs-pitcher attackability, blending HR upside with broader pitcher weakness and game context."
    : activeMatchupLens === "hr"
      ? "HR-specific damage lens that keeps batter power first, then layers in pitcher home-run vulnerability and park context."
      : "Pitcher-vs-opponent-team strikeout model blending pitcher K skill with opposing team K%, whiff%, and xBA for today’s slate.";

  const handlePitcherSort = (key: PitcherSortKey) => {
    setPitcherSortDirection((current) => (pitcherSortKey === key ? (current === "asc" ? "desc" : "asc") : key === "pitcher" || key === "gameKey" ? "asc" : "desc"));
    setPitcherSortKey(key);
  };

  const handleBatterSort = (key: BatterSortKey) => {
    setBatterSortDirection((current) => (batterSortKey === key ? (current === "asc" ? "desc" : "asc") : key === "player" || key === "team" || key === "opposingPitcher" ? "asc" : "desc"));
    setBatterSortKey(key);
  };

  const handleMatchupSort = (key: MatchupSortKey) => {
    setMatchupSortDirection((current) => (matchupSortKey === key ? (current === "asc" ? "desc" : "asc") : key === "player" || key === "team" || key === "opposingPitcher" ? "asc" : "desc"));
    setMatchupSortKey(key);
  };

  const handleStrikeoutSort = (key: StrikeoutSortKey) => {
    setStrikeoutSortDirection((current) => (strikeoutSortKey === key ? (current === "asc" ? "desc" : "asc") : key === "pitcher" || key === "team" || key === "opponent" ? "asc" : "desc"));
    setStrikeoutSortKey(key);
  };

  const toggleBvpBatterRow = (row: { playerId: number | null; opposingPitcherId: number | null }) => {
    const key = keyForBvpRow(row.playerId, row.opposingPitcherId);
    setBvpExpandedBatterKey((current) => (current === key ? null : key));
  };

  const toggleBvpMatchupRow = (row: { playerId: number | null; opposingPitcherId: number | null }) => {
    const key = keyForBvpRow(row.playerId, row.opposingPitcherId);
    setBvpExpandedMatchupKey((current) => (current === key ? null : key));
  };

  /**
   * Shared batter-vs-pitcher history detail panel -- used by both the
   * Batter View table and the Matchups table, since both row types carry
   * the same (playerId, opposingPitcherId) identity pair. Display-only:
   * this never reads or writes hrScore, matchup scores, rankings,
   * recommendations, confidence, eligibility, or sorting.
   */
  function BvpDetailPanel({ playerId, opposingPitcherId, player, opposingPitcher }: {
    playerId: number | null; opposingPitcherId: number | null; player: string; opposingPitcher: string;
  }) {
    if (bvpHistoryLoading) return <MlbBvpHistoryPanelLoading />;
    if (bvpHistoryUnavailable) return <MlbBvpHistoryPanelUnavailable batter={player} />;
    const key = keyForBvpRow(playerId, opposingPitcherId);
    const entry = key ? bvpHistoryByKey.get(key) : undefined;
    if (!entry) return <MlbBvpHistoryPanelUnavailable batter={player} />;
    return <MlbBvpHistoryPanel entry={entry} batter={player} pitcher={opposingPitcher} />;
  }

  return (
      <main className={cn("site-page bg-[#edf2f7] pb-12 pt-3 text-slate-900", isMobile ? "text-[14px]" : "")}>
        <div>
          <div className="mb-3"><MlbNavHero /></div>
          {!hasData ? (
            <div className="space-y-3">
              <div className="rounded-[30px] bg-[#0f2748] px-5 py-5 text-white shadow-sm">
                <h1 className={cn("font-semibold tracking-[-0.04em]", isMobile ? "text-[28px]" : "text-3xl sm:text-4xl")}>MLB HR Prop Dashboard</h1>
                <p className={cn("mt-2 max-w-3xl leading-6 text-sky-100", isMobile ? "text-[13px]" : "text-sm")}>
                  Starting pitcher vulnerability, park environment, and batter power/contact angles for today&apos;s slate.
                </p>
              </div>
              <FreshnessStatus status={status} />
            </div>
          ) : (
              <section className="space-y-3">
                <div className="rounded-[30px] bg-[#0f2748] px-5 py-5 text-white shadow-sm">
                  <div className={cn("flex flex-col gap-3", isMobile ? "" : "lg:flex-row lg:items-start lg:justify-between")}>
                    <div>
                      <h1 className={cn("font-semibold tracking-[-0.04em]", isMobile ? "text-[28px]" : "text-3xl sm:text-4xl")}>MLB HR Prop Dashboard</h1>
                      <p className={cn("mt-2 max-w-3xl leading-6 text-sky-100", isMobile ? "text-[13px]" : "text-sm")}>
                        Starting pitcher vulnerability, park environment, and batter power/contact angles for today&apos;s slate.
                      </p>
                      <p className={cn("mt-1 max-w-3xl leading-5 text-sky-200/70", isMobile ? "text-[11px]" : "text-xs")}>
                        HR Quality Score is a relative matchup-quality ranking, not a calibrated probability.
                      </p>
                    </div>
                    <div className={cn("flex flex-wrap gap-2", isMobile ? "items-center justify-between" : "")}>
                      <span className={cn("rounded-full bg-white/10 px-3 py-1 font-semibold text-white", isMobile ? "text-[13px]" : "text-sm")}>👥 {slateSummary.hitterCount} hitters</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-sky-200">
                    <span>{formatDateLabel(dashboard?.date || bestBets?.date)}</span>
                    <span>•</span>
                    <span>{games.length} games</span>
                    <span>•</span>
                    <span>{pitchers.length} starters</span>
                  </div>
                </div>

                <FreshnessStatus status={status} />

                <MlbParkFactorsStrip parks={parkRows} perspective="hitter" subtitle="Today's park and weather context" />

                <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="border-l-2 border-sky-500 pl-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">🏟️ Strongest Parks</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.strongestParks}</div>
                    </div>
                    <div>
                      <div className="border-l-2 border-sky-500 pl-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">🎯 Top Arm</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.topArm}</div>
                    </div>
                    <div>
                      <div className="border-l-2 border-sky-500 pl-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">💥 Top Bat</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.topBat}</div>
                    </div>
                  </div>
                  {bestBets?.slatePreview ? (
                    <div className="mt-3 border-t border-sky-200 pt-3 text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">📝 Slate note:</span> {bestBets.slatePreview.slateOverview}
                    </div>
                  ) : null}
                </div>

                <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="max-w-4xl text-sm leading-7 text-slate-600">
                    This board ranks today&apos;s batters by HR Quality Score — a relative measure of home-run matchup strength built from barrel rate, hard-hit rate, recent power, and the opposing pitcher&apos;s HR vulnerability. It&apos;s a ranking tool for research, not a prediction of who will homer or a guaranteed pick.
                  </p>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <h2 className="text-base font-bold text-slate-900">How to read this page</h2>
                    <dl className="mt-2 grid gap-x-5 gap-y-2 text-xs leading-5 text-slate-600 sm:grid-cols-2">
                      <div><dt className="inline font-bold text-slate-900">HR Score — </dt><dd className="inline">Higher scores indicate stronger relative home-run matchups today. It is not a probability.</dd></div>
                      <div><dt className="inline font-bold text-slate-900">HR Odds — </dt><dd className="inline">Current sportsbook anytime-home-run price when available.</dd></div>
                      <div><dt className="inline font-bold text-slate-900">Market % — </dt><dd className="inline">Raw implied probability from the sportsbook odds. It is not adjusted for vig and is not a model estimate.</dd></div>
                      <div><dt className="inline font-bold text-slate-900">Use both together — </dt><dd className="inline">Compare matchup strength with the available market price to identify research opportunities.</dd></div>
                    </dl>
                  </div>
                </section>

                <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4">
                    <div className="flex flex-nowrap gap-3 overflow-x-auto whitespace-nowrap" style={{ WebkitOverflowScrolling: "touch" }}>
                      {[
                        { key: "batters", label: "💥 Batters" },
                        { key: "matchups", label: "⚔️ Matchup Lenses" },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveTab(tab.key as TabKey)}
                          className={cn(
                            "border-b-2 px-1 py-3 text-sm font-semibold whitespace-nowrap transition",
                            activeTab === tab.key
                              ? "border-sky-700 text-sky-800"
                              : "border-transparent text-slate-500 hover:text-slate-900",
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3">
                    {activeTab === "pitchers" ? (
                      <section className="space-y-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">🔥 Pitcher View</h2>
                            <p className="mt-1 text-sm text-slate-500">Sorted by highest HR VS by default. Score columns carry the strongest emphasis; raw traits stay more restrained.</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={pitcherSearch}
                              onChange={(event) => setPitcherSearch(event.target.value)}
                              placeholder="Search pitcher or park"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <GameSelect value={pitcherGameFilter} onChange={setPitcherGameFilter} options={gameOptions} label="Game" />
                          </div>
                        </div>
                        <DataLegend />
                        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                          <table className="min-w-full border-separate border-spacing-0 text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                              <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                {[
                                  ["pitcher", "Pitcher"],
                                  ["gameKey", "Game"],
                                  ["parkFactor", "Park"],
                                  ["xera", "xERA"],
                                  ["hardHitRate", "Hard Hit%"],
                                  ["flyBallRate", "FB%"],
                                  ["barrelRate", "Barrel%"],
                                  ["kRate", "K%"],
                                  ["bbRate", "BB%"],
                                  ["whiffRate", "Whiff%"],
                                  ["hrVs", "HR VS"],
                                  ["hitsVs", "Hits VS"],
                                  ["kVs", "K VS"],
                                  ["last7HR", "L7 HR"],
                                  ["hrPerStart", "HR/GS"],
                                ].map(([key, label]) => (
                                  <th key={key} className="border-b border-slate-200 bg-white px-4 py-1 text-left font-semibold whitespace-nowrap">
                                    <button type="button" onClick={() => handlePitcherSort(key as PitcherSortKey)} className="transition hover:text-slate-900">
                                      {label}{makeSortIndicator(pitcherSortKey === key, pitcherSortDirection)}
                                    </button>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredPitchers.length ? filteredPitchers.map((pitcher) => (
                                <tr key={`${pitcher.gameKey}-${pitcher.team}-${pitcher.pitcher}`} className="odd:bg-white even:bg-slate-50/60">
                                  <td className="border-b border-slate-100 px-4 py-1.5 min-w-[180px]">
                                    <div className="font-medium text-slate-900">{pitcher.pitcher}</div>
                                    <div className="mt-1 text-xs text-slate-500">{pitcher.ballpark}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-1.5 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <TeamLogoBadge team={pitcher.team} size={20} showLabel={false} />
                                      <span>{pitcher.team}</span>
                                      <span className="text-slate-400">vs</span>
                                      <TeamLogoBadge team={pitcher.opponent} size={20} showLabel={false} />
                                      <span>{pitcher.opponent}</span>
                                    </div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-1.5">
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(pitcher.parkFactor))}>
                                      {pitcher.parkFactor.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("xera", pitcher.xera, pitcherHeat)}>{formatNumber(pitcher.xera, 2)}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("hardHitRate", pitcher.hardHitRate, pitcherHeat)}>{formatPercent(pitcher.hardHitRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("flyBallRate", pitcher.flyBallRate, pitcherHeat)}>{formatPercent(pitcher.flyBallRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("barrelRate", pitcher.barrelRate, pitcherHeat)}>{formatPercent(pitcher.barrelRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("kRate", pitcher.kRate, pitcherHeat)}>{formatPercent(pitcher.kRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("bbRate", pitcher.bbRate, pitcherHeat)}>{formatPercent(pitcher.bbRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("whiffRate", pitcher.whiffRate, pitcherHeat)}>{formatPercent(pitcher.whiffRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("hrVs", pitcher.hrVs, pitcherHeat)}><ScorePill value={pitcher.hrVs} /></td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("hitsVs", pitcher.hitsVs, pitcherHeat)}><ScorePill value={pitcher.hitsVs} /></td>
                                  <td className="border-b border-slate-100 px-4 py-1.5" style={getPitcherTableHeatStyle("kVs", pitcher.kVs, pitcherHeat)}><ScorePill value={pitcher.kVs} /></td>
                                  <td className="border-b border-slate-100 px-4 py-1.5 text-center font-semibold">{pitcher.last7HR}</td>
                                  <td className="border-b border-slate-100 px-4 py-1.5 text-center text-slate-600">{pitcher.hrPerStart != null ? pitcher.hrPerStart.toFixed(2) : "—"}</td>
                                </tr>
                              )) : (
                                <tr>
                                  <td colSpan={14} className="border-b border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
                                    No pitchers match the current search or game filter.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ) : null}

                    {activeTab === "batters" ? (
                      <section className="space-y-3">

                        {/* ── Insight tables: Overdue Batters + Biggest Mismatches ── */}
                        {(() => {
                          const overdue = batters
                            .filter(b =>
                              !tbdGameKeys.has(b.gameKey) &&
                              !isStarterPlaceholder(b.opposingPitcher) &&
                              (b.atBats == null || b.atBats >= 50) &&
                              (b.barrelRate == null || b.barrelRate <= 25) &&
                              b.hrScore >= 58 &&
                              (b.last7HR ?? 0) <= 1 &&
                              ((b.barrelRate ?? 0) >= 11 || (b.hardHitRate ?? 0) >= 45)
                            )
                            .sort((a, b) => b.hrScore - a.hrScore)
                            .slice(0, 8);

                          const mismatches = batters
                            .filter(b =>
                              !tbdGameKeys.has(b.gameKey) &&
                              !isStarterPlaceholder(b.opposingPitcher) &&
                              (b.atBats == null || b.atBats >= 50) &&
                              (b.barrelRate == null || b.barrelRate <= 25) &&
                              b.hrScore >= 58 &&
                              (b.opposingPitcherHrVs ?? 0) >= 55 &&
                              ((b.pitcherXera ?? 0) >= 4.5 || (b.pitcherRegressionScore ?? 0) > 2)
                            )
                            .sort((a, b) => b.hrScore - a.hrScore)
                            .slice(0, 8);

                          if (!overdue.length && !mismatches.length) return null;

                          return (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                              {/* Overdue Batters */}
                              {overdue.length > 0 && (
                                <div id="overdue" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                  <div className="mb-3">
                                    <h3 className="text-base font-extrabold text-amber-900">⏳ Overdue Batters</h3>
                                    <p className="text-xs text-amber-700 mt-0.5">Strong HR score + good power metrics, but 0–1 HRs in last 7 days. Due for a breakout.</p>
                                  </div>
                                  {isCompactLayout ? (
                                    /* Mobile/tablet (below lg): stacked rows -- no table, no horizontal scroll. */
                                    <div className="space-y-2">
                                      {overdue.map((row) => (
                                        <div key={`od-m-${row.player}-${row.team}`} className="rounded-lg border border-amber-100 bg-white/60 px-2 py-1.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-1.5">
                                              <TeamLogoBadge team={row.team} size={13} showLabel={false} />
                                              <span className="truncate font-semibold text-slate-900 text-[11px]">{row.player}</span>
                                            </div>
                                            <StatScorePill value={row.hrScore} />
                                          </div>
                                          <div className="mt-1 text-[9px] text-slate-400">vs {row.opposingPitcher}</div>
                                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                                            <span className="text-slate-500">Barrel% <b className="text-slate-700">{row.barrelRate != null ? `${row.barrelRate.toFixed(1)}%` : "—"}</b></span>
                                            <span className="text-slate-500">L7 <b className="rounded-full bg-amber-200 px-1.5 py-0.5 text-amber-900">{row.last7HR ?? "—"}</b></span>
                                            <span className="text-slate-500">L30 <b className="text-slate-700">{row.last30HR ?? "—"}</b></span>
                                            <span className="text-slate-500">xERA <b className="text-slate-700">{row.pitcherXera != null ? row.pitcherXera.toFixed(2) : "—"}</b></span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    /* Desktop (lg and above): existing table, unchanged. */
                                    <div className="overflow-x-auto">
                                      <table className="w-full min-w-[400px] text-xs">
                                        <thead>
                                          <tr className="text-[10px] font-bold uppercase tracking-wide text-amber-700 border-b border-amber-200">
                                            <th className="pb-1.5 text-left">Batter</th>
                                            <th className="pb-1.5 text-center">Score</th>
                                            <th className="pb-1.5 text-center">Barrel%</th>
                                            <th className="pb-1.5 text-center">L7</th>
                                            <th className="pb-1.5 text-center">L30</th>
                                            <th className="pb-1.5 text-center">xERA</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {overdue.map((row) => (
                                            <tr key={`od-${row.player}-${row.team}`} className="border-b border-amber-100 last:border-0">
                                              <td className="py-1.5 pr-2">
                                                <div className="flex items-center gap-1.5">
                                                  <TeamLogoBadge team={row.team} size={13} showLabel={false} />
                                                  <span className="font-semibold text-slate-900 text-[11px]">{row.player}</span>
                                                </div>
                                                <div className="text-[9px] text-slate-400">vs {row.opposingPitcher}</div>
                                              </td>
                                              <td className="py-1.5 text-center"><StatScorePill value={row.hrScore} /></td>
                                              <td className="py-1.5 text-center font-semibold text-slate-700">{row.barrelRate != null ? `${row.barrelRate.toFixed(1)}%` : "—"}</td>
                                              <td className="py-1.5 text-center">
                                                <span className="rounded-full bg-amber-200 px-2 py-0.5 font-black text-amber-900">{row.last7HR ?? "—"}</span>
                                              </td>
                                              <td className="py-1.5 text-center font-semibold text-slate-600">{row.last30HR ?? "—"}</td>
                                              <td className="py-1.5 text-center font-semibold text-slate-600">{row.pitcherXera != null ? row.pitcherXera.toFixed(2) : "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Biggest Mismatches */}
                              {mismatches.length > 0 && (
                                <div id="mismatches" className="rounded-2xl border border-red-200 bg-red-50 p-4">
                                  <div className="mb-3">
                                    <h3 className="text-base font-extrabold text-red-900">⚔️ Biggest Mismatches</h3>
                                    <p className="text-xs text-red-700 mt-0.5">Elite HR score vs a vulnerable pitcher — high HR VS + weak xERA or regression risk.</p>
                                  </div>
                                  {isCompactLayout ? (
                                    /* Mobile/tablet (below lg): stacked rows -- no table, no horizontal scroll. */
                                    <div className="space-y-2">
                                      {mismatches.map((row) => (
                                        <div key={`mm-m-${row.player}-${row.team}`} className="rounded-lg border border-red-100 bg-white/60 px-2 py-1.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-1.5">
                                              <TeamLogoBadge team={row.team} size={13} showLabel={false} />
                                              <span className="truncate font-semibold text-slate-900 text-[11px]">{row.player}</span>
                                            </div>
                                            <StatScorePill value={row.hrScore} />
                                          </div>
                                          <div className="mt-1 text-[9px] text-slate-400">vs {row.opposingPitcher}</div>
                                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                                            <span className="text-slate-500">HR VS <b className="rounded-full bg-red-200 px-1.5 py-0.5 text-red-900">{row.opposingPitcherHrVs?.toFixed(1) ?? "—"}</b></span>
                                            <span className="text-slate-500">xERA <b className="text-slate-700">{row.pitcherXera != null ? row.pitcherXera.toFixed(2) : "—"}</b></span>
                                            <span className="text-slate-500">
                                              Regr{" "}
                                              {row.pitcherRegressionScore != null ? (
                                                <b className={row.pitcherRegressionScore > 2 ? "text-red-700" : "text-slate-700"}>
                                                  {row.pitcherRegressionScore > 0 ? `+${row.pitcherRegressionScore.toFixed(1)}` : row.pitcherRegressionScore.toFixed(1)}
                                                </b>
                                              ) : <b className="text-slate-700">—</b>}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    /* Desktop (lg and above): existing table, unchanged. */
                                    <div className="overflow-x-auto">
                                      <table className="w-full min-w-[400px] text-xs">
                                        <thead>
                                          <tr className="text-[10px] font-bold uppercase tracking-wide text-red-700 border-b border-red-200">
                                            <th className="pb-1.5 text-left">Batter</th>
                                            <th className="pb-1.5 text-center">Score</th>
                                            <th className="pb-1.5 text-center">HR VS</th>
                                            <th className="pb-1.5 text-center">xERA</th>
                                            <th className="pb-1.5 text-center">Regr</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {mismatches.map((row) => (
                                            <tr key={`mm-${row.player}-${row.team}`} className="border-b border-red-100 last:border-0">
                                              <td className="py-1.5 pr-2">
                                                <div className="flex items-center gap-1.5">
                                                  <TeamLogoBadge team={row.team} size={13} showLabel={false} />
                                                  <span className="font-semibold text-slate-900 text-[11px]">{row.player}</span>
                                                </div>
                                                <div className="text-[9px] text-slate-400">vs {row.opposingPitcher}</div>
                                              </td>
                                              <td className="py-1.5 text-center"><StatScorePill value={row.hrScore} /></td>
                                              <td className="py-1.5 text-center">
                                                <span className="rounded-full bg-red-200 px-2 py-0.5 font-black text-red-900">{row.opposingPitcherHrVs?.toFixed(1) ?? "—"}</span>
                                              </td>
                                              <td className="py-1.5 text-center font-semibold text-slate-700">{row.pitcherXera != null ? row.pitcherXera.toFixed(2) : "—"}</td>
                                              <td className="py-1.5 text-center">
                                                {row.pitcherRegressionScore != null ? (
                                                  <span className={`font-bold ${row.pitcherRegressionScore > 2 ? "text-red-700" : "text-slate-500"}`}>
                                                    {row.pitcherRegressionScore > 0 ? `+${row.pitcherRegressionScore.toFixed(1)}` : row.pitcherRegressionScore.toFixed(1)}
                                                  </span>
                                                ) : "—"}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}

                            </div>
                          );
                        })()}

                        {/* Top HR Environments — game-level, informational only, never affects player ranking */}
                        {gameEnvironments.length > 0 && (
                          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">🌡️ Top HR Environments</h2>
                            <p className="mt-1 text-xs text-slate-500">Park, weather, and starter vulnerability combined into a game-level score. Does not affect individual player rankings.</p>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {gameEnvironments.slice(0, 6).map((g) => (
                                <div key={g.gameKey} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-slate-900" title={g.matchup}>{g.matchup}</span>
                                    <span className={cn(
                                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                                      (g.gameHrEnvironmentScore ?? 0) >= 70 ? "bg-emerald-100 text-emerald-800" :
                                      (g.gameHrEnvironmentScore ?? 0) >= 50 ? "bg-amber-100 text-amber-800" :
                                      "bg-slate-200 text-slate-600",
                                    )}>
                                      {g.gameHrEnvironmentScore != null ? g.gameHrEnvironmentScore.toFixed(0) : "—"}
                                    </span>
                                  </div>
                                  <div className="mt-1 truncate text-[11px] text-slate-400">{g.ballpark}</div>
                                  <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                                    <div className="rounded bg-white px-1 py-1">
                                      <div className="text-slate-400">Park</div>
                                      <div className="font-semibold text-slate-700">{g.parkFactor != null ? g.parkFactor.toFixed(2) : "—"}</div>
                                    </div>
                                    <div className="rounded bg-white px-1 py-1">
                                      <div className="text-slate-400">Weather</div>
                                      <div className="font-semibold text-slate-700">{g.weatherEffect != null ? (g.weatherEffect > 0 ? "+" : "") + g.weatherEffect.toFixed(1) : "—"}</div>
                                    </div>
                                    <div className="rounded bg-white px-1 py-1">
                                      <div className="text-slate-400">Starter Vuln</div>
                                      <div className="font-semibold text-slate-700">{g.starterVulnerability != null ? g.starterVulnerability.toFixed(0) : "—"}</div>
                                    </div>
                                  </div>
                                  <div className="mt-1.5 text-[10px] text-slate-400">{g.qualifyingHitterCount} qualifying bat{g.qualifyingHitterCount === 1 ? "" : "s"}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">💥 Batter View</h2>
                            <p className="mt-1 text-sm text-slate-500">HR Quality Score drives the primary ranking. Supporting power and recent-HR stats provide context, not a separate probability.</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={batterSearch}
                              onChange={(event) => setBatterSearch(event.target.value)}
                              placeholder="Search batter, pitcher, or team"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <GameSelect value={batterGameFilter} onChange={setBatterGameFilter} options={gameOptions} label="Game" />
                            <button
                              type="button"
                              onClick={() => setHrFilterActive((v) => !v)}
                              title="HR Smart Filter: Barrel 12%+, Pull 20%+, HH 45%+, EV 92+, Pitcher FB 40%+, Barrel Allowed 10%+, HH Allowed 42%+, K% under 22%, Temp 75°F+, Wind Out, HR-friendly park, Favorable handedness"
                              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition whitespace-nowrap ${
                                hrFilterActive
                                  ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm"
                                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                              }`}
                            >
                              <span>⚡</span>
                              <span>Sin City</span>
                              {hrFilterActive && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white">{filteredBatters.length}</span>}
                            </button>
                          </div>
                        </div>
                        <DataLegend />
                        <div data-x-export="mlb-hr-props" className="rounded-xl border border-slate-200">
                          {isCompactLayout ? (
                          /* Mobile/tablet (below lg): compact expandable rows. */
                          <div className="divide-y divide-slate-100">
                            {filteredBatters.length ? filteredBatters.map((row, i) => {
                              const bvpKey = keyForBvpRow(row.playerId, row.opposingPitcherId);
                              const isBvpExpanded = bvpExpandedBatterKey === bvpKey;
                              const bvpEntry = bvpKey ? bvpHistoryByKey.get(bvpKey) : undefined;
                              const bvpRowLabel = `${isBvpExpanded ? "Hide" : "Show"} batter-vs-pitcher history for ${row.player} vs ${row.opposingPitcher}`;
                              const onBvpRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  toggleBvpBatterRow(row);
                                }
                              };
                              const angleTags = getBatterAngleTags(row);
                              return (
                                <div key={`m-${row.player}-${row.team}-${row.opponent}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                                  <div
                                    onClick={() => toggleBvpBatterRow(row)}
                                    onKeyDown={onBvpRowKeyDown}
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isBvpExpanded}
                                    aria-label={bvpRowLabel}
                                    className="flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors active:bg-slate-100"
                                  >
                                    <span aria-hidden="true" className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", isBvpExpanded && "rotate-90")}>▶</span>
                                    <TeamLogoBadge team={row.team} size={22} showLabel={false} />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[13px] font-semibold text-slate-900">{row.player}</div>
                                      <div className="truncate text-[11px] text-slate-400">vs {row.opposingPitcher}</div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                      {hasHrOdds && row.hrOddsYes != null ? (
                                        <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Y {row.hrOddsYes}</span>
                                      ) : null}
                                      <StatScorePill value={row.hrScore} />
                                    </div>
                                  </div>
                                  {isBvpExpanded && (
                                    <div className="space-y-3 bg-slate-50 px-3 pb-3 pt-1">
                                      <div>
                                        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Career vs Pitcher</div>
                                        <BvpDetailPanel playerId={row.playerId} opposingPitcherId={row.opposingPitcherId} player={row.player} opposingPitcher={row.opposingPitcher} />
                                      </div>
                                      <div>
                                        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">HR Model Metrics</div>
                                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                          {hasHrOdds && (
                                            <MetricTile label="HR Odds">
                                              {row.hrOddsYes != null ? (
                                                <div className="flex flex-col gap-0">
                                                  <span className="text-[11px] font-bold text-slate-700">Y {row.hrOddsYes}{row.hrOddsNo ? <span className="ml-1 font-normal text-slate-400">N {row.hrOddsNo}</span> : null}</span>
                                                  {row.marketImpliedProbability != null && (
                                                    <span className="text-[9px] text-slate-400">{(row.marketImpliedProbability * 100).toFixed(1)}% mkt</span>
                                                  )}
                                                </div>
                                              ) : <span className="text-[11px] text-slate-300">No odds posted</span>}
                                            </MetricTile>
                                          )}
                                          <MetricTile label="Barrel%">
                                            {row.barrelRate != null && row.barrelRate >= 18 ? <span>💣</span> : null}
                                            <GradCell value={row.barrelRate} display={formatPercent(row.barrelRate)} avg={8.0} spread={10} />
                                          </MetricTile>
                                          <MetricTile label="HH%">
                                            {row.hardHitRate != null && row.hardHitRate >= 55 ? <span>💥</span> : null}
                                            <GradCell value={row.hardHitRate} display={formatPercent(row.hardHitRate)} avg={46.5} spread={10} />
                                          </MetricTile>
                                          <MetricTile label="L7 HR">
                                            {row.last7HR != null && row.last7HR >= 3 ? <span>📈</span> : null}
                                            <GradCell value={row.last7HR} display={formatNumber(row.last7HR, 0)} avg={0.3} spread={2.0} />
                                          </MetricTile>
                                          <MetricTile label="L30 HR">
                                            {row.last30HR != null && row.last30HR >= 7 ? <span>👑</span> : null}
                                            <GradCell value={row.last30HR} display={formatNumber(row.last30HR, 0)} avg={2.0} spread={4.5} />
                                          </MetricTile>
                                          <MetricTile label="Ptch HR VS">
                                            {row.opposingPitcherHrVs != null && row.opposingPitcherHrVs >= 70 ? <span>⚔️</span> : null}
                                            <StatScorePill value={row.opposingPitcherHrVs} />
                                          </MetricTile>
                                          <MetricTile label="Ptch xERA">
                                            {row.pitcherXera != null ? (() => {
                                              const style = getXeraToneStyle(row.pitcherXera);
                                              return (
                                                <span className="rounded px-1 py-0.5 text-[11px] font-bold" style={{ backgroundColor: style.bg, color: style.text }}>
                                                  {row.pitcherXera.toFixed(2)}
                                                </span>
                                              );
                                            })() : <span className="text-[11px] text-slate-300">—</span>}
                                          </MetricTile>
                                          <MetricTile label="Ptch FB%">
                                            {row.pitcherFlyBallRate != null
                                              ? <span className="text-[11px] font-semibold text-slate-600">{row.pitcherFlyBallRate.toFixed(1)}%</span>
                                              : <span className="text-[11px] text-slate-300">—</span>}
                                          </MetricTile>
                                          <MetricTile label="Pitcher Trend">
                                            {row.pitcherRegressionScore != null ? (() => {
                                              const s = row.pitcherRegressionScore;
                                              const style = getRegressionToneStyle(s);
                                              return (
                                                <span className="rounded px-1 py-0.5 text-[11px] font-bold" style={{ backgroundColor: style.bg, color: style.text }}>
                                                  {s > 0 ? "+" : ""}{s.toFixed(1)} {style.label}
                                                </span>
                                              );
                                            })() : <span className="text-[11px] text-slate-300">—</span>}
                                          </MetricTile>
                                          <MetricTile label="Angle">
                                            {angleTags.length ? (
                                              <div className="flex flex-wrap gap-1">
                                                {angleTags.map((tag) => (
                                                  <span key={`${row.player}-m-${tag}`} className="whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{tag}</span>
                                                ))}
                                              </div>
                                            ) : <span className="text-[11px] text-slate-300">{DASH}</span>}
                                          </MetricTile>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }) : (
                              <div className="px-3 py-6 text-center text-sm text-slate-500">
                                {hrFilterActive ? "No Sin City batters match the current filters." : "No batters match the current search or game filter."}
                              </div>
                            )}
                          </div>
                          ) : (
                          /* Desktop (lg and above): existing table, unchanged. */
                          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                          <table className="min-w-full border-separate border-spacing-0 text-xs">
                            <thead className="sticky top-0 z-20">
                              <tr className="text-[9px] sm:text-[10px] uppercase tracking-[0.08em] sm:tracking-[0.12em] text-slate-500">
                                {/* Sticky: Rank */}
                                <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-1 sm:px-2 py-1.5 text-left font-bold w-6 sm:w-8">
                                  <button type="button" onClick={() => handleBatterSort("hrScoreRank")} className="hover:text-slate-900">
                                    #{makeSortIndicator(batterSortKey === "hrScoreRank", batterSortDirection)}
                                  </button>
                                </th>
                                {/* Sticky: Name */}
                                <th className="sticky left-6 sm:left-8 z-30 border-b border-r border-slate-200 bg-slate-50 px-1.5 sm:px-2 py-1.5 text-left font-bold min-w-[110px] sm:min-w-[130px]">
                                  <button type="button" onClick={() => handleBatterSort("player")} className="hover:text-slate-900">
                                    Batter{makeSortIndicator(batterSortKey === "player", batterSortDirection)}
                                  </button>
                                </th>
                                {/* Scrollable columns — short labels on mobile, full on sm+ */}
                                {([
                                  ...(hasHrOdds ? [["hrOddsYes", "Odds", "HR Odds"]] : []),
                                  ["hrScore", "HR↕",    "HR Score ↕"],
                                  ["barrelRate",       "Brl%",   "Barrel%"],
                                  ["hardHitRate",      "HH%",    "HH%"],
                                  ["last7HR",          "L7",     "L7 HR"],
                                  ["last30HR",         "L30",    "L30 HR"],
                                  ["opposingPitcherHrVs","P.HR", "Ptch HR VS"],
                                  ["pitcherXera",      "xERA",    "Ptch xERA"],
                                  ["pitcherFlyBallRate", "FB%",   "Ptch FB%"],
                                ] as [string, string, string][]).map(([key, short, full]) => {
                                  const help = key === "hrScore"
                                    ? {
                                        label: "HR Score",
                                        description: "Relative HR matchup-quality score. It ranks batters against each other today and is not a probability of hitting a home run.",
                                      }
                                    : key === "hrOddsYes"
                                      ? {
                                          label: "HR Odds",
                                          description: "Sportsbook anytime-home-run price. Shown only when available.",
                                        }
                                      : null;
                                  return (
                                    <th key={key} className="border-b border-slate-200 bg-slate-50 px-1 sm:px-2 py-1.5 text-left font-bold max-w-[56px] sm:max-w-none sm:whitespace-nowrap">
                                      <div className="flex items-center gap-0.5">
                                        <button type="button" onClick={() => handleBatterSort(key as BatterSortKey)} className="hover:text-slate-900 leading-tight">
                                          <span className="sm:hidden">{short}</span>
                                          <span className="hidden sm:inline">{full}</span>
                                          {makeSortIndicator(batterSortKey === key, batterSortDirection)}
                                        </button>
                                        {help ? <HeaderHelp label={help.label} description={help.description} /> : null}
                                      </div>
                                      {key === "hrOddsYes" ? (
                                        <div className="mt-0.5 flex items-center gap-0.5 normal-case tracking-normal text-[8px] text-slate-400 sm:text-[9px]">
                                          <span className="sm:hidden">Mkt %</span>
                                          <span className="hidden sm:inline">Market %</span>
                                          <HeaderHelp
                                            label="Market %"
                                            description="Raw sportsbook-implied probability from the displayed odds. Not adjusted for vig and not a model estimate."
                                          />
                                        </div>
                                      ) : null}
                                    </th>
                                  );
                                })}
                                <th className="min-w-[64px] border-b border-slate-200 bg-slate-50 px-1 py-1.5 text-left font-bold sm:min-w-[116px] sm:px-2 sm:whitespace-nowrap">
                                  <div className="flex items-center gap-0.5">
                                    <span className="sm:hidden">Trend</span>
                                    <span className="hidden sm:inline">Pitcher Trend</span>
                                    <HeaderHelp
                                      label="Pitcher Trend"
                                      description="Recent pitcher form compared with season baseline. Positive values indicate more home-run risk than the season numbers suggest; negative values indicate less."
                                    />
                                  </div>
                                </th>
                                <th className="border-b border-slate-200 bg-slate-50 px-1 sm:px-2 py-1.5 text-left font-bold sm:whitespace-nowrap">Angle</th>
                                <th className="border-b border-slate-200 bg-slate-50 px-1 sm:px-2 py-1.5 text-left font-bold sm:whitespace-nowrap">
                                  <div className="flex items-center gap-0.5">
                                    AVG vs P
                                    <HeaderHelp
                                      label="AVG vs P"
                                      description="Batter's career batting average against this specific opposing starter. Historical context only -- not used in HR Score or any ranking. Click a row to see PA, H, HR, and a Career / Last 5Y toggle."
                                    />
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredBatters.length ? filteredBatters.map((row, i) => {
                                const rowBg = i % 2 === 0 ? "bg-white" : "bg-slate-50/70";
                                const bvpKey = keyForBvpRow(row.playerId, row.opposingPitcherId);
                                const isBvpExpanded = bvpExpandedBatterKey === bvpKey;
                                const bvpEntry = bvpKey ? bvpHistoryByKey.get(bvpKey) : undefined;
                                const bvpRowLabel = `${isBvpExpanded ? "Hide" : "Show"} batter-vs-pitcher history for ${row.player} vs ${row.opposingPitcher}`;
                                const onBvpRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleBvpBatterRow(row);
                                  }
                                };
                                const stickyBg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                                return (
                                  <Fragment key={`${row.player}-${row.team}-${row.opponent}`}>
                                  <tr
                                    onClick={() => toggleBvpBatterRow(row)}
                                    onKeyDown={onBvpRowKeyDown}
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isBvpExpanded}
                                    aria-label={bvpRowLabel}
                                    className={cn(rowBg, "cursor-pointer transition-colors hover:brightness-[0.98]")}
                                  >
                                    {/* Sticky rank — shows current sort position, not raw model rank */}
                                    <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-black text-slate-400 ${stickyBg}`}>
                                      {i + 1}
                                    </td>
                                    {/* Sticky name */}
                                    <td className={`sticky left-6 sm:left-8 z-10 border-b border-r border-slate-100 px-1.5 sm:px-2 py-0.5 sm:py-1 ${stickyBg}`}>
                                      <div className="flex items-center gap-1">
                                        <span aria-hidden="true" className={cn("shrink-0 text-[8px] text-slate-400 transition-transform", isBvpExpanded && "rotate-90")}>▶</span>
                                        <TeamLogoBadge team={row.team} size={13} showLabel={false} />
                                        <span className="font-semibold text-slate-900 whitespace-nowrap text-[10px] sm:text-[11px]">{row.player}</span>
                                      </div>
                                      <div className="text-[9px] text-slate-400 truncate max-w-[105px] sm:max-w-[140px]">vs {row.opposingPitcher}</div>
                                    </td>
                                    {/* HR Odds */}
                                    {hasHrOdds && (
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      {row.hrOddsYes != null ? (
                                        <div className="flex flex-col items-start gap-0">
                                          <span className="rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-bold whitespace-nowrap bg-slate-100 text-slate-600">
                                            Y {row.hrOddsYes}
                                          </span>
                                          {row.hrOddsNo && <div className="text-[9px] text-slate-500">N {row.hrOddsNo}</div>}
                                          {row.marketImpliedProbability != null && (
                                            <div className="text-[8px] text-slate-400" title="Raw sportsbook-implied probability. Not a model probability.">
                                              {(row.marketImpliedProbability * 100).toFixed(1)}% mkt
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="block min-w-[96px] text-[9px] leading-4 text-slate-400">No sportsbook odds posted yet.</span>
                                      )}
                                    </td>
                                    )}
                                    {/* HR Score */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      <StatScorePill value={row.hrScore} />
                                    </td>
                                    {/* Barrel% */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      <div className="flex items-center gap-0.5">
                                        <span className="hidden sm:inline">{row.barrelRate != null && row.barrelRate >= 18 ? "💣" : ""}</span>
                                        <GradCell value={row.barrelRate} display={formatPercent(row.barrelRate)} avg={8.0} spread={10} />
                                      </div>
                                    </td>
                                    {/* HH% */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      <div className="flex items-center gap-0.5">
                                        <span className="hidden sm:inline">{row.hardHitRate != null && row.hardHitRate >= 55 ? "💥" : ""}</span>
                                        <GradCell value={row.hardHitRate} display={formatPercent(row.hardHitRate)} avg={46.5} spread={10} />
                                      </div>
                                    </td>
                                    {/* L7 HR */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1 text-center">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span className="hidden sm:inline">{row.last7HR != null && row.last7HR >= 3 ? "📈" : ""}</span>
                                        <GradCell value={row.last7HR} display={formatNumber(row.last7HR, 0)} avg={0.3} spread={2.0} />
                                      </div>
                                    </td>
                                    {/* L30 HR */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1 text-center">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span className="hidden sm:inline">{row.last30HR != null && row.last30HR >= 7 ? "👑" : ""}</span>
                                        <GradCell value={row.last30HR} display={formatNumber(row.last30HR, 0)} avg={2.0} spread={4.5} />
                                      </div>
                                    </td>
                                    {/* Ptch HR VS */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      <div className="flex items-center gap-0.5">
                                        <span className="hidden sm:inline">{row.opposingPitcherHrVs != null && row.opposingPitcherHrVs >= 70 ? "⚔️" : ""}</span>
                                        <StatScorePill value={row.opposingPitcherHrVs} />
                                      </div>
                                    </td>
                                    {/* Ptch xERA */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      {row.pitcherXera != null ? (() => {
                                        const x = row.pitcherXera;
                                        const style = getXeraToneStyle(x);
                                        return (
                                          <span className="rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-bold whitespace-nowrap"
                                            style={{ backgroundColor: style.bg, color: style.text }}>
                                            {x.toFixed(2)}
                                          </span>
                                        );
                                      })() : <span className="text-[9px] text-slate-300">—</span>}
                                    </td>
                                    {/* Ptch FB% */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      {row.pitcherFlyBallRate != null
                                        ? <span className="text-[9px] sm:text-[10px] font-semibold text-slate-600">{row.pitcherFlyBallRate.toFixed(1)}%</span>
                                        : <span className="text-[9px] text-slate-300">—</span>}
                                    </td>
                                    {/* Ptch Regr */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      {row.pitcherRegressionScore != null ? (() => {
                                        const s = row.pitcherRegressionScore;
                                        const style = getRegressionToneStyle(s);
                                        return (
                                          <span className="rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-bold whitespace-nowrap"
                                            style={{ backgroundColor: style.bg, color: style.text }}>
                                            {s > 0 ? "+" : ""}{s.toFixed(1)}<span className="hidden sm:inline"> {style.label}</span>
                                          </span>
                                        );
                                      })() : <span className="text-[9px] text-slate-300">—</span>}
                                    </td>
                                    {/* Angle */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                        {(() => {
                                          const tags = getBatterAngleTags(row);
                                          return tags.length
                                            ? tags.map((tag) => (
                                                <span key={`${row.player}-${tag}`} className="rounded-full bg-slate-100 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-slate-600 whitespace-nowrap">{tag}</span>
                                              ))
                                            : <span className="text-slate-400">{DASH}</span>;
                                        })()}
                                      </div>
                                    </td>
                                    {/* AVG vs P — display-only historical context, click row to expand */}
                                    <td className="border-b border-slate-100 px-1 sm:px-2 py-0.5 sm:py-1">
                                      <AvgVsPitcherCell entry={bvpEntry} loading={bvpHistoryLoading} />
                                    </td>
                                  </tr>
                                  {isBvpExpanded && (
                                    <tr>
                                      <td colSpan={10} className="border-b border-slate-100 bg-slate-50 px-2 py-2">
                                        <BvpDetailPanel playerId={row.playerId} opposingPitcherId={row.opposingPitcherId} player={row.player} opposingPitcher={row.opposingPitcher} />
                                      </td>
                                    </tr>
                                  )}
                                  </Fragment>
                                );
                              }) : (
                                <tr>
                                  <td colSpan={10} className="border-b border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
                                    {hrFilterActive ? "No Sin City batters match the current filters." : "No batters match the current search or game filter."}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          </div>
                          )}
                        </div>
                      </section>
                    ) : null}

                    {activeTab === "matchups" ? (
                      <section className="space-y-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">⚔️ Matchup Lenses</h2>
                            <p className="mt-1 text-sm text-slate-500">{matchupSectionCopy}</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={matchupSearch}
                              onChange={(event) => setMatchupSearch(event.target.value)}
                              placeholder={activeMatchupLens === "strikeout" ? "Search pitcher, opponent, or park" : "Search batter, pitcher, or park"}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <GameSelect value={matchupGameFilter} onChange={setMatchupGameFilter} options={gameOptions} label="Game" />
                            {activeMatchupLens !== "strikeout" && (
                              <button
                                type="button"
                                onClick={() => setHrFilterActive((v) => !v)}
                                title="HR Smart Filter: Barrel 12%+, Pull 20%+, HH 45%+, EV 92+, Pitcher FB 40%+, Barrel Allowed 10%+, HH Allowed 42%+, K% under 22%, Temp 75°F+, Wind Out, HR-friendly park, Favorable handedness"
                                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition whitespace-nowrap ${
                                  hrFilterActive
                                    ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm"
                                    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                                }`}
                              >
                                <span>⚡</span>
                                <span>Sin City</span>
                                {hrFilterActive && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white">{filteredMatchups.length}</span>}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: "best", label: "Best Matchups" },
                            { key: "hr", label: "HR Matchups" },
                            { key: "strikeout", label: "Strikeout Matchup" },
                          ].map((lens) => (
                            <button
                              key={lens.key}
                              type="button"
                              onClick={() => setActiveMatchupLens(lens.key as MatchupLens)}
                              className={cn(
                                "rounded-full px-3 py-1.5 text-sm font-semibold transition",
                                activeMatchupLens === lens.key
                                  ? "bg-slate-900 text-white shadow-sm"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                              )}
                            >
                              {lens.label}
                            </button>
                          ))}
                        </div>

                        {activeMatchupLens === "strikeout" ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
                            Strikeout Matchup ranks one pitcher vs one opposing team for today’s slate. It blends pitcher K skill with opposing team K%, whiff%, and xBA from the current page data. Team aggregates are slate-level and not handedness-split unless the source data already provides that upstream.
                          </div>
                        ) : null}

                        <div className={cn("grid gap-3 xl:grid-cols-2 2xl:grid-cols-4", isMobile ? "grid-cols-1" : "")}>
                          {topMatchupCards.length ? topMatchupCards.map((row) => (
                            activeMatchupLens === "strikeout" ? (
                              <article key={`${(row as PitcherStrikeoutTeamRow).rank}-${(row as PitcherStrikeoutTeamRow).pitcher}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-base font-bold text-slate-900">{(row as PitcherStrikeoutTeamRow).pitcher}</div>
                                    <div className="mt-1 text-sm text-slate-500">{(row as PitcherStrikeoutTeamRow).team} vs {(row as PitcherStrikeoutTeamRow).opponent}</div>
                                  </div>
                                  <ScorePill value={(row as PitcherStrikeoutTeamRow).strikeoutMatchupScore} />
                                </div>
                                <div className="mt-3 text-sm text-slate-600">{(row as PitcherStrikeoutTeamRow).park}</div>
                                <p className="mt-3 text-sm leading-6 text-slate-600">{(row as PitcherStrikeoutTeamRow).whyItRanksWell}</p>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">🎯 Strikeout Matchup</div>
                                    <div className="mt-1 font-semibold text-slate-900">{(row as PitcherStrikeoutTeamRow).strikeoutMatchupScore.toFixed(1)}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">🔥 Pitcher K Skill</div>
                                    <div className="mt-1 font-semibold text-slate-900">{(row as PitcherStrikeoutTeamRow).pitcherKSkillScore.toFixed(1)}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">🌀 Opp Team K / Whiff</div>
                                    <div className="mt-1 font-semibold text-slate-900">{formatPercent((row as PitcherStrikeoutTeamRow).opponentTeamKRate)} / {formatPercent((row as PitcherStrikeoutTeamRow).opponentTeamWhiffRate)}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">🛡️ Opp Team xBA</div>
                                    <div className="mt-1 font-semibold text-slate-900">{formatDecimal((row as PitcherStrikeoutTeamRow).opponentTeamXba, 3)}</div>
                                  </div>
                                </div>
                              </article>
                            ) : (
                              <article key={`${(row as PitcherVsBatterRow).rank}-${(row as PitcherVsBatterRow).player}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-base font-bold text-slate-900">{(row as PitcherVsBatterRow).player}</div>
                                    <div className="mt-1 text-sm text-slate-500">{(row as PitcherVsBatterRow).team} vs {(row as PitcherVsBatterRow).opposingPitcher}</div>
                                  </div>
                                  <ScorePill value={activeMatchupLens === "best" ? (row as PitcherVsBatterRow).bestMatchupScore : (row as PitcherVsBatterRow).hrTargetScore} />
                                </div>
                                <div className="mt-3 text-sm text-slate-600">{(row as PitcherVsBatterRow).park}</div>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                      {activeMatchupLens === "best" ? "🎯 Balanced Score" : "💥 HR Target Score"}
                                    </div>
                                    <div className="mt-1 font-semibold text-slate-900">
                                      {activeMatchupLens === "best" ? (row as PitcherVsBatterRow).bestMatchupScore.toFixed(1) : (row as PitcherVsBatterRow).hrTargetScore.toFixed(1)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                      {activeMatchupLens === "best" ? "🧨 Pitcher Attackability" : "🔥 Pitcher HR VS"}
                                    </div>
                                    <div className="mt-1 font-semibold text-slate-900">
                                      {activeMatchupLens === "best" ? (row as PitcherVsBatterRow).opposingPitcherHitsVs.toFixed(1) : (row as PitcherVsBatterRow).opposingPitcherHrVs.toFixed(1)}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {(row as PitcherVsBatterRow).angleTags.length ? (row as PitcherVsBatterRow).angleTags.map((tag) => (
                                    <span key={`${(row as PitcherVsBatterRow).player}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>
                                  )) : <span className="text-slate-400">{DASH}</span>}
                                </div>
                              </article>
                            )
                          )) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 xl:col-span-2 2xl:col-span-4">
                              No matchup rows match the current search or game filter.
                            </div>
                          )}
                        </div>

                        <DataLegend />
                        <div className="rounded-xl border border-slate-200">
                          {isCompactLayout ? (
                          /* Mobile/tablet (below lg): compact expandable rows, mirroring the Batter View card pattern. */
                          <div className="divide-y divide-slate-100">
                            {activeMatchupLens === "strikeout" ? (
                              filteredStrikeoutRows.length ? filteredStrikeoutRows.map((row, i) => {
                                const rowKey = `${row.rank}-${row.pitcher}-${row.opponent}`;
                                const isExpanded = expandedStrikeoutRowKey === rowKey;
                                const toggle = () => setExpandedStrikeoutRowKey(isExpanded ? null : rowKey);
                                const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); }
                                };
                                return (
                                  <div key={`m-${rowKey}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                                    <div
                                      onClick={toggle}
                                      onKeyDown={onRowKeyDown}
                                      role="button"
                                      tabIndex={0}
                                      aria-expanded={isExpanded}
                                      aria-label={`${isExpanded ? "Hide" : "Show"} strikeout matchup detail for ${row.pitcher} vs ${row.opponent}`}
                                      className="flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors active:bg-slate-100"
                                    >
                                      <span aria-hidden="true" className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", isExpanded && "rotate-90")}>▶</span>
                                      <TeamLogoBadge team={row.team} size={22} showLabel={false} />
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-[13px] font-semibold text-slate-900">{row.pitcher}</div>
                                        <div className="truncate text-[11px] text-slate-400">{row.team} vs {row.opponent}</div>
                                      </div>
                                      <ScorePill value={row.strikeoutMatchupScore} />
                                    </div>
                                    {isExpanded && (
                                      <div className="space-y-1.5 bg-slate-50 px-3 pb-3 pt-1">
                                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                          <MetricTile label="Park">
                                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", getParkFactorTone(row.parkFactor))}>{row.parkFactor.toFixed(2)}</span>
                                          </MetricTile>
                                          <MetricTile label="Pitcher K%"><span style={getStrikeoutTableHeatStyle("pitcherKRate", row.pitcherKRate, strikeoutHeat)} className="rounded px-1 py-0.5 text-[11px] font-bold">{formatPercent(row.pitcherKRate)}</span></MetricTile>
                                          <MetricTile label="Pitcher Whiff%"><span style={getStrikeoutTableHeatStyle("pitcherWhiffRate", row.pitcherWhiffRate, strikeoutHeat)} className="rounded px-1 py-0.5 text-[11px] font-bold">{formatPercent(row.pitcherWhiffRate)}</span></MetricTile>
                                          <MetricTile label="Pitcher K VS"><ScorePill value={row.pitcherKVs} /></MetricTile>
                                          <MetricTile label="Opp Team K%"><span style={getStrikeoutTableHeatStyle("opponentTeamKRate", row.opponentTeamKRate, strikeoutHeat)} className="rounded px-1 py-0.5 text-[11px] font-bold">{formatPercent(row.opponentTeamKRate)}</span></MetricTile>
                                          <MetricTile label="Opp Whiff%"><span style={getStrikeoutTableHeatStyle("opponentTeamWhiffRate", row.opponentTeamWhiffRate, strikeoutHeat)} className="rounded px-1 py-0.5 text-[11px] font-bold">{formatPercent(row.opponentTeamWhiffRate)}</span></MetricTile>
                                          <MetricTile label="Opp xBA"><span style={getStrikeoutTableHeatStyle("opponentTeamXba", row.opponentTeamXba, strikeoutHeat)} className="rounded px-1 py-0.5 text-[11px] font-bold">{formatDecimal(row.opponentTeamXba, 3)}</span></MetricTile>
                                        </div>
                                        <p className="text-[11px] leading-4 text-slate-500">{row.whyItRanksWell}</p>
                                      </div>
                                    )}
                                  </div>
                                );
                              }) : (
                                <div className="px-3 py-6 text-center text-sm text-slate-500">No matchup rows match the current search or game filter.</div>
                              )
                            ) : (
                              filteredMatchups.length ? filteredMatchups.map((row, i) => {
                                const bvpKey = keyForBvpRow(row.playerId, row.opposingPitcherId);
                                const isBvpExpanded = bvpExpandedMatchupKey === bvpKey;
                                const bvpRowLabel = `${isBvpExpanded ? "Hide" : "Show"} batter-vs-pitcher history for ${row.player} vs ${row.opposingPitcher}`;
                                const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleBvpMatchupRow(row); }
                                };
                                const primaryScore = activeMatchupLens === "best" ? row.bestMatchupScore : row.hrTargetScore;
                                return (
                                  <div key={`m-${row.rank}-${row.player}-${row.opposingPitcher}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                                    <div
                                      onClick={() => toggleBvpMatchupRow(row)}
                                      onKeyDown={onRowKeyDown}
                                      role="button"
                                      tabIndex={0}
                                      aria-expanded={isBvpExpanded}
                                      aria-label={bvpRowLabel}
                                      className="flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors active:bg-slate-100"
                                    >
                                      <span aria-hidden="true" className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", isBvpExpanded && "rotate-90")}>▶</span>
                                      <TeamLogoBadge team={row.team} size={22} showLabel={false} />
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-[13px] font-semibold text-slate-900">{row.player}</div>
                                        <div className="truncate text-[11px] text-slate-400">vs {row.opposingPitcher}</div>
                                      </div>
                                      <ScorePill value={primaryScore} />
                                    </div>
                                    {isBvpExpanded && (
                                      <div className="space-y-3 bg-slate-50 px-3 pb-3 pt-1">
                                        <div>
                                          <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Career vs Pitcher</div>
                                          <BvpDetailPanel playerId={row.playerId} opposingPitcherId={row.opposingPitcherId} player={row.player} opposingPitcher={row.opposingPitcher} />
                                        </div>
                                        <div>
                                          <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Matchup Metrics</div>
                                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                            <MetricTile label="Park">
                                              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", getParkFactorTone(row.parkFactor))}>{row.parkFactor.toFixed(2)}</span>
                                            </MetricTile>
                                            <MetricTile label="Batter HR"><ScorePill value={row.hrScore} /></MetricTile>
                                            {activeMatchupLens === "best" ? (
                                              <>
                                                <MetricTile label="Pitcher Hits VS">
                                                  {row.opposingPitcherHitsVs != null && row.opposingPitcherHitsVs >= 70 ? <span>⚔️</span> : null}
                                                  <ScorePill value={row.opposingPitcherHitsVs} />
                                                </MetricTile>
                                                <MetricTile label="Pitcher HR VS">
                                                  {row.opposingPitcherHrVs != null && row.opposingPitcherHrVs >= 70 ? <span>⚔️</span> : null}
                                                  <ScorePill value={row.opposingPitcherHrVs} />
                                                </MetricTile>
                                                <MetricTile label="Balanced Matchup"><ScorePill value={row.bestMatchupScore} /></MetricTile>
                                                <MetricTile label="xBA"><span className="text-[11px] font-semibold text-slate-700">{formatDecimal(row.xba, 3)}</span></MetricTile>
                                              </>
                                            ) : (
                                              <>
                                                <MetricTile label="Pitcher HR VS">
                                                  {row.opposingPitcherHrVs != null && row.opposingPitcherHrVs >= 70 ? <span>⚔️</span> : null}
                                                  <ScorePill value={row.opposingPitcherHrVs} />
                                                </MetricTile>
                                                <MetricTile label="HR Target Score"><ScorePill value={row.hrTargetScore} /></MetricTile>
                                                <MetricTile label="Barrel%"><span className="text-[11px] font-semibold text-slate-700">{formatPercent(row.barrelRate)}</span></MetricTile>
                                                <MetricTile label="Hard Hit%"><span className="text-[11px] font-semibold text-slate-700">{formatPercent(row.hardHitRate)}</span></MetricTile>
                                                <MetricTile label="xBA"><span className="text-[11px] font-semibold text-slate-700">{formatDecimal(row.xba, 3)}</span></MetricTile>
                                              </>
                                            )}
                                            <MetricTile label="Angle">
                                              {row.angleTags.length ? (
                                                <div className="flex flex-wrap gap-1">
                                                  {row.angleTags.map((tag) => (
                                                    <span key={`${row.player}-m-${tag}`} className="whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{tag}</span>
                                                  ))}
                                                </div>
                                              ) : <span className="text-[11px] text-slate-300">{DASH}</span>}
                                            </MetricTile>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              }) : (
                                <div className="px-3 py-6 text-center text-sm text-slate-500">No matchup rows match the current search or game filter.</div>
                              )
                            )}
                          </div>
                          ) : (
                          /* Desktop (lg and above): existing table, unchanged. */
                          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                          <table className="min-w-full border-separate border-spacing-0 text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                              <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                {(
                                  activeMatchupLens === "best"
                                    ? [
                                        ["rank", "Rank"],
                                        ["player", "Batter"],
                                        ["team", "Team"],
                                        ["opposingPitcher", "Vs Pitcher"],
                                        ["parkFactor", "Park"],
                                        ["hrScore", "Batter HR"],
                                        ["opposingPitcherHitsVs", "Pitcher Hits VS"],
                                        ["opposingPitcherHrVs", "Pitcher HR VS"],
                                        ["bestMatchupScore", "Balanced Matchup"],
                                        ["xba", "xBA"],
                                      ]
                                    : activeMatchupLens === "hr"
                                      ? [
                                          ["rank", "Rank"],
                                          ["player", "Batter"],
                                          ["team", "Team"],
                                          ["opposingPitcher", "Vs Pitcher"],
                                          ["parkFactor", "Park"],
                                          ["hrScore", "Batter HR"],
                                          ["opposingPitcherHrVs", "Pitcher HR VS"],
                                          ["hrTargetScore", "HR Target Score"],
                                          ["barrelRate", "Barrel%"],
                                          ["hardHitRate", "Hard Hit%"],
                                          ["xba", "xBA"],
                                        ]
                                      : [
                                          ["rank", "Rank"],
                                          ["pitcher", "Pitcher"],
                                          ["team", "Team"],
                                          ["opponent", "Opponent"],
                                          ["parkFactor", "Park"],
                                          ["pitcherKRate", "Pitcher K%"],
                                          ["pitcherWhiffRate", "Pitcher Whiff%"],
                                          ["pitcherKVs", "Pitcher K VS"],
                                          ["opponentTeamKRate", "Opp Team K%"],
                                          ["opponentTeamWhiffRate", "Opp Team Whiff%"],
                                          ["opponentTeamXba", "Opp Team xBA"],
                                          ["strikeoutMatchupScore", "Strikeout Matchup"],
                                        ]
                                ).map(([key, label]) => (
                                  <th key={key} className="border-b border-slate-200 bg-white px-4 py-1 text-left font-semibold whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => activeMatchupLens === "strikeout" ? handleStrikeoutSort(key as StrikeoutSortKey) : handleMatchupSort(key as MatchupSortKey)}
                                      className="transition hover:text-slate-900"
                                    >
                                      {label}{makeSortIndicator(activeMatchupLens === "strikeout" ? strikeoutSortKey === key : matchupSortKey === key, activeMatchupLens === "strikeout" ? strikeoutSortDirection : matchupSortDirection)}
                                    </button>
                                  </th>
                                ))}
                                {activeMatchupLens !== "strikeout" ? (
                                  <th className="border-b border-slate-200 bg-white px-4 py-1 text-left font-semibold whitespace-nowrap">Angle</th>
                                ) : null}
                                {activeMatchupLens !== "strikeout" ? (
                                  <th className="border-b border-slate-200 bg-white px-4 py-1 text-left font-semibold whitespace-nowrap">
                                    <div className="flex items-center gap-1">
                                      AVG vs P
                                      <HeaderHelp
                                        label="AVG vs P"
                                        description="Batter's career batting average against this specific opposing starter. Historical context only -- not used in Matchup Score or any ranking. Click a row to see PA, H, HR, and a Career / Last 5Y toggle."
                                      />
                                    </div>
                                  </th>
                                ) : null}
                              </tr>
                            </thead>
                            <tbody>
                              {activeMatchupLens === "strikeout"
                                ? filteredStrikeoutRows.length ? filteredStrikeoutRows.map((row) => (
                                  <tr key={`${row.rank}-${row.pitcher}-${row.opponent}`} className="odd:bg-white even:bg-slate-50/60">
                                    <td className="border-b border-slate-100 px-4 py-1.5">{row.rank}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5 min-w-[180px]">
                                      <div className="font-medium text-slate-900">{row.pitcher}</div>
                                      <div className="mt-1 max-w-[320px] text-xs leading-5 text-slate-500">{row.whyItRanksWell}</div>
                                    </td>
                                    <td className="border-b border-slate-100 px-4 py-1.5"><TeamLogoBadge team={row.team} size={20} /></td>
                                    <td className="border-b border-slate-100 px-4 py-1.5 min-w-[150px]"><TeamLogoBadge team={row.opponent} size={20} /></td>
                                    <td className="border-b border-slate-100 px-4 py-1.5">
                                      <div className="font-medium text-slate-900">{row.park}</div>
                                      <div className="mt-1">
                                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>{row.parkFactor.toFixed(2)}</span>
                                      </div>
                                    </td>
                                    <td className="border-b border-slate-100 px-4 py-1.5" style={getStrikeoutTableHeatStyle("pitcherKRate", row.pitcherKRate, strikeoutHeat)}>{formatPercent(row.pitcherKRate)}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5" style={getStrikeoutTableHeatStyle("pitcherWhiffRate", row.pitcherWhiffRate, strikeoutHeat)}>{formatPercent(row.pitcherWhiffRate)}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5" style={getStrikeoutTableHeatStyle("pitcherKVs", row.pitcherKVs, strikeoutHeat)}><ScorePill value={row.pitcherKVs} /></td>
                                    <td className="border-b border-slate-100 px-4 py-1.5" style={getStrikeoutTableHeatStyle("opponentTeamKRate", row.opponentTeamKRate, strikeoutHeat)}>{formatPercent(row.opponentTeamKRate)}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5" style={getStrikeoutTableHeatStyle("opponentTeamWhiffRate", row.opponentTeamWhiffRate, strikeoutHeat)}>{formatPercent(row.opponentTeamWhiffRate)}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5" style={getStrikeoutTableHeatStyle("opponentTeamXba", row.opponentTeamXba, strikeoutHeat)}>{formatDecimal(row.opponentTeamXba, 3)}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5" style={getStrikeoutTableHeatStyle("strikeoutMatchupScore", row.strikeoutMatchupScore, strikeoutHeat)}><ScorePill value={row.strikeoutMatchupScore} /></td>
                                  </tr>
                                )) : (
                                  <tr>
                                    <td colSpan={14} className="border-b border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
                                      No matchup rows match the current search or game filter.
                                    </td>
                                  </tr>
                                )
                                : filteredMatchups.length ? filteredMatchups.map((row) => {
                                  const bvpKey = keyForBvpRow(row.playerId, row.opposingPitcherId);
                                  const isBvpExpanded = bvpExpandedMatchupKey === bvpKey;
                                  const bvpEntry = bvpKey ? bvpHistoryByKey.get(bvpKey) : undefined;
                                  const bvpRowLabel = `${isBvpExpanded ? "Hide" : "Show"} batter-vs-pitcher history for ${row.player} vs ${row.opposingPitcher}`;
                                  const onBvpRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      toggleBvpMatchupRow(row);
                                    }
                                  };
                                  return (
                                  <Fragment key={`${row.rank}-${row.player}-${row.opposingPitcher}`}>
                                  <tr
                                    onClick={() => toggleBvpMatchupRow(row)}
                                    onKeyDown={onBvpRowKeyDown}
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isBvpExpanded}
                                    aria-label={bvpRowLabel}
                                    className="cursor-pointer odd:bg-white even:bg-slate-50/60 transition-colors hover:brightness-[0.98]"
                                  >
                                    <td className="border-b border-slate-100 px-4 py-1.5">{row.rank}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5 min-w-[180px]">
                                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                                        <span aria-hidden="true" className={cn("shrink-0 text-[9px] text-slate-400 transition-transform", isBvpExpanded && "rotate-90")}>▶</span>
                                        {row.player}
                                      </div>
                                    </td>
                                    <td className="border-b border-slate-100 px-4 py-1.5"><TeamLogoBadge team={row.team} size={20} /></td>
                                    <td className="border-b border-slate-100 px-4 py-1.5 min-w-[150px]">{row.opposingPitcher}</td>
                                    <td className="border-b border-slate-100 px-4 py-1.5">
                                      <div className="font-medium text-slate-900">{row.park}</div>
                                      <div className="mt-1">
                                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>{row.parkFactor.toFixed(2)}</span>
                                      </div>
                                    </td>
                                    {activeMatchupLens === "best" ? (
                                      <>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.hrScore, matchupHeat.hrScore, { intent: "warm", weight: "secondary" })}><ScorePill value={row.hrScore} /></td>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.opposingPitcherHitsVs, matchupHeat.opposingPitcherHitsVs, { intent: "warm", weight: "secondary" })}>
                                          <div className="flex items-center gap-1">
                                            {row.opposingPitcherHitsVs != null && row.opposingPitcherHitsVs >= 70 && <span className="text-[11px]">⚔️</span>}
                                            <ScorePill value={row.opposingPitcherHitsVs} />
                                          </div>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.opposingPitcherHrVs, matchupHeat.opposingPitcherHrVs, { intent: "warm", weight: "secondary" })}>
                                          <div className="flex items-center gap-1">
                                            {row.opposingPitcherHrVs != null && row.opposingPitcherHrVs >= 70 && <span className="text-[11px]">⚔️</span>}
                                            <ScorePill value={row.opposingPitcherHrVs} />
                                          </div>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.bestMatchupScore, matchupHeat.bestMatchupScore, { intent: "warm", weight: "primary" })}><ScorePill value={row.bestMatchupScore} /></td>
                                        <td className="border-b border-slate-100 px-4 py-1.5">{formatDecimal(row.xba, 3)}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.hrScore, matchupHeat.hrScore, { intent: "warm", weight: "secondary" })}><ScorePill value={row.hrScore} /></td>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.opposingPitcherHrVs, matchupHeat.opposingPitcherHrVs, { intent: "warm", weight: "secondary" })}>
                                          <div className="flex items-center gap-1">
                                            {row.opposingPitcherHrVs != null && row.opposingPitcherHrVs >= 70 && <span className="text-[11px]">⚔️</span>}
                                            <ScorePill value={row.opposingPitcherHrVs} />
                                          </div>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.hrTargetScore, matchupHeat.hrTargetScore, { intent: "warm", weight: "primary" })}><ScorePill value={row.hrTargetScore} /></td>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.barrelRate, matchupHeat.barrelRate, { intent: "warm", weight: "secondary" })}>{formatPercent(row.barrelRate)}</td>
                                        <td className="border-b border-slate-100 px-4 py-1.5" style={getHeatCellStyle(row.hardHitRate, matchupHeat.hardHitRate, { intent: "warm", weight: "secondary" })}>{formatPercent(row.hardHitRate)}</td>
                                        <td className="border-b border-slate-100 px-4 py-1.5">{formatDecimal(row.xba, 3)}</td>
                                      </>
                                    )}
                                    <td className="border-b border-slate-100 px-4 py-1.5">
                                      <div className="flex flex-wrap gap-1.5">
                                        {row.angleTags.length ? row.angleTags.map((tag) => (
                                          <span key={`${row.player}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>
                                        )) : <span className="text-slate-400">{DASH}</span>}
                                      </div>
                                    </td>
                                    {/* AVG vs P — display-only historical context, click row to expand */}
                                    <td className="border-b border-slate-100 px-4 py-1.5">
                                      <AvgVsPitcherCell entry={bvpEntry} loading={bvpHistoryLoading} />
                                    </td>
                                  </tr>
                                  {isBvpExpanded && (
                                    <tr>
                                      <td colSpan={activeMatchupLens === "hr" ? 13 : 12} className="border-b border-slate-100 bg-slate-50 px-4 py-2">
                                        <BvpDetailPanel playerId={row.playerId} opposingPitcherId={row.opposingPitcherId} player={row.player} opposingPitcher={row.opposingPitcher} />
                                      </td>
                                    </tr>
                                  )}
                                  </Fragment>
                                  );
                                }) : (
                                <tr>
                                  <td colSpan={activeMatchupLens === "hr" ? 13 : 12} className="border-b border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
                                    No matchup rows match the current search or game filter.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          </div>
                          )}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <SportsbookBar />
                </div>

                {bestBets && (bestBets.slatePreview || visibleBestBets.length > 0) ? (
                  <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-3">
                      {bestBets.slatePreview ? (
                        <>
                          <article className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="border-l-2 border-sky-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">📝 Slate Overview</div>
                            <p className="mt-2 text-sm leading-7 text-slate-700">{bestBets.slatePreview.slateOverview}</p>
                          </article>
                          <article className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="border-l-2 border-sky-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">🧠 Model Note</div>
                            <p className="mt-2 text-sm leading-7 text-slate-700">{bestBets.slatePreview.modelNote}</p>
                          </article>
                        </>
                      ) : null}
                    </div>

                    {visibleBestBets.length > 0 ? (
                      <aside className="space-y-3">
                        <div className="border-l-2 border-sky-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">💥 Top HR Props Today</div>
                        {visibleBestBets.slice(0, 3).map((pick) => (
                          <PickCard
                            key={`${pick.player}-${pick.team}`}
                            pick={pick}
                            row={batterLookup.get(`${pick.player}|${pick.team}|${pick.opponent}`)}
                            tier={bestBetKeys.has(`${pick.player}|${pick.team}|${pick.opponent}`)
                              ? "Best Bet"
                              : valueBetKeys.has(`${pick.player}|${pick.team}|${pick.opponent}`)
                                ? "Value Play"
                                : longshotKeys.has(`${pick.player}|${pick.team}|${pick.opponent}`)
                                  ? "Longshot"
                                  : "Unknown"}
                          />
                        ))}
                      </aside>
                    ) : null}
                  </section>
                ) : null}

                {tbdFootnotes.length > 0 ? (
                  <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="space-y-1 text-xs leading-6 text-slate-500">
                      {tbdFootnotes.map((matchup) => (
                        <p key={matchup}>The {matchup} matchup is TBD and will be updated once the starting pitcher is announced.</p>
                      ))}
                    </div>
                  </section>
                ) : null}

                <RelatedTools currentToolId="hr-props" />
              </section>
          )}
        </div>
      </main>
  );
}
