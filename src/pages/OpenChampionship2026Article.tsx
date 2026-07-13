import { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";

const title = "2026 Open Championship Picks: Best Bets, Model Rankings and Golf Odds";
const description = "JoeKnowsBall's updated PGA model finds Open Championship value at Royal Birkdale — outright, Top 10, Top 20 and Make-Cut best bets with current odds.";
const disclaimer = "Odds reflect a major regulated sportsbook and were captured Wednesday, July 15, 7:00 PM ET. Lines move and vary by book — shop for the best number. 21+. Betting involves risk. 1-800-GAMBLER.";
const picks = [
  ["Matt Fitzpatrick", "Outright", "+1850", "No. 2 model, No. 8 JKB Trend, T3 last week"],
  ["Wyndham Clark", "Outright", "+4100", "No. 1 JKB Trend, U.S. Open champion"],
  ["Tommy Fleetwood", "Top 10", "+160", "No. 4 model, No. 6 Trend, hometown links"],
  ["Xander Schauffele", "Top 20", "+106", "Made all eight career Open cuts"],
  ["Robert MacIntyre", "Top 20", "+138", "Six straight made cuts, Open best of sixth"],
  ["Justin Thomas", "Make Cut", "−260", "Made the cut in every 2026 major"],
];

function OddsTable({ final = false }: { final?: boolean }) {
  return <>
    <div className="my-5 overflow-x-auto rounded-xl border">
      <table className="min-w-[720px] w-full text-sm">
        <thead className="bg-slate-900 text-white"><tr><th className="p-3 text-left">Player</th><th className="p-3 text-left">Market</th><th className="p-3 text-left">Odds</th><th className="p-3 text-left">Sportsbook</th><th className="p-3 text-left">{final ? "Confidence" : "Key Model Signal"}</th></tr></thead>
        <tbody>{picks.map(([player, market, odds, signal], index) => <tr key={player} className={index % 2 ? "bg-slate-50" : "bg-white"}><td className="border-t p-3 font-bold">{player}</td><td className="border-t p-3">{market}</td><td className="border-t p-3 font-black">{odds}</td><td className="border-t p-3">Major book (7/15)</td><td className="border-t p-3">{final ? (index === 1 ? "Smaller-stake long shot" : index > 3 ? "Standard consideration" : "Strong consideration") : signal}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="mt-2 text-xs font-semibold text-slate-500">As of Wednesday, July 15, 2026, 7:00 PM ET.</p>
  </>;
}

export default function OpenChampionship2026Article() {
  useEffect(() => {
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", description);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", "https://joeknowsball.com/pga/the-open-2026-picks-best-bets-odds");
  }, []);

  const sectionClass = "mt-12";
  const headingClass = "mb-4 text-3xl font-black tracking-tight";
  const subheadingClass = "mb-3 mt-8 text-2xl font-black";
  const paragraphClass = "my-5 leading-8 text-slate-700";

  return <SiteShell><main className="bg-slate-50">
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <svg aria-label="Original coastal links golf illustration" role="img" viewBox="0 0 1600 620" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f4c75"/><stop offset="1" stopColor="#b7d7e8"/></linearGradient><linearGradient id="dune" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6d7f36"/><stop offset="1" stopColor="#d7c58b"/></linearGradient></defs><rect width="1600" height="620" fill="url(#sky)"/><path d="M0 360C260 280 410 410 650 330C900 245 1080 390 1600 275V620H0Z" fill="#355e3b"/><path d="M0 430C280 330 520 520 810 370C1080 240 1260 405 1600 330V620H0Z" fill="url(#dune)"/><path d="M0 500C390 420 710 560 1020 440C1240 355 1390 430 1600 390V620H0Z" fill="#2f6b3f"/><path d="M1130 180v250" stroke="white" strokeWidth="8"/><path d="m1130 185 135 45-135 45Z" fill="#fff"/></svg>
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/20"/>
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28"><p className="text-xs font-black uppercase tracking-[.24em] text-emerald-300">PGA / Golf Betting</p><h1 className="mt-4 max-w-5xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">{title}</h1><p className="mt-5 max-w-3xl text-lg text-slate-200">Model-driven outright, Top 10, Top 20 and make-cut value for Royal Birkdale.</p><p className="mt-5 text-sm font-bold text-slate-300">Published July 15, 2026 · 7:00 PM ET</p></div>
    </section>

    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap gap-2">{["The Open Championship","British Open 2026","Royal Birkdale","golf betting","PGA picks","Matt Fitzpatrick","Tommy Fleetwood","best bets","JKB model"].map(tag => <span key={tag} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{tag}</span>)}</div>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">{disclaimer}</div>
      <article className="mt-8 rounded-2xl border bg-white p-5 shadow-sm sm:p-8 lg:p-12">
        <p className={paragraphClass}>The final major of 2026 lands at Royal Birkdale, and the JoeKnowsBall PGA model has been rebuilt around it. This week's read runs the updated model — refreshed through the completed Genesis Scottish Open — against the current market to find prices that look more generous than each player's profile deserves across outright, Top 10, Top 20 and Make-Cut markets.</p>
        <p className="my-5 italic leading-8 text-slate-600">A note on the numbers: outright, placement and make-cut prices below reflect a major regulated sportsbook board captured Wednesday, July 15, 7:00 PM ET. Lines move, and Open markets vary widely between books — always shop for the best number before you bet.</p>
        <h2 className={headingClass}>Quick Picks</h2><OddsTable />

        <section className={sectionClass}><h2 className={headingClass}>The Open Championship overview</h2><p className={paragraphClass}>The 154th Open Championship runs July 16–19 at Royal Birkdale Golf Club in Southport, England — the club's 11th time hosting and its first since Jordan Spieth's 2017 win. It is a par 70 measuring roughly 7,156 yards, with both par 5s on the back nine and a redesigned 14th hole that pushes the fairway toward the dunes.</p><p className={paragraphClass}>Birkdale rewards accuracy, recovery, controlled ball flight and patience more than raw distance. Thick rough, severe bunkering and Lancashire coastal wind make approach play and short-game reliability especially important.</p></section>

        <section className={sectionClass}><h2 className={headingClass}>What the JoeKnowsBall model values this week</h2><p className={paragraphClass}>The heaviest weights fall on strokes gained total, around the green and approach, followed by off-the-tee play, while putting receives a deliberately lighter weight. In plain terms, the model is hunting for complete ball-strikers who can save par from bunkers and greenside rough.</p><p className={paragraphClass}>The second major signal is <Link className="font-bold text-emerald-700 underline" to="/pga/model">JKB Trend</Link>, which measures recent-round scoring among tracked players. See <Link className="font-bold text-emerald-700 underline" to="/pga/model">the current JoeKnowsBall PGA model</Link> for complete rankings, course fit, major history and recent finishes.</p></section>

        <section className={sectionClass}><h2 className={headingClass}>Outright winner picks</h2><h3 className={subheadingClass}>Matt Fitzpatrick — Outright at +1850</h3><p className={paragraphClass}>Fitzpatrick is the cleanest model-market disagreement. He enters No. 2 overall and No. 8 in JKB Trend, leads this shortlist in approach play and arrives off a T3 at the Genesis Scottish Open. His recent finishing line of T3, 22, 2, T36 and T14 supports the model's high floor.</p><p className={paragraphClass}>He owns seven made cuts in nine Open starts, with a best finish of fourth. The primary risk is a cold putter, but the course weighting makes that less damaging than it would be at a standard PGA Tour stop.</p><p className="font-black">Bet: Matt Fitzpatrick to win The Open at +1850.</p>
        <h3 className={subheadingClass}>Wyndham Clark — Outright at +4100</h3><p className={paragraphClass}>Clark is the model's No. 1 JKB Trend player, owns the strongest recent finishing-form score in this group and enters as the 2026 U.S. Open champion. His Open history includes a fourth-place finish and three made cuts in four starts.</p><p className={paragraphClass}>The concern is precision off the tee and an otherwise uneven major record, so this is a smaller-stake long shot rather than a safe play.</p><p className="font-black">Bet: Wyndham Clark to win The Open at +4100.</p></section>

        <section className={sectionClass}><h2 className={headingClass}>Top 10 pick</h2><h3 className={subheadingClass}>Tommy Fleetwood — Top 10 at +160</h3><p className={paragraphClass}>Fleetwood ranks No. 4 overall and No. 6 in JKB Trend, grades near the top around the green and has recent finishes of T13, T11, T11 and T4. He grew up in Southport and owns a runner-up Open finish with seven made cuts in nine starts.</p><p className="font-black">Bet: Tommy Fleetwood Top 10 at +160.</p></section>

        <section className={sectionClass}><h2 className={headingClass}>Top 20 picks</h2><h3 className={subheadingClass}>Xander Schauffele — Top 20 at +106</h3><p className={paragraphClass}>Schauffele has made the cut in all eight career Open starts and won the 2024 championship. His current Trend is cooler than his long-term profile, which makes the floor-oriented Top 20 market a better fit than an outright.</p><p className="font-black">Bet: Xander Schauffele Top 20 at +106.</p><h3 className={subheadingClass}>Robert MacIntyre — Top 20 at +138</h3><p className={paragraphClass}>MacIntyre brings links experience, six straight made cuts and a best Open finish of sixth. His short game and comfort in wind and firm turf make him a strong fit for a high-floor placement bet.</p><p className="font-black">Bet: Robert MacIntyre Top 20 at +138.</p></section>

        <section className={sectionClass}><h2 className={headingClass}>Make the Cut pick</h2><h3 className={subheadingClass}>Justin Thomas — Make Cut at −260</h3><p className={paragraphClass}>Thomas has made the cut in each of his last eight measured starts and in every major played in 2026. He also grades well around the green and owns six made cuts in nine Open starts. His Top 20 at +178 is the higher-upside alternative.</p><p className="font-black">Bet: Justin Thomas to make the cut at −260.</p></section>

        <section className={sectionClass}><h2 className={headingClass}>Bets considered but passed</h2><ul className="list-disc space-y-3 pl-6 leading-7 text-slate-700"><li><strong>Scottie Scheffler +620:</strong> Elite profile, but the outright price offers no value.</li><li><strong>Collin Morikawa +3400:</strong> Excellent approach play, but recent Trend and Open cut history are weaker.</li><li><strong>Sam Burns:</strong> Strong floor, but limited Open history support.</li><li><strong>Rickie Fowler:</strong> Strong career Open cut record, but poor current form.</li><li><strong>Bryson DeChambeau, Jon Rahm and other LIV names:</strong> Not tracked in the model's strokes-gained data, so they were passed rather than guessed at.</li></ul></section>

        <section className={sectionClass}><h2 className={headingClass}>Final betting card</h2><OddsTable final /></section>
        <section className={sectionClass}><h2 className={headingClass}>Responsible wagering note</h2><p className={paragraphClass}>Odds move constantly. Compare prices across regulated books and wager only what you can afford to lose. If gambling is affecting you or someone you know, call 1-800-GAMBLER.</p></section>
      </article>
      <div className="mt-8 rounded-xl bg-slate-900 p-5 text-sm leading-6 text-slate-100"><strong className="block text-white">Sportsbook odds disclaimer</strong>{disclaimer}</div>
      <div className="mt-8 flex flex-wrap gap-3"><Link to="/pga/model" className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-black text-white">View PGA Model</Link><Link to="/pga" className="rounded-full bg-slate-200 px-5 py-2.5 text-sm font-black text-slate-800">Back to PGA</Link></div>
    </div>
  </main></SiteShell>;
}
