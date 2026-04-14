import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SeoJsonLd from "@/components/seo/SeoJsonLd";
import { usePageSeo } from "@/hooks/usePageSeo";
import { buildArticleSchema, buildBreadcrumbSchema, buildFaqSchema, CURRENT_TOURNAMENT_PATH } from "@/lib/seo/pgaSeo";

const top40Rows = [
  ["Collin Morikawa", "Elite SG: Approach plus Harbour Town history creates one of the safest Top 40 floors."],
  ["Patrick Cantlay", "Course history and consistency make him one of the strongest top 40 golf picks today."],
  ["Matt Fitzpatrick", "Strong Harbour Town resume and a reliable short-game profile keep the floor intact."],
  ["Xander Schauffele", "Balanced metrics and low missed-cut risk fit safer golf bets and parlay structures."],
  ["Tommy Fleetwood", "Accurate ball-striking and low volatility keep him in the safer golf bets tier."],
] as const;

const faqEntries = [
  {
    question: "What are the safest golf bets today?",
    answer: "Top 40 golf bets are usually safer than outright or top-10 markets because they reward consistency and cut-making more than spike finishes.",
  },
  {
    question: "What makes a golfer good for Top 40 parlays?",
    answer: "The best Top 40 parlay golfers combine course fit, steady recent form, and low missed-cut risk.",
  },
] as const;

export default function PGATop40Picks() {
  usePageSeo({
    title: "Top 40 Golf Picks Today | Safe Golf Bets & PGA Parlays",
    description: "Top 40 golf picks today, safe golf bets, and high-floor PGA parlay targets. Updated weekly with current tournament links and model-backed players.",
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
            headline: "Top 40 Golf Picks Today | Safe Golf Bets & PGA Parlays",
            description: "Top 40 golf picks today, safe golf bets, and high-floor PGA parlay targets.",
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
            <h1 className="page-title mt-4">Top 40 Golf Picks Today</h1>
            <p className="page-copy mt-5 max-w-3xl">
              Looking for top 40 golf picks today? This evergreen page highlights safe golf bets, high-floor PGA parlay targets, and model-backed names that fit weekly Top 40 betting structures.
            </p>
            <div className="mt-7 flex flex-wrap gap-4">
              <Link to={CURRENT_TOURNAMENT_PATH} className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
                Current Tournament Picks
              </Link>
              <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-secondary px-5 py-3 text-sm font-medium text-foreground transition hover:bg-accent">
                PGA model picks
              </Link>
            </div>
          </section>

          <section className="surface-card">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">High-Floor Top 40 Targets</h2>
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
