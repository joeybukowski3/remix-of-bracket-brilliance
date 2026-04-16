import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SeoJsonLd from "@/components/seo/SeoJsonLd";
import { usePageSeo } from "@/hooks/usePageSeo";
import { FEATURED_PGA_TOURNAMENT } from "@/lib/pga/tournaments";
import { getTournamentModelPath } from "@/lib/pga/tournamentConfig";
import { buildArticleSchema, buildBreadcrumbSchema, buildFaqSchema, CURRENT_TOURNAMENT_PATH } from "@/lib/seo/pgaSeo";

const top40Rows = [
  ["Collin Morikawa", "Elite SG: Approach plus a stable cut-making profile keeps his floor among the strongest on the board."],
  ["Patrick Cantlay", "Course history, consistency, and all-around control make him one of the safest golf bets today."],
  ["Matt Fitzpatrick", "Accuracy, short game, and a dependable scoring floor fit Top 40 markets better than outright-only structures."],
  ["Xander Schauffele", "Balanced metrics and a very low missed-cut rate keep him near the top of the high-floor pool."],
  ["Tommy Fleetwood", "Low-volatility ball-striking and clean course-fit signals make him a natural parlay anchor."],
  ["Corey Conners", "One of the most repeatable ball-strikers on TOUR, which matters more than volatility for Top 40 bets."],
  ["Russell Henley", "Accuracy and approach create the kind of profile that survives tougher scoring weeks."],
  ["Shane Lowry", "Strong tee-to-green floor and enough short-game support to avoid blow-up rounds."],
  ["Si Woo Kim", "Reliable iron play and enough event-specific fit to project as a safer mid-board option."],
  ["Daniel Berger", "Steady recent form and strong course-history signals keep him viable for parlays."],
  ["Sepp Straka", "Controlled driving and solid approach numbers keep his floor more stable than the market implies."],
  ["Sungjae Im", "Balanced skill set and a dependable made-cut baseline make him useful in conservative betting structures."],
] as const;

const featuredModelPath = getTournamentModelPath(FEATURED_PGA_TOURNAMENT);

const faqEntries = [
  {
    question: "What are the safest golf bets today?",
    answer:
      "Top 40 golf bets are usually the safest PGA betting structure because they rely more on consistency and cut-making than true contention.",
  },
  {
    question: "What makes a golfer good for Top 40 parlays?",
    answer:
      "The best Top 40 parlay golfers combine course fit, steady recent form, accurate driving or strong approach play, and low missed-cut risk.",
  },
  {
    question: "How often should Top 40 golf picks be updated?",
    answer:
      "This page should be updated weekly so the player pool, course fit, and current tournament links stay aligned with the active PGA event.",
  },
] as const;

export default function PGATop40Picks() {
  usePageSeo({
    title: "Top 40 Golf Picks Today (PGA Model)",
    description: "Top 40 golf picks today, safe golf bets, and golf parlay targets built from a data-driven PGA model focused on consistency and course fit.",
    path: "/pga/top-40-golf-picks",
    type: "article",
  });

  const dateModified = "2026-04-14";

  return (
    <SiteShell>
      <SeoJsonLd
        id="top-40-golf-picks-schema"
        data={[
          buildArticleSchema({
            headline: "Top 40 Golf Picks Today (PGA Model)",
            description: "Top 40 golf picks today, safe golf bets, and golf parlay targets built from a data-driven PGA model.",
            path: "/pga/top-40-golf-picks",
            dateModified,
          }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "PGA", path: CURRENT_TOURNAMENT_PATH },
            { name: "Top 40 Golf Picks Today", path: "/pga/top-40-golf-picks" },
          ]),
          buildFaqSchema(faqEntries),
        ]}
      />

      <main className="site-page pb-16 pt-10">
        <div className="site-container site-stack">
          <section className="surface-card md:p-10">
            <div className="eyebrow-label">Evergreen PGA SEO</div>
            <h1 className="page-title mt-4">Top 40 Golf Picks Today (PGA Model)</h1>
            <p className="page-copy mt-5 max-w-3xl">
              Looking for the safest golf bets today? These Top 40 picks are generated from a data-driven PGA model focusing on consistency, course fit, and long-term performance.
            </p>
            <div className="mt-7 flex flex-wrap gap-4">
              <Link to={CURRENT_TOURNAMENT_PATH} className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
                latest tournament picks
              </Link>
              <Link to={featuredModelPath} className="inline-flex items-center rounded-xl bg-secondary px-5 py-3 text-sm font-medium text-foreground transition hover:bg-accent">
                golf betting model
              </Link>
            </div>
          </section>

          <section className="surface-card">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">High-Floor Top 40 Targets</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              Updated weekly, this board prioritizes the golfers most likely to finish inside the Top 40 without needing an outright ceiling week.
            </p>
            <div className="mt-5 overflow-hidden rounded-[24px] bg-card shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-secondary/65">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Why They're Safe</th>
                  </tr>
                </thead>
                <tbody>
                  {top40Rows.map((row, index) => (
                    <tr key={row[0]} className={`border-t border-border/60 first:border-t-0 ${index % 2 === 0 ? "bg-card" : "bg-secondary/30"}`}>
                      <td className="px-4 py-4 font-semibold text-foreground">{row[0]}</td>
                      <td className="px-4 py-4 text-muted-foreground">{row[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-card">
            <div className="eyebrow-label mb-3">Parlay Strategy</div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">How to Build Golf Parlays</h2>
            <div className="mt-5 grid gap-3">
              {[
                "Combine high-floor players instead of stacking only volatile top-end outrights.",
                "Avoid volatile players whose missed-cut risk is too high for multi-leg tickets.",
                "Focus on course history, accuracy, and approach play when choosing parlay anchors.",
                "Use model rankings instead of public perception when narrowing the safest golf bets.",
              ].map((item) => (
                <div key={item} className="surface-card-muted text-sm leading-7 text-muted-foreground">{item}</div>
              ))}
            </div>
          </section>

          <section className="surface-card">
            <div className="eyebrow-label mb-3">FAQ</div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Top 40 Golf Betting FAQ</h2>
            <div className="mt-5 grid gap-3">
              {faqEntries.map((entry) => (
                <div key={entry.question} className="surface-card-muted">
                  <h3 className="text-base font-semibold text-foreground">{entry.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{entry.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
