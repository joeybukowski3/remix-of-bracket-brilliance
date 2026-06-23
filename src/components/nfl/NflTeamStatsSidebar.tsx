import { useEffect, useState } from "react";
import type { NflGuideTeam } from "@/lib/nfl/guide2026";
import type { NflTeamStatRow, NflTeamStatsResponse } from "@/lib/nfl/teamStats";

type LoadStatus = "loading" | "success" | "error";

export default function NflTeamStatsSidebar({ team }: { team: NflGuideTeam }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<NflTeamStatsResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    setStatus("loading");

    fetch(`${base}/api/nfl/team-stats?team=${encodeURIComponent(team.abbr)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.offense) || !Array.isArray(payload?.defense)) {
          throw new Error(payload?.error ?? "2025 team statistics are unavailable.");
        }
        return payload as NflTeamStatsResponse;
      })
      .then((payload) => {
        setData(payload);
        setStatus("success");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [team.abbr]);

  return (
    <aside className="xl:sticky xl:top-24 xl:self-start" aria-label={`${team.team} 2025 statistics`}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Last season</div>
          <h2 className="mt-1 text-xl font-black">2025 team statistics</h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">Per-game values and NFL ranks from ESPN.</p>
        </div>

        {status === "loading" && <StatsLoading />}
        {status === "error" && (
          <div className="p-5 text-sm leading-6 text-slate-500">
            The 2025 statistics feed is unavailable right now. The power-rating and schedule data remain available.
          </div>
        )}
        {status === "success" && data && (
          <div>
            {data.stale && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[10px] font-bold text-amber-800">Showing the most recent cached response.</div>}
            <StatsGroup title="Offensive statistics" rows={data.offense} />
            <StatsGroup title="Defensive statistics" rows={data.defense} />
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] leading-4 text-slate-400">
              Rank 1 is best. Statistics are isolated from the projection model and do not overwrite model inputs.
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function StatsGroup({ title, rows }: { title: string; rows: NflTeamStatRow[] }) {
  return (
    <section className="border-b border-slate-100 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_58px_42px] items-center gap-2 bg-slate-50 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-slate-500">
        <span>{title}</span>
        <span className="text-right">Value</span>
        <span className="text-right">Rank</span>
      </div>
      <div className="divide-y divide-slate-100 px-4">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_58px_42px] items-center gap-2 py-2.5 text-xs">
            <span className="min-w-0 font-bold leading-4 text-slate-700">{row.label}</span>
            <span className="text-right font-black tabular-nums text-slate-900">{row.displayValue}</span>
            <RankValue rank={row.rank} />
          </div>
        ))}
      </div>
    </section>
  );
}

function RankValue({ rank }: { rank: number | null }) {
  const className = rank == null
    ? "text-slate-400"
    : rank <= 10
      ? "text-emerald-700"
      : rank >= 24
        ? "text-red-600"
        : "text-slate-600";
  return <span className={`text-right font-black tabular-nums ${className}`}>{rank == null ? "—" : `#${rank}`}</span>;
}

function StatsLoading() {
  return (
    <div className="animate-pulse p-4">
      {Array.from({ length: 14 }, (_, index) => (
        <div key={index} className="grid grid-cols-[1fr_58px_42px] gap-2 border-b border-slate-100 py-2.5 last:border-0">
          <div className="h-3 rounded bg-slate-100" />
          <div className="h-3 rounded bg-slate-100" />
          <div className="h-3 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
