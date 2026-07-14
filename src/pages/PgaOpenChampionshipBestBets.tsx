import { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";

const bestBets = [
  { player: "Matt Fitzpatrick", market: "Outright", odds: "+1850", signal: "No. 1 in the model, elite course fit, 100% cuts made recently", tier: "Top play" },
  { player: "Chris Gotterup", market: "Outright", odds: "+3100", signal: "No. 3 in the model, 92% cuts made, red-hot trend", tier: "Value" },
  { player: "Wyndham Clark", market: "Outright", odds: "+4100", signal: "Hottest trend in the entire field", tier: "Long shot" },
  { player: "Tom Kim", market: "Top 5", odds: "+880", signal: "No. 9 in the model, priced like a fringe name", tier: "Best gap" },
  { player: "Tommy Fleetwood", market: "Top 10", odds: "+160", signal: "No. 6 in the model, elite course fit", tier: "High floor" },
  { player: "Sam Burns", market: "Top 20", odds: "+168", signal: "No. 7 in the model, one of the field's hottest recent forms", tier: "Form play" },
  { player: "Justin Thomas", market: "Top 20", odds: "+178", signal: "No. 10 in the model, dependable major cut-maker", tier: "Reliable" },
  { player: "Maverick McNealy", market: "Make Cut", odds: "−188", signal: "Clean recent cut record, model-backed reliability", tier: "Cut play" },
  { player: "Kurt Kitayama", market: "Make Cut", odds: "−205", signal: "Steady recent major form at a fair number", tier: "Cut play" },
];

const marketSections = [
  {
    id: "outright",
    eyebrow: "Outright Winner",
    title: "Three prices the model believes are still playable",
    accent: "emerald",
    picks: [
      { player: "Matt Fitzpatrick", odds: "+1850", signal: "No. 1 overall in the model", body: "Matt Fitzpatrick tops our reliability-adjusted model this week, and it isn't close. He's made every one of his recent starts through the weekend, and his combination of ball-striking quality and current form is the best in the field. At +1850, the market hasn't caught up to how convincingly he grades out." },
      { player: "Chris Gotterup", odds: "+3100", signal: "No. 3 overall in the model", body: "Chris Gotterup is our No. 3 overall player — a genuinely elite combination of course fit and current form, with a cut-making rate north of 90% recently. At +3100, that's a real price for a player this well-rounded." },
      { player: "Wyndham Clark", odds: "+4100", signal: "No. 1 in current form (JKB Trend)", body: "Wyndham Clark carries the single hottest form line in the entire field right now. He won't grade as cleanly on pure reliability as the two names above him, but when the model's hottest player is still available above 40/1, that's worth a smaller-stake look." },
    ],
  },
  {
    id: "top-5",
    eyebrow: "Top 5",
    title: "The largest model-to-market gap on the board",
    accent: "amber",
    picks: [
      { player: "Tom Kim", odds: "+880", signal: "No. 9 overall in the model", body: "This is the single largest mispricing we found anywhere on the board. Tom Kim grades as a top-10 overall player in our updated model — genuinely elite current form, one of the hottest trend lines in the field — yet the market is pricing his Top 5 finish like he's a much lower-ranked name. The caveat is that his recent record at this tournament has been rougher than his overall form suggests, so this is a bet on where his game is right now, not on proven Open history." },
    ],
  },
  {
    id: "top-10",
    eyebrow: "Top 10",
    title: "A cleaner market for an elite course-fit profile",
    accent: "sky",
    picks: [
      { player: "Tommy Fleetwood", odds: "+160", signal: "No. 6 overall in the model", body: "Tommy Fleetwood is a top-6 overall model player with elite course fit for this specific setup. He's the classic 'keeps finishing high without closing' profile, which makes a Top 10 line a cleaner fit than betting him to win outright." },
    ],
  },
  {
    id: "top-20",
    eyebrow: "Top 20",
    title: "Current form and major reliability meet a plus price",
    accent: "violet",
    picks: [
      { player: "Sam Burns", odds: "+168", signal: "No. 7 overall in the model", body: "Sam Burns is one of the hottest players in the entire field by current form, and it's paired with a strong cut-making rate — the exact combination this market rewards." },
      { player: "Justin Thomas", odds: "+178", signal: "No. 10 overall in the model", body: "Justin Thomas is the steadier, more dependable name of the two: a proven major cut-maker who checks every reliability box the model looks for, at a very similar number." },
    ],
  },
  {
    id: "make-cut",
    eyebrow: "Make the Cut",
    title: "Reliability-focused positions for a volatile major",
    accent: "slate",
    picks: [
      { player: "Maverick McNealy", odds: "−188", signal: "Clean recent cut record", body: "Maverick McNealy has a clean recent cut-making record and a model profile that's more reliable than his market price suggests for this market specifically." },
      { player: "Kurt Kitayama", odds: "−205", signal: "Steady recent major form", body: "Kurt Kitayama offers a similar profile — solid recent major form at a number that isn't overly expensive for the reliability he's shown." },
    ],
  },
] as const;

const accentClasses = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  violet: "border-violet-200 bg-violet-50 text-violet-900",
  slate: "border-slate-200 bg-slate-50 text-slate-900",
};

