import { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import OpenChampionshipValueTable from "@/components/pga/OpenChampionshipValueTable";

const bestBets = [
  ["Matt Fitzpatrick", "Outright", "+1850", "No. 1 in the model, elite course fit, 100% cuts made recently"],
  ["Chris Gotterup", "Outright", "+3100", "No. 3 in the model, 92% cuts made, red-hot trend"],
  ["Wyndham Clark", "Outright", "+4100", "Hottest trend in the entire field"],
  ["Tom Kim", "Top 5", "+880", "No. 9 in the model, priced like a fringe name"],
  ["Tommy Fleetwood", "Top 10", "+160", "No. 6 in the model, elite course fit"],
  ["Sam Burns", "Top 20", "+168", "No. 7 in the model, one of the field's hottest recent forms"],
  ["Justin Thomas", "Top 20", "+178", "No. 10 in the model, dependable major cut-maker"],
  ["Maverick McNealy", "Make Cut", "−188", "Clean recent cut record, model-backed reliability"],
  ["Kurt Kitayama", "Make Cut", "−205", "Steady recent major form at a fair number"],
] as const;

const marketSections = [
  { id: "outright", eyebrow: "Outright Winner", title: "Three prices the model believes are still playable", accent: "border-emerald-200 bg-emerald-50 text-emerald-900", picks: [
    ["Matt Fitzpatrick", "+1850", "No. 1 overall in the model", "Matt Fitzpatrick tops our reliability-adjusted model this week, and it is not close. He has made every one of his recent starts through the weekend, and his combination of ball-striking quality and current form is the best in the field."],
    ["Chris Gotterup", "+3100", "No. 3 overall in the model", "Chris Gotterup is a genuinely elite combination of course fit and current form, with a recent cut-making rate north of 90%. At +3100, that is a real price for a player this well-rounded."],
    ["Wyndham Clark", "+4100", "No. 1 in current form", "Wyndham Clark carries the hottest form line in the field. He is less clean on pure reliability than the names above him, but the model's hottest player above 40/1 is worth a smaller-stake look."],
  ]},
  { id: "top-5", eyebrow: "Top 5", title: "The largest model-to-market gap on the board", accent: "border-amber-200 bg-amber-50 text-amber-900", picks: [
    ["Tom Kim", "+880", "No. 9 overall in the model", "Tom Kim grades as a top-10 overall player with elite current form, yet the market prices his Top 5 finish like a much lower-ranked name. This is a bet on where his game is now rather than on proven Open history."],
  ]},
  { id: "top-10", eyebrow: "Top 10", title: "A cleaner market for an elite course-fit profile", accent: "border-sky-200 bg-sky-50 text-sky-900", picks: [
    ["Tommy Fleetwood", "+160", "No. 6 overall in the model", "Tommy Fleetwood is a top-six model player with elite course fit. His consistent high finishes make the Top 10 market a cleaner fit than asking him to close outright."],
  ]},
  { id: "top-20", eyebrow: "Top 20", title: "Current form and major reliability meet a plus price", accent: "border-violet-200 bg-violet-50 text-violet-900", picks: [
    ["Sam Burns", "+168", "No. 7 overall in the model", "Sam Burns combines one of the field's hottest current-form profiles with a strong cut-making rate—the exact combination this market rewards."],
    ["Justin Thomas", "+178", "No. 10 overall in the model", "Justin Thomas is the steadier option: a proven major cut-maker who checks every reliability box at a similar plus price."],
  ]},
  { id: "make-cut", eyebrow: "Make the Cut", title: "Reliability-focused positions for a volatile major", accent: "border-slate-200 bg-slate-50 text-slate-900", picks: [
    ["Maverick McNealy", "−188", "Clean recent cut record", "Maverick McNealy has a clean recent cut-making record and a model profile that is more reliable than this market price suggests."],
    ["Kurt Kitayama", "−205", "Steady recent major form", "Kurt Kitayama offers solid recent major form at a number that is not overly expensive for the reliability he has shown."],
  ]},
] as const;

export default function PgaOpenChampionshipBestBets() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "2026 Open Championship Best Bets | JoeKnowsBall";
    const description = "JoeKnowsBall's reliability-adjusted PGA model identifies 2026 Open Championship value bets across outright, Top 5, Top 10, Top 20 and make-cut markets.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content;
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description;
    return () => { document.title = previousTitle; if (meta && previousDescription !== undefined) meta.content = previousDescription; };
  }, []);

  return (
    <SiteShell>
      <article className="min-h-screen bg-slate-50 text-slate-900">
        <header className="relative overflow-hidden bg-slate-950 px-4 py-12 text-white sm:py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.24),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.14),transparent_38%)]" />
          <div className="relative mx-auto max-w-6xl">
            <div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em]"><Link to="/pga" className="text-emerald-400 hover:text-emerald-300">PGA Model</Link><span className="text-slate-600">/</span><span className="text-slate-300">Best Bets</span></div>
            <div className="max-w-4xl"><div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-300">2026 Open Championship</div><h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Where JoeKnowsBall's Model Finds the Market Sleeping</h1><p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">Our reliability-adjusted PGA model flags the Open Championship bets where current form, course fit and dependable cut-making have not been fully reflected in the market.</p></div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs font-semibold text-slate-400"><span>Published July 14, 2026</span><span>Model-driven betting analysis</span><span>Odds are a single-market snapshot</span></div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:px-8 lg:py-12">
          <main className="min-w-0 space-y-10">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><p className="text-lg leading-8 text-slate-700">Every model can tell you who is playing well. The harder question is whether the market has already priced that in. We ran the updated JoeKnowsBall model—weighted more heavily toward recent form and cut-making reliability—against the Open Championship board.</p><p className="mt-4 text-lg leading-8 text-slate-700">A few names surfaced that the board has not fully adjusted to yet. Here is where the model found value and where the price still matters.</p></section>

            <section id="model" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white p-5 sm:p-7"><div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Model update</div><h2 className="mt-2 text-2xl font-black sm:text-3xl">What changed this week</h2></div><div className="space-y-5 p-5 text-base leading-7 text-slate-700 sm:p-7"><p>A purely ball-striking score misses the difference between a player who has quietly missed three of five cuts and one who has made every weekend all summer.</p><div className="grid gap-3 sm:grid-cols-2">{[["35%","Ball-striking & course fit"],["25%","Current hot form via JKB Trend"],["20%","Recent cut-making percentage"],["20%","Overall finish consistency"]].map(([weight,label]) => <div key={label} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="min-w-14 text-2xl font-black text-emerald-700">{weight}</div><div className="text-sm font-bold text-slate-700">{label}</div></div>)}</div><p>The result rewards players who are both talented and dependable right now, rather than relying only on the flashiest underlying swing metrics.</p></div></section>

            <section id="glance"><div className="mb-4"><div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Betting card</div><h2 className="mt-1 text-2xl font-black sm:text-3xl">Best Bets at a Glance</h2></div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[1.2fr_.8fr_.55fr_2fr] gap-4 bg-slate-900 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-slate-300 md:grid"><span>Player</span><span>Market</span><span>Odds</span><span>Key signal</span></div><div className="divide-y divide-slate-100">{bestBets.map(([player,market,odds,signal]) => <div key={`${player}-${market}`} className="grid gap-2 px-5 py-4 hover:bg-slate-50 md:grid-cols-[1.2fr_.8fr_.55fr_2fr] md:items-center md:gap-4"><div className="font-black">{player}</div><div className="text-sm font-bold text-slate-600">{market}</div><div className="text-lg font-black text-emerald-700">{odds}</div><div className="text-sm leading-6 text-slate-600">{signal}</div></div>)}</div></div></section>

            {marketSections.map((section) => <section key={section.id} id={section.id} className="scroll-mt-6"><div className={`rounded-2xl border p-5 shadow-sm sm:p-7 ${section.accent}`}><div className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{section.eyebrow}</div><h2 className="mt-2 text-2xl font-black sm:text-3xl">{section.title}</h2></div><div className="mt-3 space-y-3">{section.picks.map(([player,odds,signal,body]) => <div key={player} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><h3 className="text-xl font-black">{player}</h3><p className="mt-1 text-sm font-bold text-slate-500">{signal}</p></div><div className="rounded-xl bg-slate-900 px-4 py-2 text-xl font-black text-white">{odds}</div></div><p className="mt-4 text-base leading-7 text-slate-700">{body}</p></div>)}</div></section>)}

            <OpenChampionshipValueTable />

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:p-6"><h2 className="font-black">Responsible wagering note</h2><p className="mt-2">Odds move, and the numbers above reflect a single snapshot. Compare prices across sportsbooks before betting, and only wager what you are comfortable losing. Betting involves risk.</p></section>
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Full rankings</div><h2 className="mt-1 text-2xl font-black">See the complete JoeKnowsBall PGA model</h2><p className="mt-2 text-sm leading-6 text-slate-600">Review every player, model score, current trend and course-fit input behind the betting card.</p></div><Link to="/pga" className="mt-5 inline-flex shrink-0 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-800 sm:mt-0">View the full model →</Link></section>
          </main>

          <aside className="hidden lg:block"><div className="sticky top-4 space-y-4"><nav className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">Article guide</div><div className="divide-y divide-slate-100 text-sm font-bold text-slate-600">{[["#model","Model changes"],["#glance","Best bets at a glance"],["#outright","Outright winners"],["#top-5","Top 5"],["#top-10","Top 10"],["#top-20","Top 20"],["#make-cut","Make the cut"],["#value-board","Full value board"]].map(([href,label]) => <a key={href} href={href} className="block px-4 py-3 hover:bg-emerald-50 hover:text-emerald-800">{label}</a>)}</div></nav><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-black uppercase tracking-wider text-emerald-700">Model focus</div><p className="mt-2 text-sm leading-6 text-slate-700">Course fit matters, but this betting card places additional weight on recent form, cut-making and finish consistency.</p></div></div></aside>
        </div>
      </article>
    </SiteShell>
  );
}
