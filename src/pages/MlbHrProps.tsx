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
  slatePreview?: {
    slateOverview: string;
    modelNote: string;
  } | null;
  bestBets: HrPropPick[];
  valueBets: HrPropPick[];
  longshots: HrPropPick[];
};

type SortDirection = "asc" | "desc";
type TabKey = "pitchers" | "batters" | "matchups";
type PitcherSortKey =
  | "pitcher"
  | "gameKey"
  | "parkFactor"
  | "xera"
  | "hardHitRate"
  | "barrelRate"
  | "kRate"
  | "bbRate"
  | "whiffRate"
  | "hrVs"
  | "hitsVs"
  | "kVs";
type BatterSortKey =
  | "hrScoreRank"
  | "player"
  | "team"
  | "opposingPitcher"
  | "parkFactor"
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
type MatchupSortKey =
  | "rank"
  | "player"
  | "team"
  | "opposingPitcher"
  | "parkFactor"
  | "hrScore"
  | "opposingPitcherHrVs"
  | "combinedScore"
  | "scoreDiff"
  | "barrelRate"
  | "hardHitRate"
  | "xba";

type HeatRange = { low: number; high: number };

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

type SlateSummary = {
  strongestParks: string;
  topArm: string;
  topBat: string;
  hitterCount: number;
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

const DASH = "—";
const EMPTY_MESSAGE = "Today's matchup dashboard generates daily at 10 AM ET. Check back after lineups are posted.";
const ESPN_TEAM_ABBR: Record<string, string> = {
  AZ: "ari", ATH: "oak", WSH: "wsh", CWS: "chw", KCR: "kc",
  SDP: "sd", SFG: "sf", TBR: "tb", NYY: "nyy", NYM: "nym",
  LAD: "lad", LAA: "laa", BOS: "bos", CHC: "chc", CIN: "cin",
  CLE: "cle", COL: "col", DET: "det", HOU: "hou", MIA: "mia",
  MIL: "mil", MIN: "min", PHI: "phi", PIT: "pit", SEA: "sea",
  STL: "stl", TEX: "tex", TOR: "tor", ATL: "atl", BAL: "bal",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTeamValue(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeText(entry)).filter(Boolean)
    : [];
}

function normalizeGame(entry: unknown): HrDashboardGame | null {
  if (!isRecord(entry)) return null;

  const game = {
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

  if (!game.gameKey || !game.awayTeam || !game.homeTeam || game.parkFactor == null) return null;
  return game as HrDashboardGame;
}

function normalizePitcher(entry: unknown): HrDashboardPitcher | null {
  if (!isRecord(entry)) return null;

  const pitcher = {
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

  if (!pitcher.pitcher || !pitcher.team || !pitcher.opponent || pitcher.hrVs == null || pitcher.hitsVs == null || pitcher.kVs == null) {
    return null;
  }

  return pitcher as HrDashboardPitcher;
}

function normalizeBatter(entry: unknown): HrDashboardBatter | null {
  if (!isRecord(entry)) return null;

  const batter = {
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

  if (!batter.player || !batter.team || !batter.opponent || batter.hrScore == null || batter.hrScoreRank == null) return null;
  if ([batter.barrelRate, batter.hardHitRate, batter.kRate, batter.bbRate, batter.whiffRate].some((value) => value != null && (value < 0 || value > 100))) {
    return null;
  }

  return batter as HrDashboardBatter;
}

export function normalizeHrDashboardPayload(value: unknown): HrDashboardPayload | null {
  if (Array.isArray(value)) {
    return {
      date: "",
      generatedAt: "",
      games: [],
      pitchers: [],
      batters: value.map(normalizeBatter).filter((entry): entry is HrDashboardBatter => Boolean(entry)),
    };
  }

  if (!isRecord(value)) return null;

  const games = Array.isArray(value.games) ? value.games.map(normalizeGame).filter((entry): entry is HrDashboardGame => Boolean(entry)) : [];
  const pitchers = Array.isArray(value.pitchers) ? value.pitchers.map(normalizePitcher).filter((entry): entry is HrDashboardPitcher => Boolean(entry)) : [];
  const batters = Array.isArray(value.batters) ? value.batters.map(normalizeBatter).filter((entry): entry is HrDashboardBatter => Boolean(entry)) : [];

  return {
    date: normalizeText(value.date),
    generatedAt: normalizeText(value.generatedAt),
    games,
    pitchers,
    batters,
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

    return {
      player,
      team,
      opponent,
      opposingPitcher,
      hrScoreRank,
      topStats: normalizeStringList(entry.topStats).slice(0, 2),
      bullets: normalizeStringList(entry.bullets).slice(0, 2),
    };
  };

  const normalizePickList = (entry: unknown) =>
    Array.isArray(entry) ? entry.map(normalizePick).filter((pick): pick is HrPropPick => Boolean(pick)) : [];

  const slatePreview = isRecord(value.slatePreview)
    ? {
        slateOverview: normalizeText(value.slatePreview.slateOverview),
        modelNote: normalizeText(value.slatePreview.modelNote),
      }
    : null;

  return {
    date: normalizeText(value.date),
    generatedAt: normalizeText(value.generatedAt),
    slatePreview: slatePreview?.slateOverview && slatePreview?.modelNote ? slatePreview : null,
    bestBets: normalizePickList(value.bestBets),
    valueBets: normalizePickList(value.valueBets),
    longshots: normalizePickList(value.longshots),
  };
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

function buildHeatRanges<T extends Record<string, unknown>>(rows: T[], keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => {
      const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value));
      return [key, {
        low: quantile(values, 0.1) ?? 0,
        high: quantile(values, 0.9) ?? 0,
      } satisfies HeatRange];
    }),
  ) as Record<string, HeatRange>;
}

export function buildHeatStatRanges(rows: HrDashboardBatter[]) {
  return buildHeatRanges(rows, ["barrelRate", "hardHitRate", "xba", "kRate", "bbRate", "whiffRate", "last7HR", "last30HR", "opposingPitcherHrVs", "hrScore"]);
}

function buildPitcherHeatRanges(rows: HrDashboardPitcher[]) {
  return buildHeatRanges(rows, ["xera", "hardHitRate", "flyBallRate", "barrelRate", "kRate", "bbRate", "whiffRate", "hrVs", "hitsVs", "kVs"]);
}

function buildMatchupHeatRanges(rows: PitcherVsBatterRow[]) {
  return buildHeatRanges(rows, ["hrScore", "opposingPitcherHrVs", "combinedScore", "scoreDiff", "barrelRate", "hardHitRate", "xba"]);
}

export function getHeatCellStyle(value: number | null | undefined, range: HeatRange | undefined) {
  if (!Number.isFinite(value) || !range || !Number.isFinite(range.low) || !Number.isFinite(range.high) || range.high <= range.low) {
    return undefined;
  }

  const midpoint = (range.low + range.high) / 2;
  const denominator = Math.max((range.high - range.low) / 2, 0.0001);
  const normalized = Math.max(-1, Math.min(1, (value - midpoint) / denominator));
  const alpha = 0.08 + Math.abs(normalized) * 0.16;

  return {
    backgroundColor: normalized >= 0
      ? `rgba(220, 38, 38, ${alpha.toFixed(3)})`
      : `rgba(37, 99, 235, ${alpha.toFixed(3)})`,
    color: normalized >= 0 ? "#7f1d1d" : "#1e3a8a",
  };
}

function formatDateLabel(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatPercent(value: number | null | undefined, digits = 1) {
  return Number.isFinite(value) ? `${Number(value).toFixed(digits)}%` : DASH;
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : DASH;
}

function formatDecimal(value: number | null | undefined, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : DASH;
}

function getEspnTeamLogo(team?: string) {
  const safeTeam = normalizeTeamValue(team) || "TBD";
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${ESPN_TEAM_ABBR[safeTeam] ?? safeTeam.toLowerCase()}.png`;
}

function getRoofLabel(roofType: string) {
  if (/open/i.test(roofType)) return "Open";
  if (/retractable/i.test(roofType)) return "Retractable";
  if (/dome|closed/i.test(roofType)) return "Roof";
  return roofType || "Unknown";
}

function getParkFactorTone(value: number) {
  if (value >= 1.15) return "bg-red-100 text-red-800";
  if (value <= 0.9) return "bg-sky-100 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

function getScoreTone(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "bg-slate-100 text-slate-500";
  if (value >= 70) return "bg-red-100 text-red-800";
  if (value >= 55) return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

function TeamLogoBadge({ team, size = 24, showLabel = true }: { team?: string; size?: number; showLabel?: boolean }) {
  const [failed, setFailed] = useState(false);
  const safeTeam = normalizeTeamValue(team) || "TBD";
  const colors = getMlbTeamColors(safeTeam);

  if (failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
        style={{ backgroundColor: colors.primary, minWidth: size }}
      >
        {safeTeam}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <img
        src={getEspnTeamLogo(safeTeam)}
        alt={`${safeTeam} logo`}
        width={size}
        height={size}
        className="object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {showLabel ? <span className="text-sm font-medium text-slate-600">{safeTeam}</span> : null}
    </span>
  );
}

function ScorePill({ value, label }: { value: number | null | undefined; label?: string }) {
  if (!Number.isFinite(value)) return <span className="text-slate-400">{DASH}</span>;
  return (
    <span className={cn("inline-flex min-w-[3.9rem] items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", getScoreTone(value))}>
      {label ?? Number(value).toFixed(1)}
    </span>
  );
}

function DataLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />Higher / stronger</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Neutral</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" />Lower / lighter</span>
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

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function makeSortIndicator(active: boolean, direction: SortDirection) {
  if (!active) return "";
  return direction === "asc" ? " ↑" : " ↓";
}

export function buildParkSidebarRows(games: HrDashboardGame[]): ParkSidebarRow[] {
  return [...games]
    .map((game) => ({
      key: game.gameKey,
      matchup: game.matchup,
      stadium: game.stadium,
      parkFactor: game.parkFactor,
      roofType: game.roofType,
      temperature: game.temperature,
      precipitation: game.precipitation,
      windSpeed: game.windSpeed,
      windDirection: game.windDirection,
      conditions: game.conditions,
    }))
    .sort((left, right) => right.parkFactor - left.parkFactor || left.matchup.localeCompare(right.matchup));
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

export function buildPitcherVsBatterRows(
  batters: HrDashboardBatter[],
  games: HrDashboardGame[],
): PitcherVsBatterRow[] {
  const gameByKey = new Map(games.map((game) => [game.gameKey, game]));
  return [...batters]
    .map((batter) => {
      const game = gameByKey.get(batter.gameKey);
      const opposingPitcherHrVs = batter.opposingPitcherHrVs ?? 0;
      const combinedScore = Number((batter.hrScore + opposingPitcherHrVs).toFixed(1));
      const scoreDiff = Number((batter.hrScore - opposingPitcherHrVs).toFixed(1));

      return {
        rank: 0,
        gameKey: batter.gameKey,
        player: batter.player,
        team: batter.team,
        opposingPitcher: batter.opposingPitcher,
        park: game?.stadium ?? batter.ballpark,
        parkFactor: game?.parkFactor ?? batter.parkFactor,
        hrScore: batter.hrScore,
        opposingPitcherHrVs,
        combinedScore,
        scoreDiff,
        barrelRate: batter.barrelRate,
        hardHitRate: batter.hardHitRate,
        xba: batter.xba,
        angleTags: batter.angleTags,
      };
    })
    .sort((left, right) => right.combinedScore - left.combinedScore || right.hrScore - left.hrScore || left.player.localeCompare(right.player))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function sortPitchers(rows: HrDashboardPitcher[], sortKey: PitcherSortKey, direction: SortDirection) {
  return [...rows].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    const base =
      typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
    return direction === "asc" ? base : -base;
  });
}

export function sortBatters(rows: HrDashboardBatter[], sortKey: BatterSortKey, direction: SortDirection) {
  return [...rows].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    const base =
      typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
    return direction === "asc" ? base : -base;
  });
}

function sortMatchups(rows: PitcherVsBatterRow[], sortKey: MatchupSortKey, direction: SortDirection) {
  return [...rows].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    const base =
      typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
    return direction === "asc" ? base : -base;
  });
}

export default function MlbHrProps() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
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

  const games = dashboard?.games ?? [];
  const pitchers = dashboard?.pitchers ?? [];
  const batters = dashboard?.batters ?? [];
  const parkRows = useMemo(() => buildParkSidebarRows(games), [games]);
  const slateSummary = useMemo(() => buildSlateSummary(pitchers, batters, games), [pitchers, batters, games]);
  const pitcherHeat = useMemo(() => buildPitcherHeatRanges(pitchers), [pitchers]);
  const batterHeat = useMemo(() => buildHeatStatRanges(batters), [batters]);
  const matchupRows = useMemo(() => buildPitcherVsBatterRows(batters, games), [batters, games]);
  const matchupHeat = useMemo(() => buildMatchupHeatRanges(matchupRows), [matchupRows]);
  const batterLookup = useMemo(() => new Map(batters.map((row) => [`${row.player}|${row.team}|${row.opponent}`, row])), [batters]);

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
  const hasData = games.length > 0 || pitchers.length > 0 || batters.length > 0;

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
      <main className="site-page bg-[#edf2f7] pb-16 pt-4 text-slate-900">
        <div className="site-container">
          {!hasData ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              {EMPTY_MESSAGE}
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">Park Factors</div>
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

              <section className="space-y-5">
                <div className="rounded-[30px] bg-[#0f2748] px-5 py-5 text-white shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">MLB HR Prop Dashboard</div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100">
                        Starting pitcher vulnerability, park environment, and batter power/contact angles for today&apos;s slate.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">{slateSummary.hitterCount} hitters</span>
                      <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-sm font-semibold text-emerald-100">Live Slate</span>
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
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">Strongest Parks</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.strongestParks}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">Top Arm</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.topArm}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">Top Bat</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{slateSummary.topBat}</div>
                    </div>
                  </div>
                  {bestBets?.slatePreview ? (
                    <div className="mt-3 border-t border-sky-200 pt-3 text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">Slate note:</span> {bestBets.slatePreview.slateOverview}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4">
                    <div className="flex gap-6 overflow-x-auto">
                      {[
                        { key: "pitchers", label: "Pitchers" },
                        { key: "batters", label: "Batters" },
                        { key: "matchups", label: "Pitchers vs Batters" },
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
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Pitcher Table</h2>
                            <p className="mt-1 text-sm text-slate-500">Sorted by highest HR VS by default. Higher HR VS and Hits VS indicate more damage vulnerability.</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={pitcherSearch}
                              onChange={(event) => setPitcherSearch(event.target.value)}
                              placeholder="Search pitcher or park"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <FilterSelect value={pitcherGameFilter} onChange={setPitcherGameFilter} options={gameOptions} label="Game" />
                          </div>
                        </div>
                        <DataLegend />
                        <div className="overflow-x-auto">
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
                                  <th key={key} className="border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">
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
                                  <td className="border-b border-slate-100 px-3 py-2 min-w-[180px]">
                                    <div className="font-medium text-slate-900">{pitcher.pitcher}</div>
                                    <div className="mt-1 text-xs text-slate-500">{pitcher.ballpark}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <TeamLogoBadge team={pitcher.team} size={20} showLabel={false} />
                                      <span>{pitcher.team}</span>
                                      <span className="text-slate-400">vs</span>
                                      <TeamLogoBadge team={pitcher.opponent} size={20} showLabel={false} />
                                      <span>{pitcher.opponent}</span>
                                    </div>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2">
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(pitcher.parkFactor))}>
                                      {pitcher.parkFactor.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.xera, pitcherHeat.xera)}>{formatNumber(pitcher.xera, 2)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.hardHitRate, pitcherHeat.hardHitRate)}>{formatPercent(pitcher.hardHitRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.barrelRate, pitcherHeat.barrelRate)}>{formatPercent(pitcher.barrelRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.kRate, pitcherHeat.kRate)}>{formatPercent(pitcher.kRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.bbRate, pitcherHeat.bbRate)}>{formatPercent(pitcher.bbRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.whiffRate, pitcherHeat.whiffRate)}>{formatPercent(pitcher.whiffRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.hrVs, pitcherHeat.hrVs)}><ScorePill value={pitcher.hrVs} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.hitsVs, pitcherHeat.hitsVs)}><ScorePill value={pitcher.hitsVs} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.kVs, pitcherHeat.kVs)}><ScorePill value={pitcher.kVs} /></td>
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
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Batter Table</h2>
                            <p className="mt-1 text-sm text-slate-500">Sorted by highest HR Score by default. Angle tags only show when supported by the computed matchup logic.</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={batterSearch}
                              onChange={(event) => setBatterSearch(event.target.value)}
                              placeholder="Search batter, pitcher, or team"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <FilterSelect value={batterGameFilter} onChange={setBatterGameFilter} options={gameOptions} label="Game" />
                          </div>
                        </div>
                        <DataLegend />
                        <div className="overflow-x-auto">
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
                                  <th key={key} className="border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">
                                    <button type="button" onClick={() => handleBatterSort(key as BatterSortKey)} className="transition hover:text-slate-900">
                                      {label}{makeSortIndicator(batterSortKey === key, batterSortDirection)}
                                    </button>
                                  </th>
                                ))}
                                <th className="border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">Angle</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredBatters.length ? filteredBatters.map((row) => (
                                <tr key={`${row.player}-${row.team}-${row.opponent}`} className="odd:bg-white even:bg-slate-50/60">
                                  <td className="border-b border-slate-100 px-3 py-2">{row.hrScoreRank}</td>
                                  <td className="border-b border-slate-100 px-3 py-2 min-w-[180px]">
                                    <div className="font-medium text-slate-900">{row.player}</div>
                                    <div className="mt-1 text-xs text-slate-500">{row.ballpark}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2"><TeamLogoBadge team={row.team} size={20} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2 min-w-[150px]">
                                    <div>{row.opposingPitcher}</div>
                                    <div className="mt-1 text-xs text-slate-500">{row.opponent} • {row.pitcherHand}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2">
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>
                                      {row.parkFactor.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.kRate, batterHeat.kRate)}>{formatPercent(row.kRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.bbRate, batterHeat.bbRate)}>{formatPercent(row.bbRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.barrelRate, batterHeat.barrelRate)}>{formatPercent(row.barrelRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.hardHitRate, batterHeat.hardHitRate)}>{formatPercent(row.hardHitRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.xba, batterHeat.xba)}>{formatDecimal(row.xba, 3)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.whiffRate, batterHeat.whiffRate)}>{formatPercent(row.whiffRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.last7HR, batterHeat.last7HR)}>{formatNumber(row.last7HR, 0)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.last30HR, batterHeat.last30HR)}>{formatNumber(row.last30HR, 0)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.opposingPitcherHrVs, batterHeat.opposingPitcherHrVs)}><ScorePill value={row.opposingPitcherHrVs} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.hrScore, batterHeat.hrScore)}><ScorePill value={row.hrScore} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2">
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
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Pitchers vs Batters</h2>
                            <p className="mt-1 text-sm text-slate-500">Combined Score = Batter HR Score + Pitcher HR VS. Score Diff = Batter HR Score minus Pitcher HR VS.</p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={matchupSearch}
                              onChange={(event) => setMatchupSearch(event.target.value)}
                              placeholder="Search batter, pitcher, or park"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                            <FilterSelect value={matchupGameFilter} onChange={setMatchupGameFilter} options={gameOptions} label="Game" />
                          </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
                          {topMatchupCards.length ? topMatchupCards.map((row) => (
                            <article key={`${row.rank}-${row.player}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
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
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Batter HR</div>
                                  <div className="mt-1 font-semibold text-slate-900">{row.hrScore.toFixed(1)}</div>
                                </div>
                                <div>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Pitcher HR VS</div>
                                  <div className="mt-1 font-semibold text-slate-900">{row.opposingPitcherHrVs.toFixed(1)}</div>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {row.angleTags.length ? row.angleTags.map((tag) => (
                                  <span key={`${row.player}-${tag}`} className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>
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
                        <div className="overflow-x-auto">
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
                                  <th key={key} className="border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">
                                    <button type="button" onClick={() => handleMatchupSort(key as MatchupSortKey)} className="transition hover:text-slate-900">
                                      {label}{makeSortIndicator(matchupSortKey === key, matchupSortDirection)}
                                    </button>
                                  </th>
                                ))}
                                <th className="border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">Angle</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredMatchups.length ? filteredMatchups.map((row) => (
                                <tr key={`${row.rank}-${row.player}-${row.opposingPitcher}`} className="odd:bg-white even:bg-slate-50/60">
                                  <td className="border-b border-slate-100 px-3 py-2">{row.rank}</td>
                                  <td className="border-b border-slate-100 px-3 py-2 min-w-[180px]">
                                    <div className="font-medium text-slate-900">{row.player}</div>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2"><TeamLogoBadge team={row.team} size={20} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2 min-w-[150px]">{row.opposingPitcher}</td>
                                  <td className="border-b border-slate-100 px-3 py-2">
                                    <div className="font-medium text-slate-900">{row.park}</div>
                                    <div className="mt-1">
                                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>{row.parkFactor.toFixed(2)}</span>
                                    </div>
                                  </td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.hrScore, matchupHeat.hrScore)}><ScorePill value={row.hrScore} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.opposingPitcherHrVs, matchupHeat.opposingPitcherHrVs)}><ScorePill value={row.opposingPitcherHrVs} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.combinedScore, matchupHeat.combinedScore)}><ScorePill value={row.combinedScore} /></td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.scoreDiff, matchupHeat.scoreDiff)}>{row.scoreDiff.toFixed(1)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.barrelRate, matchupHeat.barrelRate)}>{formatPercent(row.barrelRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.hardHitRate, matchupHeat.hardHitRate)}>{formatPercent(row.hardHitRate)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.xba, matchupHeat.xba)}>{formatDecimal(row.xba, 3)}</td>
                                  <td className="border-b border-slate-100 px-3 py-2">
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

                {bestBets && (bestBets.slatePreview || bestBets.bestBets.length > 0) ? (
                  <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                      {bestBets.slatePreview ? (
                        <>
                          <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">Slate Overview</div>
                            <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets.slatePreview.slateOverview}</p>
                          </article>
                          <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">Model Note</div>
                            <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets.slatePreview.modelNote}</p>
                          </article>
                        </>
                      ) : null}
                    </div>

                    {bestBets.bestBets.length > 0 ? (
                      <aside className="space-y-4">
                        <div className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Top HR Props Today</div>
                        {bestBets.bestBets.slice(0, 3).map((pick) => (
                          <PickCard key={`${pick.player}-${pick.team}`} pick={pick} row={batterLookup.get(`${pick.player}|${pick.team}|${pick.opponent}`)} />
                        ))}
                      </aside>
                    ) : null}
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
