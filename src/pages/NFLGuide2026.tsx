import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflGuideNav from "@/components/nfl/NflGuideNav";
import { GuideBody } from "@/components/nfl/guide/GuideBody";
import { usePageSeo } from "@/hooks/usePageSeo";
import { NFL_GUIDE_SEASON } from "@/lib/nfl/guideRecord";

export default function NFLGuide2026() {
  usePageSeo({
    title: `${NFL_GUIDE_SEASON} NFL Guide: Power Ratings, Win Totals & Team Previews | Joe Knows Ball`,
    description: `The ${NFL_GUIDE_SEASON} JoeKnowsBall NFL Guide: power ratings for all 32 teams, market win totals and futures, schedule and rest context, coaching changes and reference statistics, organised by conference and division.`,
    path: "/nfl/guide",
  });

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-50 pb-16">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
          <div data-print-hidden className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <NflGuideNav />
            <Link
              to="/nfl-guide/"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
            >
              Print edition →
            </Link>
          </div>
          <GuideBody variant="live" />
        </div>
      </main>
    </SiteShell>
  );
}
