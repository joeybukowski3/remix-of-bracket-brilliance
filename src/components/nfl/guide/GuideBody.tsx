import { GuideSectionHeading } from "@/components/nfl/guide/GuideAtoms";
import { GuideDivisionSection } from "@/components/nfl/guide/GuideDivisionSection";
import { GuideHeader } from "@/components/nfl/guide/GuideHeader";
import { GuideLeagueOverview } from "@/components/nfl/guide/GuideLeagueOverview";
import { NFL_GUIDE_CONFERENCES } from "@/lib/nfl/guideRecord";

export type GuideVariant = "live" | "print";

function ConferenceNav() {
  return (
    <nav data-print-hidden aria-label="Conference and division navigation" className="border-y border-slate-200 py-2">
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {NFL_GUIDE_CONFERENCES.map(({ conference, divisions }) => (
          <li key={conference} className="flex flex-wrap items-center gap-1">
            <span className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-700">
              {conference}
            </span>
            {divisions.map(({ division }) => (
              <a
                key={division}
                href={`#division-${division.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-sm border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-700 transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
              >
                {division.replace(`${conference} `, "")}
              </a>
            ))}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The complete guide. Rendered by both `/nfl/guide` and the print view at
 * `/nfl-guide/`, so the two can never drift apart in content.
 */
export function GuideBody({ variant }: { variant: GuideVariant }) {
  return (
    <div className="space-y-6">
      <GuideHeader variant={variant} />
      {variant === "live" ? <ConferenceNav /> : null}
      <GuideLeagueOverview />

      {NFL_GUIDE_CONFERENCES.map(({ conference, divisions }) => (
        <section key={conference} className="guide-conference space-y-5">
          <GuideSectionHeading
            eyebrow={`${conference} · ${divisions.length} divisions`}
            title={conference === "AFC" ? "American Football Conference" : "National Football Conference"}
          />
          {divisions.map((division) => (
            <GuideDivisionSection key={division.division} division={division} />
          ))}
        </section>
      ))}

      <footer className="break-inside-avoid border-t-2 border-slate-900 pt-3 text-[10px] leading-4 text-slate-600">
        <p className="font-black uppercase tracking-wider text-slate-900">Methodology &amp; attribution</p>
        <p className="mt-1">
          Power ratings are JoeKnowsBall model output (nfl-power-v0.3.0) derived from completed regular-season
          results and nflverse team statistics. Win totals and futures are market prices as published in the
          2026 VSiN NFL Betting Guide. Schedule and rest figures are from Warren Sharp&apos;s 2026 Football
          Preview, with ranks as published. Coaching and player movement are compiled from public transaction
          reporting. Reference statistics describe the completed 2025 season.
        </p>
        <p className="mt-1">
          This guide is original JoeKnowsBall analysis and does not reproduce third-party written analysis,
          rankings or page designs. Model output is published for review and is not betting advice.
        </p>
      </footer>
    </div>
  );
}