export default function PgaOpenChampionshipBestBets() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "2026 Open Championship Best Bets | JoeKnowsBall";

    const description = "JoeKnowsBall's reliability-adjusted PGA model identifies 2026 Open Championship value bets across outright, Top 5, Top 10, Top 20 and make-cut markets.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== undefined) meta.content = previousDescription;
    };
  }, []);

  return (
    <SiteShell>
      <article className="min-h-screen bg-slate-50 text-slate-900">
        <header className="relative overflow-hidden bg-slate-950 px-4 py-12 text-white sm:py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.24),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.14),transparent_38%)]" />
          <div className="relative mx-auto max-w-6xl">
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em]">
              <Link to="/pga" className="text-emerald-400 transition hover:text-emerald-300">PGA Model</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300">Best Bets</span>
            </div>
            <div className="max-w-4xl">
              <div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-300">2026 Open Championship</div>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Where JoeKnowsBall's Model Finds the Market Sleeping</h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">Our reliability-adjusted PGA model flags the Open Championship bets where current form, course fit and dependable cut-making have not been fully reflected in the market.</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs font-semibold text-slate-400">
              <span>Published July 14, 2026</span>
              <span>Model-driven betting analysis</span>
              <span>Odds are a single-market snapshot</span>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:px-8 lg:py-12">
          <main className="min-w-0 space-y-10">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <p className="text-lg leading-8 text-slate-700">Every model can tell you who's playing well. The harder question is whether the market has already priced that in. This week we ran our updated JoeKnowsBall model — weighted more heavily toward recent form and cut-making reliability, not just ball-striking — against the current Open Championship board.</p>
              <p className="mt-4 text-lg leading-8 text-slate-700">A few names surfaced that the board has not fully adjusted to yet. Here is where we found value, and where the model believes the price still matters.</p>
            </section>

            <section id="model" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white p-5 sm:p-7">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Model update</div>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">What changed this week</h2>
              </div>
              <div className="space-y-5 p-5 text-base leading-7 text-slate-700 sm:p-7">
                <p>Our rankings have always leaned on strokes-gained data and course fit. But a purely ball-striking-based score misses something obvious: a player who has quietly missed three of his last five cuts is not the same bet as one who has not missed a weekend all summer, even when their swing metrics look similar.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["35%", "Ball-striking & course fit"],
                    ["25%", "Current hot form via JKB Trend"],
                    ["20%", "Recent cut-making percentage"],
                    ["20%", "Overall finish consistency"],
                  ].map(([weight, label]) => (
                    <div key={label} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="min-w-14 text-2xl font-black text-emerald-700">{weight}</div>
                      <div className="text-sm font-bold text-slate-700">{label}</div>
                    </div>
                  ))}
                </div>
                <p>The result rewards players who are both talented and dependable right now. Players who look good on pure stats but have been cold or inconsistent slide down; players who are hot, reliable and steady climb even when their raw ball-striking numbers are not the flashiest in the field.</p>
              </div>
            </section>

            <section id="glance">
              <div className="mb-4">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Betting card</div>
                <h2 className="mt-1 text-2xl font-black sm:text-3xl">Best Bets at a Glance</h2>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="hidden grid-cols-[1.2fr_.8fr_.55fr_2fr] gap-4 bg-slate-900 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-slate-300 md:grid">
                  <span>Player</span><span>Market</span><span>Odds</span><span>Key signal</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {bestBets.map((bet) => (
                    <div key={`${bet.player}-${bet.market}`} className="grid gap-2 px-5 py-4 transition hover:bg-slate-50 md:grid-cols-[1.2fr_.8fr_.55fr_2fr] md:items-center md:gap-4">
                      <div><div className="font-black text-slate-900">{bet.player}</div><div className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800 md:hidden">{bet.tier}</div></div>
                      <div className="text-sm font-bold text-slate-600"><span className="mr-2 text-[10px] font-black uppercase text-slate-400 md:hidden">Market</span>{bet.market}</div>
                      <div className="text-lg font-black text-emerald-700"><span className="mr-2 text-[10px] font-black uppercase text-slate-400 md:hidden">Odds</span>{bet.odds}</div>
                      <div className="text-sm leading-6 text-slate-600">{bet.signal}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {marketSections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-6">
                <div className={`rounded-2xl border p-5 shadow-sm sm:p-7 ${accentClasses[section.accent]}`}>
                  <div className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{section.eyebrow}</div>
                  <h2 className="mt-2 text-2xl font-black sm:text-3xl">{section.title}</h2>
                </div>
                <div className="mt-3 space-y-3">
                  {section.picks.map((pick) => (
                    <div key={pick.player} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                        <div><h3 className="text-xl font-black">{pick.player}</h3><p className="mt-1 text-sm font-bold text-slate-500">{pick.signal}</p></div>
                        <div className="rounded-xl bg-slate-900 px-4 py-2 text-xl font-black text-white">{pick.odds}</div>
                      </div>
                      <p className="mt-4 text-base leading-7 text-slate-700">{pick.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-950 to-slate-950 p-6 text-white shadow-sm sm:p-8">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-indigo-300">Deeper sleeper</div>
              <h2 className="mt-2 text-2xl font-black">One outsider is still worth monitoring</h2>
              <p className="mt-4 leading-7 text-slate-300">Not every value signal made the betting card. One much longer-priced player graded as the strongest course-fit profile among the field's outsiders, supported by the short-game numbers this setup rewards most. It is not a core position, but it is the type of price worth watching if the market drifts before the first tee shot.</p>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:p-6">
              <h2 className="font-black">Responsible wagering note</h2>
              <p className="mt-2">Odds move, and the numbers above reflect a single snapshot. Compare prices across sportsbooks before betting, and only wager what you are comfortable losing. Betting involves risk.</p>
            </section>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
              <div><div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Full rankings</div><h2 className="mt-1 text-2xl font-black text-slate-900">See the complete JoeKnowsBall PGA model</h2><p className="mt-2 text-sm leading-6 text-slate-600">Review every player, model score, current trend and course-fit input behind the betting card.</p></div>
              <Link to="/pga" className="mt-5 inline-flex shrink-0 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 sm:mt-0">View the full model →</Link>
            </section>
          </main>

          <aside className="hidden lg:block">
            <div className="sticky top-4 space-y-4">
              <nav className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">Article guide</div>
                <div className="divide-y divide-slate-100 text-sm font-bold text-slate-600">
                  {[
                    ["#model", "Model changes"], ["#glance", "Best bets at a glance"], ["#outright", "Outright winners"], ["#top-5", "Top 5"], ["#top-10", "Top 10"], ["#top-20", "Top 20"], ["#make-cut", "Make the cut"],
                  ].map(([href, label]) => <a key={href} href={href} className="block px-4 py-3 transition hover:bg-emerald-50 hover:text-emerald-800">{label}</a>)}
                </div>
              </nav>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Model focus</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">Course fit matters, but this betting card places additional weight on recent form, cut-making and finish consistency.</p>
              </div>
            </div>
          </aside>
        </div>
      </article>
    </SiteShell>
  );
}
