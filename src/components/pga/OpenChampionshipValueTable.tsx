import { useMemo, useState } from "react";

type Market = "outright" | "top5" | "top10" | "top20" | "makeCut";
type ValueRow = [Market, string, number, string, number, string, string, number];

const MARKET_LABELS: Record<Market, string> = {
  outright: "Outright",
  top5: "Top 5",
  top10: "Top 10",
  top20: "Top 20",
  makeCut: "Make Cut",
};

const VALUE_ROWS: ValueRow[] = [["outright","Jackson Suber",3,"+27500",57.7,"28/73","64/67",36],["outright","Jacob Bridgeman",2,"+22500",56.7,"31/73","57/67",26],["outright","Rasmus Neergaard-Petersen",3,"+33000",47.2,"45/73","67/67",22],["outright","Ryan Fox",2,"+17500",61.8,"25/73","45/67",20],["outright","Ryan Gerard",2,"+13500",67.4,"18/73","37/67",19],["outright","Keith Mitchell",3,"+17500",62,"24/73","43/67",19],["outright","Sahith Theegala",3,"+22000",50.2,"38/73","55/67",17],["outright","Eric Cole",3,"+18500",55.4,"33/73","48/67",15],["outright","Maverick McNealy",2,"+10000",69.1,"17/73","30/67",13],["outright","Nick Taylor",2,"+23000",44.3,"49/73","60/67",11],["outright","Tom Kim",2,"+5900",78.2,"9/73","19/67",10],["outright","Aaron Rai",2,"+7000",74.3,"12/73","22/67",10],["outright","Sam Stevens",2,"+29000",38.4,"56/73","65/67",9],["outright","Bud Cauley",2,"+19500",48.1,"42/73","50/67",8],["outright","Daniel Berger",2,"+29000",37.3,"58/73","66/67",8],["outright","Wyndham Clark",1,"+4100",84.7,"5/73","12/67",7],["outright","Sam Burns",2,"+4800",82.1,"7/73","14/67",7],["outright","Justin Thomas",2,"+5300",74.7,"10/73","16/67",6],["outright","Kurt Kitayama",2,"+8600",66.3,"20/73","26/67",6],["outright","Si Woo Kim",2,"+4300",80.9,"8/73","13/67",5],["top5","Jackson Suber",3,"+3000",57.7,"28/73","64/67",36],["top5","Jacob Bridgeman",2,"+2500",56.7,"31/73","56/67",25],["top5","Rasmus Neergaard-Petersen",3,"+3500",47.2,"45/73","67/67",22],["top5","Keith Mitchell",3,"+2150",62,"24/73","45/67",21],["top5","Ryan Fox",2,"+2150",61.8,"25/73","46/67",21],["top5","Ryan Gerard",2,"+1700",67.4,"18/73","37/67",19],["top5","Sahith Theegala",3,"+2500",50.2,"38/73","55/67",17],["top5","Eric Cole",3,"+2200",55.4,"33/73","47/67",14],["top5","Maverick McNealy",2,"+1350",69.1,"17/73","30/67",13],["top5","Tom Kim",2,"+880",78.2,"9/73","20/67",11],["top5","Aaron Rai",2,"+980",74.3,"12/73","22/67",10],["top5","Sam Stevens",2,"+3200",38.4,"56/73","66/67",10],["top5","Nick Taylor",2,"+2500",44.3,"49/73","57/67",8],["top5","Wyndham Clark",1,"+660",84.7,"5/73","12/67",7],["top5","Sam Burns",2,"+750",82.1,"7/73","14/67",7],["top5","Justin Thomas",2,"+810",74.7,"10/73","17/67",7],["top5","Bud Cauley",2,"+2250",48.1,"42/73","49/67",7],["top5","Daniel Berger",2,"+3100",37.3,"58/73","65/67",7],["top5","Kurt Kitayama",2,"+1175",66.3,"20/73","26/67",6],["top5","Si Woo Kim",2,"+660",80.9,"8/73","13/67",5],["top10","Jackson Suber",3,"+1250",57.7,"28/73","63/67",35],["top10","Jacob Bridgeman",2,"+1050",56.7,"31/73","56/67",25],["top10","Rasmus Neergaard-Petersen",3,"+1425",47.2,"45/73","67/67",22],["top10","Keith Mitchell",3,"+930",62,"24/73","45/67",21],["top10","Ryan Fox",2,"+930",61.8,"25/73","46/67",21],["top10","Ryan Gerard",2,"+750",67.4,"18/73","37/67",19],["top10","Sahith Theegala",3,"+1050",50.2,"38/73","55/67",17],["top10","Eric Cole",3,"+930",55.4,"33/73","47/67",14],["top10","Maverick McNealy",2,"+610",69.1,"17/73","30/67",13],["top10","Tom Kim",2,"+405",78.2,"9/73","20/67",11],["top10","Sam Stevens",2,"+1300",38.4,"56/73","66/67",10],["top10","Aaron Rai",2,"+440",74.3,"12/73","21/67",9],["top10","Wyndham Clark",1,"+320",84.7,"5/73","13/67",8],["top10","Sam Burns",2,"+355",82.1,"7/73","15/67",8],["top10","Nick Taylor",2,"+1050",44.3,"49/73","57/67",8],["top10","Justin Thomas",2,"+380",74.7,"10/73","17/67",7],["top10","Bud Cauley",2,"+930",48.1,"42/73","49/67",7],["top10","Daniel Berger",2,"+1275",37.3,"58/73","65/67",7],["top10","Kurt Kitayama",2,"+530",66.3,"20/73","26/67",6],["top10","Keegan Bradley",2,"+800",53.8,"35/73","40/67",5],["top20","Jackson Suber",3,"+510",57.7,"28/73","63/67",35],["top20","Keith Mitchell",3,"+405",62,"24/73","49/67",25],["top20","Jacob Bridgeman",2,"+440",56.7,"31/73","56/67",25],["top20","Ryan Fox",2,"+400",61.8,"25/73","48/67",23],["top20","Rasmus Neergaard-Petersen",3,"+580",47.2,"45/73","67/67",22],["top20","Ryan Gerard",2,"+325",67.4,"18/73","37/67",19],["top20","Sahith Theegala",3,"+450",50.2,"38/73","57/67",19],["top20","Maverick McNealy",2,"+270",69.1,"17/73","31/67",14],["top20","Eric Cole",3,"+395",55.4,"33/73","47/67",14],["top20","Tom Kim",2,"+186",78.2,"9/73","20/67",11],["top20","Sam Stevens",2,"+530",38.4,"56/73","66/67",10],["top20","Aaron Rai",2,"+196",74.3,"12/73","21/67",9],["top20","Sam Burns",2,"+168",82.1,"7/73","15/67",8],["top20","Justin Thomas",2,"+178",74.7,"10/73","18/67",8],["top20","Wyndham Clark",1,"+150",84.7,"5/73","12/67",7],["top20","Gary Woodland",2,"+390",50.1,"39/73","45/67",6],["top20","Daniel Berger",2,"+520",37.3,"58/73","64/67",6],["top20","Kurt Kitayama",2,"+240",66.3,"20/73","25/67",5],["top20","Keegan Bradley",2,"+345",53.8,"35/73","40/67",5],["top20","Max Greyserman",3,"+500",38.2,"57/73","62/67",5],["makeCut","Jackson Suber",3,"-120",57.7,"28/73","62/66",34],["makeCut","Keith Mitchell",3,"-140",62,"24/73","51/66",27],["makeCut","Jacob Bridgeman",2,"-132",56.7,"31/73","57/66",26],["makeCut","Ryan Fox",2,"-142",61.8,"25/73","48/66",23],["makeCut","Rasmus Neergaard-Petersen",3,"-110",47.2,"45/73","66/66",21],["makeCut","Ryan Gerard",2,"-170",67.4,"18/73","35/66",17],["makeCut","Sahith Theegala",3,"-134",50.2,"38/73","55/66",17],["makeCut","Maverick McNealy",2,"-188",69.1,"17/73","32/66",15],["makeCut","Eric Cole",3,"-144",55.4,"33/73","47/66",14],["makeCut","Tom Kim",2,"-245",78.2,"9/73","20/66",11],["makeCut","Sam Burns",2,"-260",82.1,"7/73","17/66",10],["makeCut","Aaron Rai",2,"-240",74.3,"12/73","21/66",9],["makeCut","Wyndham Clark",1,"-280",84.7,"5/73","13/66",8],["makeCut","Kurt Kitayama",2,"-205",66.3,"20/73","27/66",7],["makeCut","Gary Woodland",2,"-146",50.1,"39/73","46/66",7],["makeCut","Sam Stevens",2,"-120",38.4,"56/73","63/66",7],["makeCut","Justin Thomas",2,"-260",74.7,"10/73","16/66",6],["makeCut","J.T. Poston",2,"-148",51,"37/73","43/66",6],["makeCut","Daniel Berger",2,"-118",37.3,"58/73","64/66",6],["makeCut","Chris Gotterup",1,"-320",87.4,"3/73","8/66",5]];

