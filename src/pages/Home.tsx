import { ArrowRight, Lock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
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
    tone: "primary",
    desc: "HR prop analyzer, daily slate matchups, and Statcast-powered recommendations.",
  },
  {
    id: "ncaa",
    label: "NCAA Basketball",
    route: "/ncaa",
    active: true,
    logoSrc: "/logos/ncaa.svg",
    tone: "primary",
    desc: "Custom power rankings, matchup analysis, and March Madness bracket tools.",
  },
  {
    id: "nfl",
    label: "NFL",
    route: "/nfl",
    active: true,
    logoSrc: "/logos/nfl.svg",
    tone: "primary",
    desc: "Game analysis, line movement, player props, and weekly picks.",
  },
  {
    id: "nba",
    label: "NBA",
    route: null,
    active: false,
    logoSrc: "/logos/nba.png",
    tone: "muted",
    desc: "Player prop tools, pace and efficiency breakdowns, and DFS lineup edge.",
  },
  {
    id: "pga",
    label: "PGA Picks",
    route: featuredTournamentPath,
    active: true,
    logoSrc: "/logos/pga.svg",
    tone: "success",
    desc: "Latest tournament picks, Top 40 golf picks, golf betting model analysis, and weekly PGA best bets.",
  },
] as const;

function logoTone(tone: (typeof sports)[number]["tone"]) {
  if (tone === "success") return "bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]";
  if (tone === "muted") return "bg-secondary text-muted-foreground";
  return "bg-primary/10 text-primary";
}

function badgeTone(active: boolean) {
  return active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground";
}

export default function Home() {
  const navigate = useNavigate();

  usePageSeo({
    title: "Joe Knows Ball | Sports Analytics, Picks, Models, and Matchup Tools",
    description:
      "Joe Knows Ball features NCAA, MLB, and PGA tools with matchup analysis, rankings, tournament picks, and model-driven betting workflows.",
    path: "/",
  });

  return (
    <SiteShell>
      <main className="site-page pb-16 pt-10">
        <div className="site-container site-stack">
          <section className="surface-card md:p-8">
            <div className="max-w-4xl">
              <div className="eyebrow-label">Pick Your Sport</div>
              <h1 className="page-title mt-4 max-w-3xl">
                Betting tools built for <span className="text-primary">clearer decisions</span>.
              </h1>
              <p className="page-copy mt-5 max-w-3xl">
                Jump into sport-specific dashboards for prop analysis, matchup tools, rankings, projections, and workflow
                advantages that make slate review faster.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to={featuredTournamentPath} className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
                  latest tournament picks
                </Link>
                <Link to="/pga/top-40-golf-picks" className="inline-flex items-center rounded-xl bg-secondary px-5 py-3 text-sm font-medium text-foreground transition hover:bg-accent">
                  Top 40 golf picks
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sports.map((sport) => (
              <button
                key={sport.id}
                type="button"
                onClick={() => {
                  if (!sport.active || !sport.route) return;
                  if ("external" in sport && sport.external) {
                    window.location.href = sport.route;
                    return;
                  }
                  navigate(sport.route);
                }}
                className={`surface-card relative flex min-h-[280px] flex-col items-start gap-4 text-left transition ${
                  sport.active ? "hover:-translate-y-0.5 hover:shadow-[0_22px_48px_hsl(var(--foreground)/0.08)]" : "cursor-default opacity-75"
                }`}
              >
                {!sport.active ? <Lock className="absolute right-5 top-5 h-4 w-4 text-muted-foreground" /> : null}

                <div className={`flex h-20 w-20 items-center justify-center rounded-[24px] ${logoTone(sport.tone)}`}>
                  <img src={sport.logoSrc} alt={`${sport.label} logo`} className="h-12 w-12 object-contain" />
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">{sport.label}</h2>
                  <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${badgeTone(sport.active)}`}>
                    {sport.active ? "Available Now" : "Subscription Required"}
                  </span>
                  <p className="page-copy text-sm">{sport.desc}</p>
                </div>

                <div className={`mt-auto inline-flex items-center gap-2 text-sm font-medium ${sport.active ? "text-foreground" : "text-muted-foreground"}`}>
                  {sport.active ? "Open tools" : "Locked"}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            ))}
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
