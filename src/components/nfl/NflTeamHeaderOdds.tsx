import { useEffect, useMemo, useState } from "react";
import { formatAmericanOdds, type NflFutureQuote, type NflTeamFuturesResponse } from "@/lib/nfl/teamFutures";
import type { NflGuideTeam } from "@/lib/nfl/guide2026";

type LoadStatus = "loading" | "success" | "error";

const QUOTE_ORDER: NflFutureQuote["key"][] = ["superBowl", "conference", "division"];

export default function NflTeamHeaderOdds({ team }: { team: NflGuideTeam }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<NflTeamFuturesResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    setStatus("loading");

    fetch(`${base}/api/nfl/team-futures?team=${encodeURIComponent(team.abbr)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.quotes)) {
          throw new Error(payload?.error ?? "NFL futures markets are unavailable.");
        }
        return payload as NflTeamFuturesResponse;
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

  const quotes = useMemo(() => {
    const byKey = new Map(data?.quotes.map((quote) => [quote.key, quote]) ?? []);
    return QUOTE_ORDER.map((key) => byKey.get(key) ?? fallbackQuote(key, team));
  }, [data, team]);

  return (
    <div className="mt-6 lg:mt-0 lg:min-w-[430px]" aria-label={`${team.team} futures markets`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">Odds to win</div>
        {data?.stale && <div className="text-[9px] font-bold uppercase tracking-wider text-amber-200">Cached market</div>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {quotes.map((quote) => (
          <OddsTile key={quote.key} quote={quote} loading={status === "loading"} unavailable={status === "error" || quote.price == null} />
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-400">Polymarket probability converted to American-odds equivalent. An unavailable tile is never backfilled with a fabricated price.</p>
    </div>
  );
}

function OddsTile({ quote, loading, unavailable }: { quote: NflFutureQuote; loading: boolean; unavailable: boolean }) {
  const displayOdds = loading ? "…" : unavailable ? "—" : formatAmericanOdds(quote.americanOdds);
  const detail = loading
    ? "Loading market"
    : unavailable
      ? "Market unavailable"
      : `${quote.probability?.toFixed(1)}% implied`;

  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
        <div className={`flex h-12 min-w-12 items-center justify-center rounded-full border-2 border-white/80 px-2 text-sm font-black shadow-lg ${unavailable ? "bg-slate-700 text-slate-300" : "bg-rose-600 text-white"}`}>
          {displayOdds}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-black uppercase tracking-wide text-white">{quote.label}</div>
          <div className="mt-0.5 text-[10px] text-slate-300">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function fallbackQuote(key: NflFutureQuote["key"], team: NflGuideTeam): NflFutureQuote {
  const conference = team.division.slice(0, 3).toUpperCase();
  const label = key === "superBowl" ? "Super Bowl" : key === "conference" ? `${conference} champion` : `${team.division.toUpperCase()} winner`;
  return {
    key,
    label,
    price: null,
    probability: null,
    americanOdds: null,
    eventId: null,
    eventTitle: null,
    marketId: null,
    marketSlug: null,
  };
}