const markets = Object.keys(MARKET_LABELS) as Market[];

export default function OpenChampionshipValueTable() {
  const [market, setMarket] = useState<Market>("outright");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("all");
  const [minimumScore, setMinimumScore] = useState(0);
  const [sort, setSort] = useState<"gap" | "score" | "odds">("gap");

  const rows = useMemo(() => VALUE_ROWS
    .filter(([rowMarket, player, rowTier, , score]) => rowMarket === market
      && player.toLowerCase().includes(query.trim().toLowerCase())
      && (tier === "all" || rowTier === Number(tier))
      && score >= minimumScore)
    .sort((a, b) => sort === "score" ? b[4] - a[4] : sort === "odds" ? americanOddsValue(b[3]) - americanOddsValue(a[3]) : b[7] - a[7]),
  [market, query, tier, minimumScore, sort]);

  return (
    <section id="value-board" className="scroll-mt-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 p-5 text-white sm:p-7">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Full value board</div>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">Best model-to-market values by category</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">A positive value gap means the market ranks a player lower than the reliability-adjusted model does. Use the model score alongside the gap—a large gap on a low-ranked player is not automatically a strong bet.</p>
        </div>

        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {markets.map((key) => <button key={key} type="button" onClick={() => setMarket(key)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${market === key ? "bg-emerald-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{MARKET_LABELS[key]}</button>)}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player..." className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            <select value={tier} onChange={(event) => setTier(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"><option value="all">All tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select>
            <select value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"><option value="0">Any model score</option><option value="50">Score 50+</option><option value="60">Score 60+</option><option value="70">Score 70+</option><option value="80">Score 80+</option></select>
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"><option value="gap">Sort: Best value gap</option><option value="score">Sort: Model score</option><option value="odds">Sort: Longest odds</option></select>
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(160px,1.35fr)_70px_90px_95px_95px_95px_100px] gap-3 bg-slate-100 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 md:grid">
          <span>Player</span><span>Tier</span><span>Odds</span><span>Adj. score</span><span>Model rank</span><span>Market rank</span><span>Value gap</span>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map(([, player, rowTier, odds, score, modelRank, marketRank, gap]) => (
            <div key={`${market}-${player}`} className="grid gap-2 px-5 py-4 transition hover:bg-emerald-50/40 md:grid-cols-[minmax(160px,1.35fr)_70px_90px_95px_95px_95px_100px] md:items-center md:gap-3">
              <div className="font-black text-slate-900">{player}</div>
              <div><span className="mr-2 text-[10px] font-black uppercase text-slate-400 md:hidden">Tier</span><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${rowTier === 1 ? "bg-emerald-100 text-emerald-800" : rowTier === 2 ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>Tier {rowTier}</span></div>
              <div className="font-black text-slate-900"><span className="mr-2 text-[10px] uppercase text-slate-400 md:hidden">Odds</span>{odds}</div>
              <div className="text-sm font-bold text-slate-700"><span className="mr-2 text-[10px] uppercase text-slate-400 md:hidden">Score</span>{score.toFixed(1)}</div>
              <div className="text-sm text-slate-600"><span className="mr-2 text-[10px] font-black uppercase text-slate-400 md:hidden">Model</span>{modelRank}</div>
              <div className="text-sm text-slate-600"><span className="mr-2 text-[10px] font-black uppercase text-slate-400 md:hidden">Market</span>{marketRank}</div>
              <div><span className="mr-2 text-[10px] font-black uppercase text-slate-400 md:hidden">Gap</span><span className="inline-flex min-w-12 justify-center rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-black text-emerald-800">+{gap}</span></div>
            </div>
          ))}
          {!rows.length && <div className="px-5 py-12 text-center text-sm font-bold text-slate-400">No players match the current filters.</div>}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500">Showing the top 20 positive value gaps from the supplied odds workbook for each market. Odds are a snapshot and may move. Model rank is based on the full modeled field; market rank is based on players with available odds in that category.</div>
      </div>
    </section>
  );
}

function americanOddsValue(odds: string) {
  const value = Number(odds.replace("+", ""));
  return Number.isFinite(value) ? value : 0;
}
