import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";

const sports = [
  {
    id: "mlb",
    name: "MLB",
    route: "/mlb",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
    description: "Game analysis, player prop insights, and advanced metrics.",
  },
  {
    id: "ncaa",
    name: "NCAA",
    route: "/ncaa",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png",
    description: "Tournament brackets, power rankings, and matchup data.",
  },
  {
    id: "nfl",
    name: "NFL",
    route: "/nfl",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
    description: "Weekly game picks, line movement analysis, and DFS projections.",
    featured: true,
  },
  {
    id: "nba",
    name: "NBA",
    route: "/nba",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
    description: "Player efficiency ratings, lineup analysis, and pace breakdown.",
  },
  {
    id: "pga",
    name: "PGA",
    route: "/pga",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/9/9e/PGA_Tour_logo.svg/200px-PGA_Tour_logo.svg.png",
    description: "Tournament picks, model analysis, and golf betting tools.",
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

function SportCard({
  description,
  featured = false,
  logo,
  name,
  route,
}: {
  description: string;
  featured?: boolean;
  logo: string;
  name: string;
  route: string;
}) {
  return (
    <article
      className={`flex w-full max-w-[200px] flex-col rounded-[12px] bg-white px-6 py-7 shadow-[0_4px_20px_rgba(0,0,0,0.12)] max-md:max-w-none ${
        featured ? "min-h-[320px]" : "min-h-[300px]"
      }`}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}
    >
      <div className="flex h-[108px] items-center justify-center">
        <img
          src={logo}
          alt={`${name} logo`}
          className="max-h-[100px] w-auto object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.nextElementSibling as HTMLDivElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div
          style={{ display: "none" }}
          className="hidden h-[100px] items-center justify-center text-[28px] font-bold tracking-[0.02em] text-[#111111]"
        >
          {name}
        </div>
      </div>

      <h2 className="mt-4 text-left text-[18px] font-bold text-[#111111]">{name}</h2>
      <p className="mt-3 text-left text-[13px] leading-[1.5] text-[#555555]">{description}</p>

      <Link to={route} className="mt-auto pt-7 text-left text-[14px] font-semibold text-[#111111] no-underline">
        Explore Tools →
      </Link>
    </article>
  );
}

export default function Home() {
  usePageSeo({
    title: "Joe Knows Ball | Sports Analytics",
    description: "Data-driven insights and tools for informed decision-making.",
    path: "/",
  });

  return (
    <main className="min-h-screen bg-[#f8f8f8]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
      <header className="w-full bg-white">
        <div className="mx-auto flex min-h-[60px] max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-[22px] font-bold text-[#111111] no-underline">
            Joe Knows Ball
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
        className="relative h-[700px] w-full overflow-visible"
        style={{
          backgroundImage: "url('/images/sitebackground1.png')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.55)]" />

        <div className="relative z-10 mx-auto flex h-full max-w-[1280px] flex-col items-center px-4 text-center sm:px-6 lg:px-8">
          <div className="flex h-[38%] w-full flex-col items-center justify-end pt-10">
            <h1 className="text-[36px] font-bold leading-[1.05] text-white sm:text-[44px] lg:text-[52px]">
              Advanced Sports Analytics
            </h1>
            <p className="mt-4 max-w-[760px] text-[16px] font-normal leading-[1.45] text-[rgba(255,255,255,0.85)] lg:text-[18px]">
              Data-driven insights and tools for informed decision-making
            </p>
          </div>

          <div className="relative z-20 mt-10 w-full">
            <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-4 px-4 md:flex-row md:items-stretch md:justify-center md:gap-5 md:px-0">
              {sports.map((sport) => (
                <SportCard
                  key={sport.id}
                  description={sport.description}
                  featured={Boolean("featured" in sport && sport.featured)}
                  logo={sport.logo}
                  name={sport.name}
                  route={sport.route}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="content" className="bg-[#f8f8f8] px-4 pb-[80px] pt-[96px] md:pt-[120px]" />
    </main>
  );
}
