import { useEffect, useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import SiteShell from "@/components/layout/SiteShell";
import SportsbookBar from "@/components/SportsbookBar";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { cn } from "@/lib/utils";

type HrPropRow = {
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  pitcherHand: string;
  ballpark: string;
  parkFactor: number;
  barrelRate: number;
  hardHitRate: number;
  exitVelo: number;
  iso: number;
  hrFBRatio: number;
  pullRate: number;
  last7HR: number;
  last30HR: number;
  hrScore: number;
  hrScoreRank: number;
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

type SortKey =
  | "hrScoreRank"
  | "player"
  | "team"
  | "opponent"
  | "opposingPitcher"
  | "parkFactor"
  | "barrelRate"
  | "hardHitRate"
  | "exitVelo"
  | "iso"
  | "last7HR"
  | "last30HR"
  | "hrScore";

type SortDirection = "asc" | "desc";

type HeatStatKey =
  | "parkFactor"
  | "barrelRate"
  | "hardHitRate"
  | "exitVelo"
  | "iso"
  | "last7HR"
  | "last30HR"
  | "hrScore";

type StatRange = {
  low: number;
  high: number;
};

type ParkFactorCardRow = {
  key: string;
  ballpark: string;
  matchup: string;
  parkFactor: number;
};

const EMPTY_MESSAGE = "Today's HR prop model generates daily at 10 AM ET. Check back after lineups are posted.";
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

export function normalizeHrPropRows(value: unknown): HrPropRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;

      const row = {
        player: normalizeText(entry.player),
        team: normalizeTeamValue(entry.team),
        opponent: normalizeTeamValue(entry.opponent),
        opposingPitcher: normalizeText(entry.opposingPitcher) || "TBD",
        pitcherHand: normalizeText(entry.pitcherHand) || "R",
        ballpark: normalizeText(entry.ballpark) || "Unknown Venue",
        parkFactor: normalizeNumber(entry.parkFactor),
        barrelRate: normalizeNumber(entry.barrelRate),
        hardHitRate: normalizeNumber(entry.hardHitRate),
        exitVelo: normalizeNumber(entry.exitVelo),
        iso: normalizeNumber(entry.iso),
        hrFBRatio: normalizeNumber(entry.hrFBRatio),
        pullRate: normalizeNumber(entry.pullRate),
        last7HR: normalizeNumber(entry.last7HR),
        last30HR: normalizeNumber(entry.last30HR),
        hrScore: normalizeNumber(entry.hrScore),
        hrScoreRank: normalizeNumber(entry.hrScoreRank),
      };

      if (!row.player || !row.team || !row.opponent) return null;
      if (Object.values(row).some((field) => field === null)) return null;
      return row as HrPropRow;
    })
    .filter((entry): entry is HrPropRow => Boolean(entry));
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

export function buildHeatStatRanges(rows: HrPropRow[]) {
  const statKeys: HeatStatKey[] = ["parkFactor", "barrelRate", "hardHitRate", "exitVelo", "iso", "last7HR", "last30HR", "hrScore"];
  return Object.fromEntries(
    statKeys.map((key) => {
      const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value));
      const low = quantile(values, 0.1);
      const high = quantile(values, 0.9);
      return [key, {
        low: low ?? 0,
        high: high ?? 0,
      } satisfies StatRange];
    }),
  ) as Record<HeatStatKey, StatRange>;
}

