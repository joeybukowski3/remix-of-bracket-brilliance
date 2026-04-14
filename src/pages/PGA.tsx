import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SeoJsonLd from "@/components/seo/SeoJsonLd";
import { usePageSeo } from "@/hooks/usePageSeo";
import { buildArticleSchema, buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/pgaSeo";
import { rbcHeritage2026Content } from "@/lib/seo/pgaTournamentContent";

const tierOneBets = [
  {
    player: "Collin Morikawa",
    odds: "+176 T10",
    edge: "Edge 16",
    analysis:
      "One of the strongest RBC Heritage 2026 picks on the board. Elite Harbour Town course history, the best SG: Approach profile in the field, and an ideal post-Masters momentum bucket create the clearest value gap.",
  },
  {
    player: "Patrick Cantlay",
    odds: "+188 T10",
    edge: "Edge 14",
    analysis:
      "A top-tier RBC Heritage best bet with 30 rounds of Harbour Town experience and the No. 2 Course SG profile in the field. The approach weakness is offset by short-game strength and elite course fit.",
  },
  {
    player: "Jordan Spieth",
    odds: "+230 T10",
    edge: "Edge 12",
    analysis:
      "Harbour Town course history picks rarely get cleaner than Spieth. He owns a win here, 36 rounds of experience, and the scrambling profile that keeps his floor intact on this layout.",
  },
  {
    player: "Sam Burns",
    odds: "+230 T10",
    edge: "Edge 12",
    analysis:
      "Burns grades as one of the better golf betting model picks this week thanks to strong Harbour Town history, DG Rank No. 15, and a stable momentum profile at a still-reasonable price.",
  },
] as const;

const tierTwoBets = [
  { player: "Daniel Berger", odds: "+500", analysis: "Best long-shot value in the model. Elite Harbour Town history keeps him firmly in the RBC Heritage 2026 picks mix." },
  { player: "Xander Schauffele", odds: "+126", analysis: "Expensive, but still one of the steadier PGA golf best bets today because the profile is balanced across every key stat bucket." },
  { player: "Tommy Fleetwood", odds: "+142", analysis: "Strong fit for Harbour Town and one of the cleaner top 10 golf bets when you want low volatility with real upside." },
  { player: "Si Woo Kim", odds: "+196", analysis: "Elite approach play plus real Harbour Town experience make him one of the better value names for RBC Heritage best bets." },
] as const;

const tierThreeBets = [
  { player: "Ryo Hisatsune", odds: "+500", analysis: "Limited history, but the stat fit is strong enough to keep him in the conversation for higher-upside golf betting model picks." },
  { player: "Matt Fitzpatrick", odds: "+138", analysis: "Elite Harbour Town history and a reliable skill set make him a safer upside play, even if the number is fairly efficient." },
] as const;

const fades = [
  "Russell Henley -> T1-5 Masters group historically underperforms here.",
  "Cameron Young -> Augusta-driven pricing without the same Harbour Town fit.",
  "Jake Knapp -> Worst Course SG profile in the field.",
  "Ludvig Aberg -> Limited Harbour Town sample with a price inflated by talent and ranking.",
] as const;

const summaryRows = [
  ["Morikawa", "+176", "16", "Elite approach + HT history"],
  ["Cantlay", "+188", "14", "Best HT profile"],
  ["Schauffele", "+126", "13", "Balanced elite metrics"],
  ["Fitzpatrick", "+138", "13", "Proven winner here"],
  ["Spieth", "+230", "12", "Course specialist"],
  ["Burns", "+230", "12", "Undervalued HT fit"],
  ["Berger", "+500", "11", "Best long-shot value"],
  ["Si Woo Kim", "+196", "11", "Elite approach + experience"],
] as const;

const top40Rows = [
  ["Collin Morikawa", "Elite SG: Approach plus strong Harbour Town history gives him one of the steadiest floors in the field."],
  ["Patrick Cantlay", "Best-in-field course history with a 2.40 Course SG mark and 30 Harbour Town rounds."],
  ["Matt Fitzpatrick", "Thirty-eight Harbour Town rounds, a win here in 2023, and the accuracy-short game mix this course rewards."],
  ["Xander Schauffele", "Top-tier consistency, low missed-cut risk, and a balanced profile with no obvious weakness."],
  ["Tommy Fleetwood", "Strong Harbour Town history and elite ball-striking create a low-volatility Top 40 profile."],
  ["Jordan Spieth", "Harbour Town specialist whose scrambling and creativity keep the floor high even when the irons cool."],
  ["Russell Henley", "Accuracy and approach remain a clean fit for Harbour Town's tighter setup."],
  ["Corey Conners", "One of the most consistent ball-strikers on TOUR and a natural fit for this type of course test."],
  ["Si Woo Kim", "Thirty Harbour Town rounds, elite approach play, and strong overall course fit."],
  ["Daniel Berger", "Four straight strong finishes here and elite Harbour Town Course SG make him one of the best RBC Heritage parlays anchors."],
] as const;

const overviewBullets = [
  "Recent Form via DG Rank and TrendRank.",
  "Course History at Harbour Town through Course True SG and rounds played.",
  "Key Stat Fit built around approach, accuracy, par-4 scoring, bogey avoidance, and short-game performance.",
  "Every category is normalized across the field and reweighted to match Harbour Town's course profile.",
  "The weighting leans into SG: Approach, Driving Accuracy, Par 4 Scoring, Bogey Avoidance, and short-iron or wedge ranges.",
  "The model also accounts for post-Masters performance trends and Harbour Town experience before producing a composite score.",
  "That output ranks expected performance and highlights betting value versus market odds.",
] as const;

const strategyBullets = [
  "Harbour Town rewards accuracy over distance.",
  "SG: Approach is the most important stat in the model this week.",
  "Players in the Masters T6-15 range have historically performed best here.",
  "Course history matters more here than at most PGA events.",
  "Top 40 bets favor consistency over volatility.",
] as const;

const parlayBullets = [
  "Combine high-floor players in Top 40 markets instead of chasing only top-10 volatility.",
  "Avoid volatile players whose missed-cut risk can ruin a multi-leg ticket early.",
  "Focus on course-fit consistency, especially Harbour Town accuracy and approach signals.",
  "Use model rankings over public perception when choosing parlay anchors.",
] as const;

function SectionCard({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section className="surface-card md:p-8">
      {eyebrow ? <div className="eyebrow-label mb-3">{eyebrow}</div> : null}
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-3xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function PGA() {
  usePageSeo({
    title: rbcHeritage2026Content.title,
    description: rbcHeritage2026Content.description,
    path: rbcHeritage2026Content.path,
    type: "article",
  });

  const dateModified = "2026-04-14";

  return (
    <SiteShell>
      <SeoJsonLd
        id="rbc-heritage-2026-schema"
        data={[
          buildArticleSchema({
            headline: rbcHeritage2026Content.title,
            description: rbcHeritage2026Content.description,
            path: rbcHeritage2026Content.path,
            dateModified,
          }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "PGA Picks", path: rbcHeritage2026Content.path },
          ]),
          buildFaqSchema(rbcHeritage2026Content.faqs),
        ]}
      />
      <main className="site-page pb-16 pt-10">
        <div className="site-container site-stack">
          <section className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div className="surface-card md:p-10">
              <div className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                golf betting model picks
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-foreground md:text-6xl">
                RBC Heritage 2026 Picks &amp; Best Bets
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
                Looking for the best RBC Heritage 2026 picks? This page breaks down top golf bets, top 40 parlay plays, and model-driven insights using course history at Harbour Town, recent form, and key PGA Tour statistics. The goal is to identify high-value players based on how they fit this course - not just market odds.
              </p>
              <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
                These are the RBC Heritage best bets and Harbour Town course history picks the model likes most, with added context for PGA best bets today, golf betting picks today, and safer RBC Heritage parlays.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">View Full Model</Link>
                <a href="#best-bets" className="inline-flex items-center rounded-xl bg-secondary px-5 py-3 text-sm font-medium text-foreground transition hover:bg-accent">View top 10 golf bets</a>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                ["Primary Signals", "Form, Harbour Town course history, and weighted stat fit are the three biggest inputs before price is considered."],
                ["Course Lean", "Harbour Town pushes the model toward approach play, accuracy, par-4 scoring, and bogey control over raw distance."],
                ["Betting Use", "The output is built to compare expected performance against market pricing and isolate mispriced names for RBC Heritage parlays and outright betting."],
              ].map(([title, body]) => (
                <div key={title} className="surface-card-muted">
                  <div className="eyebrow-label text-primary/80">{title}</div>
                  <div className="mt-3 text-sm leading-7 text-muted-foreground">{body}</div>
                </div>
              ))}
            </div>
          </section>

          <SectionCard title="How the Model Works" eyebrow="Model Overview">
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <p className="text-base leading-8 text-muted-foreground">
                This model is built to stay fast and explainable. It ranks the field with a composite score that blends recent form, Harbour Town-specific performance, and the stat profile most likely to translate this week. The goal is not just to predict who plays well, but to spot where the market is underpricing that profile.
              </p>
              <div className="grid gap-3">
                {overviewBullets.map((item) => (
                  <div key={item} className="surface-card-muted text-sm leading-7 text-muted-foreground">{item}</div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top 10 Best Bets" eyebrow="RBC Heritage Best Bets">
            <div id="best-bets" className="space-y-6">
              <p className="max-w-3xl text-base leading-8 text-muted-foreground">These top 10 golf bets are the strongest value plays from the board, balancing price, Harbour Town fit, and recent form.</p>
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="surface-card">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="eyebrow-label text-primary/80">Tier 1</div>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">Strong Model + Sweet Spot Odds</h3>
                    </div>
                    <div className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">Highest-confidence price edges</div>
                  </div>
                  <div className="grid gap-4">
                    {tierOneBets.map((bet) => (
                      <article key={bet.player} className="surface-card-muted">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-semibold text-foreground">{bet.player}</h3>
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-primary">{bet.odds}</span>
                          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">{bet.edge}</span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-muted-foreground">{bet.analysis}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6">
                  {[
                    ["Tier 2", "Solid Value", tierTwoBets],
                    ["Tier 3", "Upside Plays", tierThreeBets],
                  ].map(([eyebrow, title, bets]) => (
                    <div key={String(title)} className="surface-card">
                      <div className="eyebrow-label text-primary/80">{eyebrow}</div>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{title}</h3>
                      <div className="mt-5 grid gap-4">
                        {(bets as typeof tierTwoBets).map((bet) => (
                          <article key={bet.player} className="surface-card-muted">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-lg font-semibold text-foreground">{bet.player}</h3>
                              <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">{bet.odds}</span>
                            </div>
                            <p className="mt-3 text-sm leading-7 text-muted-foreground">{bet.analysis}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top 40 Parlay Golfers" eyebrow="Safe Plays">
            <div className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <p className="max-w-3xl text-base leading-8 text-muted-foreground">High-floor players identified by the model based on course history, consistency, and Harbour Town fit. Ideal for RBC Heritage top 40 picks, RBC Heritage parlays, and safer betting structures.</p>
                <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-secondary px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent">PGA betting picks today</Link>
              </div>

              <div className="overflow-hidden rounded-[28px] bg-card shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-secondary/65">
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        <th className="px-4 py-3">Player</th>
                        <th className="px-4 py-3">Why They're a Strong Top 40 Play</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top40Rows.map((row, index) => (
                        <tr key={row[0]} className={`border-t border-border/60 align-top first:border-t-0 ${index % 2 === 0 ? "bg-card" : "bg-secondary/30"}`}>
                          <td className="px-4 py-4 font-semibold text-foreground">{row[0]}</td>
                          <td className="px-4 py-4 leading-7 text-muted-foreground">{row[1]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="surface-card">
                <div className="eyebrow-label text-primary/80">How These Players Were Selected</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="surface-card-muted text-sm leading-7 text-muted-foreground">Based on the model's weighting of SG: Approach, Driving Accuracy, Bogey Avoidance, and course history at Harbour Town.</div>
                  <div className="surface-card-muted text-sm leading-7 text-muted-foreground">Focused on high consistency, low missed-cut rates, and strong historical performance at this course.</div>
                  <div className="surface-card-muted text-sm leading-7 text-muted-foreground md:col-span-2">Designed specifically for Top 40 parlays and safer betting strategies where floor matters more than outright win equity.</div>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <SectionCard title="Notable Fades" eyebrow="Fades">
              <div className="grid gap-3">
                {fades.map((fade) => (
                  <div key={fade} className="surface-card-muted text-sm leading-7 text-muted-foreground">{fade}</div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Summary Table" eyebrow="Quick Board">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-secondary/65">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      <th className="px-3 py-3">Player</th>
                      <th className="px-3 py-3">Odds</th>
                      <th className="px-3 py-3">Edge</th>
                      <th className="px-3 py-3">Key Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row, index) => (
                      <tr key={row[0]} className={`border-t border-border/60 first:border-t-0 ${index % 2 === 0 ? "bg-card" : "bg-secondary/30"}`}>
                        <td className="px-3 py-4 font-semibold text-foreground">{row[0]}</td>
                        <td className="px-3 py-4 text-muted-foreground">{row[1]}</td>
                        <td className="px-3 py-4 text-[hsl(var(--success))]">{row[2]}</td>
                        <td className="px-3 py-4 text-muted-foreground">{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Harbour Town Betting Strategy" eyebrow="Course Strategy">
            <div className="grid gap-3">
              {strategyBullets.map((item) => (
                <div key={item} className="surface-card-muted text-sm leading-7 text-muted-foreground">{item}</div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="How to Build Golf Parlays" eyebrow="Parlay Strategy">
            <div className="grid gap-3">
              {parlayBullets.map((item) => (
                <div key={item} className="surface-card-muted text-sm leading-7 text-muted-foreground">{item}</div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="RBC Heritage Betting FAQ" eyebrow="FAQ">
            <div className="grid gap-3">
              {rbcHeritage2026Content.faqs.map((entry) => (
                <article key={entry.question} className="surface-card-muted">
                  <h3 className="text-base font-semibold text-foreground">{entry.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{entry.answer}</p>
                </article>
              ))}
            </div>
          </SectionCard>

          <section className="surface-card text-center md:p-10">
            <div className="eyebrow-label text-primary/80">Access The Full Board</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl">Open the live Harbour Town model and adjust the weights yourself.</h2>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-muted-foreground">The full model lets you sort the board, search the field, and rebalance the stat buckets to match your own view of Harbour Town.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-4">
              <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary/90">View Full Model</Link>
              <Link to="/pga/top-40-golf-picks" className="inline-flex items-center rounded-xl bg-secondary px-6 py-3 text-base font-medium text-foreground transition hover:bg-accent">Top 40 golf parlays</Link>
              <Link to="/" className="inline-flex items-center rounded-xl bg-secondary px-6 py-3 text-base font-medium text-foreground transition hover:bg-accent">Back to Home</Link>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
