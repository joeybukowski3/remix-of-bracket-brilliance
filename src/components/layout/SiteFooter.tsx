import { Link } from "react-router-dom";
import { SPORTSBOOKS } from "@/lib/sportsbooks";

const SECTIONS = [
  {
    label: "MLB",
    links: [
      { label: "Game Matchups",       to: "/mlb" },
      { label: "HR Props Dashboard",  to: "/mlb/hr-props" },
      { label: "K Props Model",       to: "/mlb/strikeout-props" },
      { label: "Hit Props Model",     to: "/mlb/batter-vs-pitcher" },
    ],
  },
  {
    label: "NCAA",
    links: [
      { label: "Power Rankings",  to: "/ncaa" },
      { label: "Schedule",        to: "/ncaa/schedule" },
      { label: "Matchups",        to: "/ncaa/matchup" },
      { label: "Betting Edge",    to: "/ncaa/betting-edge" },
      { label: "Bracket",         to: "/ncaa/bracket" },
    ],
  },
  {
    label: "PGA Tour",
    links: [
      { label: "PGA Hub",           to: "/pga" },
      { label: "Tournament Model",  to: "/pga/model" },
      { label: "Best Bets",         to: "/pga/best-bets" },
      { label: "DFS Optimizer",     to: "/pga/dfs" },
      { label: "Custom Model",      to: "/pga/custom" },
    ],
  },
  {
    label: "Site",
    links: [
      { label: "Home",              to: "/" },
      { label: "Support the Site",  to: "/donate" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#0b1220] text-slate-400">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8">

        {/* Top: logo + sitemap */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[220px_1fr]">

          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2.5 no-underline">
              <img src="/images/jkb-icon-trimmed.png" alt="Joe Knows Ball" className="h-8 w-auto" />
              <span className="text-[16px] font-bold text-white">Joe Knows Ball</span>
            </Link>
            <p className="text-[13px] leading-6 text-slate-500">
              Free sports analytics — MLB matchup intelligence, PGA golf models, and NCAA bracket tools. No account required.
            </p>
            <p className="text-[11px] text-slate-600">
              Built by someone who actually bets.
            </p>
          </div>

          {/* Sitemap grid */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {SECTIONS.map((section) => (
              <div key={section.label}>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">
                  {section.label}
                </div>
                <ul className="space-y-2">
                  {section.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="text-[13px] text-slate-500 no-underline transition hover:text-slate-200"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="my-10 border-t border-white/5" />

        {/* Partners row */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">
            Bet with our partners
          </div>
          <div className="flex flex-wrap gap-2">
            {SPORTSBOOKS.map((sb) => (
              <a
                key={sb.name}
                href={sb.referralUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition hover:opacity-90"
                style={{ backgroundColor: sb.bgColor, color: sb.textColor }}
              >
                <img
                  src={sb.logoUrl}
                  alt={sb.name}
                  className="h-4 w-4 rounded object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {sb.name}
              </a>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="my-8 border-t border-white/5" />

        {/* Bottom bar */}
        <div className="flex flex-col gap-2 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Joe Knows Ball. All rights reserved.</span>
          <span>Must be 21+ to gamble. Gambling problem? Call <strong className="text-slate-500">1-800-GAMBLER</strong>.</span>
        </div>

      </div>
    </footer>
  );
}
