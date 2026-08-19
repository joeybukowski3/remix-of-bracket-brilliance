import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { NFL_POWER_RATINGS, nflLogoUrl, type NflPowerTeam } from "@/data/nflPreseason2026";
import { slugifyNflTeam } from "@/lib/nfl/guide2026";
import { calculateRankGap, getRankGapSignal, type SuperBowlMarketTeam } from "@/lib/nfl/superBowlMarkets";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";

type SuperBowlOddsResponse = {
  source: "polymarket";
  eventId: string;
  eventTitle: string;
  eventSlug: string | null;
  updatedAt: string;
  stale?: boolean;
  teams: SuperBowlMarketTeam[];
};

type PageStatus = "loading" | "success" | "error";
type OddsRow = NflPowerTeam & {
  probability: number | null;
  marketRank: number | null;
  /** Universal current 2026 league rank; null when the team is unresolved in the current-rating board. */
  universalRank: number | null;
  gap: number | null;
};

function TeamLogo({ team }: { team: NflPowerTeam }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="flex h-7 w-7 items-center justify-center rounded-full text-[8px] font-black text-white" style={{ background: team.color }}>{team.abbr.toUpperCase()}</span>;
  return <img src={nflLogoUrl(team.abbr)} alt="" className="h-7 w-7 object-contain" loading="lazy" onError={() => setFailed(true)} />;
}

