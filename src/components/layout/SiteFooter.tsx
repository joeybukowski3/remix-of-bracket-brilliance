import { Link } from "react-router-dom";
import { SPORTSBOOKS } from "@/lib/sportsbooks";

const SECTIONS = [
  {
    label: "MLB",
    emoji: "⚾",
    links: [
      { label: "Game Matchups",       to: "/mlb" },
      { label: "HR Props Dashboard",  to: "/mlb/hr-props" },
      { label: "K Props Model",       to: "/mlb/strikeout-props" },
      { label: "Hit Props Model",     to: "/mlb/batter-vs-pitcher" },
    ],
  },
  {
    label: "NCAA",
    emoji: "🏀",
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
    emoji: "⛳",
    links: [
      { label: "PGA Hub",           to: "/pga" },
      { label: "Tournament Model",  to: "/pga/model" },
      { label: "Best Bets",         to: "/pga/best-bets" },
      { label: "Custom Model",      to: "/pga/custom" },
      { label: "DFS Optimizer",     to: "/pga/dfs" },
    ],
  },
  {
    label: "NFL",
    emoji: "🏈",
    links: [
      { label: "NFL Guide", to: "/nfl" },
    ],
  },
  {
    label: "NBA",
    emoji: "🏀",
    links: [
      { label: "NBA Hub", to: "/nba", soon: true },
    ],
  },
  {
    label: "Site",
    emoji: "🔗",
    links: [
      { label: "Home",             to: "/" },
      { label: "Support the Site", to: "/donate" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#080e1a] text-slate-400">
      <div className="mx-auto max-w-[1280px] px-4 py-14 sm:px-6 lg:px-8">

        {/* Top: brand + sitemap */}
        <div className="grid gap-12 lg:grid-cols-[240px_1fr]">

          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2.5 no-underline">
              <img src="/images/jkb-icon-trimmed.png" alt="Joe Knows Ball" className="h-8 w-auto" />
              <span className="text-[17px] font-bold text-white">Joe Knows Ball</span>
            </Link>
            <p className="text-[13px] leading-6 text-slate-500">
              Free sports analytics — MLB matchup intelligence, PGA golf models, and NCAA bracket tools. No account required.
            </p>
            <p className="text-[11px] italic text-slate-600">Built by someone who actually bets.</p>
          </div>

          {/* Sitemap grid */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
            {SECTIONS.map((section) => (
              <div key={section.label}>
                <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">
                  <span>{section.emoji}</span>
                  <span>{section.label}</span>
                </div>
                <ul className="space-y-2">
                  {section.links.map((link) => (
                    <li key={link.to}>
                      {"soon" in link && link.soon ? (
                        <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
                          {link.label}
                          <span className="rounded bg-slate-700/60 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Soon</span>
                        </span>
                      ) : (
                        <Link
                          to={link.to}
                          className="text-[12px] text-slate-500 no-underline transition-colors hover:text-slate-200"
                        >
                          {link.label}
                        </Link>
                      )}
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
            Bet with our partners — use these links to support the site
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
          <span>© {new Date().getFullYear()} Joe Knows Ball · All rights reserved.</span>
          <span>Must be 21+ to gamble · Problem? Call <strong className="text-slate-500">1-800-GAMBLER</strong></span>
        </div>

      </div>
    </footer>
  );
}
