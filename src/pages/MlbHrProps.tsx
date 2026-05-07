import { useEffect, useMemo, useState } from "react";
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

const EMPTY_MESSAGE = "Today's HR prop model generates daily at 10 AM ET. Check back after lineups are posted.";

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

function PickCard({
  pick,
  tier,
}: {
  pick: HrPropPick;
  tier: "Best Bet" | "Value Play" | "Longshot";
}) {
  const colors = getMlbTeamColors(pick.team);
  const tierClass =
    tier === "Best Bet"
      ? "bg-green-100 text-green-800"
      : tier === "Value Play"
        ? "bg-amber-100 text-amber-800"
        : "bg-purple-100 text-purple-800";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold tracking-[-0.03em] text-slate-900">{pick.player}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: colors.primary }}>
              {pick.team}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              vs {pick.opponent}
            </span>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tierClass)}>{tier}</span>
      </div>

      <div className="mt-3 text-sm text-slate-500">
        {pick.opposingPitcher}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {pick.topStats?.map((stat) => (
          <span key={`${pick.player}-${stat}`} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
            {stat}
          </span>
        ))}
      </div>

      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {pick.bullets?.map((bullet) => (
          <li key={`${pick.player}-${bullet}`} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-700" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
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
        setRawRows(Array.isArray(rawPayload) ? rawPayload : []);
        setBestBets(bestPayload as HrBestBetsPayload);
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

  const hasContent = rawRows.length > 0 && bestBets && (
    bestBets.bestBets.length > 0 || bestBets.valueBets.length > 0 || bestBets.longshots.length > 0
  );

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

          {!hasContent ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              {EMPTY_MESSAGE}
            </div>
          ) : (
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
                  {bestBets?.bestBets.map((pick) => <PickCard key={`best-${pick.player}`} pick={pick} tier="Best Bet" />)}
                  {bestBets?.valueBets.map((pick) => <PickCard key={`value-${pick.player}`} pick={pick} tier="Value Play" />)}
                  {bestBets?.longshots.map((pick) => <PickCard key={`long-${pick.player}`} pick={pick} tier="Longshot" />)}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
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
                          <td className="border-b border-slate-100 px-3 py-2">{row.team}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.opponent}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.opposingPitcher}</td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", getParkFactorTone(row.parkFactor))}>
                              {row.parkFactor.toFixed(2)}
                            </span>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.barrelRate.toFixed(1)}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.hardHitRate.toFixed(1)}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.exitVelo.toFixed(1)}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.iso.toFixed(3)}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.last7HR}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{row.last30HR}</td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", getHrScoreTone(index, filteredRows.length))}>
                              {row.hrScore.toFixed(1)}
                            </span>
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