export function getHeatCellStyle(value: number, range: StatRange) {
  if (!Number.isFinite(value) || !Number.isFinite(range.low) || !Number.isFinite(range.high) || range.high <= range.low) {
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

export function getTopParkFactorRows(rows: HrPropRow[], limit = 5): ParkFactorCardRow[] {
  const deduped = new Map<string, ParkFactorCardRow>();

  for (const row of rows) {
    const matchup = [row.team, row.opponent].sort().join(" vs ");
    const key = `${row.ballpark}|${matchup}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        key,
        ballpark: row.ballpark,
        matchup,
        parkFactor: row.parkFactor,
      });
    }
  }

  return [...deduped.values()]
    .sort((left, right) => right.parkFactor - left.parkFactor || left.ballpark.localeCompare(right.ballpark))
    .slice(0, limit);
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

function getParkFactorTone(value: number) {
  if (value > 1.1) return "border-green-200 bg-green-50 text-green-800";
  if (value < 0.9) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function getHrScoreTone(index: number, total: number) {
  if (!total) return "bg-slate-100 text-slate-700";
  const percentile = index / total;
  if (percentile < 0.25) return "bg-green-100 text-green-800";
  if (percentile < 0.75) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

function sortRows(rows: HrPropRow[], sortKey: SortKey, direction: SortDirection) {
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

function getEspnTeamLogo(team?: string) {
  const safeTeam = normalizeTeamValue(team) || "TBD";
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${ESPN_TEAM_ABBR[safeTeam] ?? safeTeam.toLowerCase()}.png`;
}

function TeamLogoBadge({
  team,
  size = 28,
  showLabel = true,
}: {
  team?: string;
  size?: number;
  showLabel?: boolean;
}) {
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
    <span className="inline-flex items-center gap-1">
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

function PickCard({
  pick,
  row,
  tier,
}: {
  pick: HrPropPick;
  row?: HrPropRow;
  tier: "Best Bet" | "Value Play" | "Longshot";
}) {
  const parkFactor = row?.parkFactor ?? 1;
  const tierClass =
    tier === "Best Bet"
      ? "bg-green-100 text-green-800"
      : tier === "Value Play"
        ? "bg-amber-100 text-amber-800"
        : "bg-purple-100 text-purple-800";
  const tierBorderClass =
    tier === "Best Bet"
      ? "border-l-4 border-l-green-600"
      : tier === "Value Play"
        ? "border-l-4 border-l-amber-400"
        : "border-l-4 border-l-purple-400";

  return (
    <article className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", tierBorderClass)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold leading-tight text-gray-900">{pick.player}</div>
          <div className="mb-3 mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <TeamLogoBadge team={pick.team} />
            <span>vs</span>
            <TeamLogoBadge team={pick.opponent} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", getParkFactorTone(parkFactor))}>
            Park {parkFactor.toFixed(2)}
          </span>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tierClass)}>{tier}</span>
        </div>
      </div>

      {/* TODO: map ESPN player IDs so player headshots can be added here. */}

      <div className="mb-2 text-sm text-gray-500">
        ⚾ {pick.opposingPitcher}{row?.pitcherHand ? ` (${row.pitcherHand})` : ""}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {pick.topStats?.map((stat) => (
          <span key={`${pick.player}-${stat}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {stat}
          </span>
        ))}
      </div>

      <ul className="mb-3 space-y-1 text-sm text-gray-700">
        {pick.bullets?.map((bullet) => (
          <li key={`${pick.player}-${bullet}`} className="flex gap-2">
            <span className="text-green-600">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tierClass)}>{tier}</span>
        <span className="text-right text-xs text-gray-400">{row?.ballpark ?? "Ballpark TBD"}</span>
      </div>
    </article>
  );
}

export default function MlbHrProps() {
  const [rawRows, setRawRows] = useState<HrPropRow[]>([]);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("hrScoreRank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [search, setSearch] = useState("");

  usePageSeo({
    title: "MLB HR Prop Best Bets Today — Joe Knows Ball",
    description: "Daily MLB home run prop picks ranked by barrel rate, exit velocity, park factors, and pitcher matchup data. Updated every morning after lineups post.",
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
          setRawRows([]);
          setBestBets(null);
          return;
        }
        const [rawPayload, bestPayload] = await Promise.all([rawResponse.json(), bestResponse.json()]);
        if (!active) return;
        setRawRows(normalizeHrPropRows(rawPayload));
        setBestBets(normalizeHrBestBetsPayload(bestPayload));
      })
      .catch(() => {
        if (!active) return;
        setRawRows([]);
        setBestBets(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const rows = normalizedSearch
      ? rawRows.filter((row) => row.player.toLowerCase().includes(normalizedSearch))
      : rawRows;
    return sortRows(rows, sortKey, sortDirection);
  }, [rawRows, search, sortKey, sortDirection]);

  const hasTopPicks = Boolean(bestBets && (
    bestBets.bestBets.length > 0 || bestBets.valueBets.length > 0 || bestBets.longshots.length > 0
  ));
  const hasRankings = rawRows.length > 0;
  const rawRowLookup = useMemo(
    () => new Map(rawRows.map((row) => [`${row.player}|${row.team}|${row.opponent}`, row])),
    [rawRows],
  );
  const heatRanges = useMemo(() => buildHeatStatRanges(rawRows), [rawRows]);
  const topParkFactors = useMemo(() => getTopParkFactorRows(rawRows), [rawRows]);

  const handleSort = (key: SortKey) => {
    setSortDirection((current) => (sortKey === key ? (current === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  return (
    <SiteShell>
      <main className="site-page bg-[#eef3f8] pb-16 pt-4 text-slate-900">
        <div className="site-container space-y-6">
          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <SportsbookBar />
          </div>

          <section className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-4xl">Today&apos;s MLB HR Prop Model</h1>
            <div className="text-sm text-slate-500">{formatDateLabel(bestBets?.date)}</div>
          </section>

          {!hasTopPicks && !hasRankings ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              {EMPTY_MESSAGE}
            </div>
          ) : (
            <>
              {hasTopPicks ? (
                <>
                  <section className="grid gap-4 md:grid-cols-2">
                    <article className="rounded-2xl border border-slate-200 border-l-4 border-l-sky-800 bg-white p-5 shadow-sm">
                      <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">Slate Overview</div>
                      <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets?.slatePreview?.slateOverview}</p>
                    </article>
                    <article className="rounded-2xl border border-slate-200 border-l-4 border-l-sky-800 bg-white p-5 shadow-sm">
                      <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">Model Note</div>
                      <p className="mt-3 text-sm leading-7 text-slate-700">{bestBets?.slatePreview?.modelNote}</p>
                    </article>
                  </section>

                  <section className="space-y-4">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Top HR Props Today</h2>
                      <p className="mt-2 text-sm text-slate-500">Highest model score plays for today&apos;s slate.</p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                      {bestBets?.bestBets.map((pick) => (
                        <PickCard
                          key={`best-${pick.player}`}
                          pick={pick}
                          row={rawRowLookup.get(`${pick.player}|${pick.team}|${pick.opponent}`)}
                          tier="Best Bet"
                        />
                      ))}
                      {bestBets?.valueBets.map((pick) => (
                        <PickCard
                          key={`value-${pick.player}`}
                          pick={pick}
                          row={rawRowLookup.get(`${pick.player}|${pick.team}|${pick.opponent}`)}
                          tier="Value Play"
                        />
                      ))}
                      {bestBets?.longshots.map((pick) => (
                        <PickCard
                          key={`long-${pick.player}`}
                          pick={pick}
                          row={rawRowLookup.get(`${pick.player}|${pick.team}|${pick.opponent}`)}
                          tier="Longshot"
                        />
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              {hasRankings ? (
                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  {!hasTopPicks ? (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      HR prop picks are temporarily unavailable, but the underlying model rankings are still online.
                    </div>
                  ) : null}

                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Full Rankings Table</h2>
                      <p className="mt-1 text-sm text-slate-500">All batters ranked by today&apos;s HR model.</p>
                    </div>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search player"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          {[
                            ["hrScoreRank", "Rank"],
                            ["player", "Player"],
                            ["team", "Team"],
                            ["opponent", "Opp"],
                            ["opposingPitcher", "Pitcher"],
                            ["parkFactor", "Park Factor"],
                            ["barrelRate", "Barrel%"],
                            ["hardHitRate", "Hard Hit%"],
                            ["exitVelo", "Exit Velo"],
                            ["iso", "ISO"],
                            ["last7HR", "Last 7 HR"],
                            ["last30HR", "Last 30 HR"],
                            ["hrScore", "HR Score"],
                          ].map(([key, label]) => (
                            <th key={key} className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
                              <button type="button" onClick={() => handleSort(key as SortKey)} className="transition hover:text-slate-900">
                                {label}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, index) => (
                          <tr key={`${row.player}-${row.team}-${row.opponent}`} className="odd:bg-white even:bg-slate-50/50">
                            <td className="border-b border-slate-100 px-3 py-2">{row.hrScoreRank}</td>
                            <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-900">{row.player}</td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center">
                                    <TeamLogoBadge team={row.team} size={20} showLabel={false} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{row.team}</TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2">{row.opponent}</td>
                            <td className="border-b border-slate-100 px-3 py-2">{row.opposingPitcher}</td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.parkFactor, heatRanges.parkFactor)}>
                              <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>
                                {row.parkFactor.toFixed(2)}
                              </span>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.barrelRate, heatRanges.barrelRate)}>{row.barrelRate.toFixed(1)}</td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.hardHitRate, heatRanges.hardHitRate)}>{row.hardHitRate.toFixed(1)}</td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.exitVelo, heatRanges.exitVelo)}>{row.exitVelo.toFixed(1)}</td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.iso, heatRanges.iso)}>{row.iso.toFixed(3)}</td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.last7HR, heatRanges.last7HR)}>{row.last7HR}</td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.last30HR, heatRanges.last30HR)}>{row.last30HR}</td>
                            <td className="border-b border-slate-100 px-3 py-2" style={getHeatCellStyle(row.hrScore, heatRanges.hrScore)}>
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getHrScoreTone(index, filteredRows.length))}>
                                {row.hrScore.toFixed(1)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>

                  <aside className="space-y-4">
                    <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">Top Park Factors</div>
                      <div className="mt-3 space-y-3">
                        {topParkFactors.map((park, index) => (
                          <div key={park.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{park.ballpark}</div>
                                <div className="mt-1 text-xs text-slate-500">{park.matchup}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-semibold text-slate-400">#{index + 1}</div>
                                <div className="mt-1 text-sm font-semibold text-slate-900">{park.parkFactor.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </aside>
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
    </SiteShell>
  );
}
