import { useMemo, useState, type ReactNode, type SVGProps } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaModelPreviewCard from "@/components/pga/PgaModelPreviewCard";
import SeoJsonLd from "@/components/seo/SeoJsonLd";
import { usePgaTournamentPlayers } from "@/hooks/usePgaTournamentPlayers";
import { usePageSeo } from "@/hooks/usePageSeo";
import { rankPlayersByScore } from "@/lib/pga/modelEngine";
import { detectActivePreset, getStoredPgaAppliedWeights } from "@/lib/pga/pgaWeights";
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import { buildPreviewSliders, getTournamentNavLinks } from "@/lib/pga/tournamentUi";
import { buildArticleSchema, buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/pgaSeo";

function SectionCard({
  title,
  eyebrow,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pga-card ${className}`}>
      {eyebrow ? <div className="pga-label mb-2.5">{eyebrow}</div> : null}
      <h2 className="pga-section-title">{title}</h2>
      <div className="mt-4 md:mt-5">{children}</div>
    </section>
  );
}

function parseEdgeScore(edge?: string) {
  if (!edge) return null;
  const match = edge.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getEdgePercent(edge?: string, maxEdge = 16) {
  const score = parseEdgeScore(edge);
  if (!score) return 0;
  return Math.min(100, Math.round((score / maxEdge) * 100));
}

function getSummaryEdgeTone(edgeText: string) {
  const score = Number(edgeText);
  if (score >= 14) return "pga-edge-chip-high";
  return "pga-edge-chip-mid";
}

function BetList({
  bets,
  tier,
}: {
  bets: readonly PgaTournamentConfig["picksPage"]["tierOneBets"];
  tier: "tier1" | "tier2" | "tier3";
}) {
  const barClass = tier === "tier1" ? "bg-[var(--pga-green-bar)]" : "bg-[var(--pga-orange)]";

  return (
    <div className="divide-y divide-[color:var(--pga-border)]">
      {bets.map((bet) => (
        <article key={bet.player} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[14px] font-medium text-foreground">{bet.player}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="pga-odds-badge">{bet.odds}</span>
              {bet.edge ? <span className="pga-edge-badge">{bet.edge}</span> : null}
            </div>
          </div>
          {bet.edge ? (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary/80">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${getEdgePercent(bet.edge)}%` }} />
            </div>
          ) : null}
          <p className="mt-3 text-[12px] leading-6 text-muted-foreground">{bet.analysis}</p>
        </article>
      ))}
    </div>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return <div className="pga-icon-frame">{children}</div>;
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--pga-border)] bg-secondary/30 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[14px] font-medium leading-6 text-foreground">{value}</div>
    </div>
  );
}

function BarChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M3 19h18" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function LineChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 18h16" />
      <path d="m5 15 4-5 4 3 6-7" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ScatterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
      <circle cx="18" cy="16" r="2" />
      <path d="m8.5 8.5 2.5 5.5" />
      <path d="m15.2 9.3-3.4 5.3" />
    </svg>
  );
}

const PARLAY_CARD_META = [
  { title: "Target Top 40 markets", icon: BarChartIcon },
  { title: "Avoid missed-cut risk", icon: ClockIcon },
  { title: "Focus on course consistency", icon: LineChartIcon },
  { title: "Model over public perception", icon: ScatterIcon },
] as const;

