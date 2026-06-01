import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { CANONICAL_BASE, usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import SiteFooter from "@/components/layout/SiteFooter";

const sports = [
  {
    id: "mlb",
    name: "MLB",
    route: "/mlb",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  },
  {
    id: "ncaa",
    name: "NCAA",
    route: "/ncaa",
    logo: "https://cdn.worldvectorlogo.com/logos/ncaa-4.svg",
  },
  {
    id: "nfl",
    name: "NFL",
    route: "/nfl",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
    locked: true,
  },
  {
    id: "nba",
    name: "NBA",
    route: "/nba",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
    locked: true,
  },
  {
    id: "pga",
    name: "PGA",
    route: "/pga",
    logo: "/logos/pga.svg",
  },
  {
    id: "world-cup",
    name: "World Cup",
    route: "/world-cup",
    logo: "/logos/wc2026-logo.png",
  },
] as const;

const navItems = [
  { label: "Home", route: "/" },
  { label: "MLB", route: "/mlb" },
  { label: "NCAA", route: "/ncaa" },
  { label: "NFL", route: "/nfl" },
  { label: "NBA", route: "/nba" },
  { label: "PGA", route: "/pga" },
] as const;

type PgaTournament = { name: string; shortName?: string; slug: string; status: string; startDate: string; endDate?: string };

function useFeaturedPgaTournament() {
  const [tournament, setTournament] = useState<PgaTournament | null>(null);

  useEffect(() => {
    fetch("/data/pga/schedule.json")
      .then((r) => r.json())
      .then((schedule: PgaTournament[]) => {
        const today = new Date().toISOString().slice(0, 10);
        // Priority 1: active
        let found = schedule.find((t) => t.status === "active");
        // Priority 2: currently in-window (started but not ended)
        if (!found) found = schedule.find((t) => t.startDate <= today && (!t.endDate || t.endDate >= today));
        // Priority 3: soonest upcoming
        if (!found) found = schedule.filter((t) => t.status === "upcoming" || t.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
        if (found) setTournament(found);
      })
      .catch(() => {});
  }, []);

  return tournament;
}

function buildFeaturedCards(pgaTournament: PgaTournament | null) {
  const pgaName   = pgaTournament?.shortName ?? pgaTournament?.name ?? "Featured Tournament";
  const pgaSlug   = pgaTournament?.slug ?? "";

  return [
    {
      title: "HR Props Dashboard",
      description: "Today's top home run edges ranked by park context, pitcher vulnerability, barrel rate, and hard-hit profile.",
      route: "/mlb/hr-props",
      eyebrow: "MLB",
      asset: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
      cta: "Open dashboard",
      accent: "#0f3b82",
      tone: "primary" as const,
    },
    {
      title: "MLB Matchup Analyzer",
      description: "Starting pitchers, team context, park factors, and full game matchup detail built for the current slate.",
      route: "/mlb",
      eyebrow: "MLB",
      asset: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
      cta: "View matchups",
      accent: "#153e75",
      tone: "primary" as const,
    },
    {
      title: "K Props Model",
      description: "Strikeout prop rankings for today's probable starters built from whiff rate, opponent K tendency, and park context.",
      route: "/mlb/strikeout-props",
      eyebrow: "MLB",
      asset: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
      cta: "View model",
      accent: "#047857",
      tone: "secondary" as const,
    },
    {
      title: "Hit Props Model",
      description: "Top batter vs pitcher matchups ranked by xBA, hard-hit rate, barrel rate, and pitcher hit vulnerability.",
      route: "/mlb/batter-vs-pitcher",
      eyebrow: "MLB",
      asset: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
      cta: "View matchups",
      accent: "#6d28d9",
      tone: "secondary" as const,
    },
    {
      title: `${pgaName} — Golf Model`,
      description: "Weighted player rankings for this week's PGA tournament. Adjust stat weights and switch between Balanced, Outright, and Top 20 presets.",
      route: pgaSlug ? `/pga/${pgaSlug}/model` : "/pga",
      eyebrow: "PGA Tour",
      asset: "/logos/pga.svg",
      cta: "Open model",
      accent: "#0f5132",
      tone: "primary" as const,
    },
    {
      title: `${pgaName} — Best Bets`,
      description: "Outright, Top 5, Top 10, and Top 20 picks for this week's tournament based on course fit and model edge.",
      route: pgaSlug ? `/pga/${pgaSlug}/picks` : "/pga",
      eyebrow: "PGA Tour",
      asset: "/logos/pga.svg",
      cta: "View picks",
      accent: "#3b6934",
      tone: "secondary" as const,
    },
  ];
}

function SportCard({
  locked = false,
  logo,
  name,
  route,
  darkBg = false,
}: {
  locked?: boolean;
  logo: string;
  name: string;
  route: string;
  darkBg?: boolean;
}) {
  const cardClassName = `flex w-full max-w-[160px] flex-col items-center rounded-[14px] border border-black/8 bg-white px-4 py-5 text-center no-underline shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none ${
    locked
      ? "cursor-default opacity-80"
      : "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
  }`;

  const cardContent = (
    <>
      <div className={`flex h-[84px] w-full items-center justify-center rounded-[8px] ${darkBg ? "bg-black" : ""}`}>
        <img
          src={logo}
          alt={`${name} logo`}
          className="max-h-[72px] w-auto object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.nextElementSibling as HTMLDivElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div
          style={{ display: "none" }}
          className="hidden h-[72px] items-center justify-center text-[24px] font-bold tracking-[0.02em] text-[#111111]"
        >
          {name}
        </div>
      </div>

      <span className="mt-3 text-[16px] font-bold text-[#111111]">{name}</span>
      <span className="mt-2 text-[12px] font-semibold text-[#111111]">
        {locked ? "Subscription Required" : "Open"}
      </span>
    </>
  );

  if (locked) {
    return (
      <div
        aria-disabled="true"
        className={cardClassName}
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      to={route}
      className={cardClassName}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}
    >
      {cardContent}
    </Link>
  );
}

function FeaturedContentCard({
  asset,
  cta,
  description,
  eyebrow,
  route,
  title,
  accent,
  tone,
}: {
  asset: string;
  cta: string;
  description: string;
  eyebrow: string;
  route: string;
  title: string;
  accent: string;
  tone: "primary" | "secondary";
}) {
  const primary = tone === "primary";
  const cardClassName = `group relative overflow-hidden rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)] ${primary ? "xl:col-span-2" : ""}`;

  const content = (
    <>
      <div className="absolute inset-x-0 top-0 h-[4px]" style={{ background: accent }} />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b6472]">{eyebrow}</div>
            <h3 className="mt-3 text-[20px] font-bold leading-tight text-[#111111]">{title}</h3>
          </div>
          <div
            className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-[18px] border border-black/6 bg-[#f7f9fc]"
            style={{ boxShadow: `inset 0 0 0 1px ${accent}1a` }}
          >
            <img src={asset} alt="" className="max-h-[34px] w-auto object-contain" />
          </div>
        </div>
        <p className="mt-4 max-w-[52ch] text-[14px] leading-6 text-[#4b5563]">{description}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ backgroundColor: `${accent}14`, color: accent }}
          >
            Latest Analysis
          </span>
          <span className="text-[13px] font-semibold text-[#111111]">{cta} →</span>
        </div>
      </div>
    </>
  );

  return (
    <Link to={route} className={cardClassName}>
      {content}
    </Link>
  );
}

