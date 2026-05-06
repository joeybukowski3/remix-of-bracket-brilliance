import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";

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
    logo: "/logos/ncaa.svg",
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
  locked = false,
  logo,
  name,
  route,
}: {
  locked?: boolean;
  logo: string;
  name: string;
  route: string;
}) {
  const cardClassName = `flex w-full max-w-[160px] flex-col items-center rounded-[14px] border border-black/8 bg-white px-4 py-5 text-center no-underline shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none ${
    locked
      ? "cursor-default opacity-80"
      : "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
  }`;

  const cardContent = (
    <>
      <div className="flex h-[84px] items-center justify-center">
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

export default function Home() {
  usePageSeo({
    title: "Joe Knows Ball | Sports Analytics",
    description: "Data-driven insights and tools for informed decision-making.",
    path: "/",
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
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
