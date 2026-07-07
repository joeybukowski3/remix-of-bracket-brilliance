import { Link } from "react-router-dom";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

const COY_CASES: Record<string, {
  odds: string;
  title: string;
  intro: string;
  pillars: { title: string; body: string }[];
  against: string[];
}> = {
  no: {
    odds: "+1267",
    title: "Kellen Moore Coach of the Year Case",
    intro: "New Orleans has the cleanest blend of schedule relief, market value, defensive stability and a realistic division path among the current top candidates.",
    pillars: [
      { title: "Favorable schedule environment", body: "The Saints draw one of the easiest customized schedules in the league, including a favorable slate of opposing passing and rushing offenses. The schedule also avoids several difficult rest and travel spots, which should reduce volatility for a team trying to build consistency." },
      { title: "Defensive foundation", body: "New Orleans allowed 27.9 yards per drive and finished seventh in red-zone defense. That gives the team a credible baseline for winning close games even if the offense develops gradually." },
      { title: "Quarterback and personnel upside", body: "Tyler Shough went 5-4 over his final nine starts, while the offense added Travis Etienne, Jordyn Tyson, Noah Fant, Oscar Delp and David Edwards. That creates a plausible path to meaningful improvement without requiring an elite offensive leap." },
      { title: "Award narrative", body: "A move from six wins to nine or ten, paired with an NFC South title or playoff berth, would fit the traditional turnaround profile. The model projects 9.0 wins, which is 1.5 above the 7.5 Vegas total." },
    ],
    against: [
      "Moore is in his second year, so the first-year-coach narrative is absent.",
      "The offense still opens 27th in the model, leaving the case dependent on quarterback growth and defensive consistency.",
      "A nine-win season may need to include a division title to separate Moore from candidates with more dramatic turnarounds.",
    ],
  },
  ind: {
    odds: "+2500",
    title: "Shane Steichen Coach of the Year Case",
    intro: "Indianapolis has the strongest evidence that a playoff-level ceiling already exists, plus one of the more attractive longshot prices among the leading profiles.",
    pillars: [
      { title: "Elite offensive ceiling", body: "Through the first 10 games of 2025, Indianapolis ranked first in EPA per play, success rate, yards per play, points per drive and points per game. The offense averaged 3.17 points per drive and 31.7 points per game during that stretch." },
      { title: "Favorable matchup profile", body: "The customized opponent slate is especially favorable against the run and generally favorable for the offense overall. That suits an attack built around Jonathan Taylor, Daniel Jones and play-action efficiency." },
      { title: "Rebound setup", body: "The Colts lost six one-score games and collapsed after Daniel Jones suffered an Achilles injury. Better health and normal close-game variance could be enough to move an 8-9 team into the playoffs." },
      { title: "Award narrative", body: "The model projects 8.5 wins, only half a win from a typical nine-win playoff range and a full win above the 7.5 Vegas total. If Steichen converts the offensive ceiling into a postseason berth, his candidacy becomes credible quickly." },
    ],
    against: [
      "The model shows only +0.5 wins of year-over-year improvement, which is less dramatic than the other top candidates.",
      "Steichen is entering his fourth year, so the candidacy relies more on playoff achievement than a fresh-coach narrative.",
      "The defense begins outside the top 20 and may limit the team's ceiling if the offense regresses from its early-2025 form.",
    ],
  },
  atl: {
    odds: "+1400",
    title: "Kevin Stefanski Coach of the Year Case",
    intro: "Atlanta offers the strongest coaching-change narrative, a high-end offensive core and a realistic path through an open NFC South.",
    pillars: [
      { title: "Elite skill-position core", body: "Bijan Robinson produced 2,298 yards from scrimmage and ranked near the top of the league in yards after contact, explosive-run rate and missed-tackle avoidance. Drake London and Kyle Pitts give the offense a concentrated group of difference-makers." },
      { title: "Positive regression signals", body: "Atlanta ranked 31st in fumble luck, led during 14 of 17 games and finished the season on a four-game winning streak. Those indicators suggest the 8-9 record understated how competitive the team was." },
      { title: "Coaching fit", body: "Stefanski inherits more offensive talent than he often had in Cleveland and can lean on a run-heavy structure built around Robinson. A quarterback rebound from Tua Tagovailoa or growth from Michael Penix would immediately raise the ceiling." },
      { title: "Award narrative", body: "Atlanta is projected for 8.2 wins, 1.7 above the 6.5 Vegas total. A first-year coach taking the Falcons from 8-9 to a division title would create a strong and easy-to-explain award case." },
    ],
    against: [
      "The model projects only +0.2 wins of year-over-year improvement.",
      "Quarterback consistency remains the main swing factor.",
      "The schedule is in the tougher half, so Atlanta may need to win the division rather than merely finish with a winning record.",
    ],
  },
  cle: {
    odds: "+2200",
    title: "Todd Monken Coach of the Year Case",
    intro: "Cleveland has the strongest defense-and-schedule turnaround profile, with a first-year coach who only needs a functional offense to create a playoff push.",
    pillars: [
      { title: "Elite defensive baseline", body: "Cleveland finished second in total defensive efficiency and EPA allowed per play, second against the pass and fourth against the run. The defense ranked first in yards allowed per drive, third in punts forced per drive, fifth on third down and sixth in the red zone." },
      { title: "Disruptive front", body: "The 2025 defense generated 53 sacks and 117 tackles for loss. That level of disruption gives Monken a unit capable of shortening games and carrying an offense through uneven stretches." },
      { title: "Favorable schedule setup", body: "The Browns draw one of the easiest customized schedules in the league and avoid several major rest disadvantages. The defensive matchup slate is particularly favorable, which should help the team's strongest unit remain dominant." },
      { title: "Award narrative", body: "The model projects 7.8 wins, 2.8 above 2025 and 1.3 above the 6.5 Vegas total. If Monken gets the offense to average and turns a five-win team into an eight- or nine-win playoff contender, the first-year-coach story becomes compelling." },
    ],
    against: [
      "The offense opens 32nd in the model and quarterback uncertainty is substantial.",
      "The Browns still need to outperform the 7.8-win baseline to reach the postseason.",
      "The AFC North path is less forgiving than the NFC South routes available to New Orleans and Atlanta.",
    ],
  },
};

export function getCoachOfYearOdds(abbr: string) {
  return COY_CASES[abbr.toLowerCase()]?.odds ?? null;
}

export default function NflCoachOfYearCase({ team }: { team: NflGuideTeamNormalized }) {
  const profile = COY_CASES[team.abbr];
  if (!profile) return null;

  return (
    <section id="coach-of-year-case" className="scroll-mt-24 overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
      <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Coach of the Year Case</div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">{profile.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{profile.intro}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Current COY odds</div>
            <div className="mt-1 text-2xl font-black text-amber-700">{profile.odds}</div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-5 md:grid-cols-2">
          {profile.pillars.map((pillar) => (
            <article key={pillar.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-black text-slate-900">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{pillar.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="text-[10px] font-black uppercase tracking-wider text-red-700">What could prevent the award</div>
          <div className="mt-3 space-y-3">
            {profile.against.map((item) => (
              <div key={item} className="flex gap-2 text-sm leading-6 text-slate-700">
                <span className="font-black text-red-600">•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/nfl/coach-of-year" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700">Back to Coach of the Year board</Link>
          <a href="#top" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Back to top</a>
        </div>
      </div>
    </section>
  );
}