export default function PgaTournamentPicksPage({ tournament }: { tournament: PgaTournamentConfig }) {
  const { picksPath, modelPath } = getTournamentNavLinks(tournament);
  usePageSeo({
    title: tournament.seo.title,
    description: tournament.seo.description,
    path: picksPath,
    type: "article",
    noindex: tournament.indexable === false,
  });

  const dateModified = "2026-04-16";
  const { players, status: previewStatus, errorMessage } = usePgaTournamentPlayers(tournament);
  const [activePreviewThemeKey, setActivePreviewThemeKey] = useState(tournament.model.previewThemes[0].key);
  const storedWeights = useMemo(
    () => getStoredPgaAppliedWeights(tournament.slug, tournament.model.presets[0].weights),
    [tournament.slug, tournament.model.presets],
  );
  const previewTheme = tournament.model.previewThemes.find((theme) => theme.key === activePreviewThemeKey) ?? tournament.model.previewThemes[0];
  const previewRows = useMemo(
    () => rankPlayersByScore(players, previewTheme.weights, tournament.manual?.playerAdjustments).slice(0, 6),
    [players, previewTheme.weights, tournament.manual?.playerAdjustments],
  );
  const activePresetKey = useMemo(() => detectActivePreset(storedWeights, tournament.model.presets), [storedWeights, tournament.model.presets]);
  const liveModelLabel = activePresetKey
    ? `${tournament.model.presets.find((preset) => preset.key === activePresetKey)?.label} preset currently saved`
    : "Custom weight profile currently saved";
  const previewSliders = buildPreviewSliders(tournament, previewTheme.key);

  return (
    <SiteShell>
      <SeoJsonLd
        id={`${tournament.slug}-schema`}
        data={[
          buildArticleSchema({
            headline: tournament.seo.title,
            description: tournament.seo.description,
            path: picksPath,
            dateModified,
          }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "PGA Picks", path: picksPath },
          ]),
          buildFaqSchema(tournament.seo.faqs),
        ]}
      />

      <main className="site-page pga-picks-page pb-28 pt-6 sm:pb-16 sm:pt-10">
        <div className="site-container site-stack">
          <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="pga-card h-full p-5 md:p-8">
              <div className="pga-badge">{tournament.hero.badge}</div>
              <h1 className="pga-hero-title mt-3 max-w-4xl sm:mt-4 md:mt-5">{tournament.hero.title}</h1>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-muted-foreground sm:mt-4 sm:text-lg sm:leading-8">
                Build your {tournament.model.courseHistoryDisplay} model first, then read the board. This page leads with a live ranking preview so the model feels like the product, not the footnote.
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                {tournament.hero.intro} {tournament.hero.support}
              </p>
              <div className="mt-5 flex flex-wrap gap-3 sm:mt-6 sm:gap-4 md:mt-8">
                <Link to={modelPath} className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 sm:px-5 sm:py-3">
                  {tournament.hero.primaryCtaLabel}
                </Link>
                <a href="#best-bets" className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary sm:px-5 sm:py-3">
                  {tournament.hero.secondaryCtaLabel}
                </a>
              </div>
              <div className="mt-6 grid gap-3">
                {tournament.model.heroSteps.map((item, index) => (
                  <div key={item.title} className="rounded-xl border border-[color:var(--pga-border)] bg-secondary/35 p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pga-green-fill)] text-[12px] font-semibold text-[var(--pga-green-dark)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h2 className="text-[15px] font-medium text-foreground">{item.title}</h2>
                        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{item.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <PgaModelPreviewCard
              status={previewStatus}
              errorMessage={errorMessage}
              themes={tournament.model.previewThemes}
              activeThemeKey={previewTheme.key}
              onThemeChange={setActivePreviewThemeKey}
              previewRows={previewRows}
              sliders={previewSliders}
              liveModelLabel={liveModelLabel}
              ctaHref={modelPath}
              eyebrow={tournament.model.previewEyebrow}
              headline={tournament.model.previewHeadline}
              body={tournament.model.previewBody}
              rankingTitle={tournament.model.previewRankingTitle}
              rankingBody={tournament.model.previewRankingBody}
              railCtaTitle={tournament.model.previewRailCtaTitle}
              railCtaBody={tournament.model.previewRailCtaBody}
              courseHistoryLabel={tournament.model.courseHistoryDisplay}
            />
          </section>

          {(tournament.tournamentInfo || tournament.summary?.modelFocus || tournament.manual?.modelFocusNote || tournament.manual?.elevatedGolfers?.length || tournament.manual?.downgradedGolfers?.length) ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
              <div className="grid gap-4">
                {tournament.tournamentInfo ? (
                  <section className="pga-card p-5">
                    <div className="pga-label">Tournament Snapshot</div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <InfoStat label="Tournament" value={tournament.name} />
                      <InfoStat label="Course" value={tournament.courseName} />
                      <InfoStat label="Location" value={tournament.location} />
                      <InfoStat label="Previous Winner" value={tournament.tournamentInfo.previousWinner ?? "TBD"} />
                      <InfoStat label="Winning Score" value={tournament.tournamentInfo.winningScore ?? "TODO / pending exact score source"} />
                      <InfoStat label="Avg Cut Line (5 yrs)" value={tournament.tournamentInfo.averageCutLineLast5Years ?? "TODO / pending cut-line history source"} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(tournament.tournamentInfo.courseFitProfile ?? []).map((item) => (
                        <span key={item} className="rounded-full border border-[color:var(--pga-border)] bg-secondary/40 px-3 py-1.5 text-[12px] font-medium text-foreground">
                          {item}
                        </span>
                      ))}
                      {tournament.tournamentInfo.purse ? (
                        <span className="rounded-full border border-[color:var(--pga-border)] bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
                          Purse {tournament.tournamentInfo.purse}
                        </span>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {(tournament.manual?.modelFocusNote || tournament.summary?.modelFocus) ? (
                  <section className="pga-card p-5">
                    <div className="pga-label">Model Focus</div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-[15px]">
                      {tournament.manual?.modelFocusNote ?? tournament.summary?.modelFocus}
                    </p>
                  </section>
                ) : null}
              </div>

              <section className="pga-card p-5">
                <div className="pga-label">Ranking Deltas</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h2 className="text-[15px] font-medium text-foreground">Elevated vs general power ranking</h2>
                    <div className="mt-3 grid gap-2">
                      {(tournament.manual?.elevatedGolfers?.length
                        ? tournament.manual.elevatedGolfers
                        : [{ player: "Use tournament override file", note: "Baseline generated output. Add elevated golfers in the override layer." }]
                      ).map((entry) => (
                        <div key={`${entry.player}-${entry.note}`} className="rounded-lg border border-[color:var(--pga-border)] bg-secondary/35 px-3 py-3">
                          <div className="text-[13px] font-medium text-foreground">{entry.player}</div>
                          <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{entry.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-[15px] font-medium text-foreground">Downgraded vs general power ranking</h2>
                    <div className="mt-3 grid gap-2">
                      {(tournament.manual?.downgradedGolfers?.length
                        ? tournament.manual.downgradedGolfers
                        : [{ player: "Use tournament override file", note: "Baseline generated output. Add downgraded golfers in the override layer." }]
                      ).map((entry) => (
                        <div key={`${entry.player}-${entry.note}`} className="rounded-lg border border-[color:var(--pga-border)] bg-secondary/35 px-3 py-3">
                          <div className="text-[13px] font-medium text-foreground">{entry.player}</div>
                          <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{entry.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </section>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {tournament.model.heroStats.map((stat) => (
              <div key={stat.label} className="pga-stat-card">
                <div className="pga-stat-value">{stat.value}</div>
                <div className="mt-2 text-[12px] font-medium text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            {tournament.model.valueStrip.map((item) => (
              <div key={item.title} className="rounded-xl border border-[color:var(--pga-border)] bg-card p-5">
                <div className="pga-label">Why use the model?</div>
                <h2 className="mt-2 text-[20px] font-medium tracking-[-0.02em] text-foreground">{item.title}</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </section>

          <SectionCard title="What Changes When You Adjust Weights" eyebrow="Model Overview">
            <div className="grid gap-5 sm:gap-6">
              <p className="max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                This model is built to stay fast and explainable. Move the weights, re-rank the field, and use the written picks after you know which {tournament.model.courseHistoryDisplay} profile you want to bet. The preview above is a front door to the full slider room on <code>{modelPath}</code>.
              </p>
              <div className="pga-flow">
                {["Adjust weights", "Re-rank the field", `Compare ${tournament.model.courseHistoryDisplay} fits`, "Open full model room", "Bet the board"].map((node, index, all) => (
                  <div key={node} className="contents">
                    <div className="pga-flow-node">{node}</div>
                    {index < all.length - 1 ? <div className="pga-flow-arrow" aria-hidden="true">&rarr;</div> : null}
                  </div>
                ))}
              </div>
              <div className="grid gap-3 xl:grid-cols-3">
                {tournament.model.weightShiftNotes.map((item) => (
                  <div key={item.title} className="rounded-lg border border-[color:var(--pga-border)] bg-secondary/40 p-4">
                    <h3 className="text-[14px] font-medium text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top 10 Best Bets" eyebrow="PGA Best Bets">
            <div id="best-bets" className="space-y-4 sm:space-y-6">
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">{tournament.picksPage.top10Intro}</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                  <div className="bg-[var(--pga-green-dark)] px-4 py-3 text-[13px] font-medium text-[var(--pga-tier-header-text)]">
                    Tier 1 &mdash; Strong model + sweet spot odds
                  </div>
                  <div className="p-4">
                    <BetList bets={tournament.picksPage.tierOneBets} tier="tier1" />
                  </div>
                </div>

                <div className="grid gap-4 sm:gap-6">
                  <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                    <div className="bg-secondary/70 px-4 py-3 text-[13px] font-medium text-muted-foreground">
                      Tier 2 &mdash; Solid value
                    </div>
                    <div className="p-4">
                      <BetList bets={tournament.picksPage.tierTwoBets} tier="tier2" />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                    <div className="bg-secondary/40 px-4 py-3 text-[13px] font-medium text-muted-foreground">
                      Tier 3 &mdash; Upside Plays
                    </div>
                    <div className="p-4">
                      <BetList bets={tournament.picksPage.tierThreeBets} tier="tier3" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top 40 Parlay Golfers" eyebrow="Safe Plays">
            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">{tournament.picksPage.top40Intro}</p>
                <Link to={`${modelPath}?preset=top40`} className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary sm:px-5 sm:py-2.5">
                  Top 40 golf picks
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--pga-green-bar)]" />
                  Strong fit
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--pga-orange)]" />
                  Moderate fit
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[color:var(--pga-border)] text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Player</th>
                        <th className="px-4 py-3">Course fit</th>
                        <th className="px-4 py-3">Why They're a Strong Top 40 Play</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournament.picksPage.top40Rows.map((row, index) => (
                        <tr key={row[0]} className="border-t border-[color:var(--pga-border)] align-top first:border-t-0">
                          <td className="px-4 py-3 sm:py-4">
                            <span className={`pga-rank-circle ${index < 5 ? "pga-rank-circle-top" : "pga-rank-circle-rest"}`}>{index + 1}</span>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground sm:py-4">{row[0]}</td>
                          <td className="px-4 py-3 sm:py-4">
                            <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                              <span className={`h-2.5 w-2.5 rounded-full ${index < 5 ? "bg-[var(--pga-green-bar)]" : "bg-[var(--pga-orange)]"}`} />
                              {index < 5 ? "Strong fit" : "Moderate fit"}
                            </span>
                          </td>
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
              <div className="grid gap-2">
                {tournament.picksPage.fades.map((fade) => (
                  <article key={fade} className="pga-fade-card">
                    <div className="text-[13px] font-medium text-[var(--pga-fade-text)]">{fade.split(" -> ")[0]}</div>
                    <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{fade.split(" -> ")[1] ?? ""}</p>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Summary Table" eyebrow="Quick Board">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--pga-border)] text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="px-3 py-3">Player</th>
                      <th className="px-3 py-3">Odds</th>
                      <th className="px-3 py-3">Edge</th>
                      <th className="px-3 py-3">Key Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournament.picksPage.summaryRows.map((row) => (
                      <tr key={row[0]} className="border-t border-[color:var(--pga-border)] first:border-t-0">
                        <td className="px-3 py-3 font-medium text-foreground sm:py-4">{row[0]}</td>
                        <td className="px-3 py-3 text-muted-foreground sm:py-4">{row[1]}</td>
                        <td className="px-3 py-3 sm:py-4">
                          <span className={`pga-edge-chip ${getSummaryEdgeTone(row[2])}`}>{row[2]}</span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground sm:py-4">{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <SectionCard title={`${tournament.model.courseHistoryDisplay} Betting Strategy`} eyebrow="Course Strategy">
            <div className="grid gap-3 sm:grid-cols-2">
              {tournament.picksPage.strategyBullets.map((item) => (
                <div key={item} className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4 text-sm leading-6 text-muted-foreground sm:leading-7">
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>

          {tournament.manual?.courseFitNotes?.length || tournament.manual?.statPriorityTweaks?.length ? (
            <SectionCard title="Weekly Tournament Adjustments" eyebrow="Manual Override Layer">
              <div className="grid gap-3 lg:grid-cols-2">
                {tournament.manual?.courseFitNotes?.length ? (
                  <div className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4">
                    <h3 className="text-[14px] font-medium text-foreground">Course-fit notes</h3>
                    <div className="mt-3 grid gap-2">
                      {tournament.manual.courseFitNotes.map((note) => (
                        <div key={note} className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
                          {note}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {tournament.manual?.statPriorityTweaks?.length ? (
                  <div className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4">
                    <h3 className="text-[14px] font-medium text-foreground">Stat priority tweaks</h3>
                    <div className="mt-3 grid gap-2">
                      {tournament.manual.statPriorityTweaks.map((tweak) => (
                        <div key={`${tweak.key}-${tweak.note}`} className="rounded-lg bg-secondary/40 px-3 py-2.5">
                          <div className="text-[13px] font-medium text-foreground">{tweak.key}</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{tweak.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="How to Build Golf Parlays" eyebrow="Parlay Strategy">
            <div className="grid gap-3 sm:grid-cols-2">
              {tournament.picksPage.parlayBullets.map((item, index) => {
                const meta = PARLAY_CARD_META[index];
                const Icon = meta.icon;

                return (
                  <div key={item} className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4">
                    <IconFrame>
                      <Icon className="h-4 w-4 text-[var(--pga-green-dark)]" />
                    </IconFrame>
                    <h3 className="mt-3 text-[13px] font-medium text-foreground">{meta.title}</h3>
                    <p className="mt-2 text-[12px] leading-6 text-muted-foreground">{item}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title={`${tournament.name} ${tournament.season} FAQ`} eyebrow="FAQ">
            <div className="grid gap-3">
              {tournament.seo.faqs.map((entry) => (
                <article key={entry.question} className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4">
                  <h3 className="text-[15px] font-medium text-foreground">{entry.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{entry.answer}</p>
                </article>
              ))}
            </div>
          </SectionCard>

          <section className="pga-card p-4 text-center md:p-10">
            <div className="pga-label">Golf betting model</div>
            <h2 className="pga-section-title mt-2">
              Use the full model room to tune the {tournament.model.courseHistoryDisplay} board before you lock in the bets below.
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:mt-4 sm:text-base sm:leading-8">
              Open the interactive board, adjust the real sliders, and compare the full-field rankings against the written outrights, Top 40 plays, and fades on this page.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3 sm:mt-7 sm:gap-4">
              <Link to={modelPath} className="inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 sm:px-6 sm:py-3 sm:text-base">
                Open Full Model
              </Link>
              <a href="#best-bets" className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary sm:px-6 sm:py-3 sm:text-base">
                Back to picks
              </a>
            </div>
          </section>
        </div>

        <div className="fixed inset-x-4 bottom-4 z-30 md:hidden">
          <Link to={modelPath} className="flex items-center justify-center rounded-2xl bg-[#1a3a2a] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(26,58,42,0.28)]">
            Open Full Model
          </Link>
        </div>
      </main>
    </SiteShell>
  );
}
