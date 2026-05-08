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

type BatterSortKey =
  | "hrScoreRank"
  | "player"
  | "team"
  | "opposingPitcher"
  | "barrelRate"
  | "hardHitRate"
  | "xba"
  | "kRate"
  | "bbRate"
  | "whiffRate"
  | "last7HR"
  | "last30HR"
  | "opposingPitcherHrVs"
  | "hrScore";

type SortDirection = "asc" | "desc";

type HeatRange = { low: number; high: number };

export const DEFAULT_BATTER_SORT = {
  key: "hrScore" as BatterSortKey,
  direction: "desc" as SortDirection,
};

const EMPTY_MESSAGE = "Today's matchup dashboard generates daily at 10 AM ET. Check back after lineups are posted.";
const DASH = "—";
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
    windDirection: normalizeText(entry.windDirection) || "—",
    conditions: normalizeText(entry.conditions) || "—",
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
  return Number.isFinite(value) ? `${Number(value).toFixed(digits)}%` : "—";
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function formatDecimal(value: number | null | undefined, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function getEspnTeamLogo(team?: string) {
  const safeTeam = normalizeTeamValue(team) || "TBD";
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${ESPN_TEAM_ABBR[safeTeam] ?? safeTeam.toLowerCase()}.png`;
}

function TeamLogoBadge({ team, size = 26, showLabel = true }: { team?: string; size?: number; showLabel?: boolean }) {
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
      {showLabel ? <span className="text-sm font-medium text-slate-500">{safeTeam}</span> : null}
    </span>
  );
}

function ScorePill({ value }: { value: number | null | undefined }) {
  if (!Number.isFinite(value)) return <span className="text-slate-400">—</span>;
  const tone = value >= 70 ? "bg-red-100 text-red-800" : value >= 55 ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800";
  return <span className={cn("inline-flex min-w-[3.75rem] items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", tone)}>{Number(value).toFixed(1)}</span>;
}

function PickCard({ pick, row, tier }: { pick: HrPropPick; row?: HrDashboardBatter; tier: "Best Bet" | "Value Play" | "Longshot" }) {
  const tierClass =
    tier === "Best Bet"
      ? "bg-red-100 text-red-800"
      : tier === "Value Play"
        ? "bg-amber-100 text-amber-800"
        : "bg-sky-100 text-sky-800";

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
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tierClass)}>{tier}</span>
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

function getRoofLabel(roofType: string) {
  if (/open/i.test(roofType)) return "Open";
  if (/retractable/i.test(roofType)) return "Retractable Roof";
  if (/dome|closed/i.test(roofType)) return "Roof Park";
  return roofType || "Unknown";
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

export default function MlbHrProps() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [sortKey, setSortKey] = useState<BatterSortKey>(DEFAULT_BATTER_SORT.key);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_BATTER_SORT.direction);
  const [search, setSearch] = useState("");

  usePageSeo({
    title: "MLB Matchup Dashboard Today - Joe Knows Ball",
    description: "Daily MLB batter-versus-pitcher matchup dashboard with starter vulnerability ratings, stadium weather context, and batter HR angles. Updated every morning after lineups post.",
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

  const pitchers = dashboard?.pitchers ?? [];
  const batters = dashboard?.batters ?? [];
  const games = dashboard?.games ?? [];
  const pitcherHeat = useMemo(() => buildPitcherHeatRanges(pitchers), [pitchers]);
  const batterHeat = useMemo(() => buildHeatStatRanges(batters), [batters]);
  const batterLookup = useMemo(
    () => new Map(batters.map((row) => [`${row.player}|${row.team}|${row.opponent}`, row])),
    [batters],
  );

  const filteredBatters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const rows = normalizedSearch
      ? batters.filter((row) => row.player.toLowerCase().includes(normalizedSearch) || row.team.toLowerCase().includes(normalizedSearch))
      : batters;
    return sortBatters(rows, sortKey, sortDirection);
  }, [batters, search, sortDirection, sortKey]);

  const sortedPitchers = useMemo(
    () => [...pitchers].sort((left, right) => right.hrVs - left.hrVs || right.hitsVs - left.hitsVs),
    [pitchers],
  );

  const hasData = games.length > 0 || pitchers.length > 0 || batters.length > 0;
  const hasTopPicks = Boolean(bestBets && (bestBets.bestBets.length || bestBets.valueBets.length || bestBets.longshots.length));

  const handleSort = (key: BatterSortKey) => {
    setSortDirection((current) => (sortKey === key ? (current === "asc" ? "desc" : "asc") : key === "player" || key === "team" || key === "opposingPitcher" ? "asc" : "desc"));
    setSortKey(key);
  };

  const getSortIndicator = (key: BatterSortKey) => {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  return (
    <SiteShell>
      <main className="site-page bg-[#eef3f8] pb-16 pt-4 text-slate-900">
        <div className="site-container space-y-6">
          <section className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-4xl">MLB Matchup Dashboard</h1>
            <p className="max-w-4xl text-sm leading-6 text-slate-600">
              Starting pitcher vulnerability, slate environment, and batter power/contact angles for today&apos;s board.
            </p>
            <div className="text-sm text-slate-500">{formatDateLabel(dashboard?.date || bestBets?.date)}</div>
          </section>

          {!hasData ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              {EMPTY_MESSAGE}
            </div>
          ) : (
            <>
              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Starting Pitchers Today</h2>
                    <p className="mt-1 text-sm text-slate-500">HR VS and Hits VS: higher means more pitcher vulnerability. K VS: higher means stronger strikeout outlook.</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        {["Pitcher", "Matchup", "xERA", "Hard Hit%", "Fly Ball%", "Barrel%", "K%", "BB%", "Whiff%", "HR VS", "Hits VS", "K VS"].map((label) => (
                          <th key={label} className="border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPitchers.map((pitcher) => (
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
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.xera, pitcherHeat.xera)}>{formatNumber(pitcher.xera, 2)}</td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.hardHitRate, pitcherHeat.hardHitRate)}>{formatPercent(pitcher.hardHitRate)}</td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.flyBallRate, pitcherHeat.flyBallRate)}>{formatPercent(pitcher.flyBallRate)}</td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.barrelRate, pitcherHeat.barrelRate)}>{formatPercent(pitcher.barrelRate)}</td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.kRate, pitcherHeat.kRate)}>{formatPercent(pitcher.kRate)}</td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.bbRate, pitcherHeat.bbRate)}>{formatPercent(pitcher.bbRate)}</td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.whiffRate, pitcherHeat.whiffRate)}>{formatPercent(pitcher.whiffRate)}</td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.hrVs, pitcherHeat.hrVs)}><ScorePill value={pitcher.hrVs} /></td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.hitsVs, pitcherHeat.hitsVs)}><ScorePill value={pitcher.hitsVs} /></td>
                          <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(pitcher.kVs, pitcherHeat.kVs)}><ScorePill value={pitcher.kVs} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <SportsbookBar />
              </div>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Stadium and Weather Context</h2>
                    <p className="mt-1 text-sm text-slate-500">PropFinder stadium weather joined to today&apos;s slate by matchup, with park factor from the site&apos;s existing model baseline.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {games.map((game) => (
                      <article key={game.gameKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{game.matchup}</div>
                            <div className="mt-1 text-xs text-slate-500">{game.stadium}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">{getRoofLabel(game.roofType)}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">Park {game.parkFactor.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Temp</div>
                            <div className="mt-1 font-semibold">{game.temperature != null ? `${game.temperature.toFixed(0)}°` : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Precip</div>
                            <div className="mt-1 font-semibold">{game.precipitation != null ? `${game.precipitation.toFixed(0)}%` : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Wind</div>
                            <div className="mt-1 font-semibold">{game.windSpeed != null ? `${game.windSpeed.toFixed(0)} MPH` : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Direction</div>
                            <div className="mt-1 font-semibold">{game.windDirection || "—"}</div>
                          </div>
                        </div>
                        <div className="mt-4 text-sm text-slate-600">{game.conditions}</div>
                      </article>
                    ))}
                  </div>
                </div>
                <aside className="space-y-4" />
              </section>

              {(bestBets?.slatePreview || hasTopPicks) ? (
                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-4">
                    {bestBets?.slatePreview ? (
                      <>
                        <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">Slate Overview</div>
                          <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets.slatePreview.slateOverview}</p>
                        </article>
                        <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">Model Note</div>
                          <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets.slatePreview.modelNote}</p>
                        </article>
                      </>
                    ) : null}
                  </div>

                  {hasTopPicks ? (
                    <aside className="space-y-4">
                      <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">Top HR Props Today</div>
                        <div className="mt-3 space-y-3">
                          {bestBets?.bestBets.slice(0, 3).map((pick) => (
                            <PickCard
                              key={`best-${pick.player}`}
                              pick={pick}
                              row={batterLookup.get(`${pick.player}|${pick.team}|${pick.opponent}`)}
                              tier="Best Bet"
                            />
                          ))}
                        </div>
                      </article>
                    </aside>
                  ) : null}
                </section>
              ) : null}

              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Batter Analysis</h2>
                    <p className="mt-1 text-sm text-slate-500">Default sort is highest HR Score. Higher Pitcher HR VS means the opposing arm is more homer-prone.</p>
                  </div>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search batter or team"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        {[
                          ["hrScoreRank", "Rank"],
                          ["player", "Batter"],
                          ["team", "Team"],
                          ["opposingPitcher", "Opp Pitcher"],
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
                          ["player", "Angles"],
                        ].map(([key, label], index) => (
                          <th key={`${key}-${label}-${index}`} className="border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">
                            {key === "player" && label === "Angles" ? label : (
                              <button type="button" onClick={() => handleSort(key as BatterSortKey)} className="transition hover:text-slate-900">
                                {label}{getSortIndicator(key as BatterSortKey)}
                              </button>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatters.map((row) => (
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
                                <span key={`${row.player}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{tag}</span>
                              )) : <span className="text-slate-400">—</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </SiteShell>
  );
}
