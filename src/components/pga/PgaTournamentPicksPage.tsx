import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SeoJsonLd from "@/components/seo/SeoJsonLd";
import { usePageSeo } from "@/hooks/usePageSeo";
import type { PgaTournamentContent } from "@/lib/seo/pgaTournamentContent";
import { buildArticleSchema, buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/pgaSeo";

const MODEL_PRESETS = [
  {
    key: "outright",
    label: "Outright Winner",
    href: "/pga/model?preset=outright",
    badge: "Highest Upside",
    badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300",
    description:
      "Targets players with elite recent form and peak birdie-making ability. Weights lean hard into TrendRank, SG: Approach, and scoring inside 150 yards.",
    icon: "T",
  },
  {
    key: "top10",
    label: "Top 10 Finish",
    href: "/pga/model?preset=top10",
    badge: "Upside + Form",
    badgeColor: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
    description:
      "Balances peak upside with enough course awareness to catch consistent high-end performers. Form leads, but approach play and scoring are still weighted.",
    icon: "10",
  },
  {
    key: "top20",
    label: "Top 20 Finish",
    href: "/pga/model?preset=top20",
    badge: "Balanced",
    badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    description:
      "Equal weight on form and course fit. Accuracy, bogey avoidance, and all-around consistency matter more in this middle range.",
    icon: "20",
  },
  {
    key: "top40",
    label: "Top 40 Finish",
    href: "/pga/model?preset=top40",
    badge: "Floor Play",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    description:
      "Pure floor model. Course fit, driving control, and bogey avoidance dominate to surface safer parlay legs.",
    icon: "40",
  },
] as const;

function SectionCard({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section className="surface-card p-4 md:p-8">
      {eyebrow ? <div className="eyebrow-label mb-2.5">{eyebrow}</div> : null}
      <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl md:text-3xl">{title}</h2>
      <div className="mt-4 md:mt-5">{children}</div>
    </section>
  );
}

export default function PgaTournamentPicksPage({ content }: { content: PgaTournamentContent }) {
  usePageSeo({
    title: content.title,
    description: content.description,
    path: content.path,
    type: "article",
  });

  const dateModified = "2026-04-14";

  return (
    <SiteShell>
      <SeoJsonLd
        id={`${content.slug}-schema`}
        data={[
          buildArticleSchema({
            headline: content.title,
            description: content.description,
            path: content.path,
            dateModified,
          }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "PGA Picks", path: content.path },
          ]),
          buildFaqSchema(content.faqs),
        ]}
      />
      <main className="site-page pb-10 pt-6 sm:pb-16 sm:pt-10">
        <div className="site-container site-stack">
          <section className="grid gap-4 sm:gap-5 lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:gap-8">
            <div className="surface-card p-4 md:p-10">
              <div className="inline-flex rounded-full bg-primary/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary sm:px-4 sm:py-1 sm:text-[11px] sm:tracking-[0.24em]">
                {content.heroBadge}
              </div>
              <h1 className="mt-3 max-w-4xl text-[2rem] font-semibold leading-[1.02] tracking-[-0.05em] text-foreground sm:mt-4 sm:text-4xl md:mt-5 md:text-6xl">
                {content.heroTitle}
              </h1>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-muted-foreground sm:mt-4 sm:text-lg sm:leading-8">
                {content.heroIntro}
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                {content.heroSupport}
              </p>
              <div className="mt-5 flex flex-wrap gap-3 sm:mt-6 sm:gap-4 md:mt-8">
                <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:px-5 sm:py-3">
                  {content.heroCtaLabel}
                </Link>
                <Link to="/pga/top-40-golf-picks" className="inline-flex items-center rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent sm:px-5 sm:py-3">
                  {content.heroSecondaryLabel}
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-1">
              {[
                ["Primary Signals", "Recent form, course history, and weighted stat fit are the biggest model inputs before price is considered."],
                ["Course Lean", "Each tournament page is weighted for the specific course test rather than using one generic PGA setup."],
                ["Betting Use", "The output is built to compare expected performance against market pricing and isolate mispriced names for best bets and Top 40 parlays."],
              ].map(([title, body]) => (
                <div key={title} className="surface-card-muted p-3 sm:p-4">
                  <div className="eyebrow-label text-primary/80">{title}</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground sm:mt-3 sm:leading-7">{body}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card p-4 md:p-8">
            <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="eyebrow-label text-primary/80">Free Interactive Model</div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 sm:px-3 sm:py-1 sm:text-[11px]">
                100% Free
              </span>
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl md:text-3xl">
              {content.presetsHeading}
            </h2>
            <p className="mt-2.5 max-w-3xl text-sm leading-7 text-muted-foreground sm:mt-3 sm:text-base sm:leading-8">
              {content.presetsIntro}
            </p>

            <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
              {MODEL_PRESETS.map((preset) => (
                <Link
                  key={preset.key}
                  to={preset.href}
                  className="group flex flex-col rounded-[22px] bg-secondary/50 p-4 ring-1 ring-border/50 transition hover:bg-secondary hover:ring-primary/30 sm:rounded-[24px] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xl sm:text-2xl">{preset.icon}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] sm:px-2.5 sm:py-1 sm:text-[10px] ${preset.badgeColor}`}>
                      {preset.badge}
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-base font-semibold tracking-[-0.02em] text-foreground sm:mt-3 sm:text-lg">
                    {preset.label}
                  </h3>
                  <p className="mt-1.5 flex-1 text-[13px] leading-5 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">
                    {preset.description}
                  </p>
                  <div className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-all group-hover:gap-2 sm:mt-3">
                    Open model
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <SectionCard title="How the Model Works" eyebrow="Model Overview">
            <div className="grid gap-5 sm:gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <p className="text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                This model is built to stay fast and explainable. It ranks the field with a composite score that blends recent form, event-specific course fit, and the stat profile most likely to translate this week. The goal is not just to predict who plays well, but to spot where the market is underpricing that profile.
              </p>
              <div className="grid gap-2.5 sm:gap-3">
                {content.overviewBullets.map((item) => (
                  <div key={item} className="surface-card-muted p-3 text-sm leading-6 text-muted-foreground sm:p-4 sm:leading-7">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top 10 Best Bets" eyebrow="PGA Best Bets">
            <div id="best-bets" className="space-y-4 sm:space-y-6">
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                {content.top10Intro}
              </p>
              <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="surface-card">
                  <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4 sm:gap-4">
                    <div>
                      <div className="eyebrow-label text-primary/80">Tier 1</div>
                      <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-foreground sm:mt-2 sm:text-2xl">
                        Strong Model + Sweet Spot Odds
                      </h3>
                    </div>
                    <div className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground sm:px-3 sm:py-1 sm:text-xs">
                      Highest-confidence price edges
                    </div>
                  </div>
                  <div className="grid gap-3 sm:gap-4">
                    {content.tierOneBets.map((bet) => (
                      <article key={bet.player} className="surface-card-muted p-3 sm:p-4">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <h3 className="text-lg font-semibold text-foreground sm:text-xl">{bet.player}</h3>
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary sm:px-3 sm:py-1 sm:text-xs">
                            {bet.odds}
                          </span>
                          {bet.edge ? (
                            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground sm:px-3 sm:py-1 sm:text-xs">
                              {bet.edge}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:mt-3 sm:leading-7">{bet.analysis}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:gap-6">
                  {([
                    ["Tier 2", "Solid Value", content.tierTwoBets],
                    ["Tier 3", "Upside Plays", content.tierThreeBets],
                  ] as const).map(([eyebrow, title, bets]) => (
                    <div key={title} className="surface-card">
                      <div className="eyebrow-label text-primary/80">{eyebrow}</div>
                      <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-foreground sm:mt-2 sm:text-2xl">
                        {title}
                      </h3>
                      <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
                        {bets.map((bet) => (
                          <article key={bet.player} className="surface-card-muted p-3 sm:p-4">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-base font-semibold text-foreground sm:text-lg">{bet.player}</h3>
                              <span className="rounded-full bg-card px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground sm:px-3 sm:py-1 sm:text-xs">
                                {bet.odds}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:mt-3 sm:leading-7">{bet.analysis}</p>
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
            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  {content.top40Intro}
                </p>
                <Link to="/pga/model?preset=top40" className="inline-flex items-center rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent sm:px-5 sm:py-2.5">
                  Top 40 golf picks
                </Link>
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
                      {content.top40Rows.map((row, index) => (
                        <tr key={row[0]} className={`border-t border-border/60 align-top first:border-t-0 ${index % 2 === 0 ? "bg-card" : "bg-secondary/30"}`}>
                          <td className="px-4 py-3 font-semibold text-foreground sm:py-4">{row[0]}</td>
                          <td className="px-4 py-3 leading-6 text-muted-foreground sm:py-4 sm:leading-7">{row[1]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-6 sm:gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <SectionCard title="Notable Fades" eyebrow="Fades">
              <div className="grid gap-2.5 sm:gap-3">
                {content.fades.map((fade) => (
                  <div key={fade} className="surface-card-muted p-3 text-sm leading-6 text-muted-foreground sm:p-4 sm:leading-7">
                    {fade}
                  </div>
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
                    {content.summaryRows.map((row, i) => (
                      <tr key={row[0]} className={`border-t border-border/60 first:border-t-0 ${i % 2 === 0 ? "bg-card" : "bg-secondary/30"}`}>
                        <td className="px-3 py-3 font-semibold text-foreground sm:py-4">{row[0]}</td>
                        <td className="px-3 py-3 text-muted-foreground sm:py-4">{row[1]}</td>
                        <td className="px-3 py-3 text-[hsl(var(--success))] sm:py-4">{row[2]}</td>
                        <td className="px-3 py-3 text-muted-foreground sm:py-4">{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Harbour Town Betting Strategy" eyebrow="Course Strategy">
            <div className="grid gap-2.5 sm:gap-3">
              {content.strategyBullets.map((item) => (
                <div key={item} className="surface-card-muted p-3 text-sm leading-6 text-muted-foreground sm:p-4 sm:leading-7">
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="How to Build Golf Parlays" eyebrow="Parlay Strategy">
            <div className="grid gap-2.5 sm:gap-3">
              {content.parlayBullets.map((item) => (
                <div key={item} className="surface-card-muted p-3 text-sm leading-6 text-muted-foreground sm:p-4 sm:leading-7">
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={`${content.heroTitle.replace(" Picks & Best Bets", "")} FAQ`} eyebrow="FAQ">
            <div className="grid gap-2.5 sm:gap-3">
              {content.faqs.map((entry) => (
                <article key={entry.question} className="surface-card-muted p-3 sm:p-4">
                  <h3 className="text-base font-semibold text-foreground">{entry.question}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground sm:mt-2 sm:leading-7">{entry.answer}</p>
                </article>
              ))}
            </div>
          </SectionCard>

          <section className="surface-card p-4 text-center md:p-10">
            <div className="eyebrow-label text-primary/80">Golf betting model</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground sm:mt-3 sm:text-3xl md:text-4xl">
              Use the live model to compare PGA best bets, Top 40 golf picks, and custom weight profiles.
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:mt-4 sm:text-base sm:leading-8">
              Open the interactive board, switch betting presets, and move between the current tournament page, the golf betting model, and the evergreen Top 40 page.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3 sm:mt-7 sm:gap-4">
              <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:px-6 sm:py-3 sm:text-base">
                golf betting model
              </Link>
              <Link to="/pga/top-40-golf-picks" className="inline-flex items-center rounded-xl bg-secondary px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent sm:px-6 sm:py-3 sm:text-base">
                Top 40 golf picks
              </Link>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
