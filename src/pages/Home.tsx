import { Link } from "react-router-dom";
import HomeHeroBackdrop from "@/components/home/HomeHeroBackdrop";
import HomeSportCard from "@/components/home/HomeSportCard";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { FEATURED_PGA_TOURNAMENT } from "@/lib/pga/tournaments";
import { getTournamentPicksPath } from "@/lib/pga/tournamentConfig";

const featuredTournamentPath = getTournamentPicksPath(FEATURED_PGA_TOURNAMENT);

const sports = [
  {
    id: "mlb",
    label: "MLB",
    route: "/mlb",
    active: true,
    external: true,
    logoSrc: "/logos/mlb.svg",
    desc: "Game analysis, player prop insights, and advanced metrics.",
  },
  {
    id: "ncaa",
    label: "NCAA",
    route: "/ncaa",
    active: true,
    logoSrc: "/logos/ncaa.svg",
    desc: "Tournament brackets, power rankings, and matchup data.",
  },
  {
    id: "nfl",
    label: "NFL",
    route: "/nfl",
    active: true,
    logoSrc: "/logos/nfl.svg",
    desc: "Weekly game picks, line movement analysis, and DFS projections.",
  },
  {
    id: "nba",
    label: "NBA",
    route: null,
    active: false,
    logoSrc: "/logos/nba.png",
    desc: "Player efficiency ratings, lineup analysis, and pace breakdown.",
  },
  {
    id: "pga",
    label: "PGA",
    route: featuredTournamentPath,
    active: true,
    logoSrc: "/logos/pga.svg",
    desc: "Tournament picks, model analysis, and golf betting tools.",
  },
] as const;

export default function Home() {
  usePageSeo({
    title: "Joe Knows Ball | Sports Analytics, Picks, Models, and Matchup Tools",
    description:
      "Joe Knows Ball features advanced sports analytics tools across MLB, NCAA, NFL, NBA, and PGA for smarter, faster betting decisions.",
    path: "/",
  });

  return (
    <SiteShell>
      <main className="relative isolate overflow-hidden bg-[#191b1d]">
        <HomeHeroBackdrop />

        <div className="relative mx-auto flex min-h-[calc(100vh-76px)] max-w-[1280px] flex-col px-4 pb-16 pt-14 sm:px-6 lg:px-8">
          <section className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col items-center">
            <div className="mt-8 text-center sm:mt-12 lg:mt-[72px]">
              <h1 className="text-[42px] font-bold leading-[0.98] tracking-[-0.045em] text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)] sm:text-[54px] lg:text-[60px]">
                Advanced Sports Analytics
              </h1>
              <p className="mx-auto mt-4 max-w-[760px] text-[20px] font-normal leading-[1.45] text-white/90 sm:text-[22px]">
                Data-driven insights and tools for informed decision-making
              </p>
            </div>

            <div className="mt-12 grid w-full gap-5 md:grid-cols-2 xl:mt-16 xl:grid-cols-5">
              {sports.map((sport) => (
                <HomeSportCard
                  key={sport.id}
                  active={sport.active}
                  desc={sport.desc}
                  external={"external" in sport && Boolean(sport.external)}
                  label={sport.label}
                  logoSrc={sport.logoSrc}
                  route={sport.route}
                />
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 xl:mt-10">
              <Link
                to={featuredTournamentPath}
                className="inline-flex items-center rounded-full border border-white/18 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/16"
              >
                Latest tournament picks
              </Link>
              <Link
                to="/pga/top-40-golf-picks"
                className="inline-flex items-center rounded-full border border-white/18 bg-transparent px-5 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10"
              >
                Top 40 golf picks
              </Link>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
