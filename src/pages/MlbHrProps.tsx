import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import SportsbookBar from "@/components/SportsbookBar";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { cn } from "@/lib/utils";

type HrDashboardGame = {
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

type HrDashboardPitcher = {
  gameKey: string;
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
  hrVs: number;
  hitsVs: number;
  kVs: number;
};

type HrDashboardBatter = {
  gameKey: string;
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  opposingPitcherId: number | null;
  pitcherHand: string;
  ballpark: string;
  parkFactor: number;
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
  angleTags: string[];
};

type HrDashboardPayload = {
  date: string;
  generatedAt: string;
  games: HrDashboardGame[];
  pitchers: HrDashboardPitcher[];
  batters: HrDashboardBatter[];
};

type HrPropPick = {
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  hrScoreRank: number;
  topStats: string[];
  bullets: string[];
};

type HrBestBetsPayload = {
  date: string;
  generatedAt: string;
  slatePreview?: { slateOverview: string; modelNote: string } | null;
  bestBets: HrPropPick[];
  valueBets: HrPropPick[];
  longshots: HrPropPick[];
};

type SortDirection = "asc" | "desc";
type TabKey = "pitchers" | "batters" | "matchups";
type PitcherSortKey = "pitcher" | "gameKey" | "parkFactor" | "xera" | "hardHitRate" | "barrelRate" | "kRate" | "bbRate" | "whiffRate" | "hrVs" | "hitsVs" | "kVs";
type BatterSortKey = "hrScoreRank" | "player" | "team" | "opposingPitcher" | "parkFactor" | "kRate" | "bbRate" | "barrelRate" | "hardHitRate" | "xba" | "whiffRate" | "last7HR" | "last30HR" | "opposingPitcherHrVs" | "hrScore";
type MatchupSortKey = "rank" | "player" | "team" | "opposingPitcher" | "parkFactor" | "hrScore" | "opposingPitcherHrVs" | "combinedScore" | "scoreDiff" | "barrelRate" | "hardHitRate" | "xba";

type HeatRange = { low: number; high: number };
type HeatIntent = "warm" | "cool" | "balance";
type HeatWeight = "primary" | "secondary";

type ParkSidebarRow = {
  key: string;
  matchup: string;
  stadium: string;
  parkFactor: number;
  roofType: string;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: string;
  conditions: string;
};

type PitcherVsBatterRow = {
  rank: number;
  gameKey: string;
  player: string;
  team: string;
  opposingPitcher: string;
  park: string;
  parkFactor: number;
  hrScore: number;
  opposingPitcherHrVs: number;
  combinedScore: number;
  scoreDiff: number;
  barrelRate: number | null;
  hardHitRate: number | null;
  xba: number | null;
  angleTags: string[];
};

export const DEFAULT_TAB: TabKey = "pitchers";
export const DEFAULT_PITCHER_SORT = { key: "hrVs" as PitcherSortKey, direction: "desc" as SortDirection };
export const DEFAULT_BATTER_SORT = { key: "hrScore" as BatterSortKey, direction: "desc" as SortDirection };
export const DEFAULT_MATCHUP_SORT = { key: "combinedScore" as MatchupSortKey, direction: "desc" as SortDirection };

const DASH = "--";
const EMPTY_MESSAGE = "Today's matchup dashboard generates daily at 10 AM ET. Check back after lineups are posted.";
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
    barrelRate: normalizeNumber(entry.barrelRate),
    kRate: normalizeNumber(entry.kRate),
    bbRate: normalizeNumber(entry.bbRate),
    whiffRate: normalizeNumber(entry.whiffRate),
    hrVs: normalizeNumber(entry.hrVs),
    hitsVs: normalizeNumber(entry.hitsVs),
    kVs: normalizeNumber(entry.kVs),
  };
  if (!p.pitcher || !p.team || !p.opponent || p.hrVs == null || p.hitsVs == null || p.kVs == null) return null;
  return p as HrDashboardPitcher;
}

function normalizeBatter(entry: unknown): HrDashboardBatter | null {
  if (!isRecord(entry)) return null;
  const b = {
    gameKey: normalizeText(entry.gameKey),
    player: normalizeText(entry.player),
    team: normalizeTeamValue(entry.team),
    opponent: normalizeTeamValue(entry.opponent),
    opposingPitcher: normalizeText(entry.opposingPitcher) || "TBD",
    opposingPitcherId: normalizeNumber(entry.opposingPitcherId),
    pitcherHand: normalizeText(entry.pitcherHand) || "R",
    ballpark: normalizeText(entry.ballpark) || "Unknown Venue",
    parkFactor: normalizeNumber(entry.parkFactor),
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
  };
  if (!b.player || !b.team || !b.opponent || b.hrScore == null || b.hrScoreRank == null) return null;
  return b as HrDashboardBatter;
}