function formatGap(gap: number | null) {
  return gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}`;
}

function gapTone(gap: number | null) {
  if (gap == null || Math.abs(gap) <= 1) return "text-slate-600";
  return gap > 0 ? "text-emerald-700" : "text-red-700";
}

function SummaryCard({ label, primary, secondary, tone = "neutral" }: { label: string; primary: string; secondary: string; tone?: "positive" | "negative" | "neutral" }) {
  const color = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-slate-600";
  return <div className="bg-white px-3 py-2.5"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-0.5 truncate text-base font-bold text-slate-900">{primary}</div><div className={`mt-0.5 truncate text-xs ${color}`}>{secondary}</div></div>;
}

export default function NFLSuperBowlOdds() {
  usePageSeo({
    title: "Super Bowl Odds & NFL Power Ranking Value | Joe Knows Ball",
    description: "Track live Super Bowl prediction-market prices and open any NFL team's full schedule, ratings, odds and offseason dashboard.",
    path: "/nfl/super-bowl",
    noindex: false,
  });

  const [status, setStatus] = useState<PageStatus>("loading");
  const [data, setData] = useState<SuperBowlOddsResponse | null>(null);
  const [error, setError] = useState("");
  // Universal current 2026 rank -- the only source for "Power rank" and the
  // rank-gap math below. Never the legacy nflPreseason2026 static rank
  // (still used here only for team identity/matching, see NFL_POWER_RATINGS
  // in the rows memo).
  const currentRating = useNflCurrentRating2026();

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/nfl/super-bowl-odds`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.teams)) throw new Error(payload?.error ?? "Live Super Bowl market prices are unavailable.");
        return payload as SuperBowlOddsResponse;
      })
      .then((payload) => { setData(payload); setStatus("success"); })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Live Super Bowl market prices are unavailable.");
        setStatus("error");
      });
    return () => controller.abort();
  }, []);

  const rows = useMemo<OddsRow[]>(() => {
    const markets = new Map(data?.teams.map((team) => [team.abbr.toLowerCase(), team]) ?? []);
    const universalRankByAbbr = new Map(
      (currentRating.data?.teams ?? []).map((team) => [team.abbr, team.rank])
    );
    return NFL_POWER_RATINGS.map((team) => {
      const market = markets.get(team.abbr.toLowerCase());
      const marketRank = market?.marketRank ?? null;
      const universalRank = universalRankByAbbr.get(team.abbr) ?? null;
      return {
        ...team,
        probability: market?.probability ?? null,
        marketRank,
        universalRank,
        gap: universalRank == null ? null : calculateRankGap(marketRank, universalRank),
      };
    }).sort((a, b) => {
      if (a.probability == null && b.probability == null) return a.team.localeCompare(b.team);
      if (a.probability == null) return 1;
      if (b.probability == null) return -1;
      return b.probability - a.probability || a.team.localeCompare(b.team);
    });
  }, [data, currentRating.data]);

  const favorite = rows.find((row) => row.marketRank === 1) ?? null;
  const bestValue = rows.filter((row) => row.gap != null && row.gap > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0] ?? null;
  const premium = rows.filter((row) => row.gap != null && row.gap < 0).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))[0] ?? null;
  const updatedAt = data?.updatedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.updatedAt)) : "—";

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Prediction Markets"
        title="Super Bowl Odds Tracker"
        description="Live Super Bowl market prices compared with the Joe Knows Ball power rankings. Select a team for its complete dashboard."
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 xl:grid-cols-4" aria-label="Super Bowl market summary" role="group">
        <SummaryCard label="Market favorite" primary={favorite?.team ?? "—"} secondary={favorite?.probability == null ? "No market price" : `${favorite.probability.toFixed(1)}%`} />
        <SummaryCard label="Best rank value" primary={bestValue?.team ?? "—"} secondary={bestValue ? `${formatGap(bestValue.gap)} spots` : "No positive gap"} tone="positive" />
        <SummaryCard label="Largest market premium" primary={premium?.team ?? "—"} secondary={premium ? `${formatGap(premium.gap)} spots` : "No negative gap"} tone="negative" />
        <SummaryCard label="Last updated" primary={updatedAt} secondary={data?.stale ? "Polymarket · cached response" : "Polymarket"} />
      </div>

      {status === "error" ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Live Super Bowl market prices are unavailable right now. {error}</section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {data?.stale && <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Showing the most recent cached market response.</div>}
          <NflTableScroller label="Super Bowl odds versus power rank">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className={NFL_TABLE_HEAD_ROW}><th scope="col" className="px-3 py-2">Odds rank</th><th scope="col" className="px-3 py-2 text-left">Team</th><th scope="col" className="px-3 py-2">Market probability</th><th scope="col" className="px-3 py-2">Power rank</th><th scope="col" className="px-3 py-2">Rank gap</th><th scope="col" className="px-3 py-2">Signal</th></tr></thead>
              <tbody>
                {status === "loading" ? Array.from({ length: 10 }, (_, index) => <tr key={index} className="animate-pulse border-t border-slate-100"><td className="p-3" colSpan={6}><div className="h-5 rounded bg-slate-100" /></td></tr>) : rows.map((row) => (
                  <tr key={row.abbr} className={NFL_TABLE_ROW}>
                    <td className="text-center font-semibold tabular-nums text-slate-900">{row.marketRank ?? "—"}</td>
                    <td className="p-0">
                      <Link to={`/nfl/guide/team/${slugifyNflTeam(row.team)}`} className="flex items-center gap-2.5 px-3 py-2 font-semibold text-slate-900 hover:text-sky-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500" aria-label={`Open ${row.team} team dashboard`}>
                        <span className="h-6 w-[3px] rounded-full" style={{ background: row.color }} aria-hidden />
                        <TeamLogo team={row} />
                        <span>{row.team}</span>
                      </Link>
                    </td>
                    <td className="text-center"><span className="font-semibold tabular-nums text-slate-900">{row.probability == null ? "—" : `${row.probability.toFixed(1)}%`}</span></td>
                    <td className="text-center tabular-nums text-slate-700">{row.universalRank ?? "—"}</td>
                    <td className={`text-center font-semibold tabular-nums ${gapTone(row.gap)}`}>{formatGap(row.gap)}</td>
                    <td className={`text-center text-xs font-semibold ${gapTone(row.gap)}`}>{getRankGapSignal(row.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </NflTableScroller>
          <p className="border-t border-slate-100 px-3 py-3 text-[11px] leading-5 text-slate-500">Rank Gap compares prediction-market rank with Joe Knows Ball power rank. A positive number means the model rates the team higher than the market does; it is a rank comparison, not a guaranteed betting edge.</p>
        </section>
      )}
    </>
  );
}