export default function Home() {
  const seo = getSeoMeta("home");
  const pgaTournament = useFeaturedPgaTournament();
  const featuredCards = buildFeaturedCards(pgaTournament);

  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Joe Knows Ball",
      url: CANONICAL_BASE,
      potentialAction: {
        "@type": "SearchAction",
        target: `${CANONICAL_BASE}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  });

  return (
    <main className="min-h-screen bg-[#f8f8f8]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
      <header className="w-full bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="site-logo-link">
            <img
              src="/images/jkb-icon-trimmed.png"
              alt="Joe Knows Ball icon"
              className="site-logo-img"
            />
            <span className="site-logo-text">Joe Knows Ball</span>
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            {navItems.map((item) => (
              <Link key={item.label} to={item.route} className="text-[15px] font-normal text-[#111111] no-underline">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage: "url('/images/Gemini_Generated_Image_r6ys4br6ys4br6ys.png')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.55)]" />

        <div className="relative mx-auto flex min-h-[calc(100vh-72px)] max-w-[1280px] items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="w-full max-w-[920px]">
            <div className="mx-auto flex max-w-[820px] flex-col items-center gap-5 text-center">
              <h1 className="text-[22px] font-bold text-white sm:text-[28px]">Select a League</h1>
              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {sports.map((sport) => (
                  <SportCard
                    key={sport.id}
                    locked={Boolean("locked" in sport && sport.locked)}
                    logo={sport.logo}
                    name={sport.name}
                    route={sport.route}
                    darkBg={sport.id === "world-cup"}
                  />
                ))}
              </div>
              <section className="mt-4 w-full rounded-[18px] border border-white/15 bg-white/8 px-4 py-5 backdrop-blur-sm sm:px-5">
                <h2 className="text-base font-bold text-white sm:text-lg">What You Get at Joe Knows Ball</h2>
                <div className="mt-4 grid gap-3 text-left md:grid-cols-3">
                  <div className="rounded-[14px] border border-white/12 bg-white/8 p-4">
                    <div aria-hidden="true" className="text-lg">⛳</div>
                    <div className="mt-2 text-sm font-bold text-white">Course-Weighted Golf Models</div>
                    <p className="mt-1 text-sm leading-6 text-white/80">
                      Every PGA tournament gets its own player rankings built from real course stats, strokes gained data, and adjustable weights you control.
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-white/12 bg-white/8 p-4">
                    <div aria-hidden="true" className="text-lg">⚾</div>
                    <div className="mt-2 text-sm font-bold text-white">MLB Matchup Intelligence</div>
                    <p className="mt-1 text-sm leading-6 text-white/80">
                      Pitcher-vs-lineup breakdowns, park factors, team form, and run total context for every game on the slate.
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-white/12 bg-white/8 p-4">
                    <div aria-hidden="true" className="text-lg">📈</div>
                    <div className="mt-2 text-sm font-bold text-white">DFS Value Finder</div>
                    <p className="mt-1 text-sm leading-6 text-white/80">
                      Upload your DraftKings or FanDuel salary sheet and instantly see which players are undervalued or overpriced against our model rankings.
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/68">Free. No account required. Built by someone who actually bets.</p>
              </section>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-black/6 bg-[#f8f8f8]">
        <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-[760px]">
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5b6472]">Featured Today</div>
            <h2 className="mt-3 text-[30px] font-bold tracking-[-0.03em] text-[#111111] sm:text-[34px]">
              Models & Picks
            </h2>
            <p className="mt-3 max-w-[62ch] text-[15px] leading-7 text-[#4b5563]">
              Jump straight into the latest MLB dashboards and PGA golf models. Links update automatically as new tournaments and slates go live.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {featuredCards.map((item) => (
              <FeaturedContentCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