export function normalizeHrDashboardPayload(value: unknown): HrDashboardPayload | null {
  if (Array.isArray(value)) {
    return {
      date: "", generatedAt: "", games: [], pitchers: [],
      batters: value.map(normalizeBatter).filter((e): e is HrDashboardBatter => Boolean(e)),
    };
  }
  if (!isRecord(value)) return null;
  return {
    date: normalizeText(value.date),
    generatedAt: normalizeText(value.generatedAt),
    games: Array.isArray(value.games) ? value.games.map(normalizeGame).filter((e): e is HrDashboardGame => Boolean(e)) : [],
    pitchers: Array.isArray(value.pitchers) ? value.pitchers.map(normalizePitcher).filter((e): e is HrDashboardPitcher => Boolean(e)) : [],
    batters: Array.isArray(value.batters) ? value.batters.map(normalizeBatter).filter((e): e is HrDashboardBatter => Boolean(e)) : [],
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

export function buildHeatStatRanges(rows: HrDashboardBatter[]) {
  return buildHeatRanges(rows, ["barrelRate","hardHitRate","xba","kRate","bbRate","whiffRate","last7HR","last30HR","opposingPitcherHrVs","hrScore"]);
}
function buildPitcherHeatRanges(rows: HrDashboardPitcher[]) {
  return buildHeatRanges(rows, ["xera","hardHitRate","flyBallRate","barrelRate","kRate","bbRate","whiffRate","hrVs","hitsVs","kVs"]);
}
function buildMatchupHeatRanges(rows: PitcherVsBatterRow[]) {
  return buildHeatRanges(rows, ["hrScore","opposingPitcherHrVs","combinedScore","scoreDiff","barrelRate","hardHitRate","xba"]);
}

export function getHeatCellStyle(
  value: number | null | undefined,
  range: HeatRange | undefined,
  options?: { intent?: HeatIntent; weight?: HeatWeight; invert?: boolean },
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

function formatDateLabel(v?: string) {
  if (!v) return "";
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d);
}
function formatPercent(v: number | null | undefined, digits = 1) { return Number.isFinite(v) ? `${Number(v).toFixed(digits)}%` : DASH; }
function formatNumber(v: number | null | undefined, digits = 1) { return Number.isFinite(v) ? Number(v).toFixed(digits) : DASH; }
function formatDecimal(v: number | null | undefined, digits = 3) { return Number.isFinite(v) ? Number(v).toFixed(digits) : DASH; }
function getEspnTeamLogo(team?: string) {
  const t = normalizeTeamValue(team) || "TBD";
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${ESPN_TEAM_ABBR[t] ?? t.toLowerCase()}.png`;
}
function getRoofLabel(r: string) {
  if (/open/i.test(r)) return "Open";
  if (/retractable/i.test(r)) return "Retractable";
  if (/dome|closed/i.test(r)) return "Roof";
  return r || "Unknown";
}

function getParkFactorTone(value: number) {
  if (value >= 1.15) return "bg-red-100 text-red-800";
  if (value <= 0.9) return "bg-sky-100 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

export function buildParkSidebarRows(games: HrDashboardGame[]): ParkSidebarRow[] {
  return [...games].map((g) => ({
    key: g.gameKey, matchup: g.matchup, stadium: g.stadium, parkFactor: g.parkFactor,
    roofType: g.roofType, temperature: g.temperature, precipitation: g.precipitation,
    windSpeed: g.windSpeed, windDirection: g.windDirection, conditions: g.conditions,
  })).sort((a, b) => b.parkFactor - a.parkFactor || a.matchup.localeCompare(b.matchup));
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

export function buildPitcherVsBatterRows(batters: HrDashboardBatter[], games: HrDashboardGame[]): PitcherVsBatterRow[] {
  const gameByKey = new Map(games.map((g) => [g.gameKey, g]));
  return [...batters].map((b) => {
    const game = gameByKey.get(b.gameKey);
    const hrVs = b.opposingPitcherHrVs ?? 0;
    return {
      rank: 0, gameKey: b.gameKey, player: b.player, team: b.team,
      opposingPitcher: b.opposingPitcher, park: game?.stadium ?? b.ballpark,
      parkFactor: game?.parkFactor ?? b.parkFactor, hrScore: b.hrScore,
      opposingPitcherHrVs: hrVs, combinedScore: Number((b.hrScore + hrVs).toFixed(1)),
      scoreDiff: Number((b.hrScore - hrVs).toFixed(1)),
      barrelRate: b.barrelRate, hardHitRate: b.hardHitRate, xba: b.xba, angleTags: b.angleTags,
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore || b.hrScore - a.hrScore || a.player.localeCompare(b.player))
    .map((r, i) => ({ ...r, rank: i + 1 }));
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
  const base: React.CSSProperties = { borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, display: "inline-block", minWidth: 52, textAlign: "center", border: "1px solid rgba(148,163,184,0.18)", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
  if (!Number.isFinite(v)) return { ...base, backgroundColor: "#f1f5f9", color: "#94a3b8" };
  if (v! >= 75) return { ...base, backgroundColor: "#dcfce7", color: "#166534", borderColor: "rgba(34,197,94,0.2)" };
  if (v! >= 62) return { ...base, backgroundColor: "#fef3c7", color: "#92400e", borderColor: "rgba(245,158,11,0.22)" };
  return { ...base, backgroundColor: "#f8fafc", color: "#475569", borderColor: "rgba(148,163,184,0.22)" };
}

// ââ sub-components âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function TeamLogoBadge({ team, size = 24, showLabel = true }: { team?: string; size?: number; showLabel?: boolean }) {
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
      <img src={getEspnTeamLogo(t)} alt={`${t} logo`} width={size} height={size} style={{ objectFit: "contain" }} loading="lazy" onError={() => setFailed(true)} />
      {showLabel && <span style={{ fontSize: 13, fontWeight: 500, color: "#475569" }}>{t}</span>}
    </span>
  );
}

function ScorePill({ value, label }: { value: number | null | undefined; label?: string }) {
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#64748b", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 16, backgroundColor: "#f8fafc" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span>🔥</span><span>Top edge gets the clearest fill</span></span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span>✨</span><span>Strong edge gets a light tint</span></span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span>❄️</span><span>K-heavy or suppressive spots lean cool</span></span>
    </div>
  );
}

function PickCard({ pick, row }: { pick: HrPropPick; row?: HrDashboardBatter }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
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
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pick.topStats.map((stat) => (
          <span key={`${pick.player}-${stat}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{stat}</span>
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-sm text-slate-700">
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

// ââ main component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export default function MlbHrProps() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [pitcherSortKey, setPitcherSortKey] = useState<PitcherSortKey>(DEFAULT_PITCHER_SORT.key);
  const [pitcherSortDirection, setPitcherSortDirection] = useState<SortDirection>(DEFAULT_PITCHER_SORT.direction);
  const [batterSortKey, setBatterSortKey] = useState<BatterSortKey>(DEFAULT_BATTER_SORT.key);
  const [batterSortDirection, setBatterSortDirection] = useState<SortDirection>(DEFAULT_BATTER_SORT.direction);
  const [matchupSortKey, setMatchupSortKey] = useState<MatchupSortKey>(DEFAULT_MATCHUP_SORT.key);
  const [matchupSortDirection, setMatchupSortDirection] = useState<SortDirection>(DEFAULT_MATCHUP_SORT.direction);
  const [pitcherSearch, setPitcherSearch] = useState("");
  const [batterSearch, setBatterSearch] = useState("");
  const [matchupSearch, setMatchupSearch] = useState("");
  const [pitcherGameFilter, setPitcherGameFilter] = useState("all");
  const [batterGameFilter, setBatterGameFilter] = useState("all");
  const [matchupGameFilter, setMatchupGameFilter] = useState("all");

  usePageSeo({
    title: "MLB HR Prop Dashboard Today - Joe Knows Ball",
    description: "Daily MLB HR prop dashboard with park factors, pitcher vulnerability, batter power signals, and combined matchup edges.",
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
    ],
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" }),
      fetch("/data/mlb/hr-props-best-bets.json", { cache: "no-store" }),
    ])
      .then(async ([rawResponse, bestResponse]) => {
        if (!active) return;
        if (!rawResponse.ok || !bestResponse.ok) {
          setDashboard(null);
          setBestBets(null);
          return;
        }
        const [rawPayload, bestPayload] = await Promise.all([rawResponse.json(), bestResponse.json()]);
        if (!active) return;
        setDashboard(normalizeHrDashboardPayload(rawPayload));
        setBestBets(normalizeHrBestBetsPayload(bestPayload));
      })
      .catch(() => {
        if (!active) return;
        setDashboard(null);
        setBestBets(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(false);
      }
    };

    syncMobile();
    window.addEventListener("resize", syncMobile);
    return () => window.removeEventListener("resize", syncMobile);
  }, []);

  const allGames = dashboard?.games ?? [];
  const allPitchers = dashboard?.pitchers ?? [];
  const allBatters = dashboard?.batters ?? [];
  const tbdGameKeys = useMemo(() => buildTbdGameKeySet(allPitchers, allBatters), [allBatters, allPitchers]);
  const games = useMemo(() => allGames.filter((game) => !tbdGameKeys.has(game.gameKey)), [allGames, tbdGameKeys]);
  const pitchers = useMemo(
    () => allPitchers.filter((pitcher) => !tbdGameKeys.has(pitcher.gameKey) && !isStarterPlaceholder(pitcher.pitcher)),
    [allPitchers, tbdGameKeys],
  );
  const batters = useMemo(
    () => allBatters.filter((batter) => !tbdGameKeys.has(batter.gameKey) && !isStarterPlaceholder(batter.opposingPitcher)),
    [allBatters, tbdGameKeys],
  );
  const tbdFootnotes = useMemo(() => buildTbdFootnotes(tbdGameKeys, allGames, allPitchers, allBatters), [allBatters, allGames, allPitchers, tbdGameKeys]);
  const parkRows = useMemo(() => buildParkSidebarRows(games), [games]);
  const slateSummary = useMemo(() => buildSlateSummary(pitchers, batters, games), [pitchers, batters, games]);
  const pitcherHeat = useMemo(() => buildPitcherHeatRanges(pitchers), [pitchers]);
  const batterHeat = useMemo(() => buildHeatStatRanges(batters), [batters]);
  const matchupRows = useMemo(() => buildPitcherVsBatterRows(batters, games), [batters, games]);
  const matchupHeat = useMemo(() => buildMatchupHeatRanges(matchupRows), [matchupRows]);
  const batterLookup = useMemo(() => new Map(batters.map((row) => [`${row.player}|${row.team}|${row.opponent}`, row])), [batters]);
  const visibleBestBets = useMemo(
    () => bestBets?.bestBets.filter((pick) => !isStarterPlaceholder(pick.opposingPitcher) && batterLookup.has(`${pick.player}|${pick.team}|${pick.opponent}`)) ?? [],
    [bestBets, batterLookup],
  );

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

  const filteredBatters = useMemo(() => {
    const query = batterSearch.trim().toLowerCase();
    const rows = batters.filter((row) => {
      if (batterGameFilter !== "all" && row.gameKey !== batterGameFilter) return false;
      if (!query) return true;
      return [
        row.player,
        row.team,
        row.opposingPitcher,
        row.ballpark,
      ].some((value) => value.toLowerCase().includes(query));
    });
    return sortBatters(rows, batterSortKey, batterSortDirection);
  }, [batterGameFilter, batterSearch, batterSortDirection, batterSortKey, batters]);

  const filteredMatchups = useMemo(() => {
    const query = matchupSearch.trim().toLowerCase();
    const rows = matchupRows.filter((row) => {
      if (matchupGameFilter !== "all" && row.gameKey !== matchupGameFilter) return false;
      if (!query) return true;
      return [
        row.player,
        row.team,
        row.opposingPitcher,
        row.park,
      ].some((value) => value.toLowerCase().includes(query));
    });
    return sortMatchups(rows, matchupSortKey, matchupSortDirection);
  }, [matchupGameFilter, matchupRows, matchupSearch, matchupSortDirection, matchupSortKey]);

  const topMatchupCards = filteredMatchups.slice(0, 4);
  const hasData = allGames.length > 0 || allPitchers.length > 0 || allBatters.length > 0 || tbdFootnotes.length > 0;

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

  return (
    <SiteShell>
      <main className={cn("site-page bg-[#edf2f7] pb-16 pt-4 text-slate-900", isMobile ? "text-[14px]" : "")}>
        <div className="site-container" style={{ maxWidth: "none", width: "100%" }}>
          {!hasData ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              {EMPTY_MESSAGE}
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
              <aside className={cn("space-y-4 xl:sticky xl:top-4 xl:self-start", isMobile ? "hidden" : "")}>
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">🏟️ Park Factors</div>
                      <div className="mt-1 text-xs text-slate-500">Today&apos;s park and weather context</div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{parkRows.length} parks</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {parkRows.map((park) => (
                      <article key={park.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{park.matchup}</div>
                            <div className="mt-1 text-xs text-slate-500">{park.stadium}</div>
                          </div>
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", getParkFactorTone(park.parkFactor))}>
                            {park.parkFactor.toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">{getRoofLabel(park.roofType)}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {park.temperature != null ? `${park.temperature.toFixed(0)}°` : DASH}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            Precip {park.precipitation != null ? `${park.precipitation.toFixed(0)}%` : DASH}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                          <span>{park.windSpeed != null ? `${park.windSpeed.toFixed(0)} MPH ${park.windDirection}` : `Wind ${DASH}`}</span>
                          <span className="truncate text-right">{park.conditions}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </aside>

              {isMobile && isSidebarOpen ? (
                <div className="fixed inset-0 z-40 bg-slate-950/35" onClick={() => setIsSidebarOpen(false)}>
                  <aside
                    className="absolute left-0 top-0 h-full w-[88vw] max-w-[320px] overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">🏟️ Park Factors</div>
                      <button
                        type="button"
                        onClick={() => setIsSidebarOpen(false)}
                        className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
                      >
                        Close
                      </button>
                    </div>
                    <div className="space-y-3">
                      {parkRows.map((park) => (
                        <article key={`mobile-${park.key}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{park.matchup}</div>
                              <div className="mt-1 text-xs text-slate-500">{park.stadium}</div>
                            </div>
                            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", getParkFactorTone(park.parkFactor))}>
                              {park.parkFactor.toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">{getRoofLabel(park.roofType)}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {park.temperature != null ? `${park.temperature.toFixed(0)}°` : DASH}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </aside>
                </div>
              ) : null}

              <section className="min-w-0 flex-1 space-y-5">
                <div className="rounded-[30px] bg-[#0f2748] px-5 py-5 text-white shadow-sm">
                  <div className={cn("flex flex-col gap-4", isMobile ? "" : "lg:flex-row lg:items-start lg:justify-between")}>
                    <div>
                      <div className={cn("font-semibold tracking-[-0.04em]", isMobile ? "text-[28px]" : "text-3xl sm:text-4xl")}>MLB HR Prop Dashboard</div>
                      <p className={cn("mt-2 max-w-3xl leading-6 text-sky-100", isMobile ? "text-[13px]" : "text-sm")}>
                        Starting pitcher vulnerability, park environment, and batter power/contact angles for today&apos;s slate.
                      </p>
                    </div>
                    <div className={cn("flex flex-wrap gap-2", isMobile ? "items-center justify-between" : "")}>
                      {isMobile ? (
                        <button
                          type="button"
                          onClick={() => setIsSidebarOpen(true)}
                          className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-semibold text-white"
                        >
                          ☰ Parks
                        </button>
                      ) : null}
                      <span className={cn("rounded-full bg-white/10 px-3 py-1 font-semibold text-white", isMobile ? "text-[13px]" : "text-sm")}>👥 {slateSummary.hitterCount} hitters</span>
                      <span className={cn("rounded-full bg-emerald-400/20 px-3 py-1 font-semibold text-emerald-100", isMobile ? "text-[13px]" : "text-sm")}>🟢 Live Slate</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-sky-200">
                    <span>{formatDateLabel(dashboard?.date || bestBets?.date)}</span>
                    <span>•</span>
                    <span>{games.length} games</span>
                    <span>•</span>
                    <span>{pitchers.length} starters</span>
                  </div>
                </div>

                <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">🏟️ Strongest Parks</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.strongestParks}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">🎯 Top Arm</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.topArm}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">💥 Top Bat</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.topBat}</div>
                    </div>
                  </div>
                  {bestBets?.slatePreview ? (
                    <div className="mt-3 border-t border-sky-200 pt-3 text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">📝 Slate note:</span> {bestBets.slatePreview.slateOverview}
                    </div>
                  ) : null}
                </div>

                <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <p className="max-w-4xl text-sm leading-7 text-slate-600">
                    Use this MLB HR props board to compare park factors, pitcher vulnerability, and batter power signals
                    across the current slate, then cross-check full-game context on the{" "}
                    <a href="/mlb" className="font-semibold text-sky-800 hover:underline">
                      MLB matchup analytics page
                    </a>
                    .
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <a href="/mlb" className="font-semibold text-sky-800 hover:underline">
                      View today&apos;s MLB matchup analytics
                    </a>
                  </div>
                </section>

                <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4">
                    <div className="flex flex-nowrap gap-6 overflow-x-auto whitespace-nowrap" style={{ WebkitOverflowScrolling: "touch" }}>
                      {[
                        { key: "pitchers", label: "🔥 Pitchers" },
                        { key: "batters", label: "💥 Batters" },
                        { key: "matchups", label: "⚔️ Pitchers vs Batters" },
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

                  <div className="p-4">
                    {activeTab === "pitchers" ? (
                      <section className="space-y-4">
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
                                  ["barrelRate", "Barrel%"],
                                  ["kRate", "K%"],
                                  ["bbRate", "BB%"],
                                  ["whiffRate", "Whiff%"],
                                  ["hrVs", "HR VS"],
                                  ["hitsVs", "Hits VS"],
                                  ["kVs", "K VS"],
                                ].map(([key, label]) => (
                                  <th key={key} className="border-b border-slate-200 bg-white px-4 py-3 text-left font-semibold whitespace-nowrap">
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
                                  <td className="border-b border-slate-100 px-4 py-3 min-w-[180px]">
                                    <div className="font-medium text-slate-900">{pitcher.pitcher}</div>
                                    <div className="mt-1 text-xs text-slate-500">{pitcher.ballpark}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <TeamLogoBadge team={pitcher.team} size={20} showLabel={false} />
                                      <span>{pitcher.team}</span>
                                      <span className="text-slate-400">vs</span>
                                      <TeamLogoBadge team={pitcher.opponent} size={20} showLabel={false} />
                                      <span>{pitcher.opponent}</span>
                                    </div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(pitcher.parkFactor))}>
                                      {pitcher.parkFactor.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.xera, pitcherHeat.xera, { intent: "balance", weight: "secondary", invert: true })}>{formatNumber(pitcher.xera, 2)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.hardHitRate, pitcherHeat.hardHitRate, { intent: "balance", weight: "secondary", invert: true })}>{formatPercent(pitcher.hardHitRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.barrelRate, pitcherHeat.barrelRate, { intent: "balance", weight: "secondary", invert: true })}>{formatPercent(pitcher.barrelRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.kRate, pitcherHeat.kRate, { intent: "cool", weight: "secondary" })}>{formatPercent(pitcher.kRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.bbRate, pitcherHeat.bbRate, { intent: "warm", weight: "secondary" })}>{formatPercent(pitcher.bbRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.whiffRate, pitcherHeat.whiffRate, { intent: "cool", weight: "secondary" })}>{formatPercent(pitcher.whiffRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.hrVs, pitcherHeat.hrVs, { intent: "warm", weight: "primary" })}><ScorePill value={pitcher.hrVs} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.hitsVs, pitcherHeat.hitsVs, { intent: "warm", weight: "primary" })}><ScorePill value={pitcher.hitsVs} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(pitcher.kVs, pitcherHeat.kVs, { intent: "cool", weight: "primary" })}><ScorePill value={pitcher.kVs} /></td>
                                </tr>
                              )) : (
                                <tr>
                                  <td colSpan={12} className="border-b border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
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
                      <section className="space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">💥 Batter View</h2>
                            <p className="mt-1 text-sm text-slate-500">HR Score drives the strongest cue. Supporting power and recent-HR stats only tint when the edge is clearly real.</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={batterSearch}
                              onChange={(event) => setBatterSearch(event.target.value)}
                              placeholder="Search batter, pitcher, or team"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <GameSelect value={batterGameFilter} onChange={setBatterGameFilter} options={gameOptions} label="Game" />
                          </div>
                        </div>
                        <DataLegend />
                        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                          <table className="min-w-full border-separate border-spacing-0 text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                              <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                {[
                                  ["hrScoreRank", "Rank"],
                                  ["player", "Batter"],
                                  ["team", "Team"],
                                  ["opposingPitcher", "Opp Pitcher"],
                                  ["parkFactor", "Park"],
                                  ["kRate", "K%"],
                                  ["bbRate", "BB%"],
                                  ["barrelRate", "Barrel%"],
                                  ["hardHitRate", "Hard Hit%"],
                                  ["xba", "xBA"],
                                  ["whiffRate", "Whiff%"],
                                  ["last7HR", "Last 7 HR"],
                                  ["last30HR", "Last 30 HR"],
                                  ["opposingPitcherHrVs", "Pitcher HR VS"],
                                  ["hrScore", "HR Score"],
                                ].map(([key, label]) => (
                                  <th key={key} className="border-b border-slate-200 bg-white px-4 py-3 text-left font-semibold whitespace-nowrap">
                                    <button type="button" onClick={() => handleBatterSort(key as BatterSortKey)} className="transition hover:text-slate-900">
                                      {label}{makeSortIndicator(batterSortKey === key, batterSortDirection)}
                                    </button>
                                  </th>
                                ))}
                                <th className="border-b border-slate-200 bg-white px-4 py-3 text-left font-semibold whitespace-nowrap">Angle</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredBatters.length ? filteredBatters.map((row) => (
                                <tr key={`${row.player}-${row.team}-${row.opponent}`} className="odd:bg-white even:bg-slate-50/60">
                                  <td className="border-b border-slate-100 px-4 py-3">{row.hrScoreRank}</td>
                                  <td className="border-b border-slate-100 px-4 py-3 min-w-[180px]">
                                    <div className="font-medium text-slate-900">{row.player}</div>
                                    <div className="mt-1 text-xs text-slate-500">{row.ballpark}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3"><TeamLogoBadge team={row.team} size={20} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3 min-w-[150px]">
                                    <div>{row.opposingPitcher}</div>
                                    <div className="mt-1 text-xs text-slate-500">{row.opponent} • {row.pitcherHand}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>
                                      {row.parkFactor.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.kRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.bbRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.barrelRate, batterHeat.barrelRate, { intent: "warm", weight: "secondary" })}>{formatPercent(row.barrelRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.hardHitRate, batterHeat.hardHitRate, { intent: "warm", weight: "secondary" })}>{formatPercent(row.hardHitRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3">{formatDecimal(row.xba, 3)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.whiffRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.last7HR, batterHeat.last7HR, { intent: "warm", weight: "secondary" })}>{formatNumber(row.last7HR, 0)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.last30HR, batterHeat.last30HR, { intent: "warm", weight: "secondary" })}>{formatNumber(row.last30HR, 0)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.opposingPitcherHrVs, batterHeat.opposingPitcherHrVs, { intent: "warm", weight: "primary" })}><ScorePill value={row.opposingPitcherHrVs} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.hrScore, batterHeat.hrScore, { intent: "warm", weight: "primary" })}><ScorePill value={row.hrScore} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3">
                                    <div className="flex flex-wrap gap-1.5">
                                      {row.angleTags.length ? row.angleTags.map((tag) => (
                                        <span key={`${row.player}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>
                                      )) : <span className="text-slate-400">{DASH}</span>}
                                    </div>
                                  </td>
                                </tr>
                              )) : (
                                <tr>
                                  <td colSpan={16} className="border-b border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
                                    No batters match the current search or game filter.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ) : null}

                    {activeTab === "matchups" ? (
                      <section className="space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">⚔️ Pitchers vs Batters</h2>
                            <p className="mt-1 text-sm text-slate-500">Combined Score = Batter HR Score + Pitcher HR VS. Score Diff = Batter HR Score minus Pitcher HR VS.</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={matchupSearch}
                              onChange={(event) => setMatchupSearch(event.target.value)}
                              placeholder="Search batter, pitcher, or park"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <GameSelect value={matchupGameFilter} onChange={setMatchupGameFilter} options={gameOptions} label="Game" />
                          </div>
                        </div>

                        <div className={cn("grid gap-4 xl:grid-cols-2 2xl:grid-cols-4", isMobile ? "grid-cols-1" : "")}>
                          {topMatchupCards.length ? topMatchupCards.map((row) => (
                            <article key={`${row.rank}-${row.player}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-base font-bold text-slate-900">{row.player}</div>
                                  <div className="mt-1 text-sm text-slate-500">{row.team} vs {row.opposingPitcher}</div>
                                </div>
                                <ScorePill value={row.combinedScore} />
                              </div>
                              <div className="mt-3 text-sm text-slate-600">{row.park}</div>
                              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">💥 Batter HR</div>
                                  <div className="mt-1 font-semibold text-slate-900">{row.hrScore.toFixed(1)}</div>
                                </div>
                                <div>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">🔥 Pitcher HR VS</div>
                                  <div className="mt-1 font-semibold text-slate-900">{row.opposingPitcherHrVs.toFixed(1)}</div>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {row.angleTags.length ? row.angleTags.map((tag) => (
                                  <span key={`${row.player}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>
                                )) : <span className="text-slate-400">{DASH}</span>}
                              </div>
                            </article>
                          )) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 xl:col-span-2 2xl:col-span-4">
                              No combined matchups match the current search or game filter.
                            </div>
                          )}
                        </div>

                        <DataLegend />
                        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                          <table className="min-w-full border-separate border-spacing-0 text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                              <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                {[
                                  ["rank", "Rank"],
                                  ["player", "Batter"],
                                  ["team", "Team"],
                                  ["opposingPitcher", "Vs Pitcher"],
                                  ["parkFactor", "Park"],
                                  ["hrScore", "Batter HR"],
                                  ["opposingPitcherHrVs", "Pitcher HR VS"],
                                  ["combinedScore", "Combined"],
                                  ["scoreDiff", "Score Diff"],
                                  ["barrelRate", "Barrel%"],
                                  ["hardHitRate", "Hard Hit%"],
                                  ["xba", "xBA"],
                                ].map(([key, label]) => (
                                  <th key={key} className="border-b border-slate-200 bg-white px-4 py-3 text-left font-semibold whitespace-nowrap">
                                    <button type="button" onClick={() => handleMatchupSort(key as MatchupSortKey)} className="transition hover:text-slate-900">
                                      {label}{makeSortIndicator(matchupSortKey === key, matchupSortDirection)}
                                    </button>
                                  </th>
                                ))}
                                <th className="border-b border-slate-200 bg-white px-4 py-3 text-left font-semibold whitespace-nowrap">Angle</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredMatchups.length ? filteredMatchups.map((row) => (
                                <tr key={`${row.rank}-${row.player}-${row.opposingPitcher}`} className="odd:bg-white even:bg-slate-50/60">
                                  <td className="border-b border-slate-100 px-4 py-3">{row.rank}</td>
                                  <td className="border-b border-slate-100 px-4 py-3 min-w-[180px]">
                                    <div className="font-medium text-slate-900">{row.player}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3"><TeamLogoBadge team={row.team} size={20} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3 min-w-[150px]">{row.opposingPitcher}</td>
                                  <td className="border-b border-slate-100 px-4 py-3">
                                    <div className="font-medium text-slate-900">{row.park}</div>
                                    <div className="mt-1">
                                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>{row.parkFactor.toFixed(2)}</span>
                                    </div>
                                  </td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.hrScore, matchupHeat.hrScore, { intent: "warm", weight: "secondary" })}><ScorePill value={row.hrScore} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.opposingPitcherHrVs, matchupHeat.opposingPitcherHrVs, { intent: "warm", weight: "secondary" })}><ScorePill value={row.opposingPitcherHrVs} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.combinedScore, matchupHeat.combinedScore, { intent: "warm", weight: "primary" })}><ScorePill value={row.combinedScore} /></td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.scoreDiff, matchupHeat.scoreDiff, { intent: "balance", weight: "primary" })}>{row.scoreDiff.toFixed(1)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.barrelRate, matchupHeat.barrelRate, { intent: "warm", weight: "secondary" })}>{formatPercent(row.barrelRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3" style={getHeatCellStyle(row.hardHitRate, matchupHeat.hardHitRate, { intent: "warm", weight: "secondary" })}>{formatPercent(row.hardHitRate)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3">{formatDecimal(row.xba, 3)}</td>
                                  <td className="border-b border-slate-100 px-4 py-3">
                                    <div className="flex flex-wrap gap-1.5">
                                      {row.angleTags.length ? row.angleTags.map((tag) => (
                                        <span key={`${row.player}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>
                                      )) : <span className="text-slate-400">{DASH}</span>}
                                    </div>
                                  </td>
                                </tr>
                              )) : (
                                <tr>
                                  <td colSpan={13} className="border-b border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
                                    No combined matchups match the current search or game filter.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <SportsbookBar />
                </div>

                {bestBets && (bestBets.slatePreview || visibleBestBets.length > 0) ? (
                  <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                      {bestBets.slatePreview ? (
                        <>
                          <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">📝 Slate Overview</div>
                            <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets.slatePreview.slateOverview}</p>
                          </article>
                          <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">🧠 Model Note</div>
                            <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets.slatePreview.modelNote}</p>
                          </article>
                        </>
                      ) : null}
                    </div>

                    {visibleBestBets.length > 0 ? (
                      <aside className="space-y-4">
                        <div className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">💥 Top HR Props Today</div>
                        {visibleBestBets.slice(0, 3).map((pick) => (
                          <PickCard key={`${pick.player}-${pick.team}`} pick={pick} row={batterLookup.get(`${pick.player}|${pick.team}|${pick.opponent}`)} />
                        ))}
                      </aside>
                    ) : null}
                  </section>
                ) : null}

                {tbdFootnotes.length > 0 ? (
                  <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="space-y-1 text-xs leading-6 text-slate-500">
                      {tbdFootnotes.map((matchup) => (
                        <p key={matchup}>The {matchup} matchup is TBD and will be updated once the starting pitcher is announced.</p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </section>
            </div>
          )}
        </div>
      </main>
    </SiteShell>
  );
}
